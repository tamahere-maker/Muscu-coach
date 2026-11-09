import { useState } from 'react'
import { supabase } from './supabase'
import { toast } from './ui'
import { envoyerEmail } from './envois'

const demain = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE') }
const dateCourte = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

// Ce que chaque action fait, affiché avant confirmation
const ACTIONS = {
  pause: {
    titre: 'Mettre le suivi en pause',
    bouton: 'Mettre en pause',
    points: [
      'L’athlète garde son compte, son historique, son programme et son plan, et peut toujours t’écrire.',
      'L’athlète sort du tableau de bord et des « À relancer », pour toi et pour ses coachs associés.',
      'Ses notifications de mise à jour s’arrêtent : rien ne part quand tu modifies son programme ou son plan.',
      'Le contrat n’est pas modifié : pense au paiement de la période de pause.',
      'Un e-mail et une notification lui expliquent tout ça.',
      'Avec une date de reprise, le suivi repart tout seul ce jour-là. Sans date, tu reçois un rappel tous les 30 jours.',
    ],
  },
  reprise: {
    titre: 'Reprendre le suivi',
    bouton: 'Reprendre le suivi',
    points: ['Alertes et notifications reviennent comme avant.', 'L’athlète reçoit un e-mail et une notification.'],
  },
  fin: {
    titre: 'Mettre fin au suivi',
    bouton: 'Mettre fin au suivi',
    danger: true,
    points: [
      'Toi et ses coachs associés n’aurez plus accès à ses données (séances, nutrition, bilans, messages).',
      'Le contrat en cours est résilié aujourd’hui ; un contrat pas encore accepté est annulé. Tu gardes l’accès à tes contrats.',
      'Ses données restent dans son espace : si tu l’invites de nouveau, tu retrouveras tout son historique.',
      'L’athlète et ses coachs associés sont prévenus par e-mail, avec le détail de ce qui a été fait.',
    ],
  },
  depart: {
    titre: 'Quitter ce suivi',
    bouton: 'Quitter ce suivi',
    danger: true,
    points: [
      'Tu n’auras plus accès à ses données ; son coach principal continue son suivi.',
      'L’athlète et son coach principal sont prévenus par e-mail.',
    ],
  },
}

// Pause, reprise et fin du suivi d'un athlète. `lien` = la ligne de coaching du coach connecté
// ({ principal, pause_depuis, pause_motif }). `onFait(type)` est appelé après l'action.
export default function GestionSuivi({ athleteId, nom, lien, onFait, ouvert: ouvertInit = false }) {
  const [action, setAction] = useState(null)
  const [motif, setMotif] = useState('')
  const [jusquAu, setJusquAu] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [ouvert, setOuvert] = useState(ouvertInit)
  if (!lien) return null
  const enPause = !!lien.pause_depuis

  async function confirmer() {
    setOccupe(true)
    const { data: ev, error } = action === 'pause' || action === 'reprise'
      ? await supabase.rpc('changer_pause', { a: athleteId, p_pause: action === 'pause', p_motif: motif || null, p_jusqu_au: action === 'pause' && jusquAu ? jusquAu : null })
      : await supabase.rpc('retirer_athlete', { a: athleteId, p_motif: motif || null })
    if (error) { setOccupe(false); return toast(error.message) }
    const erreur = await envoyerEmail('suivi', ev)
    setOccupe(false)
    const fait = { pause: 'Suivi mis en pause', reprise: 'Suivi repris', fin: 'Suivi terminé', depart: 'Tu as quitté ce suivi' }[action]
    toast(erreur ? `${fait}. L’e-mail partira dans quelques minutes.` : `${fait}, e-mail envoyé à ${nom || 'l’athlète'}.`)
    const type = action
    setAction(null); setMotif(''); setJusquAu(''); setOuvert(false)
    onFait?.(type)
  }

  const choix = lien.principal ? [enPause ? 'reprise' : 'pause', 'fin'] : ['depart']

  if (!ouvert) return <button className="btn ghost sm" onClick={() => setOuvert(true)}>Gérer</button>

  const a = action && ACTIONS[action]
  return (
    <div className="gestion">
      {enPause && <p className="sub" style={{ margin: 0 }}>En pause depuis le {dateCourte(lien.pause_depuis)}{lien.pause_jusqu_au ? `, reprise prévue le ${dateCourte(lien.pause_jusqu_au + 'T12:00')}` : ''}{lien.pause_motif ? ` : ${lien.pause_motif}` : ''}.</p>}
      {!a ? (
        <div className="row">
          {choix.map((k) => (
            <button key={k} className={`btn sm ${ACTIONS[k].danger ? 'danger' : 'ghost'}`} onClick={() => setAction(k)}>{ACTIONS[k].bouton}</button>
          ))}
          <button className="linkbtn" onClick={() => setOuvert(false)}>Fermer</button>
        </div>
      ) : (
        <>
          <strong>{a.titre} · {nom || 'Sans nom'}</strong>
          <ul className="sub">{a.points.map((p) => <li key={p}>{p}</li>)}</ul>
          {action === 'pause' && (
            <label className="field"><span className="label">Reprise automatique le (facultatif)</span>
              <input type="date" value={jusquAu} min={demain()} onChange={(e) => setJusquAu(e.target.value)} /></label>
          )}
          <label className="field"><span className="label">Message pour l’athlète (facultatif, repris dans l’e-mail)</span>
            <textarea rows={2} value={motif} maxLength={500} onChange={(e) => setMotif(e.target.value)}
              placeholder={action === 'pause' ? 'Ex. : vacances jusqu’au 1er décembre' : action === 'reprise' ? 'Ex. : on repart sur ton programme habituel' : 'Ex. : fin du programme convenu'} /></label>
          <div className="row">
            <button className={`btn sm ${a.danger ? 'danger' : ''}`} disabled={occupe} onClick={confirmer}>{occupe ? 'Un instant…' : a.bouton}</button>
            <button className="btn ghost sm" disabled={occupe} onClick={() => { setAction(null); setMotif(''); setJusquAu('') }}>Annuler</button>
          </div>
        </>
      )}
    </div>
  )
}
