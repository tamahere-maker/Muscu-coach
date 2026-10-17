import { useEffect, useState } from 'react'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, toast } from '../lib/ui'

const lienDe = (token) => `${window.location.origin}/invitation/${token}`

export default function CoachAthletes() {
  const { profil } = useSession()
  const [suivis, setSuivis] = useState(null)
  const [invits, setInvits] = useState([])
  const [email, setEmail] = useState('')
  const [prix, setPrix] = useState('')
  const [nouveau, setNouveau] = useState(null)
  const [err, setErr] = useState('')

  async function charger() {
    const [c, i] = await Promise.all([
      supabase.from('coachings')
        .select('id, principal, perimetre, athlete:profiles!coachings_athlete_id_fkey(id, nom, athlete_profiles(niveau, objectifs, materiel, seances_semaine, duree_min, blessures))')
        .eq('coach_id', profil.id).order('created_at'),
      supabase.from('invitations').select('id, email, token, prix_eur, statut, created_at')
        .eq('statut', 'envoyee').order('created_at', { ascending: false }),
    ])
    setSuivis(c.data ?? [])
    setInvits(i.data ?? [])
  }
  useEffect(() => { charger() }, [])

  async function inviter(e) {
    e.preventDefault()
    setErr('')
    const { data, error } = await supabase.from('invitations')
      .insert({ coach_id: profil.id, email: email.trim().toLowerCase(), prix_eur: prix ? Number(prix) : null })
      .select('token').single()
    if (error) return setErr(error.message)
    setNouveau(lienDe(data.token)); setEmail(''); setPrix('')
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
        <p className="sub">Invite un athlète avec son e-mail, puis envoie-lui le lien.</p>
      </div>

      <form className="card" onSubmit={inviter}>
        <h2>Inviter un athlète</h2>
        <div className="grid2">
          <label className="field"><span className="label">E-mail de l’athlète</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field"><span className="label">Prix du programme (€)</span>
            <input type="number" min="0" step="1" value={prix} onChange={(e) => setPrix(e.target.value)} placeholder="Optionnel" /></label>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="row"><button className="btn">Créer l’invitation</button></div>
        {nouveau && (
          <div className="lien"><code>{nouveau}</code>
            <button type="button" className="btn ghost sm" onClick={() => copier(nouveau)}>Copier le lien</button></div>
        )}
      </form>

      {invits.length > 0 && (
        <div className="card">
          <h2>Invitations en attente</h2>
          <div className="liste">
            {invits.map((i) => (
              <div key={i.id}>
                <span>{i.email}{i.prix_eur != null && <span className="pill">{fmt(i.prix_eur)} €</span>}</span>
                <span className="row">
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
            {suivis.map((s) => {
              const p = s.athlete.athlete_profiles ?? {}
              return (
                <div key={s.id}>
                  <div className="athlete">
                    <strong>{s.athlete.nom || 'Sans nom'} {s.principal ? <span className="pill acc">Coach principal</span> : <span className="pill">{s.perimetre}</span>}</strong>
                    <span className="sub">
                      {[p.niveau, p.objectifs?.join(', '), p.seances_semaine && `${p.seances_semaine} séances/sem.`, p.duree_min && `${p.duree_min} min`]
                        .filter(Boolean).join(' · ') || 'Profil pas encore rempli'}
                      {p.blessures ? <> · <strong>{p.blessures}</strong></> : null}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
