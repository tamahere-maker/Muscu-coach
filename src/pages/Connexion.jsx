import AuthForm from './AuthForm'
import { LIEN_ERREUR } from '../lib/supabase'

const ERREURS = {
  expire: 'Ce lien a expiré ou a déjà servi. Connecte-toi, ou refais une demande avec « Mot de passe oublié ? ».',
  invalide: 'Ce lien n’est pas valide. Connecte-toi, ou refais une demande avec « Mot de passe oublié ? ».',
}

export default function Connexion() {
  return (
    <>
      <div className="auth">
        <h1>Muscu Coach</h1>
        <p className="sub">Programmes, suivi et nutrition, avec ton coach.</p>
      </div>
      <AuthForm role="coach" titre="Espace coach" modeInitial="connexion" erreurInitiale={ERREURS[LIEN_ERREUR] ?? ''} />
      <p className="note auth">Tu es athlète ? Ton coach t’envoie un lien d’invitation pour créer ton compte. Si tu as déjà un compte, connecte-toi ci-dessus.</p>
    </>
  )
}
