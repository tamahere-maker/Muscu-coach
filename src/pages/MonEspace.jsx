import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AthleteEntrainement from './AthleteEntrainement'
import AthleteNutrition from './AthleteNutrition'

// Onglet « Moi » du coach : il suit son propre programme et son propre plan, comme un athlète.
// Il se les attribue depuis Programmes et Nutrition (choix « Moi » dans « Attribuer »).
export default function MonEspace({ vue }) {
  // Fiche sportive du coach (matériel, fuseau des rappels) créée au premier passage
  useEffect(() => { supabase.rpc('ouvrir_espace_perso').then(() => {}) }, [])
  return (
    <>
      <nav className="seg" aria-label="Mon espace">
        <NavLink to="/moi" end>Entraînement</NavLink>
        <NavLink to="/moi/nutrition">Nutrition</NavLink>
      </nav>
      {vue === 'nutrition' ? <AthleteNutrition perso /> : <AthleteEntrainement perso />}
    </>
  )
}
