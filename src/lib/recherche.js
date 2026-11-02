// Recherche d'exercices tolérante : accents, ordre des mots, pluriels, abréviations et petites fautes de frappe

export const normaliser = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim()

// Abréviations et mots courants en salle → autres façons de le dire (chaque alternative : tous ses mots requis)
const SYNONYMES = {
  dc: ['developpe couche'], di: ['developpe incline'], dm: ['developpe militaire'], sdt: ['souleve terre'], rdl: ['souleve terre roumain'],
  bench: ['developpe couche'], pec: ['pectoraux'], pecs: ['pectoraux'], abdo: ['abdominaux'], abdos: ['abdominaux'],
  dos: ['dorsal', 'lombaires', 'trapezes'], bras: ['biceps', 'triceps'], jambe: ['quadriceps', 'ischio'], jambes: ['quadriceps', 'ischio'],
  cuisse: ['quadriceps', 'ischio'], cuisses: ['quadriceps', 'ischio'], fesses: ['fessiers'], elastique: ['elastiques'],
}

const racine = (m) => (m.length > 3 ? m.replace(/(es|s|x)$/, '') : m)

// Distance d'édition bornée (renvoie max+1 dès que c'est dépassé)
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let mini = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      mini = Math.min(mini, cur[j])
    }
    if (mini > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

// Note d'un mot de la recherche face aux mots de l'exercice : 3 exact, 2 début de mot, 1 faute de frappe, 0 absent
function noteMot(t, mots) {
  let best = 0
  const rt = racine(t)
  const tol = t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0
  for (const m of mots) {
    if (m === t || racine(m) === rt) return 3
    if (m.startsWith(t) || m.startsWith(rt)) best = Math.max(best, 2)
    else if (tol && best < 1 && (distance(t, m, tol) <= tol || (m.length > t.length && distance(t, m.slice(0, t.length), tol) <= tol))) best = 1
  }
  return best
}

const cache = new WeakMap()
function motsDe(e) {
  let x = cache.get(e)
  if (!x) {
    const nom = normaliser(e.nom)
    x = { nom, mots: [...new Set([nom, (e.muscles ?? []).join(' '), (e.secondaires ?? []).join(' '), e.materiel ?? ''].map(normaliser).join(' ').split(' '))] }
    cache.set(e, x)
  }
  return x
}

// Filtre et trie les exercices selon la recherche ; liste inchangée si la recherche est vide
export function chercherExercices(exos, q) {
  const brut = normaliser(q)
  if (!brut) return exos
  const groupes = brut.split(' ').filter(Boolean).map((t) => [[t], ...(SYNONYMES[t] ?? []).map((a) => a.split(' '))])
  const res = []
  for (const e of exos) {
    const { nom, mots } = motsDe(e)
    let score = 0, ok = true
    for (const g of groupes) {
      const n = Math.max(...g.map((alt) => {
        const notes = alt.map((t) => noteMot(t, mots))
        return Math.min(...notes)
      }))
      if (!n) { ok = false; break }
      score += n
    }
    if (!ok) continue
    if (nom.includes(brut)) score += 4
    if (nom.startsWith(brut)) score += 2
    res.push({ e, score })
  }
  return res.sort((a, b) => b.score - a.score).map((x) => x.e)
}
