import { createContext, useContext, useEffect, useState } from 'react'
import { LIEN_RECUPERATION, sessionGardee, supabase } from './supabase'
import { associerUtilisateur } from './horsligne'

const Ctx = createContext(null)

// Session Supabase + profil (rôle, nom) de l'utilisateur connecté.
// `recuperation` : ouvert depuis un lien « mot de passe oublié », il faut d'abord choisir un nouveau mot de passe.
export function SessionProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profil, setProfil] = useState(null)
  const [recuperation, setRecuperation] = useState(LIEN_RECUPERATION)

  useEffect(() => {
    // Sans réseau, une session expirée ne peut pas être renouvelée : on garde celle de l'appareil
    // (les données viennent alors des copies gardées) au lieu de renvoyer vers la connexion.
    const horsLigne = (s, e) => s ?? (e !== 'SIGNED_OUT' && !navigator.onLine ? sessionGardee() : null)
    if (!navigator.onLine && sessionGardee()) setSession(sessionGardee())
    supabase.auth.getSession().then(({ data }) => setSession(horsLigne(data.session)))
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      setSession(horsLigne(s, e))
      if (e === 'PASSWORD_RECOVERY') setRecuperation(true)
      if (e === 'SIGNED_OUT') setRecuperation(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user?.id
  useEffect(() => {
    if (!uid) { setProfil(null); return }
    associerUtilisateur(uid)
    supabase.from('profiles').select('id, role, nom').eq('id', uid).single().then(async ({ data }) => {
      // Administrateur de l'app (vérification des cartes professionnelles) : coach uniquement
      const admin = data?.role === 'coach' ? (await supabase.rpc('est_admin')).data === true : false
      setProfil(data ? { ...data, admin } : data)
    })
  }, [uid])

  const finirRecuperation = () => setRecuperation(false)

  return <Ctx.Provider value={{ session, profil, setProfil, recuperation, finirRecuperation }}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)
