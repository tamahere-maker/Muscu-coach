// Mode hors ligne : l'app reste utilisable en salle sans réseau.
// - Lectures (GET /rest/v1) : réseau d'abord, copie gardée dans le cache « donnees ». Sans réseau
//   (ou réseau trop lent), la dernière copie est servie.
// - Écritures du suivi de l'athlète (séances faites, journal alimentaire, eau, compléments, type de jour) :
//   sans réseau, elles sont mises en file d'attente sur l'appareil, appliquées tout de suite aux copies
//   gardées (l'app affiche donc le changement), puis envoyées dans l'ordre au retour du réseau.
// Branché comme `fetch` du client Supabase (voir supabase.js).

const CACHE = 'donnees-v1'
const CLE_FILE = 'muscu-file-attente'
const CLE_UID = 'muscu-cache-uid'
const DELAI_MS = 7000 // au-delà, on sert la copie gardée (réseau de salle trop lent)
const MAX_ENTREES = 600

// Tables dont les écritures peuvent attendre le réseau, avec leur clé primaire
const TABLES = {
  seances_realisees: ['id'],
  series_realisees: ['id'],
  journal_aliments: ['athlete_id', 'date', 'repas_aliment_id'],
  prises_complements: ['athlete_id', 'complement_id', 'date'],
  hydratation: ['athlete_id', 'date'],
  types_jours: ['athlete_id', 'date'],
}
// Tables enfants affichées dans une table parente (séance faite → ses séries)
const ENFANTS = { series_realisees: { parent: 'seances_realisees', fk: 'seance_realisee_id' } }

const fetchReseau = (...a) => globalThis.fetch(...a)
const avecCache = () => typeof caches !== 'undefined'
let jeton = async () => null
export const configurerHorsLigne = (o) => { jeton = o.jeton }

// ---------- File d'attente ----------
const abonnes = new Set()
const prevenir = (info) => abonnes.forEach((f) => f(info))
export const surChangement = (f) => { abonnes.add(f); return () => abonnes.delete(f) }

const lireFile = () => { try { return JSON.parse(localStorage.getItem(CLE_FILE)) ?? [] } catch { return [] } }
const ecrireFile = (l) => { try { l.length ? localStorage.setItem(CLE_FILE, JSON.stringify(l)) : localStorage.removeItem(CLE_FILE) } catch { /* stockage plein */ } }
export const enAttente = () => lireFile().length

const table = (url) => url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1]
const estReseau = (e) => e?.name === 'TypeError' || e?.name === 'AbortError'

function enFile(req) {
  const l = lireFile()
  l.push({ ...req, id: (crypto.randomUUID?.() ?? String(Date.now() + Math.random())), t: Date.now() })
  ecrireFile(l)
  prevenir({ type: 'file' })
}

let envoiEnCours = null
// Envoie les écritures en attente, dans l'ordre. S'arrête au premier souci de réseau.
export function envoyerFile() {
  if (envoiEnCours) return envoiEnCours
  envoiEnCours = (async () => {
    let echecs = 0
    try {
      for (;;) {
        const [e] = lireFile()
        if (!e) break
        const t = await jeton().catch(() => null)
        const headers = { ...e.headers, ...(t ? { Authorization: `Bearer ${t}` } : {}) }
        let rep
        try { rep = await fetchReseau(e.url, { method: e.method, headers, body: e.body }) } catch { break }
        // 401 (session à renouveler) ou 5xx : on réessaiera plus tard
        if (rep.status === 401 || rep.status >= 500) break
        // 409 : déjà enregistré (envoi précédent dont la réponse s'est perdue)
        if (!rep.ok && rep.status !== 409) { echecs++; console.warn('Écriture hors ligne refusée', e.url, await rep.text().catch(() => '')) }
        ecrireFile(lireFile().filter((x) => x.id !== e.id))
      }
    } finally {
      envoiEnCours = null
      prevenir({ type: 'envoi', echecs, reste: enAttente() })
    }
  })()
  return envoiEnCours
}

// ---------- Copies gardées ----------
// Le format demandé (tableau ou objet unique) fait partie de la clé ; le fragment # étant ignoré par le cache, il va en paramètre
const cleCache = (url, headers) => `${url}${url.includes('?') ? '&' : '?'}_accept=${encodeURIComponent(headers.get('Accept') ?? '')}`

// `copie` : clone de la réponse, fait avant que le client Supabase ne lise le corps
async function garder(cle, copie) {
  const cache = await caches.open(CACHE)
  const corps = await copie.text()
  await cache.put(cle, new Response(corps, { status: 200, headers: { 'Content-Type': copie.headers.get('Content-Type') ?? 'application/json', 'X-Garde': String(Date.now()) } }))
  if (Math.random() < 0.05) {
    const cles = await cache.keys()
    for (const k of cles.slice(0, Math.max(0, cles.length - MAX_ENTREES))) await cache.delete(k)
  }
}

