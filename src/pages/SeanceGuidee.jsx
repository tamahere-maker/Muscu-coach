import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { etapes, garderEnCours, lireEnCours, remplacants } from '../lib/seance'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { Anim, fmt, toast } from '../lib/ui'

const CHAMPS_EX = 'id, nom, sprite, consigne, lien_video, muscles, materiel, categorie, force, mecanique, niveau, essentiel'
const chrono = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

// Séance guidée : aperçu avec les notes du coach, puis série par série avec repos automatique
export default function SeanceGuidee() {
  const { id } = useParams()
  const { profil } = useSession()
  const nav = useNavigate()
  const [s, setS] = useState(null)
  const [derniers, setDerniers] = useState({}) // exercice_id → séries de la dernière fois
  const [materiel, setMateriel] = useState([])
  const [run, setRun] = useState(() => lireEnCours())
  const [, tic] = useState(0)
  const [choixRempl, setChoixRempl] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const dlg = useRef()

  useEffect(() => {
    supabase.from('seances').select(`id, nom, note, programme:programmes(nom), seance_exercices(id, ordre, series, reps, charge_kg, repos_s, note, groupe, exercice:exercices(${CHAMPS_EX}))`)
      .eq('id', id).maybeSingle().then(({ data }) => setS(data && { ...data, lignes: [...data.seance_exercices].sort((a, b) => a.ordre - b.ordre) }))
    supabase.from('seances_realisees').select('date, series_realisees(exercice_id, ordre, reps, charge_kg)').eq('athlete_id', profil.id)
      .order('created_at', { ascending: false }).limit(20).then(({ data }) => {
        const d = {}
        ;(data ?? []).forEach((r) => {
          const parEx = {}
          r.series_realisees.forEach((x) => (parEx[x.exercice_id] ??= []).push(x))
          Object.entries(parEx).forEach(([ex, l]) => { d[ex] ??= l.sort((a, b) => a.ordre - b.ordre) })
        })
        setDerniers(d)
      })
    supabase.from('athlete_profiles').select('materiel').eq('athlete_id', profil.id).maybeSingle().then(({ data }) => setMateriel(data?.materiel ?? []))
  }, [id, profil.id])

  const actif = run?.seance === id ? run : null
  const repos = actif?.repos ? Math.ceil((actif.repos - Date.now()) / 1000) : 0

  // Minuteur de repos
  useEffect(() => {
    if (!actif?.repos) return
    const t = setInterval(() => {
      if (Date.now() >= actif.repos) { navigator.vibrate?.([200, 100, 200]); maj({ repos: 0 }) } else tic((x) => x + 1)
    }, 500)
    return () => clearInterval(t)
  }, [actif?.repos])

  // Le coach a pu modifier la séance pendant qu'elle était en cours : on ajuste les séries gardées
  const incoherent = !!(s && actif && s.lignes.some((l) => actif.sets[l.id]?.length !== l.series))
  useEffect(() => {
    if (!incoherent) return
    maj({ sets: Object.fromEntries(s.lignes.map((l) => [l.id, Array.from({ length: l.series }, (_, k) =>
      actif.sets[l.id]?.[k] ?? { reps: l.reps, kg: Number(l.charge_kg), fait: false })])) })
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
    const sets = Object.fromEntries(s.lignes.map((l) => [l.id, Array.from({ length: l.series }, (_, k) => {
      const p = derniers[l.exercice.id]?.[k]
      return { reps: p?.reps ?? l.reps, kg: Number(p?.charge_kg ?? l.charge_kg), fait: false }
    })]))
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
          <Link className="linkbtn" to="/">‹ Mes séances</Link>
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
                  <span className="sub">{l.series} × {l.reps}{Number(l.charge_kg) ? ` · ${fmt(l.charge_kg, 1)} kg` : ''} · repos {l.repos_s} s
                    {p ? ` · dernière fois ${p.reps} × ${fmt(p.charge_kg, 1)} kg` : ''}</span>
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
  const idxEx = s.lignes.indexOf(l)
  const suivante = et.find((x, k) => k > cur && !fait(x)) ?? et.find((x) => !fait(x) && x !== e)

  const majSerie = (patch) => maj({ sets: { ...actif.sets, [l.id]: actif.sets[l.id].map((x, k) => (k === e.serie ? { ...x, ...patch } : x)) } })
  const pas = (k, d) => majSerie({ [k]: Math.max(0, Math.round((Number(st[k]) + d) * 10) / 10) })

  function valider() {
    // Les séries suivantes de l'exercice reprennent la charge et les répétitions qu'on vient de faire
    const sets = { ...actif.sets, [l.id]: actif.sets[l.id].map((x, k) => (k === e.serie ? { ...x, fait: true }
      : k > e.serie && !x.fait ? { ...x, reps: st.reps, kg: st.kg } : x)) }
    const reste = (x) => !sets[x.ligne][x.serie].fait
    const n = et.findIndex((x, k) => k > cur && reste(x))
    const prochain = n >= 0 ? n : et.findIndex(reste)
    const termine = prochain < 0
    // Dans un superset, on enchaîne sans repos ; on repose après le dernier exercice du tour
    const r = !termine && e.repos > 0 ? Date.now() + e.repos * 1000 : 0
    maj({ sets, cur: termine ? cur : prochain, repos: r })
    if (!termine && e.repos === 0 && e.superset) toast(`Enchaîne : ${exDe(ligneDe(et[prochain])).nom}`)
    window.scrollTo(0, 0)
  }

  async function ouvrirRempl() {
    const { data } = await supabase.from('exercices').select(CHAMPS_EX).contains('muscles', [l.exercice.muscles?.[0] ?? '']).limit(300)
    setChoixRempl(remplacants(l.exercice, data ?? [], materiel))
    dlg.current.showModal()
  }
  function remplacer(x) {
    const rempl = { ...actif.rempl }
    if (x.id === l.exercice.id) delete rempl[l.id]; else rempl[l.id] = x
    // Charges reprises de la dernière fois avec ce nouvel exercice, si elles existent
    const sets = { ...actif.sets, [l.id]: actif.sets[l.id].map((z, k) => {
      const p = derniers[x.id]?.[k]
      return z.fait || !p ? z : { ...z, reps: p.reps, kg: Number(p.charge_kg) }
    }) }
    maj({ rempl, sets }); dlg.current.close()
    toast(x.id === l.exercice.id ? 'Exercice prévu rétabli' : `Remplacé par ${x.nom}`)
  }

  async function terminer() {
    const lignesFaites = s.lignes.flatMap((li) => actif.sets[li.id].map((z, k) => ({ li, z, k })).filter(({ z }) => z.fait))
    if (!lignesFaites.length) { toast('Valide au moins une série avant de terminer.'); return }
    setEnvoi(true)
    const { data: sr, error } = await supabase.from('seances_realisees').insert({ athlete_id: profil.id, seance_id: s.id, nom: s.nom }).select('id').single()
    const horsLigne = 'Pas de réseau : ta séance reste gardée sur cet appareil, réessaie dès que tu as du réseau.'
    if (error) { setEnvoi(false); toast(navigator.onLine ? error.message : horsLigne); return }
    const lignes = lignesFaites.map(({ li, z }, ordre) => {
      const x = exDe(li)
      return { seance_realisee_id: sr.id, exercice_id: x.id, exercice_prevu_id: x.id === li.exercice.id ? null : li.exercice.id, ordre, reps: Number(z.reps) || 0, charge_kg: Number(z.kg) || 0 }
    })
    const { error: e2 } = await supabase.from('series_realisees').insert(lignes)
    if (e2) {
      // Séance retirée pour éviter un doublon quand l'athlète réessaiera
      await supabase.from('seances_realisees').delete().eq('id', sr.id)
      setEnvoi(false); toast(navigator.onLine ? e2.message : horsLigne); return
    }
    setEnvoi(false)
    garderEnCours(null); setRun(null)
    toast(`Séance enregistrée · ${pluriel(lignes.length, 'série')}`)
    nav('/')
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
          <div><span className="label" style={{ color: 'inherit', opacity: 0.7 }}>Repos</span><div className="t num">{chrono(repos)}</div></div>
          <span>Ensuite : {ex.nom} · série {e.serie + 1}</span>
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
          {ex.consigne && <p style={{ margin: 0 }}>{ex.consigne}</p>}
          {ex.lien_video && <a className="linkbtn" href={ex.lien_video} target="_blank" rel="noreferrer">Voir la vidéo</a>}
        </div>
        <div className="card setcard">
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
          </div>
          <button className="btn big-btn" onClick={valider}>{st.fait ? 'Corriger la série ✓' : 'Valider la série ✓'}</button>
          <div className="setlist">
            {actif.sets[l.id].map((z, k) => (
              <div key={k} className={`${z.fait ? 'ok' : ''} ${k === e.serie ? 'cur' : ''}`} onClick={() => maj({ cur: et.findIndex((x) => x.ligne === l.id && x.serie === k) })}>
                <span>Série {k + 1}</span><span>{z.reps} reps × {fmt(z.kg || 0, 1)} kg</span><span className="tick">{z.fait ? '✓' : ''}</span>
              </div>
            ))}
          </div>
          {suivante && !fini && <p className="sub" style={{ margin: 0 }}>Ensuite : <strong>{exDe(ligneDe(suivante)).nom}</strong>{suivante.ligne !== l.id || e.superset ? ` · série ${suivante.serie + 1}` : ''}</p>}
          <button className="linkbtn" onClick={ouvrirRempl}>Machine prise ? Remplacer l’exercice</button>
        </div>
      </div>

      <div className="card">
        <h2>Toute la séance</h2>
        <div className="subs">
          {s.lignes.map((li, i) => {
            const ok = actif.sets[li.id].filter((z) => z.fait).length
            const premier = et.findIndex((x) => x.ligne === li.id && !fait(x))
            return (
              <button key={li.id} className="sub-item" onClick={() => { maj({ cur: premier >= 0 ? premier : et.findIndex((x) => x.ligne === li.id) }); window.scrollTo(0, 0) }}>
                <Anim ex={exDe(li)} cls="s" />
                <span><strong>{i + 1}. {exDe(li).nom}</strong><br /><span className="sub" style={{ fontSize: 12 }}>{ok} / {li.series} séries faites</span></span>
                <span className={`pill ${ok === li.series ? 'ok' : li.id === l.id ? 'acc' : ''}`}>{ok === li.series ? 'Fait' : li.id === l.id ? 'En cours' : 'Aller'}</span>
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
              {choixRempl.filter((x) => x.id !== ex.id).map((x) => (
                <button key={x.id} className="sub-item" onClick={() => remplacer(x)}>
                  <Anim ex={x} cls="s" /><span><strong>{x.nom}</strong><br /><span className="sub" style={{ fontSize: 12 }}>{x.materiel} · {x.muscles.join(', ')}</span></span><span className="pill">Choisir</span>
                </button>
              ))}
              {!choixRempl.length && <p className="empty">Aucun exercice équivalent trouvé.</p>}
            </div>
          </div>
        )}
      </dialog>
    </div>
  )
}
