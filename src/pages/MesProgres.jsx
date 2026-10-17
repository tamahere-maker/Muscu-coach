import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Progres from '../lib/Progres'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

// Statistiques et historique des séances de l'athlète
export default function MesProgres() {
  const { profil } = useSession()
  const [objectif, setObjectif] = useState(undefined)
  useEffect(() => {
    supabase.from('athlete_profiles').select('seances_semaine').eq('athlete_id', profil.id).maybeSingle().then(({ data }) => setObjectif(data?.seances_semaine ?? null))
  }, [profil.id])
  if (objectif === undefined) return null
  return (
    <>
      <div><Link className="linkbtn" to="/">‹ Mes séances</Link><h1>Mes progrès</h1></div>
      <Progres athleteId={profil.id} objectifSemaine={objectif} />
    </>
  )
}
