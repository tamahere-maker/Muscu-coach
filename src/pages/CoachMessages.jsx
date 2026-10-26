import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/ui'
import Conversation, { BandeauNotifications, apercu, quand } from '../lib/Messages'
import { notifier } from '../lib/push'

// Messagerie du coach : toutes ses conversations (la plus récente d'abord), ou une conversation ouverte
export default function CoachMessages() {
  const { id } = useParams()
  return id ? <UneConversation id={id} /> : <BoiteReception />
}

function UneConversation({ id }) {
  const [nom, setNom] = useState(null)
  useEffect(() => { supabase.from('profiles').select('nom').eq('id', id).maybeSingle().then(({ data }) => setNom(data?.nom ?? '')) }, [id])
  if (nom === null) return null
  return (
    <>
      <div>
        <Link className="linkbtn" to="/messages">← Toutes les conversations</Link>
        <h1 style={{ marginTop: 8 }}>{nom || 'Sans nom'}</h1>
        <p className="sub">Tous les coachs de l’athlète voient cette conversation. <Link className="linkbtn" to={`/athletes/${id}`}>Voir son suivi</Link></p>
      </div>
      <BandeauNotifications />
      <Conversation athleteId={id} />
    </>
  )
}

function BoiteReception() {
  const { profil } = useSession()
  const [convs, setConvs] = useState(null)
  const [filtre, setFiltre] = useState('')
  const dlg = useRef()

  const charger = () => supabase.rpc('conversations').then(({ data }) => setConvs(data ?? []))
  useEffect(() => {
    charger()
    const canal = supabase.channel('boite-reception')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, charger)
      .subscribe()
    window.addEventListener('focus', charger)
    return () => { supabase.removeChannel(canal); window.removeEventListener('focus', charger) }
  }, [])

  if (convs === null) return null
  const f = filtre.trim().toLowerCase()
  const visibles = convs.filter((c) => !f || (c.nom || '').toLowerCase().includes(f))
  const nonLus = convs.reduce((t, c) => t + Number(c.non_lus), 0)

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div>
          <h1>Messages</h1>
          <p className="sub">{nonLus ? `${nonLus} message${nonLus > 1 ? 's' : ''} non lu${nonLus > 1 ? 's' : ''}` : 'Tes conversations avec tes athlètes.'}</p>
        </div>
        {convs.length > 1 && <button className="btn" onClick={() => dlg.current.showModal()}>Message groupé</button>}
      </div>
      <BandeauNotifications />
      <div className="card">
        {convs.length > 6 && <input className="recherche" type="search" placeholder="Rechercher un athlète" value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label="Rechercher un athlète" />}
        {convs.length === 0 ? <p className="empty">Aucun athlète pour l’instant : invite-en un depuis l’onglet Athlètes.</p> : (
          <div className="convs">
            {visibles.map((c) => {
              const n = Number(c.non_lus)
              const texte = apercu(c.dernier_texte, c.dernier_type)
              return (
                <Link key={c.athlete_id} to={`/messages/${c.athlete_id}`} className={`conv${n ? ' non-lu' : ''}`}>
                  <span className="avatar" aria-hidden="true">{(c.nom || '?').trim()[0]?.toUpperCase()}</span>
                  <span className="conv-txt">
                    <strong>{c.nom || 'Sans nom'}</strong>
                    <span className="sub">{c.dernier_at
                      ? <>{c.dernier_auteur === profil.id ? 'Toi : ' : c.dernier_auteur !== c.athlete_id ? `${c.dernier_auteur_nom || 'Coach'} : ` : ''}{texte}</>
                      : 'Pas encore de message'}</span>
                  </span>
                  <span className="conv-meta">
                    {c.dernier_at && <small className="sub">{quand(c.dernier_at)}</small>}
                    {n > 0 && <span className="badge">{n}</span>}
                  </span>
                </Link>
              )
            })}
            {!visibles.length && <p className="empty">Aucun athlète ne correspond.</p>}
          </div>
        )}
      </div>
      <dialog ref={dlg}>
        <MessageGroupe convs={convs} fermer={() => dlg.current.close()} />
      </dialog>
    </>
  )
}

// Même message envoyé à plusieurs athlètes : il arrive dans la conversation de chacun
function MessageGroupe({ convs, fermer }) {
  const { profil } = useSession()
  const [choisis, setChoisis] = useState(() => new Set())
  const [texte, setTexte] = useState('')
  const [occupe, setOccupe] = useState(false)
  const tous = choisis.size === convs.length

  const basculer = (id) => setChoisis((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function envoyer(e) {
    e.preventDefault()
    if (!texte.trim() || !choisis.size) return
    setOccupe(true)
    const { data, error } = await supabase.from('messages')
      .insert([...choisis].map((athlete_id) => ({ athlete_id, auteur_id: profil.id, texte: texte.trim() }))).select('id')
    setOccupe(false)
    if (error) return toast(error.message)
    notifier(data.map((m) => m.id))
    toast(`Message envoyé à ${choisis.size} athlète${choisis.size > 1 ? 's' : ''}`)
    setTexte(''); setChoisis(new Set()); fermer()
  }

  return (
    <form className="dlg" onSubmit={envoyer}>
      <div className="dlg-head"><h2>Message groupé</h2>
        <button type="button" className="icon-btn" aria-label="Fermer" onClick={fermer}>×</button></div>
      <p className="sub" style={{ margin: 0 }}>Le message arrive dans la conversation de chaque athlète choisi. Chacun répond dans sa propre conversation.</p>
      <div className="choix-athletes">
        <label className="check"><input type="checkbox" checked={tous} onChange={() => setChoisis(tous ? new Set() : new Set(convs.map((c) => c.athlete_id)))} /> <strong>Tous mes athlètes</strong></label>
        {convs.map((c) => (
          <label key={c.athlete_id} className="check"><input type="checkbox" checked={choisis.has(c.athlete_id)} onChange={() => basculer(c.athlete_id)} /> {c.nom || 'Sans nom'}</label>
        ))}
      </div>
      <textarea rows="4" value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={4000} placeholder="Ton message" aria-label="Message groupé" />
      <div className="row">
        <button className="btn" disabled={occupe || !texte.trim() || !choisis.size}>Envoyer à {choisis.size} athlète{choisis.size > 1 ? 's' : ''}</button>
        <button type="button" className="btn ghost" onClick={fermer}>Annuler</button>
      </div>
    </form>
  )
}
