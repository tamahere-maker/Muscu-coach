import { fmt } from './ui'

// Macros d'une quantité d'aliment (valeurs de la bibliothèque pour 100 g)
export function macrosDe(a, grammes) {
  const k = Number(grammes) / 100
  return { kcal: a.kcal * k, proteines: a.proteines * k, glucides: a.glucides * k, lipides: a.lipides * k }
}

export function somme(liste) {
  return liste.reduce((t, m) => ({ kcal: t.kcal + m.kcal, proteines: t.proteines + m.proteines, glucides: t.glucides + m.glucides, lipides: t.lipides + m.lipides }),
    { kcal: 0, proteines: 0, glucides: 0, lipides: 0 })
}

// Unités dans lesquelles on peut doser un aliment ; les quantités restent stockées en grammes.
// La première est l'unité par défaut : l'unité propre de l'aliment s'il se compte (œuf, tranche…), sinon le gramme.
export function unites(a) {
  const l = []
  if (a.unite_g) l.push({ code: 'u', nom: a.unite_nom, pluriel: a.unite_pluriel, g: Number(a.unite_g) })
  l.push({ code: 'g', nom: 'g', pluriel: 'g', g: 1 })
  if (a.densite) l.push({ code: 'ml', nom: 'ml', pluriel: 'ml', g: Number(a.densite) })
  if (a.cas_g) l.push({ code: 'cas', nom: 'c. à soupe', pluriel: 'c. à soupe', g: Number(a.cas_g) })
  if (a.cac_g) l.push({ code: 'cac', nom: 'c. à café', pluriel: 'c. à café', g: Number(a.cac_g) })
  return l
}
// L'unité demandée si l'aliment la propose, sinon son unité par défaut
export const unite = (a, code) => { const l = unites(a); return l.find((u) => u.code === code) ?? l[0] }
// Valeur à afficher dans l'unité, et pas de saisie
export const enUnite = (u, grammes) => u.code === 'g' || u.code === 'ml' ? Math.round(Number(grammes) / u.g) : Math.round((Number(grammes) / u.g) * 10) / 10
export const pas = (u) => (u.code === 'g' ? 5 : u.code === 'ml' ? 10 : 0.5)

// « 2 œufs », « 1,5 c. à soupe », « 150 g »
export function quantite(a, grammes, code) {
  const u = unite(a, code), n = enUnite(u, grammes)
  if (u.code === 'g' || u.code === 'ml') return `${fmt(n)} ${u.nom}`
  return `${fmt(n, 1)} ${n > 1 ? u.pluriel : u.nom}`
}

export const resume = (m) => `${fmt(m.kcal)} kcal · P ${fmt(m.proteines)} · G ${fmt(m.glucides)} · L ${fmt(m.lipides)}`

// Métabolisme de base (Mifflin-St Jeor) et dépense du jour estimée selon le nombre de séances par semaine.
// Renvoie null tant que le profil est incomplet.
export function metabolisme(p) {
  if (!p?.sexe || !p.poids_kg || !p.taille_cm || !p.age) return null
  const base = 10 * p.poids_kg + 6.25 * p.taille_cm - 5 * p.age + (p.sexe === 'Homme' ? 5 : -161)
  const s = p.seances_semaine ?? 0
  const facteur = s === 0 ? 1.2 : s <= 3 ? 1.375 : s <= 5 ? 1.55 : 1.725
  return { base: Math.round(base), facteur, depense: Math.round(base * facteur) }
}

// Ce qui manque au profil pour faire le calcul
export const manquePourMetabolisme = (p) =>
  [['sexe', 'sexe'], ['poids_kg', 'poids'], ['taille_cm', 'taille'], ['age', 'âge']].filter(([k]) => !p?.[k]).map(([, l]) => l)

// Aliments de substitution : profil de macros le plus proche (part de l'énergie apportée par P, G, L),
// en privilégiant la même catégorie
const profilMacros = (x) => {
  const t = x.proteines * 4 + x.glucides * 4 + x.lipides * 9 || 1
  return [x.proteines * 4 / t, x.glucides * 4 / t, x.lipides * 9 / t]
}
export function substituts(a, aliments, exclus = [], n = 5) {
  const pa = profilMacros(a)
  return aliments.filter((b) => b.id !== a.id && !exclus.includes(b.id) && Number(b.kcal) > 0)
    .map((b) => ({ b, d: profilMacros(b).reduce((s, v, k) => s + Math.abs(v - pa[k]), 0) + (b.categorie === a.categorie ? 0 : 0.35) }))
    .sort((x, y) => x.d - y.d).slice(0, n).map((x) => x.b)
}

// Quantité équivalente : autant du macronutriment dominant de l'aliment d'origine (ou autant de calories)
export function equivalent(a, grammes, b, code) {
  const k = ['proteines', 'glucides', 'lipides'].sort((x, y) => a[y] * (y === 'lipides' ? 9 : 4) - a[x] * (x === 'lipides' ? 9 : 4))[0]
  let q = Number(b[k]) >= 2 ? (a[k] * grammes) / b[k] : (a.kcal * grammes) / b.kcal
  q = Math.min(q, grammes * 4)
  const u = unite(b, code)
  if (u.code === 'g') return Math.max(5, Math.round(q / 5) * 5)
  if (u.code === 'ml') return Math.max(10, Math.round(q / u.g / 10) * 10) * u.g
  return Math.max(0.5, Math.round((q / u.g) * 2) / 2) * u.g
}
