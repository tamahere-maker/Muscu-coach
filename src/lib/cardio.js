import { fmt } from './ui'

// Cardio et exercices en durée : un exercice de catégorie Cardio, ou une ligne de séance à laquelle le coach
// a donné une durée ou une distance (ex. gainage 45 s, mountain climbers 30 s). Chaque « série » est alors un bloc
// (1 bloc = effort continu, plusieurs = intervalles) et le repos de la ligne sert de récupération entre les blocs.
export const estCardioEx = (ex) => ex?.categorie === 'Cardio'
export const estCardio = (l, ex = l?.exercice) => estCardioEx(ex) || l?.duree_s != null || l?.distance_m != null

// Durée en secondes ↔ texte : « 30 » = 30 min, « 1:30 » = 1 min 30 s, « 1:05:00 » = 1 h 5 min
export function lireDuree(t) {
  const s = String(t ?? '').trim().replace(',', '.')
  if (!s) return null
  if (s.includes(':')) {
    const p = s.split(':').map(Number)
    if (p.some((x) => !Number.isFinite(x) || x < 0)) return null
    const v = p.reduce((a, x) => a * 60 + x, 0)
    return v > 0 ? Math.round(v) : null
  }
  const m = Number(s)
  return Number.isFinite(m) && m > 0 ? Math.round(m * 60) : null
}
export function duree(s) {
  s = Math.max(0, Math.round(Number(s) || 0))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}
// Durée telle qu'on la retape : « 30 » (minutes rondes) ou « 0:45 »
export const dureeSaisie = (s) => (!s ? '' : s % 60 ? duree(s) : String(s / 60))
// Durée lisible : « 30 min », « 45 s », « 1 h 15 »
export function dureeTexte(s) {
  s = Math.round(Number(s) || 0)
  if (s < 60) return `${s} s`
  if (s < 3600) return s % 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : `${s / 60} min`
  const m = Math.round((s % 3600) / 60)
  return `${Math.floor(s / 3600)} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`
}
export const distanceTexte = (m) => (m >= 1000 ? `${fmt(m / 1000, 2)} km` : `${fmt(m)} m`)

// Comment exprimer la vitesse : natation au 100 m, vélo et elliptique en km/h, le reste (course, marche, rameur…) au km
export function typeAllure(ex) {
  const n = (ex?.nom ?? '').toLowerCase()
  if (/natation|nage|crawl|brasse|papillon|aquajogging/.test(n)) return '100m'
  if (/v[ée]lo|vtt|elliptique|air bike|bike/.test(n)) return 'kmh'
  if (/rameur|skierg|ski erg/.test(n)) return '500m'
  return 'km'
}
// Valeur d'allure en secondes par unité (ou km/h), plus petit = plus rapide sauf en km/h
export function allureValeur(ex, s, m) {
  if (!(s > 0 && m > 0)) return null
  const t = typeAllure(ex)
  if (t === 'kmh') return (m / 1000) / (s / 3600)
  return s / (m / ({ km: 1000, '100m': 100, '500m': 500 }[t]))
}
export function allureTexte(ex, s, m) {
  const v = allureValeur(ex, s, m)
  if (v == null) return ''
  const t = typeAllure(ex)
  if (t === 'kmh') return `${fmt(v, 1)} km/h`
  return `${duree(v)} /${{ km: 'km', '100m': '100 m', '500m': '500 m' }[t]}`
}
// Plus rapide ?
export const meilleureAllure = (ex, a, b) => (typeAllure(ex) === 'kmh' ? a > b : a < b)

// Objectif d'une ligne de séance cardio, en texte : « 8 × 30 s · récup 90 s · Zone 4 »
export function objectifCardio(l) {
  const parts = []
  if (l.echauffement_s) parts.push(`échauffement ${dureeTexte(l.echauffement_s)}`)
  const bloc = [l.duree_s ? dureeTexte(l.duree_s) : '', l.distance_m ? distanceTexte(l.distance_m) : ''].filter(Boolean).join(' ou ')
  parts.push(l.series > 1 ? `${l.series} × ${bloc || 'bloc'}` : bloc || 'Durée libre')
  if (l.series > 1 && l.repos_s) parts.push(`récup ${dureeTexte(l.repos_s)}`)
  if (l.intensite) parts.push(l.intensite)
  return parts.join(' · ')
}

// Résumé d'un bloc réalisé : « 30:00 · 5 km · 6:00 /km · FC 145 · RPE 7 »
export function resumeBloc(ex, x) {
  return [x.duree_s ? duree(x.duree_s) : '', x.distance_m ? distanceTexte(x.distance_m) : '',
    allureTexte(ex, x.duree_s, x.distance_m), x.fc_moy ? `FC ${x.fc_moy}` : '', x.rpe ? `RPE ${x.rpe}` : '']
    .filter(Boolean).join(' · ')
}
export const estBlocCardio = (x) => x.duree_s != null || x.distance_m != null

// Exercices cardio de remplacement : d'autres exercices cardio, ceux avec le même matériel ou le même mode d'allure d'abord
export function remplacantsCardio(e, candidats, n = 8) {
  const t = typeAllure(e)
  return candidats.filter((x) => x.id !== e.id && estCardioEx(x))
    .map((x) => ({ x, s: (typeAllure(x) === t ? 2 : 0) + (x.materiel === e.materiel ? 1 : 0) + (x.essentiel ? 1 : 0) }))
    .sort((p, q) => q.s - p.s).slice(0, n).map((p) => p.x)
}
