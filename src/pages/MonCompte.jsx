import { useState } from 'react'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/ui'
import { ChampMdp, IdentifiantCache, estSolide, memoriserIdentifiants, traduire } from '../lib/motdepasse'
import { CarteApplication } from '../lib/pwa'
import { CarteNotifications } from '../lib/Messages'

// Compte de connexion, commun au coach et à l'athlète : nom, adresse e-mail et mot de passe
export default function MonCompte() {
  const { session, profil, setProfil } = useSession()
  const email = session.user.email
  const [nom, setNom] = useState(profil.nom || '')
  const [nouvelEmail, setNouvelEmail] = useState('')
  const [emailEnvoye, setEmailEnvoye] = useState('')
  const [mdp, setMdp] = useState({ actuel: '', nouveau: '', confirme: '' })
  const [err, setErr] = useState({})
  const [occupe, setOccupe] = useState(false)

  async function enregistrerNom(e) {
    e.preventDefault()
    const { error } = await supabase.from('profiles').update({ nom: nom.trim() }).eq('id', profil.id)
    if (error) return toast(error.message)
    setProfil({ ...profil, nom: nom.trim() })
    toast('Nom enregistré')
  }

  async function changerEmail(e) {
    e.preventDefault()
    setErr({})
    const adresse = nouvelEmail.trim()
    if (adresse.toLowerCase() === email.toLowerCase()) return setErr({ email: 'C’est déjà ton adresse actuelle.' })
    setOccupe(true)
    const { error } = await supabase.auth.updateUser({ email: adresse }, { emailRedirectTo: window.location.origin + '/compte' })
    setOccupe(false)
    if (error) return setErr({ email: traduire(error.message) })
    setEmailEnvoye(adresse); setNouvelEmail('')
  }

  async function changerMdp(e) {
    e.preventDefault()
    setErr({})
    if (!estSolide(mdp.nouveau)) return setErr({ mdp: 'Le nouveau mot de passe ne respecte pas toutes les règles.' })
    if (mdp.nouveau !== mdp.confirme) return setErr({ mdp: 'Les deux mots de passe ne correspondent pas.' })
    if (mdp.nouveau === mdp.actuel) return setErr({ mdp: 'Le nouveau mot de passe doit être différent de l’actuel.' })
    setOccupe(true)
    // Vérifie le mot de passe actuel avant de le remplacer
    const verif = await supabase.auth.signInWithPassword({ email, password: mdp.actuel })
    if (verif.error) { setOccupe(false); return setErr({ mdp: 'Mot de passe actuel incorrect.' }) }
    const { error } = await supabase.auth.updateUser({ password: mdp.nouveau })
    setOccupe(false)
    if (error) return setErr({ mdp: traduire(error.message) })
    await memoriserIdentifiants(email, mdp.nouveau, profil.nom)
    setMdp({ actuel: '', nouveau: '', confirme: '' })
    toast('Mot de passe modifié')
  }

  const majMdp = (k) => (v) => setMdp((x) => ({ ...x, [k]: v }))

  return (
    <>
      <div>
        <h1>Mon compte</h1>
        <p className="sub">Connecté avec {email}.</p>
      </div>

      <form className="card" onSubmit={enregistrerNom}>
        <h2>Nom</h2>
        <label className="field"><span className="label">Nom affiché</span>
          <input type="text" required value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" /></label>
        <div className="row"><button className="btn">Enregistrer</button></div>
      </form>

      <form className="card" onSubmit={changerEmail}>
        <h2>Adresse e-mail</h2>
        {emailEnvoye
          ? <p className="sub" style={{ margin: 0 }}>Un lien de confirmation a été envoyé à {emailEnvoye}{' '}
              (et un message de contrôle à {email}). Ton adresse changera une fois le lien ouvert.</p>
          : <p className="sub" style={{ margin: 0 }}>Tu recevras un lien pour confirmer la nouvelle adresse.</p>}
        <label className="field"><span className="label">Nouvelle adresse</span>
          <input type="email" required value={nouvelEmail} onChange={(e) => setNouvelEmail(e.target.value)} autoComplete="email" /></label>
        {err.email && <p className="err">{err.email}</p>}
        <div className="row"><button className="btn" disabled={occupe}>Changer d’adresse</button></div>
      </form>

      <form className="card" onSubmit={changerMdp}>
        <h2>Mot de passe</h2>
        <IdentifiantCache email={email} />
        <ChampMdp label="Mot de passe actuel" valeur={mdp.actuel} onChange={majMdp('actuel')} />
        <ChampMdp label="Nouveau mot de passe" valeur={mdp.nouveau} onChange={majMdp('nouveau')} nouveau regles />
        <ChampMdp label="Confirmer le mot de passe" valeur={mdp.confirme} onChange={majMdp('confirme')} nouveau name="confirm-password" />
        {err.mdp && <p className="err">{err.mdp}</p>}
        <div className="row"><button className="btn" disabled={occupe}>Changer le mot de passe</button></div>
      </form>

      <CarteNotifications />
      <CarteApplication />
    </>
  )
}
