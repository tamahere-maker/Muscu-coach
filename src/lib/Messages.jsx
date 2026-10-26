import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSession } from './session'
import { supabase } from './supabase'
import { toast } from './ui'
import { preparerPhoto } from './bilans'
import { activerPush, desactiverPush, notifier, useEtatPush } from './push'

const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const jourCle = (d) => new Date(d).toDateString()
export function jourFr(d) {
  const j = new Date(d), auj = new Date()
  const hier = new Date(auj); hier.setDate(auj.getDate() - 1)
  if (j.toDateString() === auj.toDateString()) return 'Aujourd’hui'
  if (j.toDateString() === hier.toDateString()) return 'Hier'
  return j.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(j.getFullYear() !== auj.getFullYear() && { year: 'numeric' }) })
}
// Heure ou date courte, pour la liste des conversations
export const quand = (d) => (jourCle(d) === new Date().toDateString() ? heure(d)
  : new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))
export const apercu = (texte, type) => (texte?.trim() ? texte : type === 'video' ? '🎬 Vidéo' : type === 'image' ? '📷 Photo' : '')

// Entrée envoie le message sur ordinateur ; sur téléphone, Entrée va à la ligne et on touche « Envoyer »
const entreeEnvoie = () => window.matchMedia('(pointer: fine)').matches

// Texte avec les liens cliquables
const RE_LIEN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'»])/g
export function TexteLiens({ texte }) {
  return texte.split(RE_LIEN).map((x, i) => (i % 2
    ? <a key={i} href={x} target="_blank" rel="noopener noreferrer">{x}</a>
    : <Fragment key={i}>{x}</Fragment>))
}

const MAX_VIDEO = 50 * 1024 * 1024

// Envoie une photo (réduite) ou une vidéo dans le dossier de la conversation ; renvoie { piece_chemin, piece_type }
export async function televerserPiece(athleteId, fichier) {
  const video = fichier.type.startsWith('video/')
  if (video && fichier.size > MAX_VIDEO) throw new Error('Vidéo trop lourde (50 Mo maximum). Filme un passage plus court.')
  const corps = video || fichier.type === 'image/gif' ? fichier : await preparerPhoto(fichier)
  const ext = video ? (fichier.name.split('.').pop() || 'mp4').toLowerCase() : fichier.type === 'image/gif' ? 'gif' : 'jpg'
  const chemin = `${athleteId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('messages').upload(chemin, corps, { contentType: video ? fichier.type : corps.type || 'image/jpeg' })
  if (error) throw error
  return { piece_chemin: chemin, piece_type: video ? 'video' : 'image' }
}

// Chaque abonnement en direct a son propre canal : deux canaux du même nom se partagent et le second planterait
let numCanal = 0

// Messages non lus de l'utilisateur connecté, par athlète ({ [athlete_id]: n }), relus à chaque changement de page
// et à chaque nouveau message
export function useNonLus() {
  const { session } = useSession()
  const { pathname } = useLocation()
  const [n, setN] = useState({})
  const [tic, setTic] = useState(0)
  useEffect(() => {
    if (!session) return
    supabase.rpc('messages_non_lus').then(({ data }) => setN(Object.fromEntries((data ?? []).map((x) => [x.athlete_id, Number(x.n)]))))
  }, [session?.user.id, pathname, tic])
  useEffect(() => {
    if (!session) return
    const canal = supabase.channel(`non-lus-${session.user.id}-${++numCanal}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => setTic((x) => x + 1))
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [session?.user.id])
  return n
}

// Proposition d'activer les notifications, affichée au-dessus d'une conversation
export function BandeauNotifications() {
  const [etat, relire] = useEtatPush()
  const [masque, setMasque] = useState(() => { try { return localStorage.getItem('muscu-notifs-masque') === '1' } catch { return false } })
  if (masque || !['inactif', 'ios'].includes(etat)) return null
  const masquer = () => { setMasque(true); try { localStorage.setItem('muscu-notifs-masque', '1') } catch { /* stockage indisponible */ } }
  const activer = () => activerPush().then(() => toast('Notifications activées'), (e) => toast(e.message)).finally(relire)
  return (
    <div className="bandeau-carte">
      <span>{etat === 'ios'
        ? <>Pour recevoir une notification à chaque message sur iPhone, installe d’abord l’app : dans Safari, <b>Partager</b> puis <b>Sur l’écran d’accueil</b>.</>
        : 'Active les notifications pour être prévenu de chaque nouveau message, même app fermée.'}</span>
      {etat === 'inactif' && <button className="btn sm" onClick={activer}>Activer</button>}
      <button className="btn ghost sm" onClick={masquer}>Plus tard</button>
    </div>
  )
}

