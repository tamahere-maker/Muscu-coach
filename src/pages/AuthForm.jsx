import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Connexion ou création de compte. `role` fixe le rôle du compte créé (coach depuis l'accueil, athlète depuis une invitation).
export default function AuthForm({ role, retour = window.location.origin, titre }) {
  const [mode, setMode] = useState('inscription')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [err, setErr] = useState('')
  const [envoye, setEnvoye] = useState(false)
  const [occupe, setOccupe] = useState(false)

  async function valider(e) {
    e.preventDefault()
    setErr(''); setOccupe(true)
    const { data, error } = mode === 'connexion'
      ? await supabase.auth.signInWithPassword({ email, password: mdp })
      : await supabase.auth.signUp({ email, password: mdp, options: { data: { role, nom }, emailRedirectTo: retour } })
    setOccupe(false)
    if (error) return setErr(traduire(error.message))
    if (mode === 'inscription' && !data.session) setEnvoye(true)
  }

  if (envoye) return (
    <div className="card auth">
      <h2>Vérifie ta boîte mail</h2>
      <p className="sub">Un lien de confirmation a été envoyé à {email}. Clique dessus pour activer ton compte.</p>
    </div>
  )

  return (
    <form className="card auth" onSubmit={valider}>
      <h2>{titre}</h2>
      <div className="seg" role="group">
        <button type="button" aria-pressed={mode === 'inscription'} onClick={() => setMode('inscription')}>Créer un compte</button>
        <button type="button" aria-pressed={mode === 'connexion'} onClick={() => setMode('connexion')}>Se connecter</button>
      </div>
      {mode === 'inscription' && (
        <label className="field"><span className="label">Nom</span>
          <input required value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" /></label>
      )}
      <label className="field"><span className="label">E-mail</span>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label className="field"><span className="label">Mot de passe</span>
        <input required type="password" minLength={8} value={mdp} onChange={(e) => setMdp(e.target.value)}
          autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'} /></label>
      {err && <p className="err">{err}</p>}
      <button className="btn" disabled={occupe}>{mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}</button>
    </form>
  )
}

function traduire(m) {
  if (/Invalid login/i.test(m)) return 'E-mail ou mot de passe incorrect.'
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail. Connecte-toi.'
  if (/Email not confirmed/i.test(m)) return 'Confirme d’abord ton e-mail avec le lien reçu.'
  if (/at least/i.test(m)) return 'Le mot de passe doit faire au moins 8 caractères.'
  return m
}
