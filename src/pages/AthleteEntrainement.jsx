import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TYPES, bilansAFaire, dateFr } from '../lib/bilans'
import { lireEnCours } from '../lib/seance'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

// Onglet Entraînement de l'athlète : bilans à remplir, séances du programme, dernières séances faites
export default function AthleteEntrainement() {
  const { profil } = useSession()
  const [coachs, setCoachs] = useState(null)
  const [prog, setProg] = useState(undefined)
  const [faites, setFaites] = useState(null)
  const [bilans, setBilans] = useState(null)
  const [suivi, setSuivi] = useState(null)
  const enCours = lireEnCours()

  useEffect(() => {
    supabase.from('coachings').select('id').eq('athlete_id', profil.id).then(({ data }) => setCoachs(data ?? []))
    supabase.from('programmes').select('nom, description, seances(id, ordre, nom, note, seance_exercices(id, series))')
      .eq('athlete_id', profil.id).eq('actif', true).maybeSingle().then(({ data }) => setProg(data))
    supabase.from('seances_realisees').select('id, seance_id, nom, date, series_realisees(id)').eq('athlete_id', profil.id)
      .order('created_at', { ascending: false }).limit(30).then(({ data }) => setFaites(data ?? []))
    supabase.from('bilans').select('id, type, statut, created_at, envoye_at').eq('athlete_id', profil.id)
      .order('created_at', { ascending: false }).then(({ data }) => setBilans(data ?? []))
    supabase.from('suivi_bilans').select('jour_semaine').eq('athlete_id', profil.id).maybeSingle().then(({ data }) => setSuivi(data))
  }, [profil.id])

  if (coachs === null || prog === undefined || faites === null || bilans === null) return null
  const aFaire = coachs.length ? bilansAFaire(bilans, suivi) : []
  const seances = prog ? [...prog.seances].sort((a, b) => a.ordre - b.ordre) : []
  const derniere = (id) => faites.find((f) => f.seance_id === id)
  // Prochaine séance : celle qui suit la dernière faite dans l'ordre du programme
  const idxDerniere = faites.length ? seances.findIndex((s) => s.id === faites[0].seance_id) : -1
  const prochaine = seances.length ? seances[(idxDerniere + 1) % seances.length].id : null

  return (
    <>
      <div>
        <h1>Bonjour {profil.nom}</h1>
        <p className="sub">{!coachs.length ? 'Aucun coach pour l’instant : ouvre le lien d’invitation envoyé par ton coach.'
          : prog ? 'Choisis ta séance du jour.' : 'Ton coach prépare ton programme.'}</p>
      </div>

      {aFaire.map((b) => (
        <Link key={b.id + b.type} className="card a-faire" to={b.id === 'nouveau' ? `/bilan/nouveau?type=${b.type}` : `/bilan/${b.id}`}>
          <strong>{TYPES[b.type]} à remplir</strong>
          <span className="sub">Mensurations, photos et ressentis : quelques minutes.</span>
        </Link>
      ))}

      {enCours && seances.some((s) => s.id === enCours.seance) && (
        <Link className="card a-faire" to={`/seance/${enCours.seance}`}>
          <strong>Séance en cours : {seances.find((s) => s.id === enCours.seance).nom}</strong>
          <span className="sub">Reprends là où tu t’es arrêté.</span>
        </Link>
      )}

      {prog && (
        <>
          <div>
            <h2 style={{ margin: 0 }}>{prog.nom}</h2>
            {prog.description && <p className="sub" style={{ margin: 0 }}>{prog.description}</p>}
          </div>
          <div className="grid2">
            {seances.map((s) => {
              const d = derniere(s.id)
              const series = s.seance_exercices.reduce((t, l) => t + l.series, 0)
              return (
                <Link key={s.id} className="card seance-carte" to={`/seance/${s.id}`}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0 }}>{s.nom}</h3>
                    {s.id === prochaine && <span className="pill acc">Prochaine</span>}
                  </div>
                  <span className="sub">{pluriel(s.seance_exercices.length, 'exercice')} · {pluriel(series, 'série')}{s.note ? ' · note du coach' : ''}</span>
                  <span className="sub">{d ? `Dernière fois : ${dateFr(d.date + 'T12:00')}` : 'Pas encore faite'}</span>
                </Link>
              )
            })}
          </div>
        </>
      )}

      {faites.length > 0 && (
        <div className="card">
          <h2>Mes dernières séances</h2>
          <div className="liste">
            {faites.slice(0, 8).map((f) => (
              <div key={f.id}><span>{f.nom}</span><span className="sub">{dateFr(f.date + 'T12:00')} · {pluriel(f.series_realisees.length, 'série')}</span></div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
