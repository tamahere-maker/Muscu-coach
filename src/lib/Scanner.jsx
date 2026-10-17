import { useEffect, useRef, useState } from 'react'

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

// Lecture d'un code-barres par la caméra arrière ; saisie manuelle si la caméra n'est pas disponible
export default function Scanner({ onCode }) {
  const video = useRef()
  const [etat, setEtat] = useState('demarrage')
  const [saisie, setSaisie] = useState('')

  useEffect(() => {
    let flux, minuterie, fini = false
    ;(async () => {
      try {
        const Detecteur = 'BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats()).includes('ean_13')
          ? window.BarcodeDetector
          : (await import('barcode-detector/ponyfill')).BarcodeDetector
        const detecteur = new Detecteur({ formats: FORMATS })
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (fini) return flux.getTracks().forEach((t) => t.stop())
        video.current.srcObject = flux
        await video.current.play()
        setEtat('actif')
        const lire = async () => {
          if (fini) return
          try {
            const [code] = await detecteur.detect(video.current)
            if (code?.rawValue) { fini = true; navigator.vibrate?.(80); return onCode(code.rawValue) }
          } catch { /* image pas encore prête */ }
          minuterie = setTimeout(lire, 250)
        }
        lire()
      } catch {
        if (!fini) setEtat('indisponible')
      }
    })()
    return () => { fini = true; clearTimeout(minuterie); flux?.getTracks().forEach((t) => t.stop()) }
  }, [])

  return (
    <div className="scanner">
      {etat !== 'indisponible' && (
        <div className="viseur">
          <video ref={video} muted playsInline />
          <span className="cadre" />
          {etat === 'demarrage' && <p>Ouverture de la caméra…</p>}
        </div>
      )}
      {etat === 'indisponible' && <p className="sub">Caméra indisponible. Autorise l’accès à la caméra, ou tape le code ci-dessous.</p>}
      <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); saisie.trim() && onCode(saisie.trim()) }}>
        <input type="text" inputMode="numeric" pattern="[0-9]{8,14}" placeholder="Ou tape le code-barres" aria-label="Code-barres"
          value={saisie} onChange={(e) => setSaisie(e.target.value.replace(/\D/g, ''))} />
        <button className="btn ghost">Valider</button>
      </form>
    </div>
  )
}
