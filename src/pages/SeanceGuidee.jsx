import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { etapes, garderEnCours, lignesDuBloc, lireEnCours, prochaineEtape, remplacants } from '../lib/seance'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { Anim, fmt, jourIso, toast } from '../lib/ui'
import { CHAMPS_EX, chargerDerniers, chargerMateriel, chargerSeance, chargerVideos } from '../lib/chargements'
import { enAttente } from '../lib/horsligne'
import { EcrireAuCoach } from '../lib/Messages'
import { Video, VideoCoach } from '../lib/VideoExercice'
import { allureTexte, distanceTexte, duree, estBlocCardio, estCardio, estCardioEx, lireDuree, objectifCardio, remplacantsCardio, resumeBloc, typeAllure } from '../lib/cardio'

const chrono = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

// Saisie d'un bloc cardio : texte tel qu'affiché dans les champs (durée « m:ss », distance en km ou en m pour la natation)
const enMetres = (ex) => typeAllure(ex) === '100m'
const distSaisie = (ex, m) => (m == null || m === '' ? '' : enMetres(ex) ? String(m) : String(m / 1000).replace('.', ','))
const lireDist = (ex, t) => { const v = Number(String(t ?? '').trim().replace(',', '.')); return String(t ?? '').trim() && v > 0 ? Math.round(enMetres(ex) ? v : v * 1000) : null }
const borne = (v, a, b) => { const n = Math.round(Number(v)); return String(v ?? '').trim() && n >= a && n <= b ? n : null }
// Bloc saisi → valeurs enregistrées (comme dans series_realisees)
const blocFait = (ex, z) => ({ duree_s: lireDuree(z.duree), distance_m: lireDist(ex, z.dist), fc_moy: borne(z.fc, 30, 250), rpe: borne(z.rpe, 1, 10) })
// Valeurs de départ d'une série : la dernière fois pour la muscu, l'objectif du coach pour le cardio
function serieDepart(l, p) {
  if (estCardio(l)) return { duree: l.duree_s ? duree(l.duree_s) : '', dist: distSaisie(l.exercice, l.distance_m), fc: '', rpe: '', fait: false }
  return { reps: p?.reps ?? l.reps, kg: Number(p?.charge_kg ?? l.charge_kg), fait: false }
}

