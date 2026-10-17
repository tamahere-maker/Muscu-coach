import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { fmt, jourIso } from './ui'

// 1RM estimé (formule d'Epley)
export const e1rm = (kg, reps) => (reps > 0 && kg > 0 ? kg * (1 + reps / 30) : 0)
const lundi = (iso) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return jourIso(d) }
const dateCourte = (iso) => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const dateLongue = (iso) => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

// Statistiques et historique des séances d'un athlète (vus par l'athlète et par ses coachs)
export default function Progres({ athleteId, objectifSemaine }) {
  const [seances, setSeances] = useState(null)
  const [choix, setChoix] = useState('')

  useEffect(() => {
    supabase.from('seances_realisees')
      .select('id, nom, date, created_at, series_realisees(exercice_id, exercice_prevu_id, ordre, reps, charge_kg, exercice:exercices!series_realisees_exercice_id_fkey(nom), prevu:exercices!series_realisees_exercice_prevu_id_fkey(nom))')
      .eq('athlete_id', athleteId).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(300)
      .then(({ data }) => setSeances((data ?? []).map((s) => ({ ...s, series: [...s.series_realisees].sort((a, b) => a.ordre - b.ordre) }))))
  }, [athleteId])

  const stats = useMemo(() => {
    if (!seances) return null
    const auj = jourIso(), cetteSemaine = lundi(auj)
    const il30 = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return jourIso(d) })()
    const recents = seances.filter((s) => s.date >= il30)
    const volume = recents.reduce((t, s) => t + s.series.reduce((v, x) => v + Number(x.reps) * Number(x.charge_kg), 0), 0)
    // Séances par semaine sur les 8 dernières semaines
    const semaines = Array.from({ length: 8 }, (_, i) => { const d = new Date(cetteSemaine + 'T12:00'); d.setDate(d.getDate() - 7 * (7 - i)); return jourIso(d) })
    const parSemaine = semaines.map((w) => ({ w, n: seances.filter((s) => lundi(s.date) === w).length }))
    // Records et progression par exercice (meilleur 1RM estimé de chaque séance)
    const ex = {}
    ;[...seances].reverse().forEach((s) => {
      const parEx = {}
      s.series.forEach((x) => { const v = e1rm(Number(x.charge_kg), Number(x.reps)); if (!parEx[x.exercice_id] || v > parEx[x.exercice_id].v) parEx[x.exercice_id] = { v, x } })
      Object.entries(parEx).forEach(([id, { v, x }]) => {
        const e = (ex[id] ??= { id, nom: x.exercice?.nom ?? id, points: [], record: null })
        if (v > 0) e.points.push({ date: s.date, v })
        if (v > 0 && (!e.record || v > e.record.v)) e.record = { v, kg: Number(x.charge_kg), reps: x.reps, date: s.date }
      })
    })
    const exercices = Object.values(ex).filter((e) => e.record).sort((a, b) => b.points.length - a.points.length || a.nom.localeCompare(b.nom))
    return { total: seances.length, semaine: seances.filter((s) => s.date >= cetteSemaine).length, mois: recents.length, volume, parSemaine, exercices }
  }, [seances])

  if (!seances) return null
  if (!seances.length) return <div className="card"><p className="empty">Aucune séance enregistrée pour l’instant.</p></div>

  const exChoisi = stats.exercices.find((e) => e.id === choix) ?? stats.exercices[0]
  const maxSemaine = Math.max(1, objectifSemaine ?? 0, ...stats.parSemaine.map((x) => x.n))

  return (
    <>
      <div className="kpis">
        <div className="kpi"><span className="label">Cette semaine</span><b className="num">{stats.semaine}{objectifSemaine ? ` / ${objectifSemaine}` : ''}</b></div>
        <div className="kpi"><span className="label">30 derniers jours</span><b className="num">{stats.mois}</b></div>
        <div className="kpi"><span className="label">Séances au total</span><b className="num">{stats.total}</b></div>
        <div className="kpi"><span className="label">Volume 30 jours</span><b className="num">{fmt(stats.volume / 1000, 1)} t</b></div>
      </div>

      <div className="card">
        <h2>Séances par semaine</h2>
        <div className="barres" role="img" aria-label="Séances par semaine sur 8 semaines">
          {stats.parSemaine.map(({ w, n }) => (
            <div key={w} className="barre">
              <span className="num">{n || ''}</span>
              <i style={{ height: `${(n / maxSemaine) * 100}%` }} className={objectifSemaine && n >= objectifSemaine ? 'ok' : ''} />
              <small>{dateCourte(w)}</small>
            </div>
          ))}
        </div>
        {objectifSemaine ? <p className="sub" style={{ margin: 0 }}>En vert : objectif de {objectifSemaine} séances atteint.</p> : null}
      </div>

      {exChoisi && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Progression</h2>
            <select className="inp" style={{ maxWidth: 240 }} value={exChoisi.id} onChange={(e) => setChoix(e.target.value)} aria-label="Exercice">
              {stats.exercices.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </div>
          <Courbe points={exChoisi.points} />
          <p className="sub" style={{ margin: 0 }}>Record : {exChoisi.record.reps} × {fmt(exChoisi.record.kg, 1)} kg le {dateCourte(exChoisi.record.date)}, soit un maximum estimé de {fmt(exChoisi.record.v)} kg sur une répétition.</p>
        </div>
      )}

      <div className="card">
        <h2>Records</h2>
        <div className="liste">
          {stats.exercices.slice(0, 12).map((e) => (
            <div key={e.id}><span>{e.nom}</span><span className="num"><strong>{e.record.reps} × {fmt(e.record.kg, 1)} kg</strong> <span className="sub">· {dateCourte(e.record.date)}</span></span></div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Historique</h2>
        <div className="historique">
          {seances.map((s) => {
            const groupes = []
            s.series.forEach((x) => {
              const g = groupes[groupes.length - 1]
              if (g && g.id === x.exercice_id) g.series.push(x)
              else groupes.push({ id: x.exercice_id, nom: x.exercice?.nom ?? x.exercice_id, prevu: x.prevu?.nom, series: [x] })
            })
            return (
              <details key={s.id}>
                <summary><span><strong>{s.nom}</strong><br /><span className="sub">{dateLongue(s.date)}</span></span>
                  <span className="sub">{pluriel(s.series.length, 'série')}</span></summary>
                {groupes.map((g, i) => (
                  <div key={i} className="hist-ex">
                    <strong>{g.nom}</strong>{g.prevu && <span className="swapped"> à la place de {g.prevu}</span>}
                    <div className="sub num">{g.series.map((x) => `${x.reps} × ${fmt(x.charge_kg, 1)} kg`).join(' · ')}</div>
                  </div>
                ))}
              </details>
            )
          })}
        </div>
      </div>
    </>
  )
}

// Courbe simple du 1RM estimé au fil des séances
function Courbe({ points }) {
  if (points.length < 2) return <p className="sub" style={{ margin: 0 }}>La courbe apparaîtra après deux séances avec cet exercice.</p>
  const W = 600, H = 180, P = 28
  const vs = points.map((p) => p.v), min = Math.min(...vs) * 0.95, max = Math.max(...vs) * 1.05
  const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1)
  const y = (v) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="courbe" role="img" aria-label="Progression du maximum estimé">
      <polyline points={points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.v)} r="5" />)}
      <text x={P} y={H - 6}>{dateCourte(points[0].date)}</text>
      <text x={W - P} y={H - 6} textAnchor="end">{dateCourte(points[points.length - 1].date)}</text>
      <text x={x(points.length - 1)} y={y(vs[vs.length - 1]) - 12} textAnchor="end">{fmt(vs[vs.length - 1])} kg</text>
    </svg>
  )
}
