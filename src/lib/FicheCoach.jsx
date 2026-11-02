import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { Anim, toast } from './ui'
import { chercherExercices } from './recherche'
import { VideoCoach, lecteur, supprimerFichierVideo, televerserVideo } from './VideoExercice'

// Paire non orientée de variantes, telle que rangée en base
export const paire = (a, b) => (a < b ? { exercice_a: a, exercice_b: b } : { exercice_a: b, exercice_b: a })

// Vidéo perso du coach sur un exercice : lien (YouTube, Vimeo…) ou fichier, montrée à ses athlètes en séance guidée
export function MaVideo({ exercice, coachId }) {
  const [v, setV] = useState(undefined)
  const [lien, setLien] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('videos_exercices').select('*').eq('coach_id', coachId).eq('exercice_id', exercice.id).maybeSingle()
      .then(({ data }) => { setV(data ?? null); setLien(data?.url ?? '') })
  }, [exercice.id, coachId])

  async function enregistrer(champs) {
    setErr(''); setOccupe(true)
    const ancien = v?.chemin
    const { data, error } = await supabase.from('videos_exercices')
      .upsert({ coach_id: coachId, exercice_id: exercice.id, url: null, chemin: null, ...champs, updated_at: new Date().toISOString() })
      .select('*').single()
    setOccupe(false)
    if (error) { setErr(error.message); return false }
    if (ancien && ancien !== data.chemin) supprimerFichierVideo(ancien)
    setV(data); toast('Vidéo enregistrée')
    return true
  }
  async function envoyerLien(e) {
    e.preventDefault()
    const u = lien.trim()
    if (!/^https?:\/\//.test(u)) return setErr('Le lien doit commencer par https://')
    await enregistrer({ url: u })
  }
  async function envoyerFichier(f) {
    if (!f) return
    setErr(''); setOccupe(true)
    try {
      const chemin = await televerserVideo(coachId, f)
      if (!(await enregistrer({ chemin }))) supprimerFichierVideo(chemin)
    } catch (x) { setErr(x.message); setOccupe(false) }
  }
  async function retirer() {
    if (!confirm('Retirer ta vidéo de cet exercice ?')) return
    const { error } = await supabase.from('videos_exercices').delete().eq('coach_id', coachId).eq('exercice_id', exercice.id)
    if (error) return toast(error.message)
    supprimerFichierVideo(v.chemin)
    setV(null); setLien('')
  }

  if (v === undefined) return null
  const type = lien.trim() ? lecteur(lien.trim())?.type : null
  return (
    <div className="fiche-bloc">
      <h3>Ma vidéo</h3>
      <p className="sub" style={{ margin: 0 }}>Tes athlètes la voient pendant la séance guidée, à la place de la vidéo de la bibliothèque.</p>
      {v && <div className="video-ex"><VideoCoach v={v} titre={`Vidéo de ${exercice.nom}`} /></div>}
      <form className="row off-form" onSubmit={envoyerLien}>
        <input type="url" placeholder="Lien YouTube, Vimeo…" value={lien} onChange={(e) => setLien(e.target.value)} aria-label="Lien de la vidéo" />
        <button className="btn sm" disabled={occupe || !lien.trim() || lien.trim() === v?.url}>Enregistrer</button>
      </form>
      {type === 'lien' && <small className="sub">Ce lien s’ouvrira dans un nouvel onglet (lecteur intégré pour YouTube et Vimeo).</small>}
      <div className="row">
        <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
          {occupe ? 'Envoi…' : v?.chemin ? 'Remplacer le fichier' : 'Envoyer un fichier vidéo'}
          <input type="file" accept="video/mp4,video/quicktime,video/webm" hidden disabled={occupe} onChange={(e) => { envoyerFichier(e.target.files[0]); e.target.value = '' }} />
        </label>
        {v && <button type="button" className="linkbtn" onClick={retirer}>Retirer ma vidéo</button>}
      </div>
      {err && <p className="err">{err}</p>}
    </div>
  )
}