// Séance guidée : aperçu avec les notes du coach, puis série par série avec repos automatique
export default function SeanceGuidee() {
  const { id } = useParams()
  const { profil } = useSession()
  const nav = useNavigate()
  const accueil = profil.role === 'coach' ? '/moi' : '/'
  const [s, setS] = useState(null)
  const [derniers, setDerniers] = useState({}) // exercice_id → séries de la dernière fois
  const [materiel, setMateriel] = useState([])
  const [run, setRun] = useState(() => lireEnCours())
  const [, tic] = useState(0)
  const [choixRempl, setChoixRempl] = useState(null) // { variantes, autres }
  const [videos, setVideos] = useState({}) // exercice_id → vidéo du coach
  const [envoi, setEnvoi] = useState(false)
  const dlg = useRef()
  const surTic = useRef() // vérifie l'objectif du chrono cardio
  const finRepos = useRef() // relance le chrono au bloc suivant d'un fractionné

  useEffect(() => {
    chargerSeance(id).then(({ data }) => setS(data && { ...data, lignes: [...data.seance_exercices].sort((a, b) => a.ordre - b.ordre) }))
    chargerDerniers(profil.id).then(({ data }) => {
        const d = {}
        ;(data ?? []).forEach((r) => {
          const parEx = {}
          r.series_realisees.forEach((x) => (parEx[x.exercice_id] ??= []).push(x))
          Object.entries(parEx).forEach(([ex, l]) => { d[ex] ??= l.sort((a, b) => a.ordre - b.ordre) })
        })
        setDerniers(d)
      })
    chargerMateriel(profil.id).then(({ data }) => setMateriel(data?.materiel ?? []))
  }, [id, profil.id])

  // Vidéos perso des coachs pour les exercices de la séance (et leurs remplaçants), celle du coach du programme d'abord
  const idsEx = s ? [...new Set([...s.lignes.map((l) => l.exercice.id), ...Object.values(run?.seance === id ? run.rempl : {}).map((x) => x.id)])] : []
  const cleIds = [...idsEx].sort().join(',')
  useEffect(() => {
    if (!idsEx.length) return
    chargerVideos(idsEx).then(({ data }) => {
      const v = {}
      ;(data ?? []).sort((a, b) => (b.coach_id === s.programme?.coach_id) - (a.coach_id === s.programme?.coach_id))
        .forEach((x) => { v[x.exercice_id] ??= x })
      setVideos(v)
    })
  }, [cleIds])

  const actif = run?.seance === id ? run : null
  const repos = actif?.repos ? Math.ceil((actif.repos - Date.now()) / 1000) : 0

  // Minuteur de repos
  useEffect(() => {
    if (!actif?.repos) return
    const t = setInterval(() => {
      if (Date.now() >= actif.repos) { navigator.vibrate?.([200, 100, 200]); maj({ repos: 0 }); finRepos.current?.() } else tic((x) => x + 1)
    }, 500)
    return () => clearInterval(t)
  }, [actif?.repos])

  // Chrono cardio : un seul à la fois, { ligne, serie, depuis (0 = en pause), cumul en ms, alerte }
  useEffect(() => {
    if (!actif?.chrono?.depuis) return
    const t = setInterval(() => { tic((x) => x + 1); surTic.current?.() }, 500)
    return () => clearInterval(t)
  }, [actif?.chrono?.depuis])

  // Le coach a pu modifier la séance pendant qu'elle était en cours : on ajuste les séries gardées
  const incoherent = !!(s && actif && s.lignes.some((l) => actif.sets[l.id]?.length !== l.series))
  useEffect(() => {
    if (!incoherent) return
    maj({ sets: Object.fromEntries(s.lignes.map((l) => [l.id, Array.from({ length: l.series }, (_, k) =>
      actif.sets[l.id]?.[k] ?? serieDepart(l))])) })
  }, [incoherent])

  function maj(patch) {
    setRun((r) => { const n = { ...r, ...patch }; garderEnCours(n); return n })
  }

  if (s === null) return null
  if (!s) return <p className="empty">Séance introuvable.</p>
  if (incoherent) return null

  const exDe = (l) => actif?.rempl[l.id] ?? l.exercice
  const precedent = (l, k) => derniers[exDe(l).id]?.[k]

  function commencer() {
    const sets = Object.fromEntries(s.lignes.map((l) => [l.id, Array.from({ length: l.series }, (_, k) => serieDepart(l, derniers[l.exercice.id]?.[k]))]))
    const r = { seance: id, debut: Date.now(), cur: 0, sets, rempl: {}, repos: 0 }
    garderEnCours(r); setRun(r); window.scrollTo(0, 0)
  }

  // ----- Aperçu -----
  if (!actif) {
    const autre = run && run.seance !== id
    const total = s.lignes.reduce((t, l) => t + l.series, 0)
    return (
      <>
        <div>
          <Link className="linkbtn" to={accueil}>‹ Mes séances</Link>
          <h1>{s.nom}</h1>
          <p className="sub">{s.programme?.nom} · {pluriel(s.lignes.length, 'exercice')} · {pluriel(total, 'série')}</p>
        </div>
        {s.note && <div className="card note-coach"><span className="label">Note du coach</span><p style={{ margin: 0 }}>{s.note}</p></div>}
        <div className="card ovl">
          {s.lignes.map((l, i) => {
            const p = derniers[l.exercice.id]?.[0]
            const ss = l.groupe != null && (s.lignes[i - 1]?.groupe === l.groupe || s.lignes[i + 1]?.groupe === l.groupe)
            return (
              <div key={l.id} className="ex">
                <Anim ex={l.exercice} cls="t" />
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{i + 1}. {l.exercice.nom}{ss && <span className="pill acc" style={{ marginLeft: 6 }}>Superset</span>}</h3>
                  {estCardio(l) ? (
                    <span className="sub">{objectifCardio(l)}{p && estBlocCardio(p) ? ` · dernière fois ${resumeBloc(l.exercice, p)}` : ''}</span>
                  ) : (
                  <span className="sub">{l.series} × {l.reps}{Number(l.charge_kg) ? ` · ${fmt(l.charge_kg, 1)} kg` : ''} · repos {l.repos_s} s
                    {p ? ` · dernière fois ${p.reps} × ${fmt(p.charge_kg, 1)} kg` : ''}</span>)}
                  {l.note && <p className="consigne">{l.note}</p>}
                </div>
              </div>
            )
          })}
        </div>
        {autre && <p className="sub">Une autre séance est en cours. La commencer remplacera celle-ci.</p>}
        <button className="btn big-btn" onClick={commencer} disabled={!s.lignes.length}>Commencer la séance</button>
      </>
    )
  }

  // ----- Séance en cours -----
  const et = etapes(s.lignes)
  const ligneDe = (e) => s.lignes.find((l) => l.id === e.ligne)
  const fait = (e) => actif.sets[e.ligne][e.serie].fait
  const nbFaits = et.filter(fait).length
  const fini = nbFaits === et.length
  const cur = Math.min(actif.cur, et.length - 1)
  const e = et[cur]
  const l = ligneDe(e)
  const ex = exDe(l)
  const st = actif.sets[l.id][e.serie]
  const cardio = estCardio(l)
  const ch = actif.chrono
  const chronoIci = !!ch && ch.ligne === l.id && ch.serie === e.serie
  const ecoule = chronoIci ? ch.cumul + (ch.depuis ? Date.now() - ch.depuis : 0) : 0
  const idxEx = s.lignes.indexOf(l)
  const plusTard = actif.plusTard ?? []
  const nSuiv = prochaineEtape(et, actif.sets, cur, plusTard)
  const suivante = nSuiv >= 0 && et[nSuiv] !== e ? et[nSuiv] : null
  const bloc = lignesDuBloc(s.lignes, l.id)
  // Un exercice passé redevient normal dès qu'on y revient
  const sansBloc = (ids) => ids.filter((x) => !bloc.includes(x))

  const majSerie = (patch) => maj({ sets: { ...actif.sets, [l.id]: actif.sets[l.id].map((x, k) => (k === e.serie ? { ...x, ...patch } : x)) } })
  const pas = (k, d) => majSerie({ [k]: Math.max(0, Math.round((Number(st[k]) + d) * 10) / 10) })

  function valider(auto = false) {
    // Les séries suivantes de l'exercice reprennent la charge et les répétitions qu'on vient de faire.
    // En cardio, un chrono qui tourne donne la durée du bloc.
    const temps = chronoIci && ch.depuis ? { duree: duree(Math.round(ecoule / 1000)) } : {}
    const sets = { ...actif.sets, [l.id]: actif.sets[l.id].map((x, k) => (k === e.serie ? { ...x, ...temps, fait: true }
      : !cardio && k > e.serie && !x.fait ? { ...x, reps: st.reps, kg: st.kg } : x)) }
    const pt = sansBloc(plusTard)
    const prochain = prochaineEtape(et, sets, cur, pt)
    const termine = prochain < 0
    // Dans un superset, on enchaîne sans repos ; on repose après le dernier exercice du tour
    const r = !termine && e.repos > 0 ? Date.now() + e.repos * 1000 : 0
    // Fractionné validé par le chrono : le bloc suivant repartira tout seul après la récup
    // (ou tout de suite s'il n'y a pas de récup)
    const enchaine = auto && !termine && estCardio(ligneDe(et[prochain]))
    const chrono = !chronoIci ? ch : enchaine && !r ? { ligne: et[prochain].ligne, serie: et[prochain].serie, depuis: Date.now(), cumul: 0, alerte: false } : null
    maj({ sets, cur: termine ? cur : prochain, repos: r, plusTard: pt, chrono, relance: enchaine && r > 0 })
    if (!termine && e.repos === 0 && e.superset) toast(`Enchaîne : ${exDe(ligneDe(et[prochain])).nom}`)
    else if (!termine && pt.includes(et[prochain].ligne)) toast(`On revient à ${exDe(ligneDe(et[prochain])).nom}, que tu avais passé`)
    window.scrollTo(0, 0)
  }

  // ----- Chrono cardio -----
  const objectifMs = cardio && l.duree_s ? l.duree_s * 1000 : 0
  function demarrer() {
    // Un chrono lancé sur un autre bloc est mis en pause et sa durée gardée dans ce bloc
    let sets = actif.sets
    if (ch && !chronoIci) {
      const t = ch.cumul + (ch.depuis ? Date.now() - ch.depuis : 0)
      if (t > 0) sets = { ...sets, [ch.ligne]: sets[ch.ligne].map((x, k) => (k === ch.serie ? { ...x, duree: duree(Math.round(t / 1000)) } : x)) }
    }
    maj({ sets, chrono: { ligne: l.id, serie: e.serie, depuis: Date.now(), cumul: chronoIci ? ch.cumul : 0, alerte: chronoIci && ch.alerte } })
  }
  function pause() {
    maj({ chrono: { ...ch, depuis: 0, cumul: ecoule }, sets: { ...actif.sets, [l.id]: actif.sets[l.id].map((x, k) => (k === e.serie ? { ...x, duree: duree(Math.round(ecoule / 1000)) } : x)) } })
  }
  const remettreAZero = () => maj({ chrono: null })
  // Objectif de durée atteint : vibration ; en fractionné (plusieurs blocs, sans distance), le bloc se valide tout seul
  surTic.current = () => {
    if (!chronoIci || !ch.depuis || !objectifMs || ch.alerte || ecoule < objectifMs) return
    navigator.vibrate?.([300, 100, 300])
    if (l.series > 1 && !l.distance_m) { valider(true); return }
    maj({ chrono: { ...ch, alerte: true } })
    toast('Objectif de durée atteint')
  }
  finRepos.current = () => {
    if (!actif.relance) return
    const lr = ligneDe(e)
    if (estCardio(lr)) maj({ relance: false, chrono: { ligne: lr.id, serie: e.serie, depuis: Date.now(), cumul: 0, alerte: false } })
    else maj({ relance: false })
  }

  // Machine prise : on passe tout l'exercice (ou le superset) et on y reviendra à la fin
  const autresAFaire = et.some((x) => !bloc.includes(x.ligne) && !fait(x))
  function passer() {
    const pt = [...sansBloc(plusTard), ...bloc]
    const n = prochaineEtape(et, actif.sets, cur, pt)
    if (n < 0 || bloc.includes(et[n].ligne)) { toast('Il ne reste que cet exercice à faire.'); return }
    maj({ cur: n, repos: 0, plusTard: pt })
    toast(`${ex.nom} passé, on y reviendra à la fin`)
    window.scrollTo(0, 0)
  }
  // Aller à un exercice depuis la liste : s'il était passé, il redevient normal
  function allerA(ligneId, k) {
    maj({ cur: k, plusTard: plusTard.filter((x) => !lignesDuBloc(s.lignes, ligneId).includes(x)) })
  }

  async function ouvrirRempl() {
    const e0 = l.exercice.id
    const enCardio = estCardioEx(l.exercice)
    const [{ data }, { data: liens }] = await Promise.all([
      enCardio ? supabase.from('exercices').select(CHAMPS_EX).eq('categorie', 'Cardio').limit(300)
        : supabase.from('exercices').select(CHAMPS_EX).contains('muscles', [l.exercice.muscles?.[0] ?? '']).limit(300),
      supabase.from('variantes_exercices').select('exercice_a, exercice_b').or(`exercice_a.eq.${e0},exercice_b.eq.${e0}`),
    ])
    // Variantes liées par le coach d'abord, puis les équivalents trouvés automatiquement
    const idsVar = [...new Set((liens ?? []).map((x) => (x.exercice_a === e0 ? x.exercice_b : x.exercice_a)))]
    const { data: vars } = idsVar.length ? await supabase.from('exercices').select(CHAMPS_EX).in('id', idsVar) : { data: [] }
    const variantes = vars ?? []
    const autres = enCardio ? remplacantsCardio(l.exercice, data ?? []) : remplacants(l.exercice, data ?? [], materiel)
    setChoixRempl({ variantes, autres: autres.filter((x) => !idsVar.includes(x.id)) })
    dlg.current.showModal()
  }
  function remplacer(x) {
    const rempl = { ...actif.rempl }
    if (x.id === l.exercice.id) delete rempl[l.id]; else rempl[l.id] = x
    // Charges reprises de la dernière fois avec ce nouvel exercice, si elles existent
    const sets = { ...actif.sets, [l.id]: actif.sets[l.id].map((z, k) => {
      const p = derniers[x.id]?.[k]
      return z.fait || !p || cardio ? z : { ...z, reps: p.reps, kg: Number(p.charge_kg) }
    }) }
    maj({ rempl, sets }); dlg.current.close()
    toast(x.id === l.exercice.id ? 'Exercice prévu rétabli' : `Remplacé par ${x.nom}`)
  }

  // Sans réseau, la séance est gardée sur l'appareil et envoyée au retour du réseau (horsligne.js) :
  // les identifiants sont créés ici pour qu'un nouvel envoi ne crée pas de doublon.
  async function terminer() {
    const restants = s.lignes.filter((li) => plusTard.includes(li.id) && actif.sets[li.id].some((z) => !z.fait))
    if (!fini && restants.length && !confirm(`Tu as passé ${restants.map((li) => exDe(li).nom).join(', ')}. Terminer quand même ?`)) return
    const lignesFaites = s.lignes.flatMap((li) => actif.sets[li.id].map((z, k) => ({ li, z, k })).filter(({ z }) => z.fait))
    if (!lignesFaites.length) { toast('Valide au moins une série avant de terminer.'); return }
    setEnvoi(true)
    const srId = crypto.randomUUID()
    const { error } = await supabase.from('seances_realisees').insert({ id: srId, athlete_id: profil.id, seance_id: s.id, nom: s.nom, date: jourIso(new Date(actif.debut)), created_at: new Date().toISOString() })
    if (error) { setEnvoi(false); toast(error.message); return }
    const lignes = lignesFaites.map(({ li, z }, ordre) => {
      const x = exDe(li)
      const base = { id: crypto.randomUUID(), seance_realisee_id: srId, exercice_id: x.id, exercice_prevu_id: x.id === li.exercice.id ? null : li.exercice.id, ordre }
      return estCardio(li) ? { ...base, reps: 0, charge_kg: 0, ...blocFait(x, z) }
        : { ...base, reps: Number(z.reps) || 0, charge_kg: Number(z.kg) || 0, duree_s: null, distance_m: null, fc_moy: null, rpe: null }
    })
    const { error: e2 } = await supabase.from('series_realisees').insert(lignes)
    if (e2) {
      // Séance retirée pour éviter un doublon quand l'athlète réessaiera
      await supabase.from('seances_realisees').delete().eq('id', srId)
      setEnvoi(false); toast(e2.message); return
    }
    setEnvoi(false)
    garderEnCours(null); setRun(null)
    toast(enAttente() ? `Séance gardée sur ton téléphone · ${pluriel(lignes.length, 'série')}. Elle sera envoyée à ton coach dès le retour du réseau.`
      : `Séance enregistrée · ${pluriel(lignes.length, 'série')}`)
    nav(accueil)
  }

  function abandonner() {
    if (!confirm('Abandonner la séance ? Rien ne sera enregistré.')) return
    garderEnCours(null); setRun(null)
  }

  return (
    <div className="run">
      <div className="run-head">
        <div>
          <span className="label">{s.nom} · exercice {idxEx + 1} sur {s.lignes.length}</span>
          <h1 style={{ margin: 0 }}>{ex.nom}</h1>
          {ex.id !== l.exercice.id && <span className="pill acc">Remplace {l.exercice.nom}</span>}
          {e.superset && <span className="pill acc">Superset</span>}
        </div>
      </div>
      <div className="progress" aria-label={`${nbFaits} séries sur ${et.length}`}><i style={{ width: `${(nbFaits / et.length) * 100}%` }} /></div>

      {repos > 0 && (
        <div className="resting">
          <div><span className="label" style={{ color: 'inherit', opacity: 0.7 }}>{cardio ? 'Récupération' : 'Repos'}</span><div className="t num">{chrono(repos)}</div></div>
          <span>Ensuite : {ex.nom} · {cardio ? 'bloc' : 'série'} {e.serie + 1}{cardio && actif.relance ? ' (le chrono repartira tout seul)' : ''}</span>
          <div className="row">
            <button onClick={() => maj({ repos: actif.repos + 30000 })}>+30 s</button>
            <button onClick={() => maj({ repos: 0 })}>Passer</button>
          </div>
        </div>
      )}

      {fini && (
        <div className="card">
          <h2>Séance terminée</h2>
          <p style={{ margin: 0 }}>{pluriel(nbFaits, 'série')} validées. Enregistre la séance pour que ton coach voie tes performances.</p>
          <button className="btn big-btn" disabled={envoi} onClick={terminer}>Enregistrer la séance</button>
        </div>
      )}

      {s.note && cur === 0 && !nbFaits && <div className="card note-coach"><span className="label">Note du coach sur la séance</span><p style={{ margin: 0 }}>{s.note}</p></div>}

      <div className="run-main">
        <div className="card">
          <Anim ex={ex} cls="big" />
          {l.note && <div className="note-coach"><span className="label">Note du coach</span><p style={{ margin: 0 }}>{l.note}</p></div>}
          {ex.consigne ? <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{ex.consigne}</p> : ex.consigne_en && <p className="sub" lang="en" style={{ margin: 0, whiteSpace: 'pre-line' }}>{ex.consigne_en}</p>}
          {videos[ex.id] ? (
            <details key={`c-${ex.id}`} className="video-ex" open><summary>Vidéo de ton coach</summary><VideoCoach v={videos[ex.id]} titre={`Vidéo de ${ex.nom}`} /></details>
          ) : ex.lien_video && (
            <details key={`b-${ex.id}`} className="video-ex"><summary>Voir la vidéo</summary><Video url={ex.lien_video} titre={ex.nom} /></details>
          )}
          {ex.licence && <small className="sub licence">Source : {ex.licence}</small>}
          {profil.role !== 'coach' && <EcrireAuCoach exercice={ex} seanceId={s.id} />}
        </div>
        <div className="card setcard">
          {cardio ? <BlocCardio l={l} ex={ex} e={e} st={st} majSerie={majSerie} precedent={precedent(l, e.serie)}
            chrono={{ ecoule, objectifMs, tourne: chronoIci && !!ch.depuis, demarrer, pause, remettreAZero }} /> : <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Série {e.serie + 1} / {l.series}</h2>
            <span className="pill num">Objectif {l.reps} reps{e.repos ? ` · repos ${e.repos} s` : ''}</span>
          </div>
          {precedent(l, e.serie) && <span className="sub">Dernière fois : {precedent(l, e.serie).reps} × {fmt(precedent(l, e.serie).charge_kg, 1)} kg</span>}
          <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field"><span className="label">Répétitions</span>
              <div className="stepper"><button type="button" onClick={() => pas('reps', -1)} aria-label="Moins de répétitions">−</button>
                <input type="number" inputMode="numeric" value={st.reps} onChange={(x) => majSerie({ reps: x.target.value })} aria-label="Répétitions" />
                <button type="button" onClick={() => pas('reps', 1)} aria-label="Plus de répétitions">+</button></div></div>
            <div className="field"><span className="label">Charge (kg)</span>
              <div className="stepper"><button type="button" onClick={() => pas('kg', -2.5)} aria-label="Moins de charge">−</button>
                <input type="number" inputMode="decimal" step="0.5" value={st.kg} onChange={(x) => majSerie({ kg: x.target.value })} aria-label="Charge" />
                <button type="button" onClick={() => pas('kg', 2.5)} aria-label="Plus de charge">+</button></div></div>
          </div></>}
          <button className="btn big-btn" onClick={() => valider()}>{cardio ? (st.fait ? 'Corriger le bloc ✓' : l.series > 1 ? 'Valider le bloc ✓' : 'Valider ✓') : st.fait ? 'Corriger la série ✓' : 'Valider la série ✓'}</button>
          <div className="setlist">
            {actif.sets[l.id].map((z, k) => (
              <div key={k} className={`${z.fait ? 'ok' : ''} ${k === e.serie ? 'cur' : ''}`} onClick={() => allerA(l.id, et.findIndex((x) => x.ligne === l.id && x.serie === k))}>
                <span>{cardio ? 'Bloc' : 'Série'} {k + 1}</span><span>{cardio ? resumeBloc(ex, blocFait(ex, z)) || '—' : `${z.reps} reps × ${fmt(z.kg || 0, 1)} kg`}</span><span className="tick">{z.fait ? '✓' : ''}</span>
              </div>
            ))}
          </div>
          {suivante && !fini && <p className="sub" style={{ margin: 0 }}>Ensuite : <strong>{exDe(ligneDe(suivante)).nom}</strong>{suivante.ligne !== l.id || e.superset ? ` · série ${suivante.serie + 1}` : ''}</p>}
          <div className="occupee">
            <span className="sub">Machine prise ?</span>
            {autresAFaire && <button className="linkbtn" onClick={passer}>Passer, j’y reviendrai{e.superset ? ' (superset entier)' : ''}</button>}
            <button className="linkbtn" onClick={ouvrirRempl}>Remplacer l’exercice</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Toute la séance</h2>
        <div className="subs">
          {s.lignes.map((li, i) => {
            const ok = actif.sets[li.id].filter((z) => z.fait).length
            const premier = et.findIndex((x) => x.ligne === li.id && !fait(x))
            const passe = plusTard.includes(li.id) && ok < li.series
            return (
              <button key={li.id} className="sub-item" onClick={() => { allerA(li.id, premier >= 0 ? premier : et.findIndex((x) => x.ligne === li.id)); window.scrollTo(0, 0) }}>
                <Anim ex={exDe(li)} cls="s" />
                <span><strong>{i + 1}. {exDe(li).nom}</strong><br /><span className="sub" style={{ fontSize: 12 }}>{ok} / {li.series} {estCardio(li) ? 'blocs faits' : 'séries faites'}</span></span>
                <span className={`pill ${ok === li.series ? 'ok' : li.id === l.id ? 'acc' : passe ? 'warn' : ''}`}>{ok === li.series ? 'Fait' : li.id === l.id ? 'En cours' : passe ? 'Plus tard' : 'Aller'}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="row">
        {!fini && <button className="btn ghost" disabled={envoi} onClick={terminer}>Terminer maintenant</button>}
        <button className="btn ghost" onClick={abandonner}>Abandonner</button>
      </div>

      <dialog ref={dlg} onClose={() => setChoixRempl(null)}>
        {choixRempl && (
          <div className="dlg">
            <div className="dlg-head"><h2>Remplacer {l.exercice.nom}</h2>
              <button className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button></div>
            <p className="sub" style={{ margin: 0 }}>Exercices qui travaillent le même muscle, avec ton matériel en priorité.</p>
            <div className="subs">
              {ex.id !== l.exercice.id && (
                <button className="sub-item" onClick={() => remplacer(l.exercice)}>
                  <Anim ex={l.exercice} cls="s" /><span><strong>{l.exercice.nom}</strong><br /><span className="sub" style={{ fontSize: 12 }}>Exercice prévu par ton coach</span></span><span className="pill">Revenir</span>
                </button>
              )}
              {choixRempl.variantes.filter((x) => x.id !== ex.id).map((x) => (
                <button key={x.id} className="sub-item" onClick={() => remplacer(x)}>
                  <Anim ex={x} cls="s" /><span><strong>{x.nom}</strong><br /><span className="sub" style={{ fontSize: 12 }}>Variante proposée par ton coach · {x.materiel}</span></span><span className="pill acc">Choisir</span>
                </button>
              ))}
              {choixRempl.autres.filter((x) => x.id !== ex.id).map((x) => (
                <button key={x.id} className="sub-item" onClick={() => remplacer(x)}>
                  <Anim ex={x} cls="s" /><span><strong>{x.nom}</strong><br /><span className="sub" style={{ fontSize: 12 }}>{x.materiel} · {x.muscles.join(', ')}</span></span><span className="pill">Choisir</span>
                </button>
              ))}
              {!choixRempl.variantes.length && !choixRempl.autres.length && <p className="empty">Aucun exercice équivalent trouvé.</p>}
            </div>
          </div>
        )}
      </dialog>
    </div>
  )
}

// Bloc cardio en séance : chrono, puis durée, distance, fréquence cardiaque moyenne et ressenti (RPE)
function BlocCardio({ l, ex, e, st, majSerie, precedent, chrono }) {
  const { ecoule, objectifMs, tourne, demarrer, pause, remettreAZero } = chrono
  const z = blocFait(ex, st)
  const allure = allureTexte(ex, z.duree_s, z.distance_m)
  const reste = objectifMs ? Math.max(0, objectifMs - ecoule) : 0
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{l.series > 1 ? `Bloc ${e.serie + 1} / ${l.series}` : 'Cardio'}</h2>
        <span className="pill num">{objectifCardio({ ...l, series: 1 })}</span>
      </div>
      {precedent && estBlocCardio(precedent) && <span className="sub">Dernière fois : {resumeBloc(ex, precedent)}</span>}
      <div className="chrono-cardio">
        <div className="t num">{duree(Math.floor(ecoule / 1000))}</div>
        {objectifMs > 0 && <>
          <div className="progress" aria-hidden="true"><i style={{ width: `${Math.min(100, (ecoule / objectifMs) * 100)}%` }} /></div>
          <span className="sub">{reste > 0 ? `Reste ${duree(Math.ceil(reste / 1000))}` : 'Objectif atteint'}</span>
        </>}
        <div className="row" style={{ justifyContent: 'center' }}>
          {tourne ? <button className="btn" onClick={pause}>Pause</button>
            : <button className="btn" onClick={demarrer}>{ecoule ? 'Reprendre' : 'Démarrer le chrono'}</button>}
          {!tourne && ecoule > 0 && <button className="btn ghost" onClick={remettreAZero}>Remettre à zéro</button>}
        </div>
      </div>
      <div className="grid2 saisie-cardio">
        <label className="field"><span className="label">Durée</span>
          <input type="text" inputMode="numeric" placeholder="m:ss" value={st.duree} onChange={(x) => majSerie({ duree: x.target.value })} aria-label="Durée" /></label>
        <label className="field"><span className="label">Distance ({enMetres(ex) ? 'm' : 'km'})</span>
          <input type="text" inputMode="decimal" placeholder="Optionnel" value={st.dist} onChange={(x) => majSerie({ dist: x.target.value })} aria-label="Distance" /></label>
        <label className="field"><span className="label">FC moyenne</span>
          <input type="number" inputMode="numeric" min="30" max="250" placeholder="bpm" value={st.fc} onChange={(x) => majSerie({ fc: x.target.value })} aria-label="Fréquence cardiaque moyenne" /></label>
        <label className="field"><span className="label">Ressenti (RPE 1 à 10)</span>
          <input type="number" inputMode="numeric" min="1" max="10" placeholder="1 facile, 10 à fond" value={st.rpe} onChange={(x) => majSerie({ rpe: x.target.value })} aria-label="Ressenti de 1 à 10" /></label>
      </div>
      {allure && <span className="sub">Allure : <strong className="num">{allure}</strong>{z.distance_m ? ` sur ${distanceTexte(z.distance_m)}` : ''}</span>}
    </>
  )
}
