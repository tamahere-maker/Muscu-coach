import { createContext, useContext, useEffect, useState } from 'react'
import { LIEN_RECUPERATION, supabase } from './supabase'

const Ctx = createContext(null)

// Session Supabase + profil (rôle, nom) de l'utilisateur connecté.
// `recuperation` : ouvert depuis un lien « mot de passe oublié », il faut d'abord choisir un nouveau mot de passe.
export function SessionProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profil, setProfil] = useState(null)
  const [recuperation, setRecuperation] = useState(LIEN_RECUPERATION)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      setSession(s)
      if (e === 'PASSWORD_RECOVERY') setRecuperation(true)
      if (e === 'SIGNED_OUT') setRecuperation(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user?.id
  useEffect(() => {
    if (!uid) { setProfil(null); return }
    supabase.from('profiles').select('id, role, nom').eq('id', uid).single().then(({ data }) => setProfil(data))
  }, [uid])

  const finirRecuperation = () => setRecuperation(false)

  return <Ctx.Provider value={{ session, profil, setProfil, recuperation, finirRecuperation }}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)
