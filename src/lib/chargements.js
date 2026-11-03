import { supabase } from './supabase'
import { chargerCalendrier, decaler } from './jours'
import { jourIso } from './ui'

// Requêtes partagées entre les pages et le préchargement hors ligne : une même requête donne
// la même copie gardée (horsligne.js), donc la page la retrouve sans réseau.

export const CHAMPS_EX = 'id, nom, sprite, image_url, consigne, consigne_en, lien_video, licence, wger_id, muscles, materiel, categorie, force, mecanique, niveau, essentiel'

// ----- Entraînement -----
export const chargerProgramme = (aid) => supabase.from('programmes').select('nom, description, seances(id, ordre, nom, note, seance_exercices(id, series))')
  .eq('athlete_id', aid).eq('actif', true).maybeSingle()
export const chargerSeance = (id) => supabase.from('seances')
  .select(`id, nom, note, programme:programmes(nom, coach_id), seance_exercices(id, ordre, series, reps, charge_kg, repos_s, note, groupe, exercice:exercices(${CHAMPS_EX}))`)
  .eq('id', id).maybeSingle()
export const chargerDerniers = (aid) => supabase.from('seances_realisees').select('date, series_realisees(exercice_id, ordre, reps, charge_kg)').eq('athlete_id', aid)
  .order('created_at', { ascending: false }).limit(20)
export const chargerMateriel = (aid) => supabase.from('athlete_profiles').select('materiel').eq('athlete_id', aid).maybeSingle()
export const chargerVideos = (ids) => supabase.from('videos_exercices').select('coach_id, exercice_id, url, chemin, updated_at').in('exercice_id', [...new Set(ids)].sort())

// ----- Nutrition -----
export const chargerPlan = (aid) => supabase.from('plans_nutrition')
  .select('id, nom, description, kcal, proteines, glucides, lipides, jours_differents, kcal_repos, proteines_repos, glucides_repos, lipides_repos, eau_ml, repas(id, ordre, nom, note, type_jour, repas_aliments(id, ordre, aliment_id, grammes, alternatives, unite, recette)), complements(*)')
  .eq('athlete_id', aid).eq('actif', true).maybeSingle()
export const chargerAliments = () => supabase.from('aliments').select('id, categorie, nom, marque, code_barres, kcal, proteines, glucides, lipides, unite_nom, unite_pluriel, unite_g, cac_g, cas_g, densite').order('nom')
export const chargerJournal = (aid, jour) => supabase.from('journal_aliments').select('repas_aliment_id, aliment_id, grammes, unite, confirme').eq('athlete_id', aid).eq('date', jour)
export const chargerPrises = (aid, jour) => supabase.from('prises_complements').select('*').eq('athlete_id', aid).eq('date', jour)
export const chargerEau = (aid, jour) => supabase.from('hydratation').select('ml').eq('athlete_id', aid).eq('date', jour).maybeSingle()
export const chargerSemaine = (aid) => supabase.from('journal_aliments').select('date, repas_aliment_id, aliment_id, grammes, confirme').eq('athlete_id', aid).gte('date', decaler(jourIso(), -6))

// Images des exercices : les planches de sprites et les images wger passent par le service worker, qui les garde
function prechargerImages(exercices) {
  const urls = new Set()
  exercices.forEach((x) => {
    if (x.sprite) urls.add(`/sprites/s${String(x.sprite[0]).padStart(2, '0')}.jpg`)
    else if (x.image_url) urls.add(x.image_url)
  })
  urls.forEach((u) => fetch(u, u.startsWith('/') ? {} : { mode: 'no-cors' }).catch(() => {}))
}

// Avec du réseau, à l'ouverture de l'app : tout ce qu'il faut pour la salle (séances du programme,
// dernières charges, plan alimentaire du jour) est chargé une fois, donc gardé sur l'appareil.
let dernier = 0
export async function prechargerAthlete(aid) {
  if (navigator.onLine === false || Date.now() - dernier < 5 * 60 * 1000) return
  dernier = Date.now()
  const jour = jourIso()
  try {
    const [{ data: prog }] = await Promise.all([
      chargerProgramme(aid), chargerDerniers(aid), chargerMateriel(aid),
      chargerPlan(aid), chargerAliments(), chargerJournal(aid, jour), chargerPrises(aid, jour), chargerEau(aid, jour), chargerSemaine(aid),
      chargerCalendrier(aid, decaler(jour, -6), jour),
    ])
    const seances = await Promise.all((prog?.seances ?? []).map((s) => chargerSeance(s.id).then(({ data }) => data)))
    const exercices = seances.filter(Boolean).flatMap((s) => s.seance_exercices.map((l) => l.exercice).filter(Boolean))
    await Promise.all(seances.filter((s) => s?.seance_exercices.length).map((s) => chargerVideos(s.seance_exercices.map((l) => l.exercice.id))))
    prechargerImages(exercices)
  } catch { dernier = 0 }
}
