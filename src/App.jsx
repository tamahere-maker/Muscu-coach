import { useEffect } from 'react'
import { Link, NavLink, useLocation, Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from './lib/session'
import { LIEN_EMAIL_PARTIEL, LIEN_TYPE, supabase } from './lib/supabase'
import { Toast, toast } from './lib/ui'
import Connexion from './pages/Connexion'
import Invitation from './pages/Invitation'
import InvitationCoach from './pages/InvitationCoach'
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
import MonCompte from './pages/MonCompte'
import MesMessages from './pages/MesMessages'
import { useNonLus } from './lib/Messages'
import NouveauMotDePasse from './pages/NouveauMotDePasse'
import { BandeauxPwa } from './lib/pwa'

// Message affiché à l'arrivée depuis un lien reçu par e-mail
const MESSAGE_LIEN = LIEN_EMAIL_PARTIEL ? 'Lien accepté. Ouvre aussi celui envoyé à ton autre adresse pour finir le changement.'
  : { signup: 'Adresse e-mail confirmée, bienvenue !', email_change: 'Nouvelle adresse e-mail confirmée' }[LIEN_TYPE]

export default function App() {
  const { session, profil, recuperation } = useSession()
  const location = useLocation()
  const pret = !!profil
  const nonLus = useNonLus()
  useEffect(() => { if (pret && MESSAGE_LIEN) toast(MESSAGE_LIEN) }, [pret])
  if (session === undefined) return null
  const choixMdp = session && recuperation

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div className="brand">Muscu <b>Coach</b></div>
          <span className="spacer" />
          {profil && !choixMdp && (profil.role === 'coach'
            ? <Link className="who" to="/compte">{profil.nom || session.user.email} · Mon compte</Link>
            : <>
              <Link className="who" to="/messages">Messages{nonLus[profil.id] > 0 && location.pathname !== '/messages' && <span className="badge">{nonLus[profil.id]}</span>}</Link>
              <Link className="who" to="/profil">{profil.nom || session.user.email} · Mon profil</Link>
            </>)}
          {session && <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Déconnexion</button>}
        </div>
        {profil && !choixMdp && (
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
      <BandeauxPwa connecte={!!profil && !choixMdp} />
      <main>
        <Routes>
          <Route path="/invitation/:token" element={<Invitation />} />
          <Route path="/invitation-coach/:token" element={<InvitationCoach />} />
          {!session ? (
            <Route path="*" element={<Connexion />} />
          ) : choixMdp ? (
            <Route path="*" element={<NouveauMotDePasse />} />
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
              {profil.role === 'athlete' && <Route path="/messages" element={<MesMessages />} />}
              {profil.role === 'coach' && <Route path="/athletes/:id" element={<AthleteSuivi />} />}
              {profil.role === 'athlete' && <Route path="/bilan/:id" element={<BilanFormulaire />} />}
              <Route path="/bilans/:id" element={<BilanDetail />} />
              <Route path="/compte" element={<MonCompte />} />
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
