import { supabase } from './supabase'
import { jourIso } from './ui'

// Jours de la semaine, 1 = lundi … 7 = dimanche
export const JOURS_SEMAINE = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Jeu'], [5, 'Ven'], [6, 'Sam'], [7, 'Dim']]
export const TYPES_JOUR = { entrainement: 'Jour d’entraînement', repos: 'Jour de repos' }

export const decaler = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return jourIso(d) }
export const numeroJour = (iso) => ((new Date(iso + 'T12:00').getDay() + 6) % 7) + 1

// Ce qu'il faut pour savoir si un jour est un jour d'entraînement : jours prévus par le programme,
// séances faites et choix de l'athlète, entre `debut` et `fin` (AAAA-MM-JJ)
export async function chargerCalendrier(aid, debut, fin) {
  const [p, f, c] = await Promise.all([
    supabase.from('programmes').select('jours_entrainement').eq('athlete_id', aid).eq('actif', true).maybeSingle(),
    supabase.from('seances_realisees').select('date').eq('athlete_id', aid).gte('date', debut).lte('date', fin),
    supabase.from('types_jours').select('date, type').eq('athlete_id', aid).gte('date', debut).lte('date', fin),
  ])
  return {
    jours: p.data?.jours_entrainement ?? [],
    faites: new Set((f.data ?? []).map((x) => x.date)),
    choix: Object.fromEntries((c.data ?? []).map((x) => [x.date, x.type])),
  }
}

// Type d'un jour : choix de l'athlète, sinon jours du programme, sinon séance faite ce jour-là
export function typeDuJour(iso, cal) {
  if (cal.choix[iso]) return { type: cal.choix[iso], source: 'choix' }
  if (cal.jours.length) return { type: cal.jours.includes(numeroJour(iso)) ? 'entrainement' : 'repos', source: 'programme' }
  return { type: cal.faites.has(iso) ? 'entrainement' : 'repos', source: 'seances' }
}

// Repas du plan pour un type de jour
export const repasDuJour = (plan, repas, type) => repas.filter((r) => !plan.jours_differents || r.type_jour === 'tous' || r.type_jour === type)

// Objectifs du plan pour un type de jour (ceux du jour de repos, à défaut ceux du plan)
export function objectifs(plan, type) {
  const repos = plan.jours_differents && type === 'repos'
  return Object.fromEntries(['kcal', 'proteines', 'glucides', 'lipides'].map((k) => [k, repos ? plan[`${k}_repos`] ?? plan[k] : plan[k]]))
}
