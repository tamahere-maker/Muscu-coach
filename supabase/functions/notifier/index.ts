// Notifications push des nouveaux messages.
// { action: 'cle' } → clé publique VAPID (les clés sont créées au premier appel et gardées dans config_serveur)
// { messages: [id…] } → prévient les autres participants de chaque conversation (messages envoyés par l'appelant)
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function clesVapid() {
  const lire = async () => Object.fromEntries(((await admin.from('config_serveur').select('cle, valeur')
    .in('cle', ['vapid_public', 'vapid_prive'])).data ?? []).map((x) => [x.cle, x.valeur]))
  let c = await lire()
  if (!c.vapid_public || !c.vapid_prive) {
    const k = webpush.generateVAPIDKeys()
    // ignoreDuplicates : si deux appels créent des clés en même temps, les premières enregistrées sont gardées
    await admin.from('config_serveur').upsert([{ cle: 'vapid_public', valeur: k.publicKey }, { cle: 'vapid_prive', valeur: k.privateKey }],
      { onConflict: 'cle', ignoreDuplicates: true })
    c = await lire()
  }
  return { publique: c.vapid_public, privee: c.vapid_prive }
}

const apercu = (m: { texte: string; piece_type: string | null }) =>
  m.texte.trim() ? (m.texte.length > 140 ? m.texte.slice(0, 137) + '…' : m.texte) : m.piece_type === 'video' ? '🎬 Vidéo' : '📷 Photo'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const jeton = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
  const { data: { user } } = await admin.auth.getUser(jeton)
  if (!user) return json({ erreur: 'Non connecté' }, 401)
  const corps = await req.json().catch(() => ({}))
  const cles = await clesVapid()
  if (corps.action === 'cle') return json({ cle: cles.publique })

  const ids = Array.isArray(corps.messages) ? corps.messages.slice(0, 100) : []
  if (!ids.length) return json({ envoyees: 0 })
  // Seulement les messages tout juste envoyés par l'appelant (pas de renvoi d'anciens messages)
  const { data: msgs } = await admin.from('messages')
    .select('id, athlete_id, auteur_id, texte, piece_type, auteur:profiles!messages_auteur_id_fkey(nom, role)')
    .in('id', ids).eq('auteur_id', user.id).gte('created_at', new Date(Date.now() - 5 * 60000).toISOString())
  if (!msgs?.length) return json({ envoyees: 0 })

  webpush.setVapidDetails('mailto:noreply@optepia.fr', cles.publique, cles.privee)
  const athletes = [...new Set(msgs.map((m) => m.athlete_id))]
  const { data: coachings } = await admin.from('coachings').select('athlete_id, coach_id').in('athlete_id', athletes)
  let envoyees = 0
  for (const m of msgs) {
    const participants = [m.athlete_id, ...(coachings ?? []).filter((c) => c.athlete_id === m.athlete_id).map((c) => c.coach_id)]
    const destinataires = participants.filter((id) => id !== m.auteur_id)
    if (!destinataires.length) continue
    const { data: abos } = await admin.from('abonnements_push').select('endpoint, user_id, p256dh, auth').in('user_id', destinataires)
    const auteur = Array.isArray(m.auteur) ? m.auteur[0] : m.auteur
    await Promise.all((abos ?? []).map(async (a) => {
      const pourAthlete = a.user_id === m.athlete_id
      const charge = JSON.stringify({
        titre: `${auteur?.nom || 'Nouveau message'}${pourAthlete && auteur?.role === 'coach' ? ' · coach' : ''}`,
        corps: apercu(m),
        url: pourAthlete ? '/messages' : `/messages/${m.athlete_id}`,
        tag: `messages-${m.athlete_id}`,
      })
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, charge, { TTL: 86400 })
        envoyees++
      } catch (e) {
        // Abonnement expiré ou retiré par le navigateur : on l'oublie
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await admin.from('abonnements_push').delete().eq('endpoint', a.endpoint)
      }
    }))
  }
  return json({ envoyees })
})
