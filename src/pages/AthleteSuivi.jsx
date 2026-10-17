import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Progres from '../lib/Progres'
import AthleteBilans from './AthleteBilans'
import AthleteNutrition from './AthleteNutrition'

const VUES = [['seances', 'Séances'], ['nutrition', 'Nutrition'], ['bilans', 'Bilans']]

// Suivi d'un athlète par son coach : séances faites et statistiques, repas confirmés, bilans
export default function AthleteSuivi() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const vue = VUES.some(([k]) => k === params.get('vue')) ? params.get('vue') : 'seances'
  const [athlete, setAthlete] = useState(null)

  useEffect(() => {
    supabase.from('profiles').select('id, nom, athlete_profiles(seances_semaine)').eq('id', id).single().then(({ data }) => setAthlete(data))
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
      {vue === 'seances' && <Progres athleteId={id} objectifSemaine={ap?.seances_semaine} />}
      {vue === 'nutrition' && <AthleteNutrition athleteId={id} lecture />}
      {vue === 'bilans' && <AthleteBilans id={id} />}
    </>
  )
}
