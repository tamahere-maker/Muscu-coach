// wger.de (base d'exercices ouverte, licence CC-BY-SA) → exercices de la bibliothèque
import { supabase } from './supabase'

const API = 'https://wger.de/api/v2'
const FR = 12, EN = 2

// Muscles et matériel wger (identifiants fixes) → libellés de l'app
const MUSCLES = { 1: 'Biceps', 2: 'Épaules', 3: 'Pectoraux', 4: 'Pectoraux', 5: 'Triceps', 6: 'Abdominaux', 7: 'Mollets', 8: 'Fessiers',
  9: 'Trapèzes', 10: 'Quadriceps', 11: 'Ischio-jambiers', 12: 'Grand dorsal', 13: 'Biceps', 14: 'Abdominaux', 15: 'Mollets', 16: 'Lombaires' }
const MATERIEL = { 1: 'Barre', 2: 'Barre EZ', 3: 'Haltères', 10: 'Kettlebell', 11: 'Élastiques', 12: 'Poulie', 5: 'Swiss ball',
  6: 'Poids du corps', 7: 'Poids du corps', 4: 'Poids du corps' }

const id = (x) => (typeof x === 'object' && x ? x.id : x)
const uniques = (l) => [...new Set(l.filter(Boolean))]
const texte = (html) => {
  if (!html) return null
  const d = new DOMParser().parseFromString(html, 'text/html')
  d.querySelectorAll('li').forEach((li) => li.prepend('• '))
  d.querySelectorAll('p, li, br').forEach((n) => n.append('\n'))
  const t = d.body.textContent.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
  return t || null
}

// Fiche exerciseinfo wger → ligne de la table exercices
export function versExercice(p) {
  const trad = p.translations ?? p.exercises ?? []
  const fr = trad.find((t) => id(t.language) === FR)
  const en = trad.find((t) => id(t.language) === EN)
  const t = fr ?? en ?? trad[0]
  const muscles = uniques((p.muscles ?? []).map((m) => MUSCLES[id(m)]))
  const secondaires = uniques((p.muscles_secondary ?? []).map((m) => MUSCLES[id(m)])).filter((m) => !muscles.includes(m))
  const mat = (p.equipment ?? []).map((e) => MATERIEL[id(e)]).filter(Boolean)
  const image = (p.images ?? []).find((i) => i.is_main) ?? p.images?.[0]
  const video = (p.videos ?? []).find((v) => v.is_main) ?? p.videos?.[0]
  const lic = typeof p.license === 'object' && p.license ? p.license.short_name : null
  const auteurs = uniques([p.license_author, t?.license_author]).join(', ')
  return {
    id: `wger-${p.id}`,
    wger_id: p.id,
    nom: (t?.name || '').trim(),
    nom_fr: !!fr,
    consigne: fr ? texte(fr.description) : null,
    consigne_en: !fr && en ? texte(en.description) : null,
    muscles: muscles.length ? muscles : secondaires.slice(0, 1),
    secondaires: muscles.length ? secondaires : secondaires.slice(1),
    materiel: mat.find((m) => m !== 'Poids du corps') ?? mat[0] ?? ((p.equipment ?? []).length ? 'Autre' : 'Poids du corps'),
    categorie: id(p.category) === 15 ? 'Cardio' : 'Musculation',
    niveau: null,
    image_url: image?.image ?? null,
    lien_video: video?.video ?? null,
    licence: `wger.de · ${lic || 'CC-BY-SA 4.0'}${auteurs ? ` · ${auteurs}` : ''}`,
  }
}

async function lire(chemin) {
  let r
  try { r = await fetch(`${API}${chemin}`, { headers: { Accept: 'application/json' } }) } catch { throw new Error('wger.de est injoignable. Vérifie ta connexion.') }
  if (r.status === 429) throw new Error('Trop de recherches d’affilée : attends une minute puis réessaie.')
  if (!r.ok) { const e = new Error('wger.de ne répond pas, réessaie dans un instant.'); e.status = r.status; throw e }
  return r.json()
}

// Recherche par nom (français et anglais, tolérante aux fautes côté wger).
// Version actuelle de l'API : filtre name__search sur exerciseinfo. Ancienne : exercise/search puis une fiche par exercice.
export async function rechercherExercices(terme) {
  const t = encodeURIComponent(terme.trim())
  let fiches = null
  try {
    const d = await lire(`/exerciseinfo/?name__search=${t}&language__code=fr,en&limit=24`)
    // Une API qui ignore le filtre renvoie toute la base : on passe alors à l'ancienne recherche
    if (Array.isArray(d.results) && (d.count ?? d.results.length) < 400) fiches = d.results
  } catch (e) { if (!e.status) throw e }
  if (!fiches) {
    const d = await lire(`/exercise/search/?term=${t}&language=fr,en`)
    const ids = uniques((d.suggestions ?? []).map((s) => s.data?.base_id ?? s.data?.exercise ?? s.data?.id)).slice(0, 16)
    fiches = (await Promise.all(ids.map((i) => lire(`/exerciseinfo/${i}/`).catch(() => null)))).filter(Boolean)
  }
  return fiches.map(versExercice).filter((e) => e.nom && e.muscles.length)
}

// Garde un exercice wger dans la bibliothèque (un seul exemplaire, partagé entre coachs)
export async function garderExercice(e, coachId) {
  const deja = async () => (await supabase.from('exercices').select('*').eq('wger_id', e.wger_id).maybeSingle()).data
  const existant = await deja()
  if (existant) return existant
  const { nom_fr, ...ligne } = e
  const { data, error } = await supabase.from('exercices')
    .insert({ ...ligne, source: 'wger', sprite: null, cree_par: coachId }).select('*').single()
  if (error?.code === '23505') return deja()
  if (error) throw new Error(error.message)
  return data
}