async function copieGardee(cle) {
  if (!avecCache()) return null
  return (await caches.open(CACHE)).match(cle)
}

// Efface les copies et la file (déconnexion, autre compte)
export async function viderHorsLigne() {
  ecrireFile([])
  if (avecCache()) await caches.delete(CACHE).catch(() => {})
}

// À la connexion : les copies d'un autre compte sont effacées
export function associerUtilisateur(uid) {
  let avant = null
  try { avant = localStorage.getItem(CLE_UID); localStorage.setItem(CLE_UID, uid) } catch { /* stockage indisponible */ }
  if (avant && avant !== uid) return viderHorsLigne()
}

// ---------- Application d'une écriture aux copies gardées ----------
// Colonnes de premier niveau d'un `select` PostgREST : « id, nom, series_realisees(id), coach:profiles!fk(nom) »
function colonnes(select) {
  const res = []
  let prof = 0, cur = ''
  for (const c of (select ?? '*') + ',') {
    if (c === '(') prof++
    if (c === ')') prof--
    if (c === ',' && prof === 0) { if (cur.trim()) res.push(cur.trim()); cur = '' } else cur += c
  }
  return res.map((p) => {
    const i = p.indexOf('(')
    if (i < 0) { const [a, b] = p.split(':'); return { nom: b ?? a, cle: a.split('::')[0] } }
    const tete = p.slice(0, i), [alias, reste] = tete.includes(':') ? tete.split(':') : [null, tete]
    const t = reste.split('!')[0]
    return { nom: alias ?? t, table: t, sous: p.slice(i + 1, -1) }
  })
}

const SPECIAUX = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', '_accept'])
const val = (x) => (x === 'null' ? null : x)
const egal = (a, b) => a != null && b != null && String(a) === String(b)
const cmp = (a, b) => (a != null && b != null && !isNaN(a) && !isNaN(b) ? Number(a) - Number(b) : String(a).localeCompare(String(b)))

// true / false, ou null si le filtre n'est pas compris (on ne touche alors pas à la copie)
function verifie(ligne, params) {
  for (const [k, v] of params) {
    if (SPECIAUX.has(k)) continue
    if (k.includes('.') || k === 'or' || k === 'and' || !(k in ligne)) return null
    const i = v.indexOf('.'), op = v.slice(0, i), x = v.slice(i + 1), y = ligne[k]
    const ok = op === 'eq' ? egal(y, x) : op === 'neq' ? !egal(y, x)
      : op === 'gt' ? cmp(y, x) > 0 : op === 'gte' ? cmp(y, x) >= 0 : op === 'lt' ? cmp(y, x) < 0 : op === 'lte' ? cmp(y, x) <= 0
      : op === 'is' ? y === val(x)
      : op === 'in' ? x.replace(/^\(|\)$/g, '').split(',').map((z) => z.replace(/^"|"$/g, '')).some((z) => egal(y, z))
      : undefined
    if (ok === undefined) return null
    if (!ok) return false
  }
  return true
}

// Valeurs fixées par les filtres « eq » d'une copie (colonnes absentes de ses lignes)
const fixes = (params) => Object.fromEntries([...params].filter(([k, v]) => !SPECIAUX.has(k) && v.startsWith('eq.')).map(([k, v]) => [k, v.slice(3)]))

function projeter(ligne, cols) {
  if (cols.some((c) => c.nom === '*' || c.cle === '*')) return { ...ligne }
  const o = {}
  for (const c of cols) {
    if (c.table) o[c.nom] = ENFANTS[c.table]?.parent ? [] : null
    else o[c.nom] = ligne[c.cle] ?? null
  }
  return o
}

const memeCle = (a, b, pk, fx) => pk.every((k) => egal(a[k] ?? fx[k], b[k]))

