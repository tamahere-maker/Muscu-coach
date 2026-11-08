import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { useSession } from './session'
import { toast } from './ui'

// Photo de profil : fichiers dans le bucket public « avatars » (avatars/<id du compte>/<uuid>.jpg),
// chemin gardé dans profiles.photo. Le nom du fichier change à chaque photo : pas de souci de cache.
const BUCKET = 'avatars'
const TAILLE = 512 // côté de l'image envoyée, en pixels
// Côté de la zone de recadrage à l'écran (réduit sur les petits téléphones)
const cadre = () => Math.max(200, Math.min(280, window.innerWidth - 84))

export const urlPhoto = (chemin) => (chemin ? supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl : null)

export function initiales(nom = '') {
  const mots = nom.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  return ((mots[0]?.[0] ?? '') + (mots.length > 1 ? mots[mots.length - 1][0] : mots[0]?.[1] ?? '')).toUpperCase() || '?'
}

// Miniature ronde : la photo, ou les initiales si aucune (ou si elle ne charge pas, hors ligne par exemple)
export function Avatar({ chemin, nom, taille = 36 }) {
  const url = urlPhoto(chemin)
  const [rate, setRate] = useState(false)
  useEffect(() => setRate(false), [url])
  return (
    <span className="avatar" style={{ width: taille, height: taille, fontSize: Math.round(taille * 0.4) }} aria-hidden="true">
      {url && !rate ? <img src={url} alt="" onError={() => setRate(true)} /> : initiales(nom)}
    </span>
  )
}

