// Service worker de Muscu Coach : coquille de l'app disponible hors ligne.
// Les données (Supabase) ne sont jamais mises en cache : elles passent toujours par le réseau.
// Remplacée à chaque build par vite.config.js (versionServiceWorker)
const VERSION = 'dev'
const COQUILLE = `coquille-${VERSION}`
const MEDIAS = 'medias-v1'
const FIXES = ['/', '/manifest.webmanifest', '/icons/icone-192.png', '/icons/icone.svg']

// À l'installation : la page d'accueil et les fichiers JS/CSS qu'elle charge
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(COQUILLE)
    await cache.addAll(FIXES)
    const html = await (await cache.match('/')).text()
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
    await cache.addAll(assets)
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const cle of await caches.keys()) if (cle !== COQUILLE && cle !== MEDIAS) await caches.delete(cle)
    await self.clients.claim()
  })())
})

// La page demande d'activer la nouvelle version (bouton « Mettre à jour »)
self.addEventListener('message', (e) => { if (e.data === 'activer') self.skipWaiting() })

const depuisCache = async (nomCache, req) => {
  const cache = await caches.open(nomCache)
  const trouve = await cache.match(req)
  if (trouve) return trouve
  const rep = await fetch(req)
  if (rep.ok || rep.type === 'opaque') cache.put(req, rep.clone())
  return rep
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Pages : réseau d'abord (dernière version), sinon la coquille gardée en cache
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const rep = await fetch(req)
        if (rep.ok) (await caches.open(COQUILLE)).put('/', rep.clone())
        return rep
      } catch {
        return (await caches.match('/')) || Response.error()
      }
    })())
    return
  }

  if (url.origin === self.location.origin) {
    // Fichiers de build (noms hachés, donc immuables) et icônes
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) e.respondWith(depuisCache(COQUILLE, req))
    // Animations d'exercices : gardées après le premier affichage
    else if (url.pathname.startsWith('/sprites/')) e.respondWith(depuisCache(MEDIAS, req))
    return
  }

  // Polices Google
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(depuisCache(MEDIAS, req))
})
