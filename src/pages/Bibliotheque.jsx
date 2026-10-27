import { NavLink } from 'react-router-dom'
import Exercices from './Exercices'
import Aliments from './Aliments'

// Onglet « Bibliothèque » du coach : exercices et aliments, chacun à sa propre adresse
export default function Bibliotheque({ vue }) {
  return (
    <>
      <nav className="seg" aria-label="Bibliothèque">
        <NavLink to="/exercices">Exercices</NavLink>
        <NavLink to="/aliments">Aliments</NavLink>
      </nav>
      {vue === 'aliments' ? <Aliments /> : <Exercices />}
    </>
  )
}
