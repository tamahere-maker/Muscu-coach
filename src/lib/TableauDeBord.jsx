import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { fmt } from './ui'

const joursDepuis = (iso) => Math.round((Date.now() - new Date(iso + 'T12:00')) / 86400000)
const dateCourte = (iso) => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

// Vue d'ensemble du coach : chiffres de la semaine et athlètes qui demandent une action
export default function TableauDeBord({ nonLus }) {
  const [lignes, setLignes] = useState(null)
  useEffect(() => { supabase.rpc('tableau_de_bord').then(({ data }) => setLignes(data ?? [])) }, [])
  if (!lignes || lignes.length === 0) return null

  const alertes = []
  for (const a of lignes) {
    const lien = (vue) => `/athletes/${a.athlete_id}?vue=${vue}`
    const nm = a.nom || 'Sans nom'
    if (nonLus[a.athlete_id]) alertes.push({ cle: a.athlete_id + 'm', lien: lien('messages'), ton: 'acc', texte: `${nm} : ${nonLus[a.athlete_id]} message${nonLus[a.athlete_id] > 1 ? 's' : ''} non lu${nonLus[a.athlete_id] > 1 ? 's' : ''}` })
    if (a.bilans_a_lire > 0) alertes.push({ cle: a.athlete_id + 'b', lien: lien('bilans'), ton: 'acc', texte: `${nm} : ${a.bilans_a_lire} bilan${a.bilans_a_lire > 1 ? 's' : ''} à lire` })
    if (a.bilan_en_retard) alertes.push({ cle: a.athlete_id + 'r', lien: lien('bilans'), ton: 'warn', texte: `${nm} : bilan hebdomadaire en retard` })
    if (!a.derniere_seance) alertes.push({ cle: a.athlete_id + 'i', lien: lien('seances'), ton: 'warn', texte: `${nm} : aucune séance enregistrée` })
    else if (joursDepuis(a.derniere_seance) >= 7) alertes.push({ cle: a.athlete_id + 'i', lien: lien('seances'), ton: 'warn', texte: `${nm} : aucune séance depuis ${joursDepuis(a.derniere_seance)} jours` })
    else if (a.objectif_semaine && a.seances_7j < a.objectif_semaine) alertes.push({ cle: a.athlete_id + 'o', lien: lien('seances'), ton: '', texte: `${nm} : ${a.seances_7j} séance${a.seances_7j > 1 ? 's' : ''} sur ${a.objectif_semaine} prévues ces 7 derniers jours` })
    for (const r of a.records) alertes.push({ cle: a.athlete_id + r.exercice + r.date, lien: lien('seances'), ton: 'ok', texte: `${nm} : record au ${r.exercice}, ${fmt(r.kg, 1)} kg × ${r.reps} (${dateCourte(r.date)})` })
  }
  const total = (k) => lignes.reduce((t, a) => t + Number(a[k]), 0)
  const actifs = lignes.filter((a) => a.seances_7j > 0).length
  const messages = Object.values(nonLus).reduce((t, n) => t + n, 0)

  return (
    <div className="card">
      <h2>Cette semaine</h2>
      <div className="kpis">
        <div className="kpi"><span className="label">Athlètes actifs (7 j)</span><b className="num">{actifs} / {lignes.length}</b></div>
        <div className="kpi"><span className="label">Séances (7 j)</span><b className="num">{total('seances_7j')}</b></div>
        <div className="kpi"><span className="label">Bilans à lire</span><b className="num">{total('bilans_a_lire')}</b></div>
        <div className="kpi"><span className="label">Messages non lus</span><b className="num">{messages}</b></div>
      </div>
      {alertes.length === 0
        ? <p className="empty">Rien à signaler : tous tes athlètes sont à jour.</p>
        : <div className="liste alertes">
            {alertes.map((x) => (
              <div key={x.cle}>
                <span><span className={`point ${x.ton}`} aria-hidden="true" />{x.texte}</span>
                <Link className="btn ghost sm" to={x.lien}>Voir</Link>
              </div>
            ))}
          </div>}
    </div>
  )
}
