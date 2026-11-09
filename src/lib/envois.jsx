import { supabase } from './supabase'

// E-mails envoyés par la fonction Supabase « envois » (Resend) : invitations et confirmation de contrat.
// Renvoie null si l'e-mail est parti, sinon le message d'erreur à afficher.
export async function envoyerEmail(action, id) {
  try {
    const { data, error } = await supabase.functions.invoke('envois', { body: { action, id } })
    if (!error) return data?.erreur ?? null
    const corps = await error.context?.json?.().catch(() => null)
    return corps?.erreur || 'L’e-mail n’a pas pu partir. Réessaie plus tard.'
  } catch {
    return 'L’e-mail n’a pas pu partir. Réessaie plus tard.'
  }
}

// Résultat d'une invitation tout juste créée : état de l'e-mail + lien à copier en secours
export function ResultatInvitation({ nouveau, copier }) {
  if (!nouveau) return null
  return (
    <>
      <p className={nouveau.etat === 'echec' ? 'err' : 'sub'} style={{ margin: 0 }}>
        {nouveau.etat === 'envoi' ? `Envoi de l’e-mail à ${nouveau.email}…`
          : nouveau.etat === 'ok' ? `E-mail d’invitation envoyé à ${nouveau.email}. Tu peux aussi lui transmettre le lien toi-même :`
          : `${nouveau.erreur} L’invitation est créée : envoie-lui ce lien toi-même.`}
      </p>
      <div className="lien"><code>{nouveau.lien}</code>
        <button type="button" className="btn ghost sm" onClick={() => copier(nouveau.lien)}>Copier le lien</button></div>
    </>
  )
}