// Rubrique « Notifications » de Mon compte
export function CarteNotifications() {
  const [etat, relire] = useEtatPush()
  const [occupe, setOccupe] = useState(false)
  const agir = (f, ok) => { setOccupe(true); f().then(() => toast(ok), (e) => toast(e.message)).finally(() => { setOccupe(false); relire() }) }
  if (etat === null) return null
  return (
    <div className="card">
      <h2>Notifications</h2>
      <p className="sub" style={{ margin: 0 }}>{{
        actif: 'Cet appareil reçoit une notification à chaque nouveau message.',
        inactif: 'Reçois une notification sur cet appareil à chaque nouveau message, même quand l’app est fermée.',
        refuse: 'Les notifications sont bloquées pour ce site dans les réglages du navigateur. Autorise-les puis reviens ici.',
        ios: 'Sur iPhone, les notifications fonctionnent une fois l’app installée : dans Safari, touche Partager puis Sur l’écran d’accueil, et ouvre l’app depuis l’icône.',
        indisponible: 'Ce navigateur ne permet pas les notifications.',
      }[etat]}</p>
      {etat === 'inactif' && <div className="row"><button className="btn" disabled={occupe} onClick={() => agir(activerPush, 'Notifications activées')}>Activer les notifications</button></div>}
      {etat === 'actif' && <div className="row"><button className="btn ghost" disabled={occupe} onClick={() => agir(desactiverPush, 'Notifications désactivées')}>Désactiver sur cet appareil</button></div>}
    </div>
  )
}

