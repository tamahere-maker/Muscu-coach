import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, toast } from '../lib/ui'
import { manquePourMetabolisme, metabolisme } from '../lib/nutrition'
import { useNonLus } from '../lib/Messages'
import TableauDeBord from '../lib/TableauDeBord'
import { useDecroches } from '../lib/decroches'
import { BandeauCarte, useCartePro } from '../lib/cartePro'
import { ResultatInvitation, envoyerEmail } from '../lib/envois'
import GestionSuivi from '../lib/GestionSuivi'

const lienDe = (token) => `${window.location.origin}/invitation/${token}`

export default function CoachAthletes() {
  const { profil } = useSession()
  const [suivis, setSuivis] = useState(null)
  const [invits, setInvits] = useState([])
  const [email, setEmail] = useState('')
  const [prix, setPrix] = useState('')
  const [nouveau, setNouveau] = useState(null)
  const [err, setErr] = useState('')
  const [envoi, setEnvoi] = useState(null) // id de l'invitation dont l'e-mail part
  const [anciens, setAnciens] = useState([])
  const [version, setVersion] = useState(0) // rechargement du tableau de bord et des alertes après une pause ou une fin
  const nonLus = useNonLus()
  const decroches = useDecroches(profil.id, version)
  const [carte] = useCartePro(profil.id)

  async function charger() {
    const [c, i, a] = await Promise.all([
      supabase.from('coachings')
        .select('id, principal, perimetre, pause_depuis, pause_motif, pause_jusqu_au, athlete:profiles!coachings_athlete_id_fkey(id, nom, athlete_profiles(niveau, objectifs, materiel, seances_semaine, duree_min, blessures, sexe, poids_kg, taille_cm, age), programmes!programmes_athlete_id_fkey(id, nom, actif), plans_nutrition!plans_nutrition_athlete_id_fkey(id, nom, actif), bilans!bilans_athlete_id_fkey(statut))')
        .eq('coach_id', profil.id).order('created_at'),
      supabase.from('invitations').select('id, email, token, prix_eur, statut, created_at, email_envoye_at')
        .eq('statut', 'envoyee').order('created_at', { ascending: false }),
      supabase.from('coachings_archives').select('id, athlete_id, nom_athlete, principal, debut_at, fin_at, motif')
        .eq('coach_id', profil.id).order('fin_at', { ascending: false }).limit(50),
    ])
    setSuivis(c.data ?? [])
    setInvits(i.data ?? [])
    // Anciens athlètes : la fin la plus récente de chacun, sauf ceux qui sont de nouveau suivis
    const suivisIds = new Set((c.data ?? []).map((x) => x.athlete.id))
    const vus = new Set()
    setAnciens((a.data ?? []).filter((x) => !suivisIds.has(x.athlete_id) && !vus.has(x.athlete_id) && vus.add(x.athlete_id)))
  }
  useEffect(() => { charger() }, [])

  async function inviter(e) {
    e.preventDefault()
    setErr('')
    const adresse = email.trim().toLowerCase()
    const { data, error } = await supabase.from('invitations')
      .insert({ coach_id: profil.id, email: adresse, prix_eur: prix ? Number(prix) : null })
      .select('id, token').single()
    if (error) return setErr(error.message)
    setEmail(''); setPrix('')
    setNouveau({ lien: lienDe(data.token), email: adresse, etat: 'envoi' })
    const erreur = await envoyerEmail('invitation', data.id)
    setNouveau({ lien: lienDe(data.token), email: adresse, etat: erreur ? 'echec' : 'ok', erreur })
    charger()
  }

  async function renvoyer(i) {
    setEnvoi(i.id)
    const erreur = await envoyerEmail('invitation', i.id)
    setEnvoi(null)
    toast(erreur || `E-mail renvoyé à ${i.email}`)
    charger()
  }

  async function annuler(id) {
    await supabase.from('invitations').update({ statut: 'annulee' }).eq('id', id)
    charger()
  }

  const copier = (lien) => navigator.clipboard.writeText(lien).then(() => toast('Lien copié'))

  return (
    <>
      <div>
        <h1>Mes athlètes</h1>
        <p className="sub">Invite un athlète avec son e-mail : il reçoit un lien pour créer son compte et te rejoindre.</p>
      </div>

      <BandeauCarte carte={carte} />

      <TableauDeBord key={version} nonLus={nonLus} decroches={decroches} />

      <form className="card" onSubmit={inviter}>
        <h2>Inviter un athlète</h2>
        <div className="grid2">
          <label className="field"><span className="label">E-mail de l’athlète</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field"><span className="label">Prix du programme (€)</span>
            <input type="number" min="0" step="1" value={prix} onChange={(e) => setPrix(e.target.value)} placeholder="Optionnel" /></label>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="row"><button className="btn" disabled={nouveau?.etat === 'envoi'}>Envoyer l’invitation</button></div>
        <ResultatInvitation nouveau={nouveau} copier={copier} />
      </form>

      {invits.length > 0 && (
        <div className="card">
          <h2>Invitations en attente</h2>
          <div className="liste">
            {invits.map((i) => (
              <div key={i.id}>
                <span>{i.email}{i.prix_eur != null && <span className="pill">{fmt(i.prix_eur)} €</span>}
                  {i.email_envoye_at && <span className="pill ok">E-mail envoyé le {new Date(i.email_envoye_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>}</span>
                <span className="row">
                  <button className="btn ghost sm" disabled={envoi === i.id} onClick={() => renvoyer(i)}>{i.email_envoye_at ? 'Renvoyer l’e-mail' : 'Envoyer par e-mail'}</button>
                  <button className="btn ghost sm" onClick={() => copier(lienDe(i.token))}>Copier le lien</button>
                  <button className="linkbtn" onClick={() => annuler(i.id)}>Annuler</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Athlètes suivis</h2>
        {suivis === null ? null : suivis.length === 0 ? <p className="empty">Aucun athlète pour l’instant.</p> : (
          <div className="liste">
            {[...suivis].sort((x, y) => !!x.pause_depuis - !!y.pause_depuis || (decroches?.[y.athlete.id]?.gravite ?? 0) - (decroches?.[x.athlete.id]?.gravite ?? 0)).map((s) => {
              const p = s.athlete.athlete_profiles ?? {}
              const prog = s.athlete.programmes?.find((x) => x.actif)
              const plan = s.athlete.plans_nutrition?.find((x) => x.actif)
              const nouveaux = s.athlete.bilans?.filter((x) => x.statut === 'envoye').length ?? 0
              return (
                <div key={s.id}>
                  <div className="athlete">
                    <strong>{s.athlete.nom || 'Sans nom'} {s.principal ? <span className="pill acc">Coach principal</span> : <span className="pill">Coach associé · {s.perimetre}</span>}
                      {s.pause_depuis ? <span className="pill">En pause</span>
                        : decroches?.[s.athlete.id]?.raisons.length > 0 && <span className="pill warn">À relancer</span>}</strong>
                    <span className="sub">
                      {[p.niveau, p.objectifs?.join(', '), p.seances_semaine && `${p.seances_semaine} séances/sem.`, p.duree_min && `${p.duree_min} min`]
                        .filter(Boolean).join(' · ') || 'Profil pas encore rempli'}
                      {p.blessures ? <> · <strong>{p.blessures}</strong></> : null}
                    </span>
                    <Metabolisme p={p} />
                  </div>
                  <span className="row">
                    <Link className="btn sm" to={`/athletes/${s.athlete.id}${nouveaux > 0 ? '?vue=bilans' : ''}`}>Suivi{nouveaux > 0 && <span className="badge">{nouveaux}</span>}</Link>
                    <Link className="btn ghost sm" to={`/messages/${s.athlete.id}`}>Messages{nonLus[s.athlete.id] > 0 && <span className="badge">{nonLus[s.athlete.id]}</span>}</Link>
                    {!s.principal && s.perimetre === 'Nutrition' ? null : prog ? <Link className="btn ghost sm" to={`/programmes/${prog.id}`}>{prog.nom}</Link>
                      : <Link className="linkbtn" to="/programmes">Attribuer un programme</Link>}
                    {!s.principal && s.perimetre === 'Entraînement' ? null : plan ? <Link className="btn ghost sm" to={`/nutrition/${plan.id}`}>{plan.nom}</Link>
                      : <Link className="linkbtn" to="/nutrition">Attribuer un plan</Link>}
                    <GestionSuivi athleteId={s.athlete.id} nom={s.athlete.nom} lien={s} onFait={() => { charger(); setVersion((v) => v + 1) }} />
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {anciens.length > 0 && (
        <div className="card">
          <h2>Anciens athlètes</h2>
          <p className="sub" style={{ margin: 0 }}>Tu n’as plus accès à leurs données. Pour reprendre l’un d’eux, invite-le de nouveau : tu retrouveras son historique.</p>
          <div className="liste">
            {anciens.map((x) => (
              <div key={x.id}>
                <span className="athlete">
                  <strong>{x.nom_athlete || 'Sans nom'}</strong>
                  <span className="sub">Suivi du {new Date(x.debut_at).toLocaleDateString('fr-FR')} au {new Date(x.fin_at).toLocaleDateString('fr-FR')}
                    {x.principal ? '' : ' (coach associé)'}{x.motif ? ` · ${x.motif}` : ''}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function Metabolisme({ p }) {
  const m = metabolisme(p)
  if (!m) return <span className="sub metab">Métabolisme de base : il manque {manquePourMetabolisme(p).join(', ')} dans le profil de l’athlète.</span>
  return (
    <span className="metab">
      Métabolisme de base <strong className="num">{fmt(m.base)} kcal</strong> · Dépense du jour estimée <strong className="num">{fmt(m.depense)} kcal</strong>
      <small className="sub"> ({p.seances_semaine ?? 0} séance{(p.seances_semaine ?? 0) > 1 ? 's' : ''}/sem., ×{fmt(m.facteur, 3)})</small>
    </span>
  )
}
