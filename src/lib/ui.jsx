import { useEffect, useRef, useState } from 'react'

// Animation d'un exercice. Toujours : deux positions prises dans une planche de sprites [planche, ligne, nb_lignes]
// (légère, gardée hors ligne). En grand format, une vidéo fluide (images intermédiaires générées par
// scripts/animations/generer.py) se superpose dès que l'animation est visible à l'écran.
export function Anim({ ex, cls = '' }) {
  const boite = useRef()
  const [visible, setVisible] = useState(false)
  const [prete, setPrete] = useState(false)
  const fluide = !!ex.sprite && cls !== 't' && cls !== 's' && !matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!fluide || !('IntersectionObserver' in window)) return
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '200px' })
    obs.observe(boite.current)
    return () => obs.disconnect()
  }, [fluide])

  if (!ex.sprite) return <span className={`anim perso ${cls}`} role="img" aria-label={ex.nom}>{ex.nom.trim()[0]?.toUpperCase()}</span>
  const [s, r, n] = ex.sprite
  return <span ref={boite} className={`anim ${prete && visible ? 'video' : ''} ${cls}`} role="img" aria-label={ex.nom} style={{
    backgroundImage: `url(/sprites/s${String(s).padStart(2, '0')}.jpg)`,
    backgroundSize: `200% ${n * 100}%`,
    backgroundPositionY: `${n > 1 ? (r / (n - 1)) * 100 : 0}%`,
  }}>
    {fluide && visible && <video src={`/anim/s${s}-${r}.mp4`} autoPlay muted loop playsInline disablePictureInPicture
      aria-hidden="true" onPlaying={() => setPrete(true)} onError={() => setPrete(false)} />}
  </span>
}

let montrer = () => {}
export const toast = (msg) => montrer(msg)

export function Toast() {
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    let t
    montrer = (m) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(null), 2600) }
  }, [])
  return msg ? <div className="toast" role="status">{msg}</div> : null
}

export const fmt = (n, d = 0) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: d })

// Date du jour (heure locale) au format AAAA-MM-JJ
export const jourIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
