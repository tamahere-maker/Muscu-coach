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
      <AuthForm modeInitial="connexion" erreurInitiale={ERREURS[LIEN_ERREUR] ?? ''} />
    </>
  )
}