// Variantes liées par le coach (ex. développé couché barre ↔ haltères), proposées en premier quand l'athlète remplace l'exercice
export function Variantes({ exercice, coachId, exos }) {
  const [liens, setLiens] = useState(null)
  const [ajout, setAjout] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.from('variantes_exercices').select('exercice_a, exercice_b').eq('coach_id', coachId)
      .or(`exercice_a.eq.${exercice.id},exercice_b.eq.${exercice.id}`)
      .then(({ data }) => setLiens((data ?? []).map((x) => (x.exercice_a === exercice.id ? x.exercice_b : x.exercice_a))))
  }, [exercice.id, coachId])

  const parId = useMemo(() => Object.fromEntries(exos.map((e) => [e.id, e])), [exos])
  const choix = useMemo(() => {
    if (!ajout) return []
    const base = q.trim() ? exos : exos.filter((e) => e.muscles?.[0] === exercice.muscles?.[0])
    return chercherExercices(base, q).filter((e) => e.id !== exercice.id && !liens?.includes(e.id)).slice(0, 8)
  }, [ajout, q, exos, liens, exercice])

  async function lier(e) {
    const { error } = await supabase.from('variantes_exercices').insert({ coach_id: coachId, ...paire(exercice.id, e.id) })
    if (error && error.code !== '23505') return toast(error.message)
    setLiens((l) => [...l, e.id]); setQ(''); setAjout(false)
    toast(`${e.nom} liée comme variante`)
  }
  async function delier(id) {
    const { error } = await supabase.from('variantes_exercices').delete().eq('coach_id', coachId).match(paire(exercice.id, id))
    if (error) return toast(error.message)
    setLiens((l) => l.filter((x) => x !== id))
  }

  if (!liens) return null
  return (
    <div className="fiche-bloc">
      <h3>Variantes liées</h3>
      <p className="sub" style={{ margin: 0 }}>Proposées en premier à tes athlètes quand ils remplacent cet exercice (machine prise, matériel absent).</p>
      <div className="var-liste">
        {liens.map((id) => parId[id] && (
          <div key={id} className="pick" style={{ gridTemplateColumns: '48px 1fr auto' }}>
            <Anim ex={parId[id]} cls="s" />
            <span><strong>{parId[id].nom}</strong><br /><small className="sub">{parId[id].materiel}</small></span>
            <button type="button" className="linkbtn" onClick={() => delier(id)}>Délier</button>
          </div>
        ))}
        {!liens.length && !ajout && <small className="sub">Aucune variante pour l’instant.</small>}
      </div>
      {ajout ? (
        <>
          <input type="search" autoFocus placeholder="Chercher la variante" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher une variante" />
          <div className="pick-list">
            {choix.map((e) => (
              <button key={e.id} type="button" className="pick" style={{ gridTemplateColumns: '48px 1fr auto' }} onClick={() => lier(e)}>
                <Anim ex={e} cls="s" /><span><strong>{e.nom}</strong><br /><small className="sub">{e.muscles.join(', ')} · {e.materiel}</small></span>
                <span className="pill acc">Lier</span>
              </button>
            ))}
            {!choix.length && <small className="sub">Aucun exercice ne correspond.</small>}
          </div>
          <div className="row"><button type="button" className="btn ghost sm" onClick={() => { setAjout(false); setQ('') }}>Annuler</button></div>
        </>
      ) : <div className="row"><button type="button" className="btn ghost sm" onClick={() => setAjout(true)}>+ Lier une variante</button></div>}
    </div>
  )
}

// Favoris du coach : ensemble des identifiants d'exercices et bascule
export function useFavoris(coachId) {
  const [fav, setFav] = useState(() => new Set())
  useEffect(() => {
    if (!coachId) return
    supabase.from('favoris_exercices').select('exercice_id').eq('coach_id', coachId)
      .then(({ data }) => setFav(new Set((data ?? []).map((x) => x.exercice_id))))
  }, [coachId])
  async function basculer(e) {
    const avant = fav.has(e.id)
    setFav((s) => { const n = new Set(s); avant ? n.delete(e.id) : n.add(e.id); return n })
    const { error } = avant
      ? await supabase.from('favoris_exercices').delete().eq('coach_id', coachId).eq('exercice_id', e.id)
      : await supabase.from('favoris_exercices').insert({ coach_id: coachId, exercice_id: e.id })
    if (error && error.code !== '23505') {
      setFav((s) => { const n = new Set(s); avant ? n.add(e.id) : n.delete(e.id); return n })
      toast(error.message)
    }
  }
  return [fav, basculer]
}
