import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, toast } from '../lib/ui'

// Modèles de programmes du coach : préparés à l'avance, puis attribués aux athlètes
export default function Programmes() {
  const { profil } = useSession()
  const nav = useNavigate()
  const [modeles, setModeles] = useState(null)

  useEffect(() => {
    supabase.from('programmes').select('id, nom, description, prix_eur, seances(count)')
      .is('athlete_id', null).eq('coach_id', profil.id).order('created_at', { ascending: false })
      .then(({ data }) => setModeles(data ?? []))
  }, [profil.id])

  async function creer() {
    const { data, error } = await supabase.from('programmes')
      .insert({ coach_id: profil.id, athlete_id: null, nom: 'Nouveau programme' }).select('id').single()
    if (error) return toast(error.message)
    nav(`/programmes/${data.id}`)
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Mes programmes</h1>
          <p className="sub">Prépare tes programmes à l’avance, puis attribue-les à tes athlètes.</p>
        </div>
        <button className="btn" onClick={creer}>Nouveau programme</button>
      </div>
      <div className="card">
        {modeles === null ? null : modeles.length === 0 ? <p className="empty">Aucun programme pour l’instant.</p> : (
          <div className="liste">
            {modeles.map((m) => (
              <div key={m.id}>
                <div className="athlete">
                  <strong>{m.nom}</strong>
                  <span className="sub">{[`${m.seances[0]?.count ?? 0} séance(s)`, m.prix_eur != null && `${fmt(m.prix_eur)} €`, m.description].filter(Boolean).join(' · ')}</span>
                </div>
                <Link className="btn ghost sm" to={`/programmes/${m.id}`}>Ouvrir</Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
