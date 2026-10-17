import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, toast } from '../lib/ui'

// Modèles de plans alimentaires du coach : préparés à l'avance, puis attribués aux athlètes
export default function Plans() {
  const { profil } = useSession()
  const nav = useNavigate()
  const [plans, setPlans] = useState(null)

  useEffect(() => {
    supabase.from('plans_nutrition').select('id, nom, description, kcal, repas(count)')
      .is('athlete_id', null).eq('coach_id', profil.id).order('created_at', { ascending: false })
      .then(({ data }) => setPlans(data ?? []))
  }, [profil.id])

  async function creer() {
    const { data, error } = await supabase.from('plans_nutrition')
      .insert({ coach_id: profil.id, athlete_id: null, nom: 'Nouveau plan alimentaire' }).select('id').single()
    if (error) return toast(error.message)
    nav(`/nutrition/${data.id}`)
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Plans alimentaires</h1>
          <p className="sub">Prépare tes plans à l’avance, puis attribue-les à tes athlètes.</p>
        </div>
        <button className="btn" onClick={creer}>Nouveau plan</button>
      </div>
      <div className="card">
        {plans === null ? null : plans.length === 0 ? <p className="empty">Aucun plan pour l’instant.</p> : (
          <div className="liste">
            {plans.map((p) => (
              <div key={p.id}>
                <div className="athlete">
                  <strong>{p.nom}</strong>
                  <span className="sub">{[`${p.repas[0]?.count ?? 0} repas`, p.kcal && `${fmt(p.kcal)} kcal`, p.description].filter(Boolean).join(' · ')}</span>
                </div>
                <Link className="btn ghost sm" to={`/nutrition/${p.id}`}>Ouvrir</Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
