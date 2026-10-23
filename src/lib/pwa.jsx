import { useEffect, useState } from 'react'

// État partagé de l'app installable : capturé dès le chargement, avant le montage de React
let invite = null        // événement beforeinstallprompt gardé pour plus tard
let attente = null       // nouvelle version du service worker prête à prendre la main
const abonnes = new Set()
const prevenir = () => abonnes.forEach((f) => f())

export const estInstallee = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
const estIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function demarrerPwa() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); invite = e; prevenir() })
  window.addEventListener('appinstalled', () => { invite = null; prevenir() })
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register('/sw.js').catch(() => null)
    if (!reg) return
    const surveiller = (sw) => sw?.addEventListener('statechange', () => {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) { attente = sw; prevenir() }
    })
    if (reg.waiting && navigator.serviceWorker.controller) { attente = reg.waiting; prevenir() }
    surveiller(reg.installing)
    reg.addEventListener('updatefound', () => surveiller(reg.installing))
    // Vérifie s'il y a une nouvelle version quand l'app revient au premier plan
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}) })
  })
  // Rechargement seulement après « Mettre à jour » (pas à la toute première installation)
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (miseAJourDemandee) { miseAJourDemandee = false; location.reload() } })
}
let miseAJourDemandee = false
const mettreAJour = () => { miseAJourDemandee = true; attente?.postMessage('activer') }

function useEtatPwa() {
  const [, maj] = useState(0)
  useEffect(() => { const f = () => maj((n) => n + 1); abonnes.add(f); return () => abonnes.delete(f) }, [])
  return { invite, attente }
}

function useEnLigne() {
  const [enLigne, setEnLigne] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setEnLigne(true), off = () => setEnLigne(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return enLigne
}

// Comment installer l'app sur cet appareil : 'bouton' (Android, Chrome, Edge), 'ios' (Safari, à la main) ou null
export function useInstallation() {
  const { invite: inv } = useEtatPwa()
  if (estInstallee()) return { mode: null }
  if (inv) return {
    mode: 'bouton',
    installer: async () => { inv.prompt(); await inv.userChoice.catch(() => null); invite = null; prevenir() },
  }
  if (estIOS()) return { mode: 'ios' }
  return { mode: null }
}

const CLE_MASQUEE = 'muscu-installation-masquee'
const lireMasquee = () => { try { return localStorage.getItem(CLE_MASQUEE) === '1' } catch { return false } }

export function ConsigneIOS() {
  return <>Dans Safari, touche <b>Partager</b> puis <b>Sur l’écran d’accueil</b>.</>
}

// Bandeaux sous l'en-tête : hors ligne, nouvelle version, proposition d'installer l'app
export function BandeauxPwa({ connecte }) {
  const enLigne = useEnLigne()
  const { attente: sw } = useEtatPwa()
  const inst = useInstallation()
  const [masquee, setMasquee] = useState(lireMasquee)
  const masquer = () => { setMasquee(true); try { localStorage.setItem(CLE_MASQUEE, '1') } catch { /* stockage indisponible */ } }

  return (
    <>
      {!enLigne && <div className="bandeau warn" role="status"><span>Hors ligne : l’app a besoin du réseau pour charger et enregistrer tes données. Une séance en cours reste gardée sur cet appareil.</span></div>}
      {sw && <div className="bandeau" role="status"><span>Une nouvelle version de l’app est disponible.</span><button className="btn sm" onClick={mettreAJour}>Mettre à jour</button></div>}
      {connecte && !sw && inst.mode && !masquee && (
        <div className="bandeau">
          <span>{inst.mode === 'bouton' ? 'Installe Muscu Coach sur ton écran d’accueil pour l’ouvrir comme une app.' : <>Installe Muscu Coach sur ton écran d’accueil : <ConsigneIOS /></>}</span>
          {inst.mode === 'bouton' && <button className="btn sm" onClick={inst.installer}>Installer</button>}
          <button className="btn ghost sm" onClick={masquer}>Plus tard</button>
        </div>
      )}
    </>
  )
}

// Rubrique « Application » de Mon compte : installer l'app sur l'appareil
export function CarteApplication() {
  const inst = useInstallation()
  return (
    <div className="card">
      <h2>Application</h2>
      {estInstallee() ? <p className="sub" style={{ margin: 0 }}>Muscu Coach est installée sur cet appareil.</p>
        : inst.mode === 'bouton' ? <>
            <p className="sub" style={{ margin: 0 }}>Ajoute Muscu Coach à ton écran d’accueil pour l’ouvrir comme une app, en plein écran.</p>
            <div className="row"><button className="btn" onClick={inst.installer}>Installer l’app</button></div>
          </>
        : inst.mode === 'ios' ? <p className="sub" style={{ margin: 0 }}>Pour l’ajouter à ton écran d’accueil : <ConsigneIOS /></p>
        : <p className="sub" style={{ margin: 0 }}>Pour installer l’app, ouvre ce site sur ton téléphone dans Chrome (Android) ou Safari (iPhone).</p>}
    </div>
  )
}
