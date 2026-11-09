// E-mails (Resend) et notifications de l'app.
// Appels depuis l'app (jeton de l'utilisateur) :
//   { action: 'invitation', id }        → e-mail d'invitation à l'athlète (coach qui a créé l'invitation)
//   { action: 'invitation_coach', id }  → e-mail d'invitation à un coach associé (coach principal qui l'a créée)
//   { action: 'contrat', id }           → e-mail de confirmation du contrat accepté, PDF joint (une seule fois)
//   { action: 'suivi', id }             → pause, reprise ou fin du suivi (evenements_suivi, migration 032) : push + e-mail
//                                         à l'athlète, e-mail aux coachs concernés (coach auteur de l'action)
// Appel de pg_cron (en-tête x-cle-cron, toutes les 5 min, voir migration 031) :
//   { action: 'maj' } → push + e-mail à l'athlète quand son coach a modifié son programme ou son plan alimentaire,
//                       regroupés : 10 min après la dernière modification, ou au bout d'une heure au plus tard.
//                       Rattrape aussi les événements de suivi que l'app n'a pas pu notifier.
// La clé Resend est lue dans le secret RESEND_API_KEY, sinon dans config_serveur (cle = 'resend_api_key').
import webpush from 'npm:web-push@3.6.7'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import { createClient } from 'npm:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cle-cron',
}
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const EXPEDITEUR = 'Muscu Coach <noreply@optepia.fr>'
const ATTENTE_MIN = 10   // délai sans modification avant d'envoyer la mise à jour
const MAX_MIN = 60       // envoi au plus tard une heure après la première modification

async function config(cles: string[]) {
  const { data } = await admin.from('config_serveur').select('cle, valeur').in('cle', cles)
  return Object.fromEntries((data ?? []).map((x) => [x.cle, x.valeur])) as Record<string, string>
}

const echapper = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

