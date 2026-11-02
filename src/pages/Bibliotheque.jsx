import { NavLink } from 'react-router-dom'
import Exercices from './Exercices'
import Aliments from './Aliments'
import Recettes from './Recettes'

// Onglet « Bibliothèque » du coach : exercices, aliments et recettes, chacun à sa propre adresse
export default function Bibliotheque({ vue }) {
  return (
    <>
      <nav className="seg" aria-label="Bibliothèque">
        <NavLink to="/exercices">Exercices</NavLink>
        <NavLink to="/aliments">Aliments</NavLink>
        <NavLink to="/recettes">Recettes</NavLink>
      </nav>
      {vue === 'aliments' ? <Aliments /> : vue === 'recettes' ? <Recettes /> : <Exercices />}
    </>
  )
}
