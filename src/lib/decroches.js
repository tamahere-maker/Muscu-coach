import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { jourIso } from './ui'
import { decaler, typeDuJour } from './jours'
import { dernierJourBilan } from './bilans'

// Athlètes « décrochés » : séances prévues non faites sur les 7 derniers jours, bilan hebdomadaire en retard,
// bilan demandé par le coach resté sans réponse. Tout est calculé côté navigateur avec les données
// que le coach peut déjà lire (programme actif, séances faites, jours choisis par l'athlète, bilans).

const FENETRE = 7          // jours examinés pour les séances, aujourd'hui exclu
const DELAI_DEMANDE = 3    // jours avant de signaler un bilan demandé non rempli

const ecartJours = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000)

// Pour un athlète. `auj` au format AAAA-MM-JJ ; `debut` = date à partir de laquelle on peut lui reprocher
// quelque chose (arrivée chez le coach, début du programme).
export function evaluer({ auj, debutSuivi, programme, faites, choix, bilans, jourBilan }) {
  const raisons = []

  // Séances : jours d'entraînement prévus (programme ou choix de l'athlète) entre J-7 et la veille,
  // comparés aux séances faites sur la même période, aujourd'hui compris (une séance rattrapée compte).
  if (programme?.jours_entrainement?.length) {
    const debutProg = programme.created_at.slice(0, 10)
    const depuis = [decaler(auj, -FENETRE), debutSuivi, debutProg].sort().at(-1)
    const cal = { jours: programme.jours_entrainement, faites: new Set(faites), choix }
    let prevues = 0
    for (let d = depuis; d < auj; d = decaler(d, 1)) if (typeDuJour(d, cal).type === 'entrainement') prevues++
    const nbFaites = faites.filter((d) => d >= depuis && d <= auj).length
    const manquees = prevues - nbFaites
    if (prevues > 0 && manquees > 0) {
      raisons.push({ type: 'seances', manquees, prevues, gravite: manquees,
        texte: `${manquees} séance${manquees > 1 ? 's' : ''} manquée${manquees > 1 ? 's' : ''} sur ${prevues} prévue${prevues > 1 ? 's' : ''} (7 derniers jours)` })
    }
  }

  // Bilan hebdomadaire : le dernier jour de bilan passé (la veille au plus tard) sans bilan envoyé depuis
  if (jourBilan) {
    const veille = new Date(auj + 'T12:00'); veille.setDate(veille.getDate() - 1)
    const echeance = jourIso(dernierJourBilan(jourBilan, veille))
    const envoye = bilans.some((b) => b.statut !== 'demande' && b.envoye_at && jourIso(new Date(b.envoye_at)) >= echeance)
    if (echeance >= debutSuivi && !envoye) {
      const n = ecartJours(echeance, auj)
      raisons.push({ type: 'bilan', gravite: 1 + Math.floor(n / 7),
        texte: `bilan hebdomadaire en retard de ${n} jour${n > 1 ? 's' : ''}` })
    }
  }

  // Bilan demandé par le coach et toujours pas rempli
  const demandes = bilans.filter((b) => b.statut === 'demande' && ecartJours(b.created_at.slice(0, 10), auj) >= DELAI_DEMANDE)
  if (demandes.length) {
    const n = Math.max(...demandes.map((b) => ecartJours(b.created_at.slice(0, 10), auj)))
    raisons.push({ type: 'demande', gravite: 1,
      texte: demandes.length > 1 ? `${demandes.length} bilans demandés sans réponse` : `bilan demandé il y a ${n} jours, sans réponse` })
  }

  return raisons
}

// Charge les données de tous les athlètes du coach et renvoie { [athlete_id]: { raisons, gravite, joursPrevus } }
// pour les athlètes à relancer (raisons non vide) ; joursPrevus = le programme actif fixe des jours d'entraînement.
// null pendant le chargement.
export function useDecroches(coachId, version = 0) {
  const [res, setRes] = useState(null)
  useEffect(() => {
    if (!coachId) return
    let fini = false
    ;(async () => {
      const auj = jourIso()
      const debut = decaler(auj, -FENETRE)
      const { data: liens } = await supabase.from('coachings').select('athlete_id, principal, perimetre, created_at, pause_depuis').eq('coach_id', coachId)
      // Athlètes en pause : pas d'alerte
      const actifs = (liens ?? []).filter((l) => !l.pause_depuis)
      const ids = actifs.map((l) => l.athlete_id)
      if (!ids.length) { if (!fini) setRes({}); return }
      const [p, f, c, b, s] = await Promise.all([
        supabase.from('programmes').select('athlete_id, jours_entrainement, created_at').in('athlete_id', ids).eq('actif', true),
        supabase.from('seances_realisees').select('athlete_id, date').in('athlete_id', ids).gte('date', debut),
        supabase.from('types_jours').select('athlete_id, date, type').in('athlete_id', ids).gte('date', debut),
        supabase.from('bilans').select('athlete_id, statut, envoye_at, created_at').in('athlete_id', ids)
          .or(`statut.eq.demande,envoye_at.gte.${decaler(auj, -21)}`),
        supabase.from('suivi_bilans').select('athlete_id, jour_semaine').in('athlete_id', ids),
      ])
      const par = (rows, id) => (rows ?? []).filter((r) => r.athlete_id === id)
      const out = {}
      for (const l of actifs) {
        const id = l.athlete_id
        // Un coach associé « Nutrition » n'est pas concerné par les séances
        const seances = l.principal || l.perimetre !== 'Nutrition'
        const programme = seances ? par(p.data, id)[0] : null
        const raisons = evaluer({
          auj,
          debutSuivi: l.created_at.slice(0, 10),
          programme,
          faites: par(f.data, id).map((x) => x.date),
          choix: Object.fromEntries(par(c.data, id).map((x) => [x.date, x.type])),
          bilans: par(b.data, id),
          jourBilan: par(s.data, id)[0]?.jour_semaine,
        })
        const joursPrevus = !!programme?.jours_entrainement?.length
        if (raisons.length || joursPrevus) out[id] = { raisons, joursPrevus, gravite: raisons.reduce((t, r) => t + r.gravite, 0) }
      }
      if (!fini) setRes(out)
    })()
    return () => { fini = true }
  }, [coachId, version])
  return res
}
