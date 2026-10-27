import { useState } from 'react'

// Règles d'un mot de passe solide, cochées au fil de la saisie
const REGLES = [
  { id: 'long', label: '8 caractères minimum', test: (p) => p.length >= 8 },
  { id: 'maj', label: 'Une majuscule', test: (p) => /[A-Z]/.test(p) },
  { id: 'min', label: 'Une minuscule', test: (p) => /[a-z]/.test(p) },
  { id: 'chiffre', label: 'Un chiffre', test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'Un caractère spécial (!@#$…)', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
]

export const estSolide = (p) => REGLES.every((r) => r.test(p || ''))

export function ReglesMdp({ valeur }) {
  return (
    <ul className="regles-mdp">
      {REGLES.map((r) => <li key={r.id} className={r.test(valeur) ? 'ok' : undefined}><span className="case" aria-hidden="true">✓</span>{r.label}</li>)}
    </ul>
  )
}

// Champ mot de passe avec bouton Afficher / Masquer
// `name` et `autoComplete` permettent au trousseau / gestionnaire de mots de passe de proposer l'enregistrement et le remplissage
export function ChampMdp({ label, valeur, onChange, nouveau = false, regles = false, name }) {
  const [voir, setVoir] = useState(false)
  const nomChamp = name || (nouveau ? 'new-password' : 'password')
  return (
    <label className="field"><span className="label">{label}</span>
      <span className="mdp">
        <input required type={voir ? 'text' : 'password'} value={valeur} onChange={(e) => onChange(e.target.value)}
          name={nomChamp} id={nomChamp} autoComplete={nouveau ? 'new-password' : 'current-password'}
          autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button type="button" className="btn ghost sm" onClick={() => setVoir(!voir)} aria-pressed={voir}>{voir ? 'Masquer' : 'Afficher'}</button>
      </span>
      {regles && <ReglesMdp valeur={valeur} />}
    </label>
  )
}

// Identifiant caché pour les formulaires sans champ e-mail (changement de mot de passe) :
// le trousseau sait ainsi à quel compte rattacher le nouveau mot de passe
export function IdentifiantCache({ email }) {
  return <input type="email" name="username" autoComplete="username" value={email || ''} readOnly hidden />
}

// Après une connexion réussie : enregistre l'identifiant dans le gestionnaire du navigateur quand il le permet
// (Chrome, Edge, Android). Safari et le trousseau iCloud se basent sur l'envoi du formulaire.
export async function memoriserIdentifiants(email, mdp, nom) {
  try {
    if (!window.PasswordCredential || !navigator.credentials?.store) return
    await navigator.credentials.store(new window.PasswordCredential({ id: email, password: mdp, name: nom || email }))
  } catch { /* refus ou API indisponible : sans conséquence */ }
}

// Messages d'erreur Supabase en français
export function traduire(m = '') {
  if (/Invalid login/i.test(m)) return 'E-mail ou mot de passe incorrect.'
  if (/already registered|already exists/i.test(m)) return 'Un compte existe déjà avec cet e-mail. Connecte-toi.'
  if (/Email not confirmed/i.test(m)) return 'Confirme d’abord ton e-mail avec le lien reçu.'
  if (/same.*password|different from the old/i.test(m)) return 'Choisis un mot de passe différent de l’ancien.'
  if (/weak|at least|too short/i.test(m)) return 'Le mot de passe ne respecte pas toutes les règles.'
  if (/rate limit|too many|seconds/i.test(m)) return 'Trop de demandes. Réessaie dans quelques minutes.'
  if (/invalid.*email|email.*invalid/i.test(m)) return 'Adresse e-mail invalide.'
  return m
}
