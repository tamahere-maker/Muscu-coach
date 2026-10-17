import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/ui'
import { COMMENTAIRES, MESURES, RESSENTIS, TYPES, preparerPhoto } from '../lib/bilans'

// Bilan rempli par l'athlète : nouveau (initial ou hebdomadaire) ou demandé par le coach
export default function BilanFormulaire() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { profil } = useSession()
  const nav = useNavigate()
  const nouveau = id === 'nouveau'
  const bilanId = useMemo(() => (nouveau ? crypto.randomUUID() : id), [id])
  const [f, setF] = useState(null)
  const [photos, setPhotos] = useState([]) // { chemin, apercu }
  const [envoi, setEnvoi] = useState(false)
  const [chargement, setChargement] = useState(0)

  useEffect(() => {
    (async () => {
      // pré-remplit le poids avec la dernière valeur connue
      const { data: dernier } = await supabase.from('bilans').select('poids_kg').eq('athlete_id', profil.id).not('poids_kg', 'is', null)
        .order('created_at', { ascending: false }).limit(1)
      const poids = dernier?.[0]?.poids_kg ?? null
      if (nouveau) return setF({ type: params.get('type') === 'initial' ? 'initial' : 'hebdo', poids_kg: poids })
      const { data } = await supabase.from('bilans').select('*').eq('id', id).single()
      setF(data && { ...data, poids_kg: data.poids_kg ?? poids })
    })()
  }, [id])

  const maj = (k, v) => setF((x) => ({ ...x, [k]: v }))

  async function ajouterPhotos(e) {
    const fichiers = [...e.target.files].slice(0, 6 - photos.length)
    e.target.value = ''
    setChargement((n) => n + fichiers.length)
    for (const fichier of fichiers) {
      try {
        // photo réduite si le navigateur sait la lire, sinon fichier d'origine (JPEG, PNG ou WebP)
        const blob = await preparerPhoto(fichier).catch(() => {
          if (['image/jpeg', 'image/png', 'image/webp'].includes(fichier.type)) return fichier
          throw new Error('format non pris en charge, choisis une photo JPEG ou PNG')
        })
        const chemin = `${profil.id}/${bilanId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`
        const { error } = await supabase.storage.from('bilans').upload(chemin, blob, { contentType: blob.type || 'image/jpeg' })
        if (error) throw error
        setPhotos((p) => [...p, { chemin, apercu: URL.createObjectURL(blob) }])
      } catch (err) {
        toast(`Photo non envoyée : ${err.message}`)
      } finally {
        setChargement((n) => n - 1)
      }
    }
  }
  async function retirerPhoto(ph) {
    await supabase.storage.from('bilans').remove([ph.chemin])
    setPhotos((p) => p.filter((x) => x !== ph))
  }

  async function envoyer(e) {
    e.preventDefault()
    if (RESSENTIS.some(([k]) => !f[k])) return toast('Note chaque ressenti de 1 à 5.')
    setEnvoi(true)
    const champs = Object.fromEntries([...MESURES.map(([k]) => k), ...RESSENTIS.map(([k]) => k), ...COMMENTAIRES.map(([k]) => k)]
      .map((k) => [k, f[k] === '' || f[k] === undefined ? (k.startsWith('commentaire') ? '' : null) : f[k]]))
    champs.photos = [...(f.photos ?? []), ...photos.map((p) => p.chemin)]
    const { error } = nouveau
      ? await supabase.from('bilans').insert({ id: bilanId, athlete_id: profil.id, type: f.type, statut: 'envoye', envoye_at: new Date().toISOString(), ...champs })
      : await supabase.from('bilans').update({ ...champs, statut: 'envoye' }).eq('id', id)
    setEnvoi(false)
    if (error) return toast(error.message)
    toast('Bilan envoyé à ton coach')
    nav('/', { replace: true })
  }

  if (!f) return null
  if (!nouveau && f.statut !== 'demande') { nav(`/bilans/${id}`, { replace: true }); return null }

  return (
    <form className="bilan" onSubmit={envoyer}>
      <div>
        <button type="button" className="linkbtn" onClick={() => nav('/')}>← Accueil</button>
        <h1 style={{ marginTop: 8 }}>{TYPES[f.type]}</h1>
        <p className="sub">Prends tes mesures le matin à jeun, au même endroit à chaque bilan.</p>
      </div>

      <div className="card">
        <h2>Mensurations</h2>
        <div className="params">
          {MESURES.map(([k, lib, u]) => (
            <label key={k} className="field"><span className="label">{lib} ({u})</span>
              <input type="number" min="0" step="0.1" inputMode="decimal" value={f[k] ?? ''} onChange={(e) => maj(k, e.target.value === '' ? null : Number(e.target.value))} /></label>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Photos</h2>
        <p className="sub" style={{ margin: 0 }}>Face, profil et dos, même lumière et même tenue à chaque fois. Seuls toi et tes coachs les voient.</p>
        <div className="photos">
          {photos.map((ph) => (
            <div key={ph.chemin} className="photo"><img src={ph.apercu} alt="" />
              <button type="button" className="icon-btn" aria-label="Retirer la photo" onClick={() => retirerPhoto(ph)}>×</button></div>
          ))}
          {chargement > 0 && <div className="photo attente">Envoi…</div>}
          {photos.length < 6 && (
            <label className="photo ajout">+ Ajouter
              <input type="file" accept="image/*" multiple onChange={ajouterPhotos} hidden /></label>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Ressentis de la semaine</h2>
        <p className="sub" style={{ margin: 0 }}>1 = très mauvais, 5 = excellent. Pour le stress, 5 = très stressé.</p>
        {RESSENTIS.map(([k, lib]) => (
          <div key={k} className="note-ligne">
            <span>{lib}</span>
            <div className="notes5" role="group" aria-label={lib}>
              {[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} aria-pressed={f[k] === n} onClick={() => maj(k, n)}>{n}</button>)}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>En quelques mots</h2>
        {COMMENTAIRES.map(([k, lib, ph]) => (
          <label key={k} className="field"><span className="label">{lib}</span>
            <textarea rows={2} value={f[k] ?? ''} placeholder={ph} onChange={(e) => maj(k, e.target.value)} /></label>
        ))}
      </div>

      <button className="btn big-btn" disabled={envoi || chargement > 0}>Envoyer le bilan</button>
    </form>
  )
}
