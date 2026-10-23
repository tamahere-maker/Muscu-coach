import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSession } from './session'
import { supabase } from './supabase'
import { toast } from './ui'

const heure = (d) => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// Messages non lus de l'utilisateur connecté, par athlète ({ [athlete_id]: n }), relus à chaque changement de page
export function useNonLus() {
  const { session } = useSession()
  const { pathname } = useLocation()
  const [n, setN] = useState({})
  useEffect(() => {
    if (!session) return
    supabase.rpc('messages_non_lus').then(({ data }) => setN(Object.fromEntries((data ?? []).map((x) => [x.athlete_id, Number(x.n)]))))
  }, [session?.user.id, pathname])
  return n
}

// Conversation d'un athlète avec tous ses coachs, mise à jour en direct
export default function Conversation({ athleteId }) {
  const { profil } = useSession()
  const [msgs, setMsgs] = useState(null)
  const [texte, setTexte] = useState('')
  const [occupe, setOccupe] = useState(false)
  const fin = useRef(null)

  const marquerLu = () => supabase.from('lectures_messages')
    .upsert({ athlete_id: athleteId, lecteur_id: profil.id, lu_jusqu_a: new Date().toISOString() })

  async function charger() {
    const { data } = await supabase.from('messages')
      .select('id, texte, created_at, auteur_id, auteur:profiles!messages_auteur_id_fkey(nom, role)')
      .eq('athlete_id', athleteId).order('created_at').limit(500)
    setMsgs(data ?? [])
    await marquerLu()
  }

  useEffect(() => {
    charger()
    const canal = supabase.channel(`messages-${athleteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `athlete_id=eq.${athleteId}` }, charger)
      .subscribe()
    window.addEventListener('focus', charger)
    return () => { supabase.removeChannel(canal); window.removeEventListener('focus', charger) }
  }, [athleteId])

  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])

  async function envoyer(e) {
    e.preventDefault()
    if (!texte.trim()) return
    setOccupe(true)
    const { error } = await supabase.from('messages').insert({ athlete_id: athleteId, auteur_id: profil.id, texte: texte.trim() })
    setOccupe(false)
    if (error) return toast(error.message)
    setTexte('')
    charger()
  }

  async function supprimer(m) {
    if (!confirm('Supprimer ce message ?')) return
    await supabase.from('messages').delete().eq('id', m.id)
    charger()
  }

  if (msgs === null) return null
  return (
    <div className="card conversation">
      {msgs.length === 0 && <p className="empty">Aucun message pour l’instant. {profil.role === 'athlete' ? 'Pose ta question à ton coach ici.' : 'Écris à ton athlète ici : tous ses coachs voient la conversation.'}</p>}
      <div className="bulles">
        {msgs.map((m) => {
          const moi = m.auteur_id === profil.id
          return (
            <div key={m.id} className={`bulle${moi ? ' moi' : ''}`}>
              {!moi && <span className="label">{m.auteur?.nom || 'Sans nom'}{m.auteur?.role === 'coach' && profil.role === 'athlete' ? ' · coach' : ''}</span>}
              <p>{m.texte}</p>
              <small>{heure(m.created_at)}{moi && <> · <button className="linkbtn" onClick={() => supprimer(m)}>Supprimer</button></>}</small>
            </div>
          )
        })}
        <div ref={fin} />
      </div>
      <form className="envoi" onSubmit={envoyer}>
        <textarea rows="2" value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ton message" maxLength={4000} aria-label="Message"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) envoyer(e) }} />
        <button className="btn" disabled={occupe || !texte.trim()}>Envoyer</button>
      </form>
    </div>
  )
}
