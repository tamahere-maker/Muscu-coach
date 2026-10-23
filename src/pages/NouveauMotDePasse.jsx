import { useState } from 'react'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/ui'
import { ChampMdp, estSolide, traduire } from '../lib/motdepasse'

// Ouvert depuis le lien « mot de passe oublié » : l'utilisateur est connecté le temps de choisir un nouveau mot de passe
export default function NouveauMotDePasse() {
  const { finirRecuperation } = useSession()
  const [mdp, setMdp] = useState('')
  const [mdp2, setMdp2] = useState('')
  const [err, setErr] = useState('')
  const [occupe, setOccupe] = useState(false)

  async function valider(e) {
    e.preventDefault()
    setErr('')
    if (!estSolide(mdp)) return setErr('Le mot de passe ne respecte pas toutes les règles.')
    if (mdp !== mdp2) return setErr('Les deux mots de passe ne correspondent pas.')
    setOccupe(true)
    const { error } = await supabase.auth.updateUser({ password: mdp })
    setOccupe(false)
    if (error) return setErr(traduire(error.message))
    finirRecuperation()
    toast('Mot de passe modifié')
  }

  async function annuler() {
    finirRecuperation()
    await supabase.auth.signOut()
  }

  return (
    <form className="card auth" onSubmit={valider}>
      <h2>Nouveau mot de passe</h2>
      <p className="sub" style={{ margin: 0 }}>Choisis un nouveau mot de passe pour ton compte Muscu Coach.</p>
      <ChampMdp label="Nouveau mot de passe" valeur={mdp} onChange={setMdp} nouveau regles />
      <ChampMdp label="Confirmer le mot de passe" valeur={mdp2} onChange={setMdp2} nouveau />
      {err && <p className="err">{err}</p>}
      <button className="btn" disabled={occupe}>Enregistrer le mot de passe</button>
      <button type="button" className="linkbtn" onClick={annuler}>Annuler</button>
    </form>
  )
}
