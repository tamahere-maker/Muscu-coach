import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { estInstallee } from './pwa'

// Notifications push des nouveaux messages : abonnement de l'appareil, envoi via la fonction Supabase « notifier »

const estIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const supporte = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

// Clé publique VAPID (base64url) → octets attendus par pushManager.subscribe
const octets = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

const abonnementActuel = async () => {
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

const enregistrer = (sub) => {
  const j = sub.toJSON()
  return supabase.rpc('enregistrer_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth })
}

// 'actif', 'inactif', 'refuse' (bloquées dans le navigateur), 'ios' (installer l'app d'abord) ou 'indisponible'
export async function etatPush() {
  if (!supporte()) return estIOS() && !estInstallee() ? 'ios' : 'indisponible'
  if (Notification.permission === 'denied') return 'refuse'
  if (!import.meta.env.PROD) return 'indisponible' // le service worker n'est installé qu'en production
  return Notification.permission === 'granted' && (await abonnementActuel()) ? 'actif' : 'inactif'
}

export async function activerPush() {
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications refusées dans le navigateur')
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const { data, error } = await supabase.functions.invoke('notifier', { body: { action: 'cle' } })
    if (error || !data?.cle) throw new Error('Notifications indisponibles pour le moment')
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: octets(data.cle) })
  }
  const { error } = await enregistrer(sub)
  if (error) throw error
}

export async function desactiverPush() {
  const sub = supporte() ? await abonnementActuel() : null
  if (!sub) return
  await supabase.rpc('retirer_push', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

// Au lancement : rattache l'abonnement existant de l'appareil au compte connecté (l'adresse peut changer)
export async function rafraichirPush() {
  if (!supporte() || Notification.permission !== 'granted') return
  const sub = await abonnementActuel()
  if (sub) await enregistrer(sub)
}

// Prévient les autres participants des messages qu'on vient d'envoyer (sans bloquer l'envoi en cas d'échec)
export const notifier = (ids) => supabase.functions.invoke('notifier', { body: { messages: ids } }).catch(() => {})

// Déconnexion : l'appareil cesse de recevoir les notifications du compte
export async function deconnexion() {
  await desactiverPush().catch(() => {})
  await supabase.auth.signOut()
}

export function useEtatPush() {
  const [etat, setEtat] = useState(null)
  const relire = () => etatPush().then(setEtat).catch(() => setEtat('indisponible'))
  useEffect(() => { relire() }, [])
  return [etat, relire]
}
