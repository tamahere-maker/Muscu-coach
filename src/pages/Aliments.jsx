import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/ui'

export default function Aliments() {
  const [aliments, setAliments] = useState([])
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.from('aliments').select('*').order('categorie').order('nom').then(({ data }) => setAliments(data ?? []))
  }, [])

  const groupes = useMemo(() => {
    const t = q.trim().toLowerCase()
    const g = {}
    for (const a of aliments) if (!t || a.nom.toLowerCase().includes(t)) (g[a.categorie] ??= []).push(a)
    return Object.entries(g)
  }, [aliments, q])

  return (
    <>
      <div>
        <h1>Aliments</h1>
        <p className="sub">Valeurs pour 100 g, et par unité quand l’aliment se compte. Valeurs indicatives.</p>
      </div>
      <input type="search" placeholder="Rechercher un aliment" value={q} onChange={(e) => setQ(e.target.value)} />
      {groupes.map(([cat, liste]) => (
        <div key={cat} className="card">
          <h2>{cat}</h2>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Aliment</th><th className="n">kcal</th><th className="n">Prot.</th><th className="n">Gluc.</th><th className="n">Lip.</th><th>Unité</th></tr></thead>
              <tbody>
                {liste.map((a) => (
                  <tr key={a.id}>
                    <td>{a.nom}</td><td className="n">{fmt(a.kcal)}</td><td className="n">{fmt(a.proteines, 1)}</td>
                    <td className="n">{fmt(a.glucides, 1)}</td><td className="n">{fmt(a.lipides, 1)}</td>
                    <td>{a.unite_nom ? `1 ${a.unite_nom} = ${fmt(a.unite_g)} g` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  )
}
