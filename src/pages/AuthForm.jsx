import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { ChampMdp, estSolide, traduire } from '../lib/motdepasse'

// Connexion, création de compte et mot de passe oublié. `role` fixe le rôle du compte créé (coach depuis l'accueil, athlète depuis une invitation).
export default function AuthForm({ role, retour = window.location.origin + '/', titre, modeInitial = 'inscription', erreurInitiale = '' }) {
  const [mode, setMode] = useState(modeInitial)
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [mdp2, setMdp2] = useState('')
  const [err, setErr] = useState(erreurInitiale)
  const [nonConfirme, setNonConfirme] = useState(false)
  const [envoye, setEnvoye] = useState(null)
  const [occupe, setOccupe] = useState(false)

  function changer(m) { setMode(m); setErr(''); setNonConfirme(false) }

  async function valider(e) {
    e.preventDefault()
    setErr(''); setNonConfirme(false)
    if (mode === 'inscription') {
      if (!estSolide(mdp)) return setErr('Le mot de passe ne respecte pas toutes les règles.')
      if (mdp !== mdp2) return setErr('Les deux mots de passe ne correspondent pas.')
    }
    setOccupe(true)
    if (mode === 'oubli') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/' })
      setOccupe(false)
      // Réponse identique que le compte existe ou non, sauf si l'envoi est bloqué
      if (error && /rate limit|too many|seconds/i.test(error.message)) return setErr(traduire(error.message))
      return setEnvoye('oubli')
    }
    const { data, error } = mode === 'connexion'
      ? await supabase.auth.signInWithPassword({ email, password: mdp })
      : await supabase.auth.signUp({ email, password: mdp, options: { data: { role, nom }, emailRedirectTo: retour } })
    setOccupe(false)
    if (error) {
      setNonConfirme(/Email not confirmed/i.test(error.message))
      return setErr(traduire(error.message))
    }
    if (mode === 'inscription' && !data.session) setEnvoye('confirmation')
  }

  async function renvoyer() {
    setOccupe(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: retour } })
    setOccupe(false)
    setErr(error ? traduire(error.message) : '')
    if (!error) setEnvoye('confirmation-renvoyee')
  }

  if (envoye) return (
    <div className="card auth">
      <h2>Vérifie ta boîte mail</h2>
      <p className="sub">{envoye === 'oubli'
        ? `Si un compte existe avec l’adresse ${email}, un lien pour choisir un nouveau mot de passe vient d’être envoyé.`
        : `Un lien de confirmation ${envoye === 'confirmation-renvoyee' ? 'a de nouveau été' : 'a été'} envoyé à ${email}. Clique dessus pour activer ton compte.`}
        {' '}Pense à regarder dans les courriers indésirables.</p>
      {err && <p className="err">{err}</p>}
      <div className="row">
        {envoye !== 'oubli' && <button className="btn ghost" disabled={occupe} onClick={renvoyer}>Renvoyer l’e-mail</button>}
        <button className="linkbtn" onClick={() => { setEnvoye(null); changer('connexion') }}>Retour à la connexion</button>
      </div>
    </div>
  )

  if (mode === 'oubli') return (
    <form className="card auth" onSubmit={valider}>
      <h2>Mot de passe oublié</h2>
      <p className="sub" style={{ margin: 0 }}>Saisis l’adresse e-mail de ton compte : tu recevras un lien pour choisir un nouveau mot de passe.</p>
      <label className="field"><span className="label">E-mail</span>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      {err && <p className="err">{err}</p>}
      <button className="btn" disabled={occupe}>Envoyer le lien</button>
      <button type="button" className="linkbtn" onClick={() => changer('connexion')}>Retour à la connexion</button>
    </form>
  )

  return (
    <form className="card auth" onSubmit={valider}>
      <h2>{titre}</h2>
      <div className="seg" role="group">
        <button type="button" aria-pressed={mode === 'inscription'} onClick={() => changer('inscription')}>Créer un compte</button>
        <button type="button" aria-pressed={mode === 'connexion'} onClick={() => changer('connexion')}>Se connecter</button>
      </div>
      {mode === 'inscription' && (
        <label className="field"><span className="label">Nom</span>
          <input required value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" /></label>
      )}
      <label className="field"><span className="label">E-mail</span>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <ChampMdp label="Mot de passe" valeur={mdp} onChange={setMdp} nouveau={mode === 'inscription'} regles={mode === 'inscription'} />
      {mode === 'inscription' && <ChampMdp label="Confirmer le mot de passe" valeur={mdp2} onChange={setMdp2} nouveau />}
      {mode === 'connexion' && <button type="button" className="linkbtn" style={{ justifySelf: 'end' }} onClick={() => changer('oubli')}>Mot de passe oublié ?</button>}
      {err && <p className="err">{err}</p>}
      {nonConfirme && <button type="button" className="btn ghost" disabled={occupe} onClick={renvoyer}>Renvoyer l’e-mail de confirmation</button>}
      <button className="btn" disabled={occupe}>{mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}</button>
    </form>
  )
}
