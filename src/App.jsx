import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from './lib/session'
import { supabase } from './lib/supabase'
import { Toast } from './lib/ui'
import Connexion from './pages/Connexion'
import Invitation from './pages/Invitation'
import CoachAthletes from './pages/CoachAthletes'
import AthleteAccueil from './pages/AthleteAccueil'
import Exercices from './pages/Exercices'
import Aliments from './pages/Aliments'
import Programmes from './pages/Programmes'
import ProgrammeEditeur from './pages/ProgrammeEditeur'
import Plans from './pages/Plans'
import PlanEditeur from './pages/PlanEditeur'
import AthleteBilans from './pages/AthleteBilans'
import BilanDetail from './pages/BilanDetail'
import BilanFormulaire from './pages/BilanFormulaire'

export default function App() {
  const { session, profil } = useSession()
  if (session === undefined) return null

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div className="brand">Muscu <b>Coach</b></div>
          <span className="spacer" />
          {profil && <span className="who">{profil.nom || session.user.email} · {profil.role === 'coach' ? 'Coach' : 'Athlète'}</span>}
          {session && <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Déconnexion</button>}
        </div>
        {profil && (
          <nav className="tabs">
            <NavLink to="/">{profil.role === 'coach' ? 'Athlètes' : 'Accueil'}</NavLink>
            {profil.role === 'coach' && <NavLink to="/programmes">Programmes</NavLink>}
            {profil.role === 'coach' && <NavLink to="/nutrition">Nutrition</NavLink>}
            <NavLink to="/exercices">Exercices</NavLink>
            <NavLink to="/aliments">Aliments</NavLink>
          </nav>
        )}
      </header>
      <main>
        <Routes>
          <Route path="/invitation/:token" element={<Invitation />} />
          {!session ? (
            <Route path="*" element={<Connexion />} />
          ) : !profil ? (
            <Route path="*" element={null} />
          ) : (
            <>
              <Route path="/" element={profil.role === 'coach' ? <CoachAthletes /> : <AthleteAccueil />} />
              {profil.role === 'coach' && <Route path="/programmes" element={<Programmes />} />}
              {profil.role === 'coach' && <Route path="/programmes/:id" element={<ProgrammeEditeur />} />}
              {profil.role === 'coach' && <Route path="/nutrition" element={<Plans />} />}
              {profil.role === 'coach' && <Route path="/athletes/:id" element={<AthleteBilans />} />}
              {profil.role === 'athlete' && <Route path="/bilan/:id" element={<BilanFormulaire />} />}
              <Route path="/bilans/:id" element={<BilanDetail />} />
              {profil.role === 'coach' && <Route path="/nutrition/:id" element={<PlanEditeur />} />}
              <Route path="/exercices" element={<Exercices />} />
              <Route path="/aliments" element={<Aliments />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </main>
      <Toast />
    </>
  )
}
