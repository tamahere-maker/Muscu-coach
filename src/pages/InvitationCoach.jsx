import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, toast } from '../lib/ui'
import AuthForm from './AuthForm'

// Invitation d'un coach associé par le coach principal d'un athlète
export default function InvitationCoach() {
  const { token } = useParams()
  const { session, profil } = useSession()
  const nav = useNavigate()
  const [infos, setInfos] = useState(undefined)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (profil?.role !== 'coach') return
    supabase.rpc('infos_invitation_coach', { t: token }).then(({ data }) => setInfos(data?.[0] ?? null))
  }, [token, profil?.role])

  async function accepter() {
    setErr('')
    const { data, error } = await supabase.rpc('accepter_invitation_coach', { t: token })
    if (error) return setErr(error.message)
    toast('Invitation acceptée')
    nav(`/athletes/${data}`, { replace: true })
  }

  if (!session) return (
    <>
      <div className="auth">
        <h1>Invitation</h1>
        <p className="sub">Un coach t’invite à suivre un de ses athlètes sur Muscu Coach. Crée ton compte coach ou connecte-toi pour accepter.</p>
      </div>
      <AuthForm role="coach" retour={window.location.href} titre="Compte coach" />
    </>
  )
  if (!profil) return null
  if (profil.role !== 'coach') return (
    <div className="card auth"><h2>Invitation</h2>
      <p className="sub">Ce lien est destiné à un coach. Déconnecte-toi pour te connecter avec un compte coach.</p></div>
  )
  if (infos === undefined) return null
  if (infos === null) return (
    <div className="card auth"><h2>Invitation</h2>
      <p className="sub">Cette invitation a déjà été utilisée ou annulée. Demande un nouveau lien au coach qui t’a invité.</p></div>
  )
  return (
    <div className="card auth">
      <h2>Coacher {infos.athlete || 'un athlète'}</h2>
      <p className="sub">{infos.coach} t’invite comme coach associé de {infos.athlete || 'son athlète'}, sur le périmètre « {infos.perimetre} »,
        {' '}avec {fmt(infos.part_pct)} % du paiement du programme.</p>
      {err && <p className="err">{err}</p>}
      <button className="btn" onClick={accepter}>Accepter l’invitation</button>
    </div>
  )
}
