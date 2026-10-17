// Fiche produit Open Food Facts → aliment de la bibliothèque (valeurs pour 100 g)
const CHAMPS = 'product_name_fr,product_name,brands,nutriments,serving_quantity,quantity'

export async function chercherProduit(code) {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${CHAMPS}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error('Open Food Facts ne répond pas, réessaie dans un instant.')
  const { status, product: p } = await r.json()
  if (status !== 1 || !p) return null
  const n = p.nutriments ?? {}
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null)
  const val = (x) => (x == null || x === '' ? null : Math.round(Number(x) * 10) / 10)
  const portion = Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : null
  return {
    code_barres: code,
    nom: (p.product_name_fr || p.product_name || '').trim(),
    marque: (p.brands || '').split(',')[0].trim() || null,
    kcal: val(kcal), proteines: val(n.proteins_100g), glucides: val(n.carbohydrates_100g), lipides: val(n.fat_100g),
    unite_nom: portion ? 'portion' : null, unite_pluriel: portion ? 'portions' : null, unite_g: portion,
  }
}

export const complet = (a) => a.nom && [a.kcal, a.proteines, a.glucides, a.lipides].every((x) => x != null)
