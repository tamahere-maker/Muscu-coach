// Rappels de prise des compléments (appelée toutes les 5 min par pg_cron, voir migration 024).
// Pour chaque complément d'un plan actif qui a une heure de prise : si l'heure est passée depuis moins d'une heure
// (heure locale de l'athlète), qu'il n'est pas coché « pris » et qu'aucun rappel n'est parti aujourd'hui,
// une notification push est envoyée sur les appareils de l'athlète.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } })
const FENETRE_MIN = 60

// Date (AAAA-MM-JJ) et minutes depuis minuit dans un fuseau donné
function maintenant(fuseau: string) {
  let p: Record<string, string>
  try {
    p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]))
  } catch {
    return maintenant('Europe/Paris')
  }
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}

Deno.serve(async (req) => {
  const { data: conf } = await admin.from('config_serveur').select('cle, valeur').in('cle', ['cle_cron', 'vapid_public', 'vapid_prive'])
  const c = Object.fromEntries((conf ?? []).map((x) => [x.cle, x.valeur]))
  if (!c.cle_cron || req.headers.get('x-cle-cron') !== c.cle_cron) return json({ erreur: 'Accès refusé' }, 403)
  if (!c.vapid_public || !c.vapid_prive) return json({ envoyees: 0, note: 'Clés VAPID pas encore créées' })
  webpush.setVapidDetails('mailto:noreply@optepia.fr', c.vapid_public, c.vapid_prive)

  const { data: comps } = await admin.from('complements')
    .select('id, nom, dose, moment, heure, plan:plans_nutrition!inner(athlete_id, actif)')
    .not('heure', 'is', null).eq('plan.actif', true).not('plan.athlete_id', 'is', null)
  if (!comps?.length) return json({ envoyees: 0 })

  const athletes = [...new Set(comps.map((x) => (Array.isArray(x.plan) ? x.plan[0] : x.plan).athlete_id as string))]
  const { data: profils } = await admin.from('athlete_profiles').select('athlete_id, fuseau').in('athlete_id', athletes)
  const fuseaux = Object.fromEntries((profils ?? []).map((p) => [p.athlete_id, p.fuseau || 'Europe/Paris']))

  // Compléments dont l'heure vient de passer, avec la date locale de l'athlète
  const dus = comps.flatMap((x) => {
    const athlete = (Array.isArray(x.plan) ? x.plan[0] : x.plan).athlete_id as string
    const { date, minutes } = maintenant(fuseaux[athlete] ?? 'Europe/Paris')
    const [h, m] = String(x.heure).split(':').map(Number)
    const retard = minutes - (h * 60 + m)
    return retard >= 0 && retard < FENETRE_MIN ? [{ ...x, athlete, date }] : []
  })
  if (!dus.length) return json({ envoyees: 0 })

  const { data: prises } = await admin.from('prises_complements').select('complement_id, date').in('complement_id', dus.map((d) => d.id))
  const pris = new Set((prises ?? []).map((p) => `${p.complement_id}|${p.date}`))
  let envoyees = 0
  for (const d of dus) {
    if (pris.has(`${d.id}|${d.date}`)) continue
    // Réserve le rappel du jour : si la ligne existe déjà, il est déjà parti
    const { data: neuf } = await admin.from('rappels_envoyes')
      .upsert({ complement_id: d.id, date: d.date }, { onConflict: 'complement_id,date', ignoreDuplicates: true }).select('complement_id')
    if (!neuf?.length) continue
    const { data: abos } = await admin.from('abonnements_push').select('endpoint, p256dh, auth').eq('user_id', d.athlete)
    const charge = JSON.stringify({
      titre: `💊 ${d.nom}`,
      corps: [d.dose, d.moment].filter(Boolean).join(' · ') || 'C’est l’heure de ton complément',
      url: '/nutrition',
      tag: `complement-${d.id}`,
    })
    await Promise.all((abos ?? []).map(async (a) => {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, charge, { TTL: 3600 })
        envoyees++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await admin.from('abonnements_push').delete().eq('endpoint', a.endpoint)
      }
    }))
  }
  return json({ envoyees })
})