// Gabarit commun, même présentation que les e-mails de compte (supabase/templates)
function gabarit({ titre, paragraphes, bouton, lien, pied }: { titre: string; paragraphes: string[]; bouton?: string; lien?: string; pied?: string }) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${echapper(titre)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#16191f;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #d6d9df;border-radius:12px;">
<tr><td style="padding:28px 28px 0;font-family:'Arial Narrow',Arial,sans-serif;font-size:24px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Muscu <span style="color:#d6402b;">Coach</span></td></tr>
<tr><td style="padding:20px 28px 0;"><h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${echapper(titre)}</h1>
${paragraphes.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;">${p}</p>`).join('\n')}</td></tr>
${bouton && lien ? `<tr><td style="padding:8px 28px 24px;"><a href="${echapper(lien)}" style="display:inline-block;background:#d6402b;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:8px;">${echapper(bouton)}</a></td></tr>
<tr><td style="padding:0 28px 24px;font-size:13px;line-height:1.5;color:#5b6270;">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br><a href="${echapper(lien)}" style="color:#d6402b;word-break:break-all;">${echapper(lien)}</a></td></tr>` : ''}
${pied ? `<tr><td style="padding:16px 28px 24px;border-top:1px solid #d6d9df;font-size:12px;line-height:1.5;color:#5b6270;">${pied}</td></tr>` : ''}
</table></td></tr></table></body></html>`
}

async function envoyerMail(cle: string, m: { to: string[]; cc?: string[]; reply_to?: string; subject: string; html: string; attachments?: { filename: string; content: string }[] }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EXPEDITEUR, ...m }),
  })
  if (!r.ok) throw new Error(`Resend ${r.status} : ${(await r.text()).slice(0, 300)}`)
  return (await r.json()).id as string
}

const emailDe = async (id: string) => (await admin.auth.admin.getUserById(id)).data.user?.email ?? null
const nomDe = async (id: string | null) => id ? (await admin.from('profiles').select('nom').eq('id', id).maybeSingle()).data?.nom || '' : ''

// ---------- PDF du contrat (polices standard : caractères WinAnsi seulement) ----------
const WINANSI = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
const pdfTexte = (s: string) => [...s.replace(/[   ]/g, ' ').replace(/[‐‑]/g, '-')]
  .map((c) => { const n = c.charCodeAt(0); return (n >= 32 && n <= 126) || (n >= 160 && n <= 255) || WINANSI.has(c) ? c : n === 9 ? ' ' : '' }).join('')

async function pdfContrat(k: Record<string, any>, preuve: Record<string, any> | null, coach: string, athlete: string) {
  const doc = await PDFDocument.create()
  doc.setTitle(pdfTexte(k.titre)); doc.setAuthor('Muscu Coach'); doc.setLanguage('fr-FR')
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const gras = await doc.embedFont(StandardFonts.HelveticaBold)
  const L = 595.28, H = 841.89, M = 56, largeur = L - 2 * M
  let page = doc.addPage([L, H]); let y = H - M
  const ligne = (texte: string, { police = normal, taille = 10, avant = 0, apres = 4, retrait = 0, couleur = rgb(0.09, 0.1, 0.12) } = {}) => {
    y -= avant
    const mots = pdfTexte(texte).split(' ')
    let cour = ''
    const lignes: string[] = []
    for (const mot of mots) {
      const essai = cour ? cour + ' ' + mot : mot
      if (police.widthOfTextAtSize(essai, taille) > largeur - retrait && cour) { lignes.push(cour); cour = mot } else cour = essai
    }
    lignes.push(cour)
    for (const l of lignes) {
      if (y - taille < M) { page = doc.addPage([L, H]); y = H - M }
      y -= taille * 1.35
      page.drawText(l, { x: M + retrait, y, size: taille, font: police, color: couleur })
    }
    y -= apres
  }
  const date = (d: string) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })
  const jour = (d: string) => new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  ligne('MUSCU COACH', { police: gras, taille: 9, couleur: rgb(0.84, 0.25, 0.17), apres: 10 })
  for (const l of String(k.texte).split('\n')) {
    if (l.startsWith('# ')) ligne(l.slice(2), { police: gras, taille: 16, apres: 8 })
    else if (l.startsWith('## ')) ligne(l.slice(3), { police: gras, taille: 11.5, avant: 8, apres: 3 })
    else if (l.startsWith('- ')) ligne('•  ' + l.slice(2), { retrait: 10 })
    else if (l.trim()) ligne(l)
  }
  ligne('Récapitulatif et preuve d’acceptation', { police: gras, taille: 11.5, avant: 14, apres: 3 })
  ligne(`Coach : ${coach} · Athlète : ${athlete}`)
  ligne(`Prix : ${Number(k.prix_eur).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} TTC · Durée : ${k.date_fin ? `du ${jour(k.date_debut)} au ${jour(k.date_fin)}` : `à partir du ${jour(k.date_debut)}`}, sans reconduction`)
  if (k.accepte_at) ligne(`Accepté électroniquement par ${athlete} le ${date(k.accepte_at)} (heure de Paris).${k.demarrage_anticipe ? ' Démarrage demandé avant la fin du délai de rétractation de 14 jours.' : ''}`)
  ligne(`Empreinte SHA-256 du texte : ${preuve?.empreinte || k.empreinte}${preuve?.ip ? ` · adresse IP ${preuve.ip}` : ''}`, { taille: 8.5 })
  ligne(`Référence du contrat : ${k.id}`, { taille: 8.5 })
  return await doc.saveAsBase64()
}

// ---------- Push ----------
async function pousser(c: Record<string, string>, userId: string, charge: Record<string, string>) {
  if (!c.vapid_public || !c.vapid_prive) return 0
  webpush.setVapidDetails('mailto:noreply@optepia.fr', c.vapid_public, c.vapid_prive)
  const { data: abos } = await admin.from('abonnements_push').select('endpoint, p256dh, auth').eq('user_id', userId)
  let n = 0
  await Promise.all((abos ?? []).map(async (a) => {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(charge), { TTL: 86400 })
      n++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await admin.from('abonnements_push').delete().eq('endpoint', a.endpoint)
    }
  }))
  return n
}

// ---------- Actions ----------
async function invitation(cle: string, app: string, userId: string, id: string) {
  const { data: inv } = await admin.from('invitations').select('id, email, token, prix_eur, statut, email_envoye_at').eq('id', id).eq('coach_id', userId).maybeSingle()
  if (!inv || inv.statut !== 'envoyee') return json({ erreur: 'Invitation introuvable ou déjà utilisée' }, 404)
  if (inv.email_envoye_at && Date.now() - new Date(inv.email_envoye_at).getTime() < 60000) return json({ erreur: 'E-mail déjà envoyé à l’instant, réessaie dans une minute' }, 429)
  const coach = await nomDe(userId) || 'Ton coach'
  const lien = `${app}/invitation/${inv.token}`
  await envoyerMail(cle, {
    to: [inv.email], reply_to: (await emailDe(userId)) ?? undefined,
    subject: `${coach} t’invite sur Muscu Coach`,
    html: gabarit({
      titre: `${coach} t’invite sur Muscu Coach`,
      paragraphes: [
        `<strong>${echapper(coach)}</strong> sera ton coach sur Muscu Coach : ton programme d’entraînement, ton plan alimentaire, tes bilans et vos messages au même endroit.`,
        inv.prix_eur != null ? `Prix du programme annoncé : <strong>${Number(inv.prix_eur).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</strong>.` : '',
        'Crée ton compte athlète avec cette adresse e-mail (ou connecte-toi si tu en as déjà un), puis accepte l’invitation.',
      ].filter(Boolean),
      bouton: 'Rejoindre mon coach', lien,
      pied: 'Tu ne connais pas ce coach ? Ignore simplement ce message : rien ne se passera sans ton accord. Pour lui répondre, réponds à cet e-mail.',
    }),
  })
  await admin.from('invitations').update({ email_envoye_at: new Date().toISOString() }).eq('id', inv.id)
  return json({ ok: true })
}

async function invitationCoach(cle: string, app: string, userId: string, id: string) {
  const { data: inv } = await admin.from('invitations_coach').select('id, email, token, perimetre, statut, athlete_id, email_envoye_at').eq('id', id).eq('invite_par', userId).maybeSingle()
  if (!inv || inv.statut !== 'envoyee') return json({ erreur: 'Invitation introuvable ou déjà utilisée' }, 404)
  if (inv.email_envoye_at && Date.now() - new Date(inv.email_envoye_at).getTime() < 60000) return json({ erreur: 'E-mail déjà envoyé à l’instant, réessaie dans une minute' }, 429)
  const [coach, athlete] = await Promise.all([nomDe(userId), nomDe(inv.athlete_id)])
  const lien = `${app}/invitation-coach/${inv.token}`
  await envoyerMail(cle, {
    to: [inv.email], reply_to: (await emailDe(userId)) ?? undefined,
    subject: `${coach || 'Un coach'} t’invite comme coach associé sur Muscu Coach`,
    html: gabarit({
      titre: 'Invitation comme coach associé',
      paragraphes: [`<strong>${echapper(coach || 'Un coach')}</strong> t’invite à suivre ${athlete ? `<strong>${echapper(athlete)}</strong>` : 'un de ses athlètes'} sur Muscu Coach, sur le périmètre « ${echapper(inv.perimetre)} ».`,
        'Crée ton compte coach ou connecte-toi, puis accepte l’invitation.'],
      bouton: 'Voir l’invitation', lien,
      pied: 'Tu ne connais pas ce coach ? Ignore simplement ce message.',
    }),
  })
  await admin.from('invitations_coach').update({ email_envoye_at: new Date().toISOString() }).eq('id', inv.id)
  return json({ ok: true })
}

async function contrat(cle: string, app: string, userId: string, id: string) {
  const { data: k } = await admin.from('contrats').select('*').eq('id', id).maybeSingle()
  if (!k || (k.athlete_id !== userId && k.coach_id !== userId)) return json({ erreur: 'Contrat introuvable' }, 404)
  if (k.statut !== 'accepte') return json({ erreur: 'Le contrat n’est pas accepté' }, 409)
  // Réservation : un seul e-mail de confirmation par contrat, même si l'app appelle deux fois
  const { data: pris } = await admin.from('contrats').update({ email_confirmation_at: new Date().toISOString() })
    .eq('id', id).is('email_confirmation_at', null).select('id')
  if (!pris?.length) return json({ ok: true, deja: true })
  try {
    const [{ data: preuve }, coach, athlete, mailAthlete, mailCoach] = await Promise.all([
      admin.from('acceptations_contrat').select('empreinte, ip, created_at').eq('contrat_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      nomDe(k.coach_id), nomDe(k.athlete_id), emailDe(k.athlete_id), emailDe(k.coach_id),
    ])
    if (!mailAthlete) throw new Error('Adresse de l’athlète introuvable')
    const pdf = await pdfContrat(k, preuve, coach, athlete)
    const quand = new Date(k.accepte_at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })
    await envoyerMail(cle, {
      to: [mailAthlete], cc: mailCoach && mailCoach !== mailAthlete ? [mailCoach] : undefined, reply_to: mailCoach ?? undefined,
      subject: `Contrat accepté : ${k.titre}`,
      html: gabarit({
        titre: 'Ton contrat de coaching est accepté',
        paragraphes: [
          `Bonjour ${echapper(athlete)}, tu as accepté le contrat « <strong>${echapper(k.titre)}</strong> » proposé par <strong>${echapper(coach)}</strong> le ${echapper(quand)}.`,
          `Prix : <strong>${Number(k.prix_eur).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} TTC</strong>. Tu trouveras le contrat complet en PDF joint à cet e-mail : garde-le précieusement.`,
          `Tu disposes de <strong>14 jours</strong> pour te rétracter, depuis l’app (Mon profil › Mes contrats) ou en répondant à cet e-mail.`,
        ],
        bouton: 'Voir le contrat dans l’app', lien: `${app}/contrats/${k.id}`,
        pied: `Une copie de cet e-mail est envoyée à ton coach. Empreinte SHA-256 du texte : ${echapper(preuve?.empreinte || k.empreinte)}`,
      }),
      attachments: [{ filename: `contrat-${String(k.titre).normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50) || 'coaching'}.pdf`, content: pdf }],
    })
    return json({ ok: true })
  } catch (e) {
    await admin.from('contrats').update({ email_confirmation_at: null }).eq('id', id)
    throw e
  }
}

async function majRegroupees(cle: string | undefined, app: string, c: Record<string, string>) {
  const maintenant = Date.now()
  const { data: lignes } = await admin.from('maj_en_attente').select('*')
    .or(`derniere_modif.lt.${new Date(maintenant - ATTENTE_MIN * 60000).toISOString()},premiere_modif.lt.${new Date(maintenant - MAX_MIN * 60000).toISOString()}`)
  let push = 0, mails = 0
  for (const l of lignes ?? []) {
    // Réservation : on retire la ligne seulement si le coach ne l'a pas modifiée entre-temps
    const { data: pris } = await admin.from('maj_en_attente').delete().eq('athlete_id', l.athlete_id).eq('type', l.type)
      .eq('derniere_modif', l.derniere_modif).select('athlete_id')
    if (!pris?.length) continue
    const prog = l.type === 'programme'
    const [coach, { data: p }] = await Promise.all([nomDe(l.coach_id), admin.from('profiles').select('nom, emails_maj, role').eq('id', l.athlete_id).maybeSingle()])
    if (!p || p.role !== 'athlete') continue
    // Suivi en pause : pas de notification de mise à jour
    const { data: pause } = await admin.from('coachings').select('id').eq('athlete_id', l.athlete_id).not('pause_depuis', 'is', null).limit(1)
    if (pause?.length) continue
    const qui = coach || 'Ton coach'
    const quoi = prog ? `ton programme${l.nom ? ` « ${l.nom} »` : ''}` : `ton plan alimentaire${l.nom ? ` « ${l.nom} »` : ''}`
    const url = prog ? '/' : '/nutrition'
    push += await pousser(c, l.athlete_id, {
      titre: prog ? 'Programme mis à jour' : 'Plan alimentaire mis à jour',
      corps: `${qui} a modifié ${quoi}.`, url, tag: `maj-${l.type}`,
    })
    if (cle && p.emails_maj !== false) {
      const mail = await emailDe(l.athlete_id)
      if (!mail) continue
      try {
        await envoyerMail(cle, {
          to: [mail], reply_to: l.coach_id ? (await emailDe(l.coach_id)) ?? undefined : undefined,
          subject: prog ? 'Ton programme a été mis à jour' : 'Ton plan alimentaire a été mis à jour',
          html: gabarit({
            titre: prog ? 'Ton programme a été mis à jour' : 'Ton plan alimentaire a été mis à jour',
            paragraphes: [`Bonjour ${echapper(p.nom || '')}, <strong>${echapper(qui)}</strong> vient de modifier ${echapper(quoi)}.`,
              prog ? 'Jette un œil avant ta prochaine séance : exercices, séries, charges ou repos ont pu changer.' : 'Jette un œil à tes repas : aliments, quantités, objectifs ou compléments ont pu changer.'],
            bouton: prog ? 'Voir mon programme' : 'Voir mon plan', lien: `${app}${url}`,
            pied: 'Tu peux couper ces e-mails dans l’app, Mon compte › Notifications (la notification sur ton téléphone reste active).',
          }),
        })
        mails++
      } catch (e) {
        console.error('maj', l.athlete_id, (e as Error).message)
      }
    }
  }
  // Événements de suivi restés sans notification (app fermée juste après l'action, réseau coupé…)
  const { data: evs } = await admin.from('evenements_suivi').select('id').is('notifie_at', null)
    .lt('created_at', new Date(maintenant - 2 * 60000).toISOString()).limit(50)
  for (const e of evs ?? []) {
    try { await suivi(cle, app, c, null, e.id) } catch (err) { console.error('suivi', e.id, (err as Error).message) }
  }
  return json({ traitees: lignes?.length ?? 0, push, mails, suivi: evs?.length ?? 0 })
}

// ---------- Pause, reprise et fin du suivi ----------
const jourLong = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

async function suivi(cle: string | undefined, app: string, c: Record<string, string>, userId: string | null, id: string) {
  const { data: ev } = await admin.from('evenements_suivi').select('*').eq('id', id).maybeSingle()
  if (!ev || (userId && ev.coach_id !== userId)) return json({ erreur: 'Action introuvable' }, 404)
  // Réservation : une seule notification par action
  const { data: pris } = await admin.from('evenements_suivi').update({ notifie_at: new Date().toISOString() })
    .eq('id', id).is('notifie_at', null).select('id')
  if (!pris?.length) return json({ ok: true, deja: true })
  try {
    const d = ev.details ?? {}
    const [auteur, athlete, mailAthlete, mailAuteur] = await Promise.all([nomDe(ev.coach_id), nomDe(ev.athlete_id), emailDe(ev.athlete_id), emailDe(ev.coach_id)])
    const qui = auteur || 'Ton coach'
    const motif = ev.motif ? `Message de ${echapper(qui)} : « ${echapper(ev.motif)} »` : ''
    const quand = jourLong(ev.created_at)
    const garde = 'Ton compte, ton historique de séances, tes mesures, tes bilans, ton programme et ton plan alimentaire restent dans ton espace : rien n’est effacé.'
    let mail: { sujet: string; titre: string; paragraphes: string[]; bouton?: string; lien?: string } | null = null
    let push: { titre: string; corps: string } | null = null
    const autres: { id: string; sujet: string; titre: string; paragraphes: string[] }[] = []

    if (ev.type === 'pause') {
      push = { titre: 'Suivi en pause', corps: `${qui} a mis ton suivi en pause.` }
      mail = {
        sujet: 'Ton suivi est en pause', titre: 'Ton suivi est en pause',
        paragraphes: [`Bonjour ${echapper(athlete)}, <strong>${echapper(qui)}</strong> a mis ton suivi en pause le ${quand}.`, motif,
          '<strong>Ce qui change :</strong> ton coach ne reçoit plus d’alertes sur tes séances et tes bilans, et tu ne reçois plus de notifications quand ton programme ou ton plan est modifié.',
          `<strong>Ce qui ne change pas :</strong> ${garde} Tu peux continuer à t’entraîner et à écrire à ton coach depuis l’app. Ton contrat n’est pas modifié par la pause.`,
          'Un e-mail te préviendra dès que ton suivi reprendra.'].filter(Boolean),
        bouton: 'Ouvrir l’app', lien: app,
      }
    } else if (ev.type === 'reprise') {
      push = { titre: 'Ton suivi reprend', corps: `${qui} a repris ton suivi.` }
      mail = {
        sujet: 'Ton suivi reprend', titre: 'Ton suivi reprend',
        paragraphes: [`Bonjour ${echapper(athlete)}, <strong>${echapper(qui)}</strong> a repris ton suivi le ${quand}.`, motif,
          'Ton coach voit de nouveau tes séances et tes bilans dans ses alertes, et tu reçois de nouveau une notification quand ton programme ou ton plan change.'].filter(Boolean),
        bouton: 'Voir mon programme', lien: app,
      }
    } else if (ev.type === 'fin') {
      const assoc: { id: string; nom: string }[] = d.associes ?? []
      const ctr: { titre: string; statut: string }[] = d.contrats ?? []
      push = { titre: 'Fin de ton suivi', corps: `${qui} a mis fin à ton suivi.` }
      mail = {
        sujet: `${qui} a mis fin à ton suivi`, titre: 'Ton suivi est terminé',
        paragraphes: [`Bonjour ${echapper(athlete)}, <strong>${echapper(qui)}</strong> a mis fin à ton suivi le ${quand}.`, motif,
          '<strong>Ce qui a été fait :</strong>',
          `• ${echapper(qui)} n’a plus accès à tes données (séances, nutrition, bilans, messages).`,
          ...assoc.map((a) => `• ${echapper(a.nom || 'Ton coach associé')}, coach associé, ne te suit plus non plus.`),
          ...ctr.map((k) => k.statut === 'resilie' ? `• Le contrat « ${echapper(k.titre)} » est résilié à cette date.` : `• La proposition de contrat « ${echapper(k.titre)} » est annulée.`),
          `<strong>Ce qui reste :</strong> ${garde} Si tu rejoins un coach plus tard, il pourra les consulter.`,
          'Une question sur un paiement ou sur ton contrat ? Réponds simplement à cet e-mail pour écrire à ton coach.'].filter(Boolean),
        bouton: 'Ouvrir l’app', lien: app,
      }
      for (const a of assoc) autres.push({ id: a.id, sujet: `Fin du suivi de ${athlete}`, titre: `Fin du suivi de ${athlete}`,
        paragraphes: [`<strong>${echapper(qui)}</strong>, coach principal, a mis fin au suivi de <strong>${echapper(athlete)}</strong> le ${quand}.`,
          'Tu n’as plus accès à ses données, et ce suivi n’apparaît plus dans ta liste d’athlètes.'] })
    } else if (ev.type === 'depart_associe') {
      const principal = d.principal ? await nomDe(d.principal) : ''
      push = { titre: 'Changement de coach', corps: `${qui} ne fait plus partie de tes coachs.` }
      mail = {
        sujet: `${qui} ne fait plus partie de tes coachs`, titre: 'Changement dans ton équipe de coachs',
        paragraphes: [`Bonjour ${echapper(athlete)}, <strong>${echapper(qui)}</strong>, coach associé, a quitté ton suivi le ${quand}.`, motif,
          `${echapper(qui)} n’a plus accès à tes données.${principal ? ` <strong>${echapper(principal)}</strong>, ton coach principal, continue de te suivre.` : ''}`, garde].filter(Boolean),
        bouton: 'Ouvrir l’app', lien: app,
      }
      if (d.principal) autres.push({ id: d.principal, sujet: `${qui} a quitté le suivi de ${athlete}`, titre: 'Un coach associé est parti',
        paragraphes: [`<strong>${echapper(qui)}</strong> a quitté le suivi de <strong>${echapper(athlete)}</strong> le ${quand}.`, motif,
          'Pense à revoir la répartition du paiement et, si besoin, à inviter un autre coach associé.'].filter(Boolean) })
    } else if (ev.type === 'retrait_associe') {
      const nom = d.nom || 'Ton coach associé'
      push = { titre: 'Changement de coach', corps: `${nom} ne fait plus partie de tes coachs.` }
      mail = {
        sujet: `${nom} ne fait plus partie de tes coachs`, titre: 'Changement dans ton équipe de coachs',
        paragraphes: [`Bonjour ${echapper(athlete)}, <strong>${echapper(qui)}</strong>, ton coach principal, a retiré <strong>${echapper(nom)}</strong> de ton suivi le ${quand}.`, motif,
          `${echapper(nom)} n’a plus accès à tes données. ${echapper(qui)} continue de te suivre.`, garde].filter(Boolean),
        bouton: 'Ouvrir l’app', lien: app,
      }
      if (d.associe) autres.push({ id: d.associe, sujet: `Fin de ton suivi de ${athlete}`, titre: `Fin de ton suivi de ${athlete}`,
        paragraphes: [`<strong>${echapper(qui)}</strong>, coach principal, t’a retiré du suivi de <strong>${echapper(athlete)}</strong> le ${quand}.`, motif,
          'Tu n’as plus accès à ses données, et ce suivi n’apparaît plus dans ta liste d’athlètes.'].filter(Boolean) })
    }
    if (!mail || !push) return json({ erreur: 'Action inconnue' }, 400)

    await pousser(c, ev.athlete_id, { ...push, url: '/', tag: `suivi-${ev.type}` })
    let mails = 0
    if (cle && mailAthlete) {
      await envoyerMail(cle, {
        to: [mailAthlete], reply_to: mailAuteur ?? undefined, subject: mail.sujet,
        html: gabarit({ titre: mail.titre, paragraphes: mail.paragraphes, bouton: mail.bouton, lien: mail.lien,
          pied: 'E-mail envoyé automatiquement par Muscu Coach à la suite d’une action de ton coach. Pour lui écrire, réponds à cet e-mail.' }),
      })
      mails++
    }
    for (const o of autres) {
      const adr = cle ? await emailDe(o.id) : null
      if (!adr) continue
      try {
        await envoyerMail(cle!, { to: [adr], reply_to: mailAuteur ?? undefined, subject: o.sujet,
          html: gabarit({ titre: o.titre, paragraphes: o.paragraphes, bouton: 'Ouvrir l’app', lien: app }) })
        mails++
      } catch (e) { console.error('suivi coach', o.id, (e as Error).message) }
    }
    return json({ ok: true, mails })
  } catch (e) {
    await admin.from('evenements_suivi').update({ notifie_at: null }).eq('id', id)
    throw e
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const corps = await req.json().catch(() => ({}))
  const c = await config(['cle_cron', 'vapid_public', 'vapid_prive', 'resend_api_key', 'app_url'])
  const cle = Deno.env.get('RESEND_API_KEY') || c.resend_api_key
  const app = (c.app_url || 'https://muscu-coach.optepia.workers.dev').replace(/\/$/, '')
  try {
    if (corps.action === 'maj') {
      if (!c.cle_cron || req.headers.get('x-cle-cron') !== c.cle_cron) return json({ erreur: 'Accès refusé' }, 403)
      return await majRegroupees(cle, app, c)
    }
    const jeton = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    const { data: { user } } = await admin.auth.getUser(jeton)
    if (!user) return json({ erreur: 'Non connecté' }, 401)
    if (typeof corps.id !== 'string') return json({ erreur: 'Paramètre manquant' }, 400)
    if (corps.action === 'suivi') return await suivi(cle, app, c, user.id, corps.id)
    if (!cle) return json({ erreur: 'Envoi d’e-mails pas encore configuré' }, 503)
    if (corps.action === 'invitation') return await invitation(cle, app, user.id, corps.id)
    if (corps.action === 'invitation_coach') return await invitationCoach(cle, app, user.id, corps.id)
    if (corps.action === 'contrat') return await contrat(cle, app, user.id, corps.id)
    return json({ erreur: 'Action inconnue' }, 400)
  } catch (e) {
    console.error(e)
    return json({ erreur: 'L’e-mail n’a pas pu partir. Réessaie plus tard.' }, 502)
  }
})
