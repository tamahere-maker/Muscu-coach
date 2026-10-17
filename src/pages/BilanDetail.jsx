import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, toast } from '../lib/ui'
import { COMMENTAIRES, MESURES, RESSENTIS, TYPES_COACH, dateFr, urlsPhotos } from '../lib/bilans'

// Lecture d'un bilan envoyé, comparé au précédent ; le coach y répond
export default function BilanDetail() {
  const { id } = useParams()
  const { profil } = useSession()
  const nav = useNavigate()
  const coach = profil.role === 'coach'
  const [b, setB] = useState(null)
  const [prec, setPrec] = useState(null)
  const [urls, setUrls] = useState({})
  const [reponse, setReponse] = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('bilans').select('*, athlete:profiles!bilans_athlete_id_fkey(nom)').eq('id', id).single()
      if (!data) return
      setB(data); setReponse(data.reponse_coach)
      const { data: avant } = await supabase.from('bilans').select('*').eq('athlete_id', data.athlete_id).neq('statut', 'demande')
        .lt('envoye_at', data.envoye_at).order('envoye_at', { ascending: false }).limit(1)
      setPrec(avant?.[0] ?? null)
      setUrls(await urlsPhotos([...data.photos, ...(avant?.[0]?.photos ?? [])]))
      if (coach && data.statut === 'envoye') {
        await supabase.from('bilans').update({ statut: 'vu', vu_at: new Date().toISOString() }).eq('id', id)
      }
    })()
  }, [id])

  async function repondre(e) {
    e.preventDefault()
    const { error } = await supabase.from('bilans').update({ reponse_coach: reponse, reponse_par: profil.id, statut: 'vu', vu_at: new Date().toISOString() }).eq('id', id)
    if (error) return toast(error.message)
    setB((x) => ({ ...x, reponse_coach: reponse }))
    toast('Réponse envoyée')
  }

  if (!b) return null
  const ecart = (k) => {
    if (b[k] == null || prec?.[k] == null) return null
    const d = Number(b[k]) - Number(prec[k])
    return d === 0 ? '=' : `${d > 0 ? '+' : ''}${fmt(d, 1)}`
  }

  return (
    <>
      <div>
        <button className="linkbtn" onClick={() => nav(coach ? `/athletes/${b.athlete_id}` : '/')}>← {coach ? b.athlete.nom : 'Accueil'}</button>
        <h1 style={{ marginTop: 8 }}>{TYPES_COACH[b.type]}</h1>
        <p className="sub">{coach ? `${b.athlete.nom} · ` : ''}{b.envoye_at ? `envoyé le ${dateFr(b.envoye_at)}` : 'pas encore rempli'}{prec ? ` · comparé au bilan du ${dateFr(prec.envoye_at)}` : ''}</p>
      </div>

      {b.statut === 'demande' ? <p className="empty">L’athlète n’a pas encore rempli ce bilan.</p> : <>
        <div className="card">
          <h2>Mensurations</h2>
          <div className="mesures">
            {MESURES.filter(([k]) => b[k] != null).map(([k, lib, u]) => (
              <div key={k}><span className="label">{lib}</span><b className="num">{fmt(b[k], 1)} {u}</b>
                {ecart(k) && <small className="sub num">{ecart(k)} {ecart(k) !== '=' ? u : ''}</small>}</div>
            ))}
          </div>
          {MESURES.every(([k]) => b[k] == null) && <p className="empty">Aucune mesure.</p>}
        </div>

        {b.photos.length > 0 && (
          <div className="card">
            <h2>Photos</h2>
            <div className="photos grandes">{b.photos.map((p) => urls[p] && <a key={p} href={urls[p]} target="_blank" rel="noreferrer" className="photo"><img src={urls[p]} alt="Photo du bilan" /></a>)}</div>
            {prec?.photos.length > 0 && <>
              <span className="label">Bilan précédent</span>
              <div className="photos">{prec.photos.map((p) => urls[p] && <a key={p} href={urls[p]} target="_blank" rel="noreferrer" className="photo"><img src={urls[p]} alt="Photo du bilan précédent" /></a>)}</div>
            </>}
          </div>
        )}

        <div className="card">
          <h2>Ressentis</h2>
          {RESSENTIS.map(([k, lib]) => (
            <div key={k} className="note-ligne">
              <span>{lib}</span>
              <span className="row"><span className="jauge" aria-label={`${b[k]} sur 5`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= b[k] ? 'on' : undefined} />)}</span>
                <b className="num">{b[k]}/5</b>{prec?.[k] && prec[k] !== b[k] && <small className="sub">({prec[k]} avant)</small>}</span>
            </div>
          ))}
          {COMMENTAIRES.filter(([k]) => b[k]).map(([k, lib]) => (
            <div key={k}><span className="label">{lib}</span><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{b[k]}</p></div>
          ))}
        </div>

        {coach ? (
          <form className="card" onSubmit={repondre}>
            <h2>Ta réponse</h2>
            <textarea rows={4} value={reponse} onChange={(e) => setReponse(e.target.value)} placeholder="Ajustements, encouragements, points à surveiller…" />
            <div className="row"><button className="btn" disabled={reponse === b.reponse_coach}>Envoyer la réponse</button></div>
          </form>
        ) : b.reponse_coach && (
          <div className="card"><h2>Réponse de ton coach</h2><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{b.reponse_coach}</p></div>
        )}
      </>}
    </>
  )
}
