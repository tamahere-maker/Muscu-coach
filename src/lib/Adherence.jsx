import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { fmt, jourIso } from './ui'
import { chargerCalendrier, decaler } from './jours'
import { MACROS, TOLERANCE, bilan, ecart, journee, lundi, periode } from './adherence'

const pct = (n, sur) => (sur ? `${fmt((n / sur) * 100)} %` : '—')
const signe = (e) => (e == null ? '—' : `${e > 0 ? '+' : e < 0 ? '−' : ''}${fmt(Math.abs(e) * 100)} %`)
const classeEcart = (e) => (e == null ? '' : Math.abs(e) <= TOLERANCE ? 'ok' : 'warn')
const jourCourt = (iso) => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const NB_SEMAINES = 4

// Adhérence au plan alimentaire d'un athlète, vue par son coach : repas suivis, aliments confirmés
// et écart entre ce qui a été mangé et les objectifs, par semaine et par jour.
// Calculé à partir du journal de l'athlète (seuls les aliments confirmés sont comptés).
export default function Adherence({ athleteId }) {
  const [donnees, setDonnees] = useState(undefined)

  useEffect(() => {
    let annule = false
    const auj = jourIso(), debutFenetre = decaler(lundi(auj), -7 * (NB_SEMAINES - 1))
    ;(async () => {
      const { data: plan } = await supabase.from('plans_nutrition')
        .select('id, created_at, kcal, proteines, glucides, lipides, jours_differents, kcal_repos, proteines_repos, glucides_repos, lipides_repos, repas(id, ordre, type_jour, repas_aliments(id, ordre, aliment_id, grammes))')
        .eq('athlete_id', athleteId).eq('actif', true).maybeSingle()
      if (!plan) { if (!annule) setDonnees(null); return }
      // Pas de journée comptée avant l'attribution du plan
      const depuis = jourIso(new Date(plan.created_at))
      const debut = depuis > debutFenetre ? depuis : debutFenetre
      const [j, cal] = await Promise.all([
        supabase.from('journal_aliments').select('date, repas_aliment_id, aliment_id, grammes, confirme').eq('athlete_id', athleteId).gte('date', debut).lte('date', auj),
        chargerCalendrier(athleteId, debut, auj),
      ])
      const journal = j.data ?? []
      const tousRepas = plan.repas.map((r) => ({ ...r, lignes: r.repas_aliments }))
      const ids = [...new Set([...tousRepas.flatMap((r) => r.lignes.map((l) => l.aliment_id)), ...journal.map((x) => x.aliment_id).filter(Boolean)])]
      const { data: al } = ids.length ? await supabase.from('aliments').select('id, kcal, proteines, glucides, lipides').in('id', ids) : { data: [] }
      const alim = Object.fromEntries((al ?? []).map((a) => [a.id, a]))
      const parJour = {}
      journal.forEach((x) => { (parJour[x.date] ??= {})[x.repas_aliment_id] = x })
      const jours = periode(debut, auj).map((d) => journee(d, plan, tousRepas, parJour[d] ?? {}, alim, cal))
      if (!annule) setDonnees({ jours, debut, depuis })
    })()
    return () => { annule = true }
  }, [athleteId])

  if (donnees === undefined) return null
  if (donnees === null) return null // pas de plan : AthleteNutrition l'indique déjà

  const auj = jourIso()
  const { jours } = donnees
  // Aujourd'hui est en cours : affiché, mais pas compté dans les moyennes
  const finies = jours.filter((j) => j.d < auj && j.aliments)
  const semaine7 = bilan(finies.filter((j) => j.d >= decaler(auj, -7)))
  const semaines = Array.from({ length: NB_SEMAINES }, (_, i) => decaler(lundi(auj), -7 * i))
    .map((w) => ({ w, b: bilan(finies.filter((j) => lundi(j.d) === w)) }))
    .filter((s) => s.b.n || s.w === lundi(auj))
  const derniers = jours.slice(0, 14)

  return (
    <div className="card adherence">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Adhérence au plan</h2>
        <span className="sub">7 derniers jours{semaine7.n < 7 ? ` (${semaine7.n} j)` : ''}</span>
      </div>
      {!semaine7.n ? <p className="empty">Pas encore de journée complète depuis l’attribution du plan.</p> : (
        <>
          <div className="kpis">
            <div className="kpi"><span className="label">Repas suivis</span><b className="num">{pct(semaine7.repasSuivis, semaine7.repas)}</b>
              <span className="sub">{semaine7.repasSuivis} / {semaine7.repas}</span></div>
            <div className="kpi"><span className="label">Aliments confirmés</span><b className="num">{pct(semaine7.confirmes, semaine7.aliments)}</b>
              <span className="sub">{semaine7.changes ? `dont ${semaine7.changes} remplacé${semaine7.changes > 1 ? 's' : ''}` : 'aucun remplacé'}</span></div>
            <div className="kpi"><span className="label">Calories / objectif</span><b className={`num ${classeEcart(semaine7.ecarts.kcal)}`}>{signe(semaine7.ecarts.kcal)}</b>
              <span className="sub">{fmt(semaine7.mange.kcal / semaine7.n)} kcal par jour</span></div>
            <div className="kpi"><span className="label">Jours dans la cible</span><b className="num">{semaine7.avecCible ? `${semaine7.dansCible} / ${semaine7.avecCible}` : '—'}</b>
              <span className="sub">calories à ±{fmt(TOLERANCE * 100)} %</span></div>
          </div>
          <div className="ecarts-macros">
            {MACROS.slice(1).map(([k, l]) => (
              <span key={k} className={`pill ${classeEcart(semaine7.ecarts[k])}`}>{l} {signe(semaine7.ecarts[k])}</span>
            ))}
            {semaine7.rienNote ? <span className="pill warn">{semaine7.rienNote} jour{semaine7.rienNote > 1 ? 's' : ''} sans rien noté</span> : null}
          </div>
        </>
      )}

      <h3>Par semaine</h3>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Semaine du</th><th className="n">Repas suivis</th><th className="n">Calories</th><th className="n">Prot.</th><th className="n">Gluc.</th><th className="n">Lip.</th></tr></thead>
          <tbody>
            {semaines.map(({ w, b }) => (
              <tr key={w}>
                <td>{jourCourt(w)}{w === lundi(auj) ? <span className="sub"> · en cours</span> : ''}</td>
                <td className="n">{pct(b.repasSuivis, b.repas)}</td>
                {MACROS.map(([k]) => <td key={k} className={`n ${classeEcart(b.ecarts[k])}`}>{b.n ? signe(b.ecarts[k]) : '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Par jour</h3>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Jour</th><th className="n">Repas</th><th className="n">Mangé / objectif</th><th className="n">Écart</th><th className="n">Prot.</th></tr></thead>
          <tbody>
            {derniers.map((j) => {
              const e = ecart(j.mange.kcal, j.cible.kcal)
              return (
                <tr key={j.d}>
                  <td>{j.d === auj ? 'Aujourd’hui' : jourCourt(j.d)}<span className="sub">{j.d === auj ? ' · en cours' : j.aliments && !j.confirmes ? ' · rien noté' : ''}</span></td>
                  <td className="n">{j.repasSuivis} / {j.repas}</td>
                  <td className="n">{fmt(j.mange.kcal)}{j.cible.kcal ? ` / ${fmt(j.cible.kcal)}` : ''} kcal</td>
                  <td className={`n ${j.d === auj ? '' : classeEcart(e)}`}>{signe(e)}</td>
                  <td className="n">{fmt(j.mange.proteines)}{j.cible.proteines ? ` / ${fmt(j.cible.proteines)}` : ''} g</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ margin: 0 }}>Un repas est suivi quand tous ses aliments sont confirmés par l’athlète. Les écarts comparent ce qui a été mangé aux objectifs du plan, à partir du {jourCourt(donnees.debut)} ; la journée en cours n’est pas comptée. En vert : à ±{fmt(TOLERANCE * 100)} % de l’objectif.</p>
    </div>
  )
}
