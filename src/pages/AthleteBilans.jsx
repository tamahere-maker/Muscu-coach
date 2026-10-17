import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, toast } from '../lib/ui'
import { JOURS, TYPES_COACH, dateFr } from '../lib/bilans'

// Suivi des bilans d'un athlète par le coach : jour du bilan hebdomadaire, demandes, historique
export default function AthleteBilans({ id }) {
  const { profil } = useSession()
  const [athlete, setAthlete] = useState(null)
  const [bilans, setBilans] = useState(null)
  const [jour, setJour] = useState('')

  async function charger() {
    const [a, b, s] = await Promise.all([
      supabase.from('profiles').select('id, nom').eq('id', id).single(),
      supabase.from('bilans').select('id, type, statut, created_at, envoye_at, poids_kg, reponse_coach').eq('athlete_id', id).order('created_at', { ascending: false }),
      supabase.from('suivi_bilans').select('jour_semaine').eq('athlete_id', id).maybeSingle(),
    ])
    setAthlete(a.data); setBilans(b.data ?? []); setJour(s.data?.jour_semaine ?? '')
  }
  useEffect(() => { charger() }, [id])

  async function changerJour(v) {
    setJour(v)
    const { error } = await supabase.from('suivi_bilans').upsert({ athlete_id: id, jour_semaine: v === '' ? null : Number(v), updated_at: new Date().toISOString() })
    toast(error ? error.message : v === '' ? 'Bilan hebdomadaire désactivé' : `Bilan chaque ${JOURS[v - 1]}`)
  }
  async function demander() {
    const { error } = await supabase.from('bilans').insert({ athlete_id: id, type: 'ponctuel', statut: 'demande', demande_par: profil.id })
    if (error) return toast(error.message)
    toast(`Bilan demandé à ${athlete.nom}`)
    charger()
  }
  async function annuler(b) {
    await supabase.from('bilans').delete().eq('id', b.id)
    charger()
  }

  if (!athlete || !bilans) return null
  const statut = (b) => b.statut === 'demande' ? <span className="pill warn">En attente</span>
    : b.statut === 'envoye' ? <span className="pill acc">Nouveau</span> : <span className="pill ok">{b.reponse_coach ? 'Répondu' : 'Lu'}</span>

  return (
    <>
      <div className="card">
        <div className="grid2">
          <label className="field"><span className="label">Bilan hebdomadaire</span>
            <select className="inp" value={jour} onChange={(e) => changerJour(e.target.value)}>
              <option value="">Pas de bilan hebdomadaire</option>
              {JOURS.map((j, i) => <option key={j} value={i + 1}>Chaque {j}</option>)}
            </select></label>
          <div className="field"><span className="label">Bilan ponctuel</span>
            <button className="btn ghost" onClick={demander}>Demander un bilan maintenant</button></div>
        </div>
        <p className="sub" style={{ margin: 0 }}>Le bilan initial est proposé automatiquement à l’athlète à son inscription.</p>
      </div>

      <div className="card">
        <h2>Historique</h2>
        {bilans.length === 0 ? <p className="empty">Aucun bilan pour l’instant.</p> : (
          <div className="liste">
            {bilans.map((b) => (
              <div key={b.id}>
                <div className="athlete">
                  <strong>{TYPES_COACH[b.type]} {statut(b)}</strong>
                  <span className="sub">{b.envoye_at ? `Envoyé le ${dateFr(b.envoye_at)}` : `Demandé le ${dateFr(b.created_at)}`}{b.poids_kg != null ? ` · ${fmt(b.poids_kg, 1)} kg` : ''}</span>
                </div>
                {b.statut === 'demande'
                  ? <button className="linkbtn" onClick={() => annuler(b)}>Annuler</button>
                  : <Link className="btn ghost sm" to={`/bilans/${b.id}`}>Ouvrir</Link>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
