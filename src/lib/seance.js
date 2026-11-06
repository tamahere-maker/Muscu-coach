import { blocs } from './supersets'
import { MATERIEL } from './listes'

// Déroulé d'une séance guidée : une étape par série. Dans un superset, on enchaîne la série k
// de chaque exercice avant le repos. `repos` = secondes de repos après l'étape (0 = enchaîner).
export function etapes(lignes) {
  const res = []
  blocs(lignes).forEach((b) => {
    const tours = Math.max(...b.items.map(({ l }) => l.series))
    for (let k = 0; k < tours; k++) {
      const du = b.items.filter(({ l }) => l.series > k)
      du.forEach(({ l }, i) => res.push({ ligne: l.id, serie: k, superset: b.items.length > 1, repos: i === du.length - 1 ? b.items[b.items.length - 1].l.repos_s : 0 }))
    }
  })
  if (res.length) res[res.length - 1].repos = 0
  return res
}

// Exercices du même bloc (un superset se passe en entier)
export function lignesDuBloc(lignes, ligneId) {
  return blocs(lignes).find((b) => b.items.some(({ l }) => l.id === ligneId))?.items.map(({ l }) => l.id) ?? [ligneId]
}

// Prochaine étape à faire après `cur` : d'abord les séries pas faites des exercices non passés
// (dans l'ordre, en repartant du début), puis celles des exercices passés « pour plus tard ». -1 si tout est fait.
export function prochaineEtape(et, sets, cur, plusTard = []) {
  const reste = (x) => !sets[x.ligne]?.[x.serie]?.fait
  const ordre = [...et.keys()].filter((k) => k > cur).concat([...et.keys()].filter((k) => k <= cur))
  const libre = ordre.find((k) => reste(et[k]) && !plusTard.includes(et[k].ligne))
  if (libre != null) return libre
  return ordre.find((k) => reste(et[k])) ?? -1
}

// Exercices de remplacement : même muscle principal, même type de mouvement, avec le matériel de l'athlète
export function remplacants(e, candidats, materiel = [], n = 6) {
  const tout = materiel.includes('Salle complète') || materiel.length === 0
  const ok = new Set(materiel.flatMap((m) => MATERIEL[m] || []))
  return candidats.filter((x) => x.id !== e.id && x.muscles?.[0] === e.muscles?.[0])
    .map((x) => ({ x, s: (x.force === e.force ? 3 : 0) + (x.mecanique === e.mecanique ? 2 : 0) + (x.essentiel ? 2 : 0)
      + (x.categorie === e.categorie ? 1 : -2) + (x.materiel !== e.materiel ? 1 : 0) + (tout || ok.has(x.materiel) ? 2 : -4) + (x.niveau === 'Avancé' ? -1 : 0) }))
    .sort((p, q) => q.s - p.s).slice(0, n).map((p) => p.x)
}

// Séance en cours, gardée dans le navigateur pour survivre à un rechargement
const CLE = 'muscu-coach-seance-en-cours'
export const lireEnCours = () => { try { return JSON.parse(localStorage.getItem(CLE)) } catch { return null } }
export const garderEnCours = (r) => { try { r ? localStorage.setItem(CLE, JSON.stringify(r)) : localStorage.removeItem(CLE) } catch { /* stockage indisponible */ } }
