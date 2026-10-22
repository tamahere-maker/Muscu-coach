import { createClient } from '@supabase/supabase-js'

// Lus avant que le client Supabase ne consomme le lien reçu par e-mail (il efface l'adresse ensuite)
const lien = window.location.hash + window.location.search
export const LIEN_RECUPERATION = /[#&?]type=recovery/.test(lien)
// Type du lien ouvert : signup (inscription confirmée), email_change, recovery…
export const LIEN_TYPE = (lien.match(/[#&?]type=(\w+)/) || [])[1] || null
export const LIEN_EMAIL_PARTIEL = /[#&?]message=Confirmation(\+|%20)link(\+|%20)accepted/.test(lien)
export const LIEN_ERREUR = /[#&?]error_code=/.test(lien) ? (/otp_expired/.test(lien) ? 'expire' : 'invalide') : null

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY)
