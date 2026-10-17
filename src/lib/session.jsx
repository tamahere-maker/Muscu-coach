import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)

// Session Supabase + profil (rôle, nom) de l'utilisateur connecté
export function SessionProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profil, setProfil] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user?.id
  useEffect(() => {
    if (!uid) { setProfil(null); return }
    supabase.from('profiles').select('id, role, nom').eq('id', uid).single().then(({ data }) => setProfil(data))
  }, [uid])

  return <Ctx.Provider value={{ session, profil, setProfil }}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)
