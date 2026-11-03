import { createClient } from '@supabase/supabase-js'
import { configurerHorsLigne, fetchHorsLigne } from './horsligne'

// Lus avant que le client Supabase ne consomme le lien reçu par e-mail (il efface l'adresse ensuite)
const lien = window.location.hash + window.location.search
export const LIEN_RECUPERATION = /[#&?]type=recovery/.test(lien)
// Type du lien ouvert : signup (inscription confirmée), email_change, recovery…
export const LIEN_TYPE = (lien.match(/[#&?]type=(\w+)/) || [])[1] || null
export const LIEN_EMAIL_PARTIEL = /[#&?]message=Confirmation(\+|%20)link(\+|%20)accepted/.test(lien)
export const LIEN_ERREUR = /[#&?]error_code=/.test(lien) ? (/otp_expired/.test(lien) ? 'expire' : 'invalide') : null

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, { global: { fetch: fetchHorsLigne } })

// Sans réseau, les requêtes de données n'attendent pas le renouvellement de la session (jusqu'à 30 s
// de tentatives) : elles vont directement aux copies gardées et à la file d'attente (horsligne.js).
const fetchAvecSession = supabase.rest.fetch
supabase.rest.fetch = (input, init) => (navigator.onLine === false ? fetchHorsLigne(input, init) : fetchAvecSession(input, init))
configurerHorsLigne({ jeton: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null })

// Session gardée sur l'appareil, même expirée : sans réseau elle ne peut pas être renouvelée,
// mais elle suffit pour afficher les données gardées. Renouvelée au retour du réseau.
export function sessionGardee() {
  try {
    const s = JSON.parse(localStorage.getItem(supabase.auth.storageKey))
    return s?.user?.id && s.refresh_token ? s : null
  } catch { return null }
}