// Rubrique « Photo de profil » de Mon compte
export function CartePhoto() {
  const { session, profil, setProfil } = useSession()
  const camera = useRef(), galerie = useRef(), fichier = useRef(), dlg = useRef()
  const [image, setImage] = useState(null)
  const [occupe, setOccupe] = useState(false)
  const nom = profil.nom || session.user.email

  async function choisir(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (f.type && !f.type.startsWith('image/')) return toast('Choisis une image (JPEG, PNG…).')
    try {
      setImage(await chargerImage(f))
      dlg.current.showModal()
    } catch { toast('Image illisible sur cet appareil : essaie une photo en JPEG ou PNG.') }
  }

  function fermer() { dlg.current?.close(); setImage(null) }

  async function enregistrer(blob) {
    setOccupe(true)
    try {
      const chemin = `${profil.id}/${crypto.randomUUID()}.jpg`
      const up = await supabase.storage.from(BUCKET).upload(chemin, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
      if (up.error) throw up.error
      const { error } = await supabase.from('profiles').update({ photo: chemin }).eq('id', profil.id)
      if (error) { await supabase.storage.from(BUCKET).remove([chemin]); throw error }
      if (profil.photo) supabase.storage.from(BUCKET).remove([profil.photo]).catch(() => {})
      setProfil({ ...profil, photo: chemin })
      fermer()
      toast('Photo de profil enregistrée')
    } catch (err) { toast(navigator.onLine ? err.message : 'Pas de réseau : réessaie dès que tu as du réseau.') } finally { setOccupe(false) }
  }

  async function retirer() {
    if (!confirm('Retirer ta photo de profil ?')) return
    const { error } = await supabase.from('profiles').update({ photo: null }).eq('id', profil.id)
    if (error) return toast(error.message)
    supabase.storage.from(BUCKET).remove([profil.photo]).catch(() => {})
    setProfil({ ...profil, photo: null })
    toast('Photo retirée')
  }

  return (
    <div className="card">
      <h2>Photo de profil</h2>
      <div className="photo-profil">
        <Avatar chemin={profil.photo} nom={nom} taille={88} />
        <p className="sub" style={{ margin: 0 }}>Visible par tes {profil.role === 'coach' ? 'athlètes et coachs associés' : 'coachs'}. Tu pourras la recadrer avant de l’enregistrer.</p>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={choisir} />
      <input ref={galerie} type="file" accept="image/*" hidden onChange={choisir} />
      <input ref={fichier} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" hidden onChange={choisir} />
      <div className="row">
        <button type="button" className="btn ghost sm" onClick={() => camera.current.click()}>📷 Prendre une photo</button>
        <button type="button" className="btn ghost sm" onClick={() => galerie.current.click()}>🖼️ Galerie</button>
        <button type="button" className="btn ghost sm" onClick={() => fichier.current.click()}>📁 Importer un fichier</button>
        {profil.photo && <button type="button" className="linkbtn" onClick={retirer}>Retirer la photo</button>}
      </div>
      <dialog ref={dlg} onClose={() => setImage(null)} className="dlg-recadrage">
        {image && <Recadrage image={image} occupe={occupe} onAnnuler={fermer} onValider={enregistrer} />}
      </dialog>
    </div>
  )
}

async function chargerImage(f) {
  const url = URL.createObjectURL(f)
  try {
    const img = new Image()
    img.src = url
    await img.decode() // l'orientation EXIF est appliquée par le navigateur
    if (!img.naturalWidth) throw new Error('vide')
    return img
  } finally { setTimeout(() => URL.revokeObjectURL(url), 60000) }
}

// Recadrage carré : glisser pour déplacer, pincer / molette / curseur pour zoomer. Le cercle montre ce qui sera affiché.
export function Recadrage({ image, occupe, onAnnuler, onValider }) {
  const canvas = useRef()
  const [CADRE] = useState(cadre)
  const w = image.naturalWidth, h = image.naturalHeight
  const base = CADRE / Math.min(w, h) // échelle où l'image couvre juste le cadre
  const [v, setV] = useState({ z: 1, x: 0, y: 0 }) // zoom, décalage du centre de l'image (px écran)
  const doigts = useRef(new Map())
  const geste = useRef(null)

  const borner = ({ z, x, y }) => {
    z = Math.min(5, Math.max(1, z))
    const mx = (w * base * z - CADRE) / 2, my = (h * base * z - CADRE) / 2
    return { z, x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) }
  }
  const zoomer = (z) => setV((p) => borner({ ...p, z, x: p.x * z / p.z, y: p.y * z / p.z }))

  useEffect(() => {
    const c = canvas.current, r = window.devicePixelRatio || 1
    c.width = CADRE * r; c.height = CADRE * r
    const ctx = c.getContext('2d')
    ctx.setTransform(r, 0, 0, r, 0, 0)
    ctx.clearRect(0, 0, CADRE, CADRE)
    const s = base * v.z
    ctx.drawImage(image, CADRE / 2 + v.x - (w * s) / 2, CADRE / 2 + v.y - (h * s) / 2, w * s, h * s)
  }, [v, image])

  useEffect(() => {
    const c = canvas.current
    const molette = (e) => { e.preventDefault(); setV((p) => { const z = Math.min(5, Math.max(1, p.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); return borner({ z, x: p.x * z / p.z, y: p.y * z / p.z }) }) }
    c.addEventListener('wheel', molette, { passive: false })
    return () => c.removeEventListener('wheel', molette)
  }, [image])

  function bas(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    geste.current = null
  }
  function bouge(e) {
    const d = doigts.current
    if (!d.has(e.pointerId)) return
    const avant = d.get(e.pointerId)
    d.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (d.size === 1) {
      setV((p) => borner({ ...p, x: p.x + e.clientX - avant.x, y: p.y + e.clientY - avant.y }))
    } else if (d.size === 2) {
      const [a, b] = [...d.values()]
      const ecart = Math.hypot(a.x - b.x, a.y - b.y)
      if (geste.current) { const k = ecart / geste.current; setV((p) => { const z = Math.min(5, Math.max(1, p.z * k)); return borner({ z, x: p.x * z / p.z, y: p.y * z / p.z }) }) }
      geste.current = ecart
    }
  }
  function haut(e) { doigts.current.delete(e.pointerId); geste.current = null }

  function valider() {
    const s = base * v.z
    const cote = CADRE / s
    const sx = w / 2 - v.x / s - cote / 2, sy = h / 2 - v.y / s - cote / 2
    const c = document.createElement('canvas')
    c.width = c.height = Math.min(TAILLE, Math.round(cote)) || TAILLE
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height) // fond blanc pour les PNG transparents
    ctx.drawImage(image, sx, sy, cote, cote, 0, 0, c.width, c.height)
    c.toBlob((b) => (b ? onValider(b) : toast('Recadrage impossible sur cet appareil.')), 'image/jpeg', 0.88)
  }

  return (
    <div className="dlg">
      <div className="dlg-head"><h2>Recadrer la photo</h2>
        <button type="button" className="icon-btn" aria-label="Fermer" onClick={onAnnuler}>×</button></div>
      <p className="sub" style={{ margin: 0 }}>Fais glisser la photo pour la placer dans le cercle, et zoome avec deux doigts ou le curseur.</p>
      <div className="recadrage" style={{ width: CADRE, height: CADRE }}>
        <canvas ref={canvas} style={{ width: CADRE, height: CADRE }} onPointerDown={bas} onPointerMove={bouge} onPointerUp={haut} onPointerCancel={haut} aria-label="Zone de recadrage" />
        <span className="recadrage-cercle" aria-hidden="true" />
      </div>
      <label className="field recadrage-zoom"><span className="label">Zoom</span>
        <input type="range" min="1" max="5" step="0.01" value={v.z} onChange={(e) => zoomer(Number(e.target.value))} /></label>
      <div className="row">
        <button type="button" className="btn" disabled={occupe} onClick={valider}>{occupe ? 'Envoi…' : 'Enregistrer'}</button>
        <button type="button" className="btn ghost" onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  )
}
