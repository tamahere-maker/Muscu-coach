import { Link, NavLink, useLocation, Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from './lib/session'
import { supabase } from './lib/supabase'
import { Toast } from './lib/ui'
import Connexion from './pages/Connexion'
import Invitation from './pages/Invitation'
import CoachAthletes from './pages/CoachAthletes'
import AthleteEntrainement from './pages/AthleteEntrainement'
import AthleteNutrition from './pages/AthleteNutrition'
import AthleteProfil from './pages/AthleteProfil'
import SeanceGuidee from './pages/SeanceGuidee'
import Exercices from './pages/Exercices'
import Aliments from './pages/Aliments'
import Programmes from './pages/Programmes'
import ProgrammeEditeur from './pages/ProgrammeEditeur'
import Plans from './pages/Plans'
import PlanEditeur from './pages/PlanEditeur'
import AthleteSuivi from './pages/AthleteSuivi'
import MesProgres from './pages/MesProgres'
import BilanDetail from './pages/BilanDetail'
import BilanFormulaire from './pages/BilanFormulaire'

export default function App() {
  const { session, profil } = useSession()
  const location = useLocation()
  if (session === undefined) return null

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div className="brand">Muscu <b>Coach</b></div>
          <span className="spacer" />
          {profil && (profil.role === 'coach'
            ? <span className="who">{profil.nom || session.user.email} · Coach</span>
            : <Link className="who" to="/profil">{profil.nom || session.user.email} · Mon profil</Link>)}
          {session && <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Déconnexion</button>}
        </div>
        {profil && (
          <nav className="tabs">
            {profil.role === 'coach' ? (
              <>
                <NavLink to="/" end>Athlètes</NavLink>
                <NavLink to="/programmes">Programmes</NavLink>
                <NavLink to="/nutrition">Nutrition</NavLink>
                <NavLink to="/exercices">Exercices</NavLink>
                <NavLink to="/aliments">Aliments</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/" className={({ isActive }) => (isActive || /^\/(seance|progres)/.test(location.pathname) ? 'active' : undefined)} end>Entraînement</NavLink>
                <NavLink to="/nutrition">Nutrition</NavLink>
              </>
            )}
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
              <Route path="/" element={profil.role === 'coach' ? <CoachAthletes /> : <AthleteEntrainement />} />
              {profil.role === 'coach' && <Route path="/programmes" element={<Programmes />} />}
              {profil.role === 'coach' && <Route path="/programmes/:id" element={<ProgrammeEditeur />} />}
              <Route path="/nutrition" element={profil.role === 'coach' ? <Plans /> : <AthleteNutrition />} />
              {profil.role === 'athlete' && <Route path="/seance/:id" element={<SeanceGuidee />} />}
              {profil.role === 'athlete' && <Route path="/profil" element={<AthleteProfil />} />}
              {profil.role === 'athlete' && <Route path="/progres" element={<MesProgres />} />}
              {profil.role === 'coach' && <Route path="/athletes/:id" element={<AthleteSuivi />} />}
              {profil.role === 'athlete' && <Route path="/bilan/:id" element={<BilanFormulaire />} />}
              <Route path="/bilans/:id" element={<BilanDetail />} />
              {profil.role === 'coach' && <Route path="/nutrition/:id" element={<PlanEditeur />} />}
              {profil.role === 'coach' && <Route path="/exercices" element={<Exercices />} />}
              {profil.role === 'coach' && <Route path="/aliments" element={<Aliments />} />}
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </main>
      <Toast />
    </>
  )
}
