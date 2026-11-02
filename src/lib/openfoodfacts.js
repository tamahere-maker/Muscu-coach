// Open Food Facts (données ouvertes, licence ODbL) → aliments de la bibliothèque (valeurs pour 100 g)
import { supabase } from './supabase'

const CHAMPS = 'code,product_name_fr,product_name,brands,nutriments,serving_quantity,quantity,image_front_thumb_url'
const OFF = 'https://world.openfoodfacts.org'

const val = (x) => (x == null || x === '' || Number.isNaN(Number(x)) ? null : Math.round(Number(x) * 10) / 10)

// Fiche Open Food Facts → ligne de la table aliments (+ quantite et image pour l'affichage)
export function versAliment(p, code = p.code) {
  const n = p.nutriments ?? {}
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null)
  const portion = Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : null
  return {
    code_barres: String(code),
    nom: (p.product_name_fr || p.product_name || '').trim(),
    marque: (p.brands || '').split(',')[0].trim() || null,
    kcal: val(kcal), proteines: val(n.proteins_100g), glucides: val(n.carbohydrates_100g), lipides: val(n.fat_100g),
    unite_nom: portion ? 'portion' : null, unite_pluriel: portion ? 'portions' : null, unite_g: portion,
  }
}

export async function chercherProduit(code) {
  const r = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${CHAMPS}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error('Open Food Facts ne répond pas, réessaie dans un instant.')
  const { status, product: p } = await r.json()
  if (status !== 1 || !p) return null
  return versAliment(p, code)
}

// Recherche par nom (produits les plus scannés d'abord). Open Food Facts limite les recherches
// à une dizaine par minute : on cherche à la validation, pas à chaque lettre tapée.
export async function rechercherProduits(terme, page = 1) {
  const params = new URLSearchParams({
    search_terms: terme, search_simple: '1', action: 'process', json: '1',
    page_size: '24', page: String(page), lc: 'fr', sort_by: 'unique_scans_n', fields: CHAMPS,
  })
  let r
  try { r = await fetch(`${OFF}/cgi/search.pl?${params}`) } catch { throw new Error('Open Food Facts est injoignable. Vérifie ta connexion.') }
  if (r.status === 429) throw new Error('Trop de recherches d’affilée : attends une minute puis réessaie.')
  if (!r.ok) throw new Error('Open Food Facts ne répond pas, réessaie dans un instant.')
  const d = await r.json()
  const vus = new Set()
  const produits = (d.products ?? [])
    .filter((p) => p.code && !vus.has(p.code) && vus.add(p.code))
    .map((p) => ({ ...versAliment(p), quantite: p.quantity || null, image: p.image_front_thumb_url || null }))
    .filter((a) => a.nom)
  return { produits, total: Number(d.count) || produits.length }
}

export const complet = (a) => a.nom && [a.kcal, a.proteines, a.glucides, a.lipides].every((x) => x != null)

export const CAT_SCAN = 'Produits scannés'

// Garde un produit Open Food Facts dans la bibliothèque (un seul exemplaire par code-barres)
export async function garderProduit(a, coachId) {
  const deja = async () => (await supabase.from('aliments').select('*').eq('code_barres', a.code_barres).maybeSingle()).data
  const existant = await deja()
  if (existant) return existant
  const { quantite, image, ...ligne } = a
  const { data, error } = await supabase.from('aliments')
    .insert({ ...ligne, categorie: CAT_SCAN, source: 'Open Food Facts', cree_par: coachId }).select('*').single()
  if (error?.code === '23505') return deja()
  if (error) throw new Error(error.message)
  return data
}
