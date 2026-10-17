import AuthForm from './AuthForm'

export default function Connexion() {
  return (
    <>
      <div className="auth">
        <h1>Muscu Coach</h1>
        <p className="sub">Programmes, suivi et nutrition, avec ton coach.</p>
      </div>
      <AuthForm role="coach" titre="Espace coach" />
      <p className="note auth">Tu es athlète ? Ton coach t’envoie un lien d’invitation pour créer ton compte. Si tu as déjà un compte, connecte-toi ci-dessus.</p>
    </>
  )
}
