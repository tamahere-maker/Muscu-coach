import { enUnite, pas, unite, unites } from './nutrition'

// Saisie d'une quantité dans l'unité choisie (g, ml, cuillère, unité de l'aliment).
// onChange reçoit { grammes } quand la quantité change, { unite } quand l'unité change.
export default function Quantite({ aliment, grammes, code, onChange }) {
  const u = unite(aliment, code), liste = unites(aliment)
  return (
    <span className="row qte-unite">
      <input key={`${aliment.id}-${grammes}-${u.code}`} type="number" min="0" step={pas(u)} className="qte"
        aria-label={`Quantité de ${aliment.nom}`} defaultValue={enUnite(u, grammes)}
        onBlur={(e) => {
          const g = Math.round(Number(e.target.value) * u.g * 10) / 10
          if (e.target.value !== '' && g > 0 && g !== Number(grammes)) onChange({ grammes: g })
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
      {liste.length > 1
        ? <select className="unite" aria-label={`Unité pour ${aliment.nom}`} value={u.code} onChange={(e) => onChange({ unite: e.target.value })}>
            {liste.map((x) => <option key={x.code} value={x.code}>{x.pluriel}</option>)}
          </select>
        : <span className="sub">{u.pluriel}</span>}
    </span>
  )
}
