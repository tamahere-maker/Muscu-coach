import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TYPES, dateFr } from '../lib/bilans'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/ui'
import { MATERIEL, NIVEAUX, OBJECTIFS } from '../lib/listes'

// Profil de l'athlète : ses coachs, ses bilans envoyés et les infos utiles au coach
export default function AthleteProfil() {
  const { profil } = useSession()
  const [coachs, setCoachs] = useState(null)
  const [f, setF] = useState(null)
  const [bilans, setBilans] = useState(null)

  useEffect(() => {
    supabase.from('coachings').select('id, principal, perimetre, coach:profiles!coachings_coach_id_fkey(nom)')
      .eq('athlete_id', profil.id).then(({ data }) => setCoachs(data ?? []))
    supabase.from('bilans').select('id, type, statut, created_at, envoye_at, reponse_coach').eq('athlete_id', profil.id)
      .order('created_at', { ascending: false }).then(({ data }) => setBilans(data ?? []))
    supabase.from('athlete_profiles').select('*').eq('athlete_id', profil.id).single().then(({ data }) => setF(data))
  }, [profil.id])

  const maj = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const bascule = (k, v) => maj(k, f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v])
  const nombre = (v) => (v === '' ? null : Number(v))

  async function enregistrer(e) {
    e.preventDefault()
    const { athlete_id, updated_at, ...champs } = f
    const { error } = await supabase.from('athlete_profiles').update({ ...champs, updated_at: new Date().toISOString() }).eq('athlete_id', athlete_id)
    toast(error ? error.message : 'Profil enregistré')
  }

  if (coachs === null || !f || bilans === null) return null
  const envoyes = bilans.filter((b) => b.statut !== 'demande')

  return (
    <>
      <div>
        <h1>Mon profil</h1>
        <p className="sub">{coachs.length
          ? `Suivi par ${coachs.map((c) => c.coach?.nom + (c.principal ? ' (coach principal)' : '')).join(', ')}.`
          : 'Aucun coach pour l’instant : ouvre le lien d’invitation envoyé par ton coach.'}</p>
      </div>

      {envoyes.length > 0 && (
        <div className="card">
          <h2>Mes bilans</h2>
          <div className="liste">
            {envoyes.map((b) => (
              <div key={b.id}>
                <span>{TYPES[b.type].replace('Bilan demandé par ton coach', 'Bilan ponctuel')} · {dateFr(b.envoye_at)}{b.reponse_coach && <span className="pill ok">Réponse du coach</span>}</span>
                <Link className="btn ghost sm" to={`/bilans/${b.id}`}>Voir</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <form className="card" onSubmit={enregistrer}>
        <h2>Mes infos</h2>
        <p className="sub" style={{ margin: 0 }}>Ton coach s’en sert pour construire ton programme.</p>
        <div className="field"><span className="label">Sexe</span>
          <div className="chips">{['Homme', 'Femme'].map((x) => <button type="button" key={x} className="chip" aria-pressed={f.sexe === x} onClick={() => maj('sexe', x)}>{x}</button>)}</div></div>
        <div className="field"><span className="label">Niveau</span>
          <div className="chips">{NIVEAUX.map((n) => <button type="button" key={n} className="chip" aria-pressed={f.niveau === n} onClick={() => maj('niveau', n)}>{n}</button>)}</div></div>
        <div className="field"><span className="label">Objectifs</span>
          <div className="chips">{OBJECTIFS.map((o) => <button type="button" key={o} className="chip" aria-pressed={f.objectifs.includes(o)} onClick={() => bascule('objectifs', o)}>{o}</button>)}</div></div>
        <div className="field"><span className="label">Matériel accessible</span>
          <div className="chips">{Object.keys(MATERIEL).map((m) => <button type="button" key={m} className="chip" aria-pressed={f.materiel.includes(m)} onClick={() => bascule('materiel', m)}>{m}</button>)}</div></div>
        <div className="grid2">
          <label className="field"><span className="label">Séances par semaine</span>
            <input type="number" min="1" max="7" value={f.seances_semaine ?? ''} onChange={(e) => maj('seances_semaine', nombre(e.target.value))} /></label>
          <label className="field"><span className="label">Durée d’une séance (min)</span>
            <input type="number" min="10" max="240" step="5" value={f.duree_min ?? ''} onChange={(e) => maj('duree_min', nombre(e.target.value))} /></label>
          <label className="field"><span className="label">Poids (kg)</span>
            <input type="number" step="0.1" value={f.poids_kg ?? ''} onChange={(e) => maj('poids_kg', nombre(e.target.value))} /></label>
          <label className="field"><span className="label">Taille (cm)</span>
            <input type="number" value={f.taille_cm ?? ''} onChange={(e) => maj('taille_cm', nombre(e.target.value))} /></label>
          <label className="field"><span className="label">Âge</span>
            <input type="number" value={f.age ?? ''} onChange={(e) => maj('age', nombre(e.target.value))} /></label>
        </div>
        <label className="field"><span className="label">Blessures ou douleurs</span>
          <input type="text" value={f.blessures} onChange={(e) => maj('blessures', e.target.value)} placeholder="Optionnel" /></label>
        <div className="row"><button className="btn">Enregistrer</button></div>
      </form>
    </>
  )
}