async function appliquer(nomTable, methode, urlEcriture, lignes) {
  if (!avecCache()) return
  const cache = await caches.open(CACHE)
  const pk = TABLES[nomTable]
  const enfant = ENFANTS[nomTable]
  const filtresEcr = new URL(urlEcriture).searchParams
  for (const req of await cache.keys()) {
    const u = new URL(req.url)
    const t = table(u)
    if (t !== nomTable && !(enfant && t === enfant.parent)) continue
    const rep = await cache.match(req)
    let data
    try { data = JSON.parse(await rep.text()) } catch { continue }
    const params = u.searchParams, fx = fixes(params), cols = colonnes(params.get('select'))
    const liste = Array.isArray(data) ? data : data ? [data] : []
    let change = false

    if (t === nomTable && methode === 'DELETE') {
      const garde = liste.filter((l) => verifie({ ...fx, ...l }, filtresEcr) !== true)
      change = garde.length !== liste.length
      liste.splice(0, liste.length, ...garde)
    } else if (t === nomTable) {
      for (const r of lignes) {
        if (verifie(r, params) !== true) continue
        const p = projeter(r, cols)
        const i = liste.findIndex((l) => memeCle(l, r, pk, fx))
        if (i >= 0) liste[i] = { ...liste[i], ...Object.fromEntries(Object.entries(p).filter(([k]) => k in r || !(k in liste[i]))) }
        else if ((params.get('order') ?? '').includes('.desc')) liste.unshift(p)
        else liste.push(p)
        change = true
      }
    } else {
      // Nouvelles séries d'une séance faite : ajoutées dans la séance déjà gardée
      const c = cols.find((x) => x.table === nomTable)
      if (!c) continue
      const sc = colonnes(c.sous)
      for (const r of lignes) {
        const parent = liste.find((l) => egal(l.id, r[enfant.fk]))
        if (!parent) continue
        ;(parent[c.nom] ??= []).push(projeter(r, sc))
        change = true
      }
    }
    if (!change) continue
    const corps = Array.isArray(data) ? liste : liste[0] ?? null
    await cache.put(req, new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Garde': String(Date.now()) } }))
  }
}

// ---------- fetch du client Supabase ----------
const enLigne = () => typeof navigator === 'undefined' || navigator.onLine !== false

export async function fetchHorsLigne(input, init = {}) {
  const req = new Request(input, init)
  const url = new URL(req.url)
  const t = table(url)
  if (!t) return fetchReseau(input, init)

  if (req.method === 'GET') {
    if (!avecCache()) return fetchReseau(input, init)
    // Écritures en attente : envoyées d'abord, pour que la réponse les contienne
    if (enAttente() && enLigne()) await envoyerFile()
    const cle = cleCache(req.url, req.headers)
    const copie = await copieGardee(cle)
    if (!enLigne() && copie) return copie
    const reseau = fetchReseau(input, init).then((rep) => {
      if (rep.ok && (rep.headers.get('Content-Type') ?? '').includes('json')) garder(cle, rep.clone()).catch(() => {})
      return rep
    })
    if (!copie) return reseau
    let minuteur
    const delai = new Promise((ok) => { minuteur = setTimeout(() => ok('delai'), DELAI_MS) })
    try {
      const r = await Promise.race([reseau, delai])
      return r === 'delai' ? copie : r
    } catch (e) {
      if (estReseau(e)) return copie
      throw e
    } finally { clearTimeout(minuteur) }
  }

  // Écritures : seulement celles du suivi, sans réponse attendue (pas de .select() après)
  const prefer = req.headers.get('Prefer') ?? ''
  const attendable = TABLES[t] && !prefer.includes('return=representation') && ['POST', 'PATCH', 'DELETE'].includes(req.method)
  if (!attendable) return fetchReseau(input, init)

  const corps = init.body ?? null
  const mettreEnFile = async () => {
    const headers = {}
    req.headers.forEach((v, k) => { if (k !== 'authorization') headers[k] = v })
    enFile({ url: req.url, method: req.method, headers, body: typeof corps === 'string' ? corps : null })
    let lignes = []
    try { lignes = corps ? [].concat(JSON.parse(corps)) : [] } catch { /* corps illisible */ }
    // PATCH : la ligne existante prend les nouvelles valeurs (lignes visées par les filtres « eq »)
    if (req.method === 'PATCH') lignes = lignes.map((l) => ({ ...fixes(url.searchParams), ...l }))
    await appliquer(t, req.method === 'POST' ? 'POST' : req.method, req.url, lignes).catch(() => {})
    return new Response(null, { status: req.method === 'POST' ? 201 : 204, headers: { 'X-Hors-Ligne': '1' } })
  }

  // Une écriture plus ancienne attend encore : celle-ci passe derrière pour garder l'ordre
  if (!enLigne() || enAttente()) {
    const r = await mettreEnFile()
    if (enLigne()) envoyerFile()
    return r
  }
  try {
    const rep = await fetchReseau(input, init)
    if (rep.ok && avecCache()) {
      let lignes = []
      try { lignes = corps ? [].concat(JSON.parse(corps)) : [] } catch { /* corps illisible */ }
      if (req.method === 'PATCH') lignes = lignes.map((l) => ({ ...fixes(url.searchParams), ...l }))
      appliquer(t, req.method, req.url, lignes).catch(() => {})
    }
    return rep
  } catch (e) {
    if (!estReseau(e)) throw e
    return mettreEnFile()
  }
}

// Envoi automatique : au retour du réseau, au retour au premier plan et toutes les 30 s s'il reste des écritures
export function demarrerSynchro() {
  const tenter = () => { if (enAttente() && enLigne()) envoyerFile() }
  window.addEventListener('online', tenter)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tenter() })
  setInterval(tenter, 30000)
  setTimeout(tenter, 2000)
}
