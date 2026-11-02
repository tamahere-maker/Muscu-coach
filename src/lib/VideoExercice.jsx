import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const BUCKET = 'videos-exercices'

// Lien YouTube ou Vimeo → adresse du lecteur intégré ; fichier vidéo → null (lu par <video>) ; autre → lien simple
export function lecteur(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    const h = u.hostname.replace(/^www\.|^m\./, '')
    let yt = null
    if (h === 'youtu.be') yt = u.pathname.slice(1)
    else if (h.endsWith('youtube.com')) yt = u.searchParams.get('v') || u.pathname.match(/\/(shorts|embed|live)\/([^/?]+)/)?.[2]
    if (yt) return { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt.split('/')[0])}?rel=0&playsinline=1` }
    const vi = h === 'vimeo.com' && u.pathname.match(/^\/(\d+)/)?.[1]
    if (vi) return { type: 'iframe', src: `https://player.vimeo.com/video/${vi}` }
    if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { type: 'video', src: url }
  } catch { /* lien invalide */ }
  return { type: 'lien', src: url }
}

// Adresse lisible d'une vidéo du coach (fichier privé → lien signé valable une heure)
export async function adresseVideo(v) {
  if (!v) return null
  if (v.url) return v.url
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(v.chemin, 3600)
  return data?.signedUrl ?? null
}

// Lecteur d'une vidéo : intégré pour YouTube/Vimeo et les fichiers, lien sinon
export function Video({ url, fichier = false, titre = 'Vidéo' }) {
  if (!url) return null
  const l = fichier ? { type: 'video', src: url } : lecteur(url)
  if (l.type === 'iframe') return <iframe src={l.src} title={titre} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
  if (l.type === 'video') return <video src={l.src} controls playsInline preload="metadata" />
  return <a className="btn ghost" href={l.src} target="_blank" rel="noreferrer">Voir la vidéo</a>
}

// Vidéo du coach (ligne de videos_exercices) chargée et affichée
export function VideoCoach({ v, titre }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { let ok = true; adresseVideo(v).then((u) => ok && setUrl(u)); return () => { ok = false } }, [v?.url, v?.chemin])
  return url ? <Video url={url} fichier={!!v.chemin} titre={titre} /> : null
}

const MAX = 50 * 1024 * 1024

// Envoie une vidéo dans le dossier du coach ; renvoie son chemin
export async function televerserVideo(coachId, fichier) {
  if (!fichier.type.startsWith('video/')) throw new Error('Choisis un fichier vidéo (MP4, MOV ou WebM).')
  if (fichier.size > MAX) throw new Error('Vidéo trop lourde (50 Mo maximum). Filme un passage plus court ou mets-la sur YouTube.')
  const ext = (fichier.name.split('.').pop() || 'mp4').toLowerCase()
  const chemin = `${coachId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(chemin, fichier, { contentType: fichier.type })
  if (error) throw error
  return chemin
}

export const supprimerFichierVideo = (chemin) => chemin && supabase.storage.from(BUCKET).remove([chemin])
