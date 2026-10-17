import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/ui'
import AuthForm from './AuthForm'

export default function Invitation() {
  const { token } = useParams()
  const { session, profil } = useSession()
  const nav = useNavigate()
  const [err, setErr] = useState('')

  async function accepter() {
    setErr('')
    const { error } = await supabase.rpc('accepter_invitation', { t: token })
    if (error) return setErr(error.message)
    toast('Invitation acceptée, ton coach te suit maintenant')
    nav('/', { replace: true })
  }

  if (!session) return (
    <>
      <div className="auth">
        <h1>Invitation</h1>
        <p className="sub">Ton coach t’invite sur Muscu Coach. Crée ton compte athlète pour recevoir ton programme.</p>
      </div>
      <AuthForm role="athlete" retour={window.location.href} titre="Compte athlète" />
    </>
  )
  if (!profil) return null
  if (profil.role === 'coach') return (
    <div className="card auth"><h2>Invitation</h2>
      <p className="sub">Ce lien est destiné à un athlète. Déconnecte-toi pour créer un compte athlète.</p></div>
  )
  return (
    <div className="card auth">
      <h2>Rejoindre ton coach</h2>
      <p className="sub">En acceptant, ton coach pourra voir ton profil et te préparer programme et plan alimentaire.</p>
      {err && <p className="err">{err}</p>}
      <button className="btn" onClick={accepter}>Accepter l’invitation</button>
    </div>
  )
}
