import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Progres from '../lib/Progres'
import AthleteBilans from './AthleteBilans'
import AthleteNutrition from './AthleteNutrition'
import AthleteCoachs from './AthleteCoachs'
import Conversation from '../lib/Messages'

const VUES = [['seances', 'Séances'], ['nutrition', 'Nutrition'], ['bilans', 'Bilans'], ['messages', 'Messages'], ['coachs', 'Coachs']]

// Suivi d'un athlète par son coach : séances faites et statistiques, repas confirmés, bilans
export default function AthleteSuivi() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const vue = VUES.some(([k]) => k === params.get('vue')) ? params.get('vue') : 'seances'
  const [athlete, setAthlete] = useState(null)
  const [actifs, setActifs] = useState({})

  useEffect(() => {
    supabase.from('profiles').select('id, nom, athlete_profiles(seances_semaine)').eq('id', id).single().then(({ data }) => setAthlete(data))
    Promise.all([
      supabase.from('programmes').select('id, nom, prix_eur').eq('athlete_id', id).eq('actif', true).maybeSingle(),
      supabase.from('plans_nutrition').select('id, nom').eq('athlete_id', id).eq('actif', true).maybeSingle(),
    ]).then(([p, n]) => setActifs({ prog: p.data, plan: n.data }))
  }, [id])

  if (!athlete) return null
  const ap = Array.isArray(athlete.athlete_profiles) ? athlete.athlete_profiles[0] : athlete.athlete_profiles

  return (
    <>
      <div>
        <Link className="linkbtn" to="/">← Mes athlètes</Link>
        <h1 style={{ marginTop: 8 }}>Suivi de {athlete.nom}</h1>
        <div className="seg" role="group" aria-label="Vue">
          {VUES.map(([k, l]) => <button key={k} aria-pressed={vue === k} onClick={() => setParams({ vue: k }, { replace: true })}>{l}</button>)}
        </div>
      </div>
      {vue === 'seances' && actifs.prog && <div className="row"><Link className="btn ghost sm" to={`/programmes/${actifs.prog.id}`}>Modifier son programme · {actifs.prog.nom}</Link></div>}
      {vue === 'nutrition' && actifs.plan && <div className="row"><Link className="btn ghost sm" to={`/nutrition/${actifs.plan.id}`}>Modifier son plan · {actifs.plan.nom}</Link></div>}
      {vue === 'seances' && <Progres athleteId={id} objectifSemaine={ap?.seances_semaine} />}
      {vue === 'nutrition' && <AthleteNutrition athleteId={id} lecture />}
      {vue === 'bilans' && <AthleteBilans id={id} />}
      {vue === 'messages' && <Conversation athleteId={id} />}
      {vue === 'coachs' && <AthleteCoachs id={id} prix={actifs.prog?.prix_eur} />}
    </>
  )
}
