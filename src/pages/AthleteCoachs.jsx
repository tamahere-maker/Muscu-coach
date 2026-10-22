import { useEffect, useState } from 'react'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, toast } from '../lib/ui'

export const PERIMETRES = ['Entraînement et nutrition', 'Entraînement', 'Nutrition']
const lienDe = (token) => `${window.location.origin}/invitation-coach/${token}`

// Coachs d'un athlète. Le coach principal invite des coachs associés, choisit leur périmètre et leur part du paiement.
export default function AthleteCoachs({ id, prix }) {
  const { profil } = useSession()
  const [coachs, setCoachs] = useState(null)
  const [invits, setInvits] = useState([])
  const [f, setF] = useState({ email: '', perimetre: PERIMETRES[0], part: '' })
  const [nouveau, setNouveau] = useState(null)
  const [err, setErr] = useState('')

  async function charger() {
    const [c, i] = await Promise.all([
      supabase.from('coachings').select('id, coach_id, principal, perimetre, part_pct, coach:profiles!coachings_coach_id_fkey(nom)')
        .eq('athlete_id', id).order('principal', { ascending: false }).order('created_at'),
      supabase.from('invitations_coach').select('id, email, perimetre, part_pct, token').eq('athlete_id', id).eq('statut', 'envoyee').order('created_at'),
    ])
    setCoachs(c.data ?? [])
    setInvits(i.data ?? [])
  }
  useEffect(() => { charger() }, [id])

  if (coachs === null) return null
  const principal = coachs.some((c) => c.principal && c.coach_id === profil.id)
  const associes = coachs.filter((c) => !c.principal)
  const totalParts = (sauf = null, enPlus = 0) =>
    associes.filter((c) => c.id !== sauf).reduce((t, c) => t + Number(c.part_pct), 0) + invits.reduce((t, i) => t + Number(i.part_pct), 0) + enPlus
  const partPrincipal = 100 - totalParts()

  async function inviter(e) {
    e.preventDefault()
    setErr('')
    const part = Number(f.part || 0)
    if (totalParts(null, part) > 100) return setErr(`Il ne reste que ${fmt(partPrincipal)} % à répartir.`)
    const { data, error } = await supabase.from('invitations_coach')
      .insert({ athlete_id: id, invite_par: profil.id, email: f.email.trim().toLowerCase(), perimetre: f.perimetre, part_pct: part })
      .select('token').single()
    if (error) return setErr(error.message)
    setNouveau(lienDe(data.token)); setF({ email: '', perimetre: PERIMETRES[0], part: '' })
    charger()
  }

  async function modifier(c, champs) {
    if ('part_pct' in champs && totalParts(c.id, champs.part_pct) > 100) return toast('La somme des parts dépasse 100 %')
    const { error } = await supabase.from('coachings').update(champs).eq('id', c.id)
    if (error) return toast(error.message)
    charger()
  }

  async function retirer(c) {
    if (!confirm(`Retirer ${c.coach?.nom || 'ce coach'} du suivi de cet athlète ?`)) return
    const { error } = await supabase.from('coachings').delete().eq('id', c.id)
    if (error) return toast(error.message)
    charger()
  }

  async function annuler(i) {
    await supabase.from('invitations_coach').update({ statut: 'annulee' }).eq('id', i.id)
    charger()
  }

  const copier = (lien) => navigator.clipboard.writeText(lien).then(() => toast('Lien copié'))
  const euros = (pct) => (prix ? ` · ${fmt((prix * pct) / 100, 2)} €` : '')

  return (
    <>
      <div className="card">
        <h2>Coachs de l’athlète</h2>
        <div className="liste">
          {coachs.map((c) => (
            <div key={c.id}>
              <span>
                <strong>{c.coach?.nom || 'Coach'}</strong>{' '}
                {c.principal
                  ? <span className="pill acc">Coach principal · {fmt(partPrincipal)} %{euros(partPrincipal)}</span>
                  : !principal && <span className="pill">{c.perimetre} · {fmt(c.part_pct)} %{euros(c.part_pct)}</span>}
              </span>
              {principal && !c.principal && (
                <span className="row">
                  <select className="inp" style={{ width: 'auto' }} value={c.perimetre} onChange={(e) => modifier(c, { perimetre: e.target.value })} aria-label="Périmètre">
                    {PERIMETRES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                  <label className="row" style={{ gap: 4 }}>
                    <input type="number" min="0" max="100" step="1" defaultValue={c.part_pct} aria-label="Part du paiement en %"
                      onBlur={(e) => Number(e.target.value) !== Number(c.part_pct) && modifier(c, { part_pct: Number(e.target.value || 0) })} /> %
                  </label>
                  <button className="linkbtn" onClick={() => retirer(c)}>Retirer</button>
                </span>
              )}
            </div>
          ))}
          {invits.map((i) => (
            <div key={i.id}>
              <span>{i.email} <span className="pill warn">Invitation envoyée</span> <span className="pill">{i.perimetre} · {fmt(i.part_pct)} %</span></span>
              {principal && (
                <span className="row">
                  <button className="btn ghost sm" onClick={() => copier(lienDe(i.token))}>Copier le lien</button>
                  <button className="linkbtn" onClick={() => annuler(i)}>Annuler</button>
                </span>
              )}
            </div>
          ))}
        </div>
        {associes.length === 0 && invits.length === 0 && <p className="empty">Aucun coach associé pour l’instant.</p>}
      </div>

      {principal && (
        <form className="card" onSubmit={inviter}>
          <h2>Inviter un coach associé</h2>
          <p className="sub" style={{ margin: 0 }}>Il pourra suivre l’athlète et modifier son programme, son plan alimentaire ou les deux. Sa part est prise sur la tienne.</p>
          <div className="grid2">
            <label className="field"><span className="label">E-mail du coach</span>
              <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label className="field"><span className="label">Périmètre</span>
              <select className="inp" value={f.perimetre} onChange={(e) => setF({ ...f, perimetre: e.target.value })}>
                {PERIMETRES.map((p) => <option key={p}>{p}</option>)}
              </select></label>
            <label className="field"><span className="label">Part du paiement (%)</span>
              <input type="number" min="0" max={partPrincipal} step="1" value={f.part} onChange={(e) => setF({ ...f, part: e.target.value })} placeholder="0" /></label>
          </div>
          {err && <p className="err">{err}</p>}
          <div className="row"><button className="btn">Créer l’invitation</button></div>
          {nouveau && (
            <div className="lien"><code>{nouveau}</code>
              <button type="button" className="btn ghost sm" onClick={() => copier(nouveau)}>Copier le lien</button></div>
          )}
        </form>
      )}
    </>
  )
}
