import { supabase } from './supabase'

export const MESURES = [
  ['poids_kg', 'Poids', 'kg'], ['tour_taille', 'Tour de taille', 'cm'], ['tour_hanches', 'Tour de hanches', 'cm'],
  ['tour_poitrine', 'Tour de poitrine', 'cm'], ['tour_bras', 'Tour de bras', 'cm'], ['tour_cuisse', 'Tour de cuisse', 'cm'],
  ['masse_grasse', 'Masse grasse', '%'],
]
// Ressentis notés de 1 (mauvais) à 5 (excellent) ; pour le stress, 5 = très stressé
export const RESSENTIS = [
  ['entrainement', 'Entraînements'], ['energie', 'Énergie'], ['moral', 'Moral'], ['nutrition', 'Respect du plan alimentaire'],
  ['recuperation', 'Récupération'], ['sommeil', 'Sommeil'], ['stress', 'Stress'],
]
export const COMMENTAIRES = [
  ['commentaire_entrainement', 'Ressentis à l’entraînement', 'Charges, douleurs, séances manquées…'],
  ['commentaire_nutrition', 'Nutrition', 'Écarts, faim, digestion…'],
  ['commentaire_recuperation', 'Récupération et sommeil', 'Courbatures, heures de sommeil…'],
  ['commentaire', 'Autre chose à dire à ton coach', ''],
]
export const TYPES = { initial: 'Bilan initial', hebdo: 'Bilan de la semaine', ponctuel: 'Bilan demandé par ton coach' }
export const TYPES_COACH = { initial: 'Bilan initial', hebdo: 'Bilan hebdomadaire', ponctuel: 'Bilan ponctuel' }
export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

// Dernière date (aujourd'hui compris) tombant le jour de bilan (1 = lundi … 7 = dimanche)
export function dernierJourBilan(jour, auj = new Date()) {
  const d = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate())
  const iso = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - ((iso - jour + 7) % 7))
  return d
}

// Bilans à remplir par l'athlète : demandes du coach, bilan initial, bilan de la semaine
export function bilansAFaire(bilans, suivi) {
  const res = bilans.filter((b) => b.statut === 'demande').map((b) => ({ id: b.id, type: b.type }))
  const envoyes = bilans.filter((b) => b.statut !== 'demande')
  if (!envoyes.length && !res.some((b) => b.type === 'initial')) res.push({ id: 'nouveau', type: 'initial' })
  else if (suivi?.jour_semaine && !res.length) {
    const d0 = dernierJourBilan(suivi.jour_semaine)
    if (!envoyes.some((b) => new Date(b.envoye_at) >= d0)) res.push({ id: 'nouveau', type: 'hebdo' })
  }
  return res
}

// Réduit la photo (1600 px max, JPEG) avant l'envoi : plus rapide sur mobile et moins de stockage
export async function preparerPhoto(fichier) {
  const img = await createImageBitmap(fichier)
  const k = Math.min(1, 1600 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85))
}

export async function urlsPhotos(chemins) {
  if (!chemins?.length) return {}
  const { data } = await supabase.storage.from('bilans').createSignedUrls(chemins, 3600)
  return Object.fromEntries((data ?? []).map((x) => [x.path, x.signedUrl]))
}

export const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