// Conversation d'un athlète avec tous ses coachs, mise à jour en direct
export default function Conversation({ athleteId }) {
  const { profil } = useSession()
  const [msgs, setMsgs] = useState(null)
  const [lectures, setLectures] = useState([])
  const [urls, setUrls] = useState({})
  const urlsConnues = useRef({})
  const [texte, setTexte] = useState('')
  const [piece, setPiece] = useState(null) // { fichier, apercu }
  const [occupe, setOccupe] = useState(false)
  const [edition, setEdition] = useState(null) // { id, texte }
  const fin = useRef(null)
  const choixFichier = useRef(null)
  const coach = profil.role === 'coach'

  const marquerLu = () => document.visibilityState === 'visible' && supabase.from('lectures_messages')
    .upsert({ athlete_id: athleteId, lecteur_id: profil.id, lu_jusqu_a: new Date().toISOString() })

  async function charger() {
    const [{ data }, { data: lus }] = await Promise.all([
      supabase.from('messages')
        .select('id, texte, created_at, modifie_at, auteur_id, piece_chemin, piece_type, seance_id, auteur:profiles!messages_auteur_id_fkey(nom, role), exercice:exercices(nom), seance:seances(nom)')
        .eq('athlete_id', athleteId).order('created_at').limit(500),
      supabase.from('lectures_messages').select('lecteur_id, lu_jusqu_a, lecteur:profiles!lectures_messages_lecteur_id_fkey(nom, role)').eq('athlete_id', athleteId),
    ])
    setMsgs(data ?? [])
    setLectures(lus ?? [])
    // Liens temporaires vers les photos et vidéos, demandés une seule fois par fichier
    const manquants = (data ?? []).map((m) => m.piece_chemin).filter((c) => c && !urlsConnues.current[c])
    if (manquants.length) {
      const { data: signes } = await supabase.storage.from('messages').createSignedUrls(manquants, 3600)
      Object.assign(urlsConnues.current, Object.fromEntries((signes ?? []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl])))
      setUrls({ ...urlsConnues.current })
    }
    await marquerLu()
  }

  const relireLectures = () => supabase.from('lectures_messages')
    .select('lecteur_id, lu_jusqu_a, lecteur:profiles!lectures_messages_lecteur_id_fkey(nom, role)').eq('athlete_id', athleteId)
    .then(({ data }) => data && setLectures(data))

  useEffect(() => {
    setMsgs(null)
    charger()
    const canal = supabase.channel(`messages-${athleteId}-${++numCanal}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `athlete_id=eq.${athleteId}` }, charger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lectures_messages', filter: `athlete_id=eq.${athleteId}` }, relireLectures)
      .subscribe()
    window.addEventListener('focus', charger)
    return () => { supabase.removeChannel(canal); window.removeEventListener('focus', charger) }
  }, [athleteId])

  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])
  useEffect(() => () => piece && URL.revokeObjectURL(piece.apercu), [piece])

  function choisirPiece(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.type.startsWith('video/') && f.size > MAX_VIDEO) return toast('Vidéo trop lourde (50 Mo maximum). Filme un passage plus court.')
    setPiece({ fichier: f, apercu: URL.createObjectURL(f) })
  }

  async function envoyer(e) {
    e?.preventDefault()
    if ((!texte.trim() && !piece) || occupe) return
    setOccupe(true)
    try {
      const pj = piece ? await televerserPiece(athleteId, piece.fichier) : {}
      const { data, error } = await supabase.from('messages').insert({ athlete_id: athleteId, auteur_id: profil.id, texte: texte.trim(), ...pj }).select('id').single()
      if (error) throw error
      notifier([data.id])
      setTexte(''); setPiece(null)
      charger()
    } catch (err) { toast(err.message) } finally { setOccupe(false) }
  }

  async function enregistrerEdition() {
    const t = edition.texte.trim()
    const m = msgs.find((x) => x.id === edition.id)
    if (!t && !m.piece_chemin) return toast('Le message ne peut pas être vide')
    const { error } = await supabase.from('messages').update({ texte: t }).eq('id', edition.id)
    if (error) return toast(error.message)
    setEdition(null)
    charger()
  }

  async function supprimer(m) {
    if (!confirm('Supprimer ce message ?')) return
    const { error } = await supabase.from('messages').delete().eq('id', m.id)
    if (error) return toast(error.message)
    if (m.piece_chemin) await supabase.storage.from('messages').remove([m.piece_chemin])
    charger()
  }

  if (msgs === null) return null
  // « Vu » sous mon dernier message : les autres participants qui ont lu la conversation depuis
  const dernierMien = [...msgs].reverse().find((m) => m.auteur_id === profil.id)
  const vuPar = dernierMien ? lectures.filter((l) => l.lecteur_id !== profil.id && new Date(l.lu_jusqu_a) >= new Date(dernierMien.created_at)) : []
  const libelleVu = !vuPar.length ? null : coach
    ? `Vu par ${vuPar.map((l) => l.lecteur_id === athleteId ? (l.lecteur?.nom || 'l’athlète') : (l.lecteur?.nom || 'un coach')).join(', ')}`
    : `Vu${vuPar.length > 1 || vuPar[0].lecteur?.nom ? ` par ${vuPar.map((l) => l.lecteur?.nom || 'ton coach').join(', ')}` : ''}`

  return (
    <div className="card conversation">
      {msgs.length === 0 && <p className="empty">Aucun message pour l’instant. {coach ? 'Écris à ton athlète ici : tous ses coachs voient la conversation.' : 'Pose ta question à ton coach ici.'}</p>}
      <div className="bulles">
        {msgs.map((m, i) => {
          const moi = m.auteur_id === profil.id
          const nouveauJour = i === 0 || jourCle(msgs[i - 1].created_at) !== jourCle(m.created_at)
          const enEdition = edition?.id === m.id
          return (
            <Fragment key={m.id}>
              {nouveauJour && <div className="jour" role="separator">{jourFr(m.created_at)}</div>}
              <div className={`bulle${moi ? ' moi' : ''}`}>
                {!moi && <span className="label">{m.auteur?.nom || 'Sans nom'}{m.auteur?.role === 'coach' && !coach ? ' · coach' : ''}</span>}
                {m.exercice && (coach
                  ? <Link className="contexte" to={`/athletes/${athleteId}?vue=seances`}>À propos de <b>{m.exercice.nom}</b>{m.seance && ` · ${m.seance.nom}`}</Link>
                  : <span className="contexte">À propos de <b>{m.exercice.nom}</b>{m.seance && ` · ${m.seance.nom}`}</span>)}
                {m.piece_type === 'image' && (urls[m.piece_chemin]
                  ? <a href={urls[m.piece_chemin]} target="_blank" rel="noreferrer"><img className="piece" src={urls[m.piece_chemin]} alt="Photo envoyée" loading="lazy" /></a>
                  : <span className="piece vide">Photo</span>)}
                {m.piece_type === 'video' && (urls[m.piece_chemin]
                  ? <video className="piece" src={urls[m.piece_chemin]} controls playsInline preload="metadata" />
                  : <span className="piece vide">Vidéo</span>)}
                {enEdition ? (
                  <div className="edition">
                    <textarea rows="3" value={edition.texte} maxLength={4000} autoFocus aria-label="Modifier le message"
                      onChange={(e) => setEdition({ ...edition, texte: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Escape') setEdition(null); if (e.key === 'Enter' && !e.shiftKey && entreeEnvoie()) { e.preventDefault(); enregistrerEdition() } }} />
                    <span className="row"><button className="btn sm" onClick={enregistrerEdition}>Enregistrer</button>
                      <button className="linkbtn" onClick={() => setEdition(null)}>Annuler</button></span>
                  </div>
                ) : m.texte && <p><TexteLiens texte={m.texte} /></p>}
                <small>{heure(m.created_at)}{m.modifie_at && ' · modifié'}
                  {moi && !enEdition && <> · <button className="linkbtn" onClick={() => setEdition({ id: m.id, texte: m.texte })}>Modifier</button>
                    {' · '}<button className="linkbtn" onClick={() => supprimer(m)}>Supprimer</button></>}</small>
              </div>
              {m === dernierMien && libelleVu && <span className="vu">{libelleVu}</span>}
            </Fragment>
          )
        })}
        <div ref={fin} />
      </div>
      {piece && (
        <div className="piece-attente">
          {piece.fichier.type.startsWith('video/') ? <video src={piece.apercu} muted playsInline /> : <img src={piece.apercu} alt="" />}
          <span className="sub">{piece.fichier.type.startsWith('video/') ? 'Vidéo' : 'Photo'} prête à envoyer</span>
          <button className="linkbtn" onClick={() => setPiece(null)}>Retirer</button>
        </div>
      )}
      <form className="envoi" onSubmit={envoyer}>
        <input ref={choixFichier} type="file" accept="image/*,video/*" hidden onChange={choisirPiece} />
        <button type="button" className="icon-btn joindre" aria-label="Joindre une photo ou une vidéo" title="Joindre une photo ou une vidéo"
          onClick={() => choixFichier.current.click()} disabled={occupe}>📎</button>
        <textarea rows="2" value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ton message" maxLength={4000} aria-label="Message"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || (!e.shiftKey && entreeEnvoie()))) envoyer(e) }} />
        <button className="btn" disabled={occupe || (!texte.trim() && !piece)}>{occupe ? 'Envoi…' : 'Envoyer'}</button>
      </form>
    </div>
  )
}

// Depuis la séance guidée : question au coach sur l'exercice en cours, avec une photo ou une vidéo si besoin
export function EcrireAuCoach({ exercice, seanceId }) {
  const { profil } = useSession()
  const dlg = useRef()
  const choixFichier = useRef()
  const [texte, setTexte] = useState('')
  const [fichier, setFichier] = useState(null)
  const [occupe, setOccupe] = useState(false)

  async function envoyer(e) {
    e.preventDefault()
    if (!texte.trim() && !fichier) return
    setOccupe(true)
    try {
      const pj = fichier ? await televerserPiece(profil.id, fichier) : {}
      const { data, error } = await supabase.from('messages').insert({
        athlete_id: profil.id, auteur_id: profil.id, texte: texte.trim(), exercice_id: exercice.id, seance_id: seanceId, ...pj,
      }).select('id').single()
      if (error) throw error
      notifier([data.id])
      toast('Message envoyé à ton coach')
      setTexte(''); setFichier(null); dlg.current.close()
    } catch (err) { toast(navigator.onLine ? err.message : 'Pas de réseau : réessaie dès que tu as du réseau.') } finally { setOccupe(false) }
  }

  return (
    <>
      <button className="linkbtn" onClick={() => dlg.current.showModal()}>Une question ? Écrire à mon coach</button>
      <dialog ref={dlg}>
        <form className="dlg" onSubmit={envoyer}>
          <div className="dlg-head"><h2>Question sur {exercice.nom}</h2>
            <button type="button" className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button></div>
          <p className="sub" style={{ margin: 0 }}>Ton coach verra de quel exercice tu parles. Tu peux joindre une vidéo pour qu’il corrige ta technique.</p>
          <textarea rows="4" value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={4000} placeholder="Ta question" aria-label="Ta question" />
          <input ref={choixFichier} type="file" accept="image/*,video/*" hidden onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = ''
            if (f && f.type.startsWith('video/') && f.size > MAX_VIDEO) return toast('Vidéo trop lourde (50 Mo maximum). Filme un passage plus court.')
            setFichier(f || null)
          }} />
          <div className="row">
            <button type="button" className="btn ghost sm" onClick={() => choixFichier.current.click()}>📎 {fichier ? 'Changer le fichier' : 'Joindre une photo ou une vidéo'}</button>
            {fichier && <span className="sub">{fichier.type.startsWith('video/') ? 'Vidéo' : 'Photo'} jointe · <button type="button" className="linkbtn" onClick={() => setFichier(null)}>Retirer</button></span>}
          </div>
          <div className="row">
            <button className="btn" disabled={occupe || (!texte.trim() && !fichier)}>{occupe ? 'Envoi…' : 'Envoyer'}</button>
            <button type="button" className="btn ghost" onClick={() => dlg.current.close()}>Annuler</button>
          </div>
        </form>
      </dialog>
    </>
  )
}
