import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { Anim, toast } from '../lib/ui'
import { blocs } from '../lib/supersets'

const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const CHAMPS_EX = [['series', 'Séries', 1], ['reps', 'Reps', 1], ['charge_kg', 'Charge (kg)', 0.5], ['repos_s', 'Repos (s)', 15]]

// Édition d'un programme : un modèle du coach, ou le programme d'un athlète
export default function ProgrammeEditeur() {
  const { id } = useParams()
  const { profil } = useSession()
  const nav = useNavigate()
  const [prog, setProg] = useState(null)
  const [seances, setSeances] = useState([])
  const [exos, setExos] = useState([])
  const [athletes, setAthletes] = useState([])
  const [cible, setCible] = useState('')
  const [ajoutDans, setAjoutDans] = useState(null)
  const [q, setQ] = useState('')
  const dlg = useRef()

  async function charger() {
    const { data } = await supabase.from('programmes')
      .select('id, nom, description, prix_eur, athlete_id, athlete:profiles!programmes_athlete_id_fkey(nom), seances(id, ordre, nom, note, seance_exercices(id, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe))')
      .eq('id', id).single()
    if (!data) return
    setProg(data)
    setSeances([...data.seances].sort((a, b) => a.ordre - b.ordre)
      .map((s) => ({ ...s, seance_exercices: [...s.seance_exercices].sort((a, b) => a.ordre - b.ordre) })))
  }
  useEffect(() => { charger() }, [id])
  useEffect(() => {
    supabase.from('exercices').select('id, nom, muscles, materiel, essentiel, sprite').order('id').then(({ data }) => setExos(data ?? []))
    supabase.from('coachings').select('athlete:profiles!coachings_athlete_id_fkey(id, nom)').eq('coach_id', profil.id)
      .then(({ data }) => setAthletes((data ?? []).map((c) => c.athlete)))
  }, [profil.id])
  useEffect(() => { if (ajoutDans) dlg.current.showModal() }, [ajoutDans])

  const exo = useMemo(() => Object.fromEntries(exos.map((e) => [e.id, e])), [exos])
  const choix = useMemo(() => {
    const t = sansAccent(q.trim())
    return exos.filter((e) => !t || sansAccent(e.nom).includes(t) || e.muscles.some((m) => sansAccent(m).includes(t)))
      .sort((a, b) => b.essentiel - a.essentiel).slice(0, 40)
  }, [exos, q])

  const majProg = async (champs) => {
    setProg((p) => ({ ...p, ...champs }))
    const { error } = await supabase.from('programmes').update(champs).eq('id', id)
    if (error) toast(error.message)
  }
  const majSeance = async (s, champs) => {
    setSeances((l) => l.map((x) => (x.id === s.id ? { ...x, ...champs } : x)))
    await supabase.from('seances').update(champs).eq('id', s.id)
  }
  const majLigne = async (l, champs) => {
    setSeances((ss) => ss.map((s) => ({ ...s, seance_exercices: s.seance_exercices.map((x) => (x.id === l.id ? { ...x, ...champs } : x)) })))
    await supabase.from('seance_exercices').update(champs).eq('id', l.id)
  }

  async function ajouterSeance() {
    const ordre = seances.length ? Math.max(...seances.map((s) => s.ordre)) + 1 : 0
    await supabase.from('seances').insert({ programme_id: id, ordre, nom: `Séance ${String.fromCharCode(65 + seances.length)}` })
    charger()
  }
  async function supprimerSeance(s) {
    if (!confirm(`Supprimer « ${s.nom} » et ses exercices ?`)) return
    await supabase.from('seances').delete().eq('id', s.id)
    charger()
  }
  async function deplacer(liste, i, d, table) {
    const a = liste[i], b = liste[i + d]
    if (!b) return
    const sortir = table === 'seance_exercices' ? { groupe: null } : {}
    await Promise.all([supabase.from(table).update({ ordre: b.ordre, ...sortir }).eq('id', a.id), supabase.from(table).update({ ordre: a.ordre }).eq('id', b.id)])
    charger()
  }
  async function ajouterExercice(e) {
    const l = ajoutDans.seance_exercices
    const { error } = await supabase.from('seance_exercices').insert({
      seance_id: ajoutDans.id, exercice_id: e.id, ordre: l.length ? Math.max(...l.map((x) => x.ordre)) + 1 : 0,
    })
    if (error) return toast(error.message)
    dlg.current.close()
    toast(`${e.nom} ajouté`)
    charger()
  }
  // Lie l'exercice j au précédent (superset), ou coupe le superset entre les deux
  async function lier(s, j) {
    const l = s.seance_exercices, prec = l[j - 1], cur = l[j]
    const lies = prec.groupe != null && prec.groupe === cur.groupe
    const suite = []
    for (let k = j; k < l.length && (k === j || (cur.groupe != null && l[k].groupe === cur.groupe)); k++) suite.push(l[k])
    let g
    if (lies) g = suite.length > 1 ? Math.max(0, ...l.map((x) => x.groupe ?? 0)) + 1 : null
    else {
      g = prec.groupe ?? Math.max(0, ...l.map((x) => x.groupe ?? 0)) + 1
      if (prec.groupe == null) await supabase.from('seance_exercices').update({ groupe: g }).eq('id', prec.id)
    }
    await supabase.from('seance_exercices').update({ groupe: g }).in('id', suite.map((x) => x.id))
    charger()
  }
  async function retirer(l) {
    await supabase.from('seance_exercices').delete().eq('id', l.id)
    charger()
  }
  async function attribuer() {
    const { error } = await supabase.rpc('attribuer_modele', { m: id, a: cible })
    if (error) return toast(error.message)
    toast(`Programme attribué à ${athletes.find((a) => a.id === cible)?.nom}`)
    setCible('')
  }
  async function supprimer() {
    if (!confirm('Supprimer ce programme ?')) return
    await supabase.from('programmes').delete().eq('id', id)
    nav(prog.athlete_id ? '/' : '/programmes')
  }

  if (!prog) return null
  const modele = !prog.athlete_id

  return (
    <>
      <div>
        <button className="linkbtn" onClick={() => nav(modele ? '/programmes' : '/')}>← {modele ? 'Mes programmes' : 'Mes athlètes'}</button>
        <h1 style={{ marginTop: 8 }}>{prog.nom}</h1>
        <p className="sub">{modele ? 'Modèle : les modifications ne touchent pas les programmes déjà attribués.' : `Programme de ${prog.athlete?.nom}`}</p>
      </div>

      <div className="card">
        <div className="grid2">
          <label className="field"><span className="label">Nom du programme</span>
            <input type="text" defaultValue={prog.nom} onBlur={(e) => e.target.value.trim() && e.target.value !== prog.nom && majProg({ nom: e.target.value.trim() })} /></label>
          <label className="field"><span className="label">Prix (€)</span>
            <input type="number" min="0" defaultValue={prog.prix_eur ?? ''} placeholder="Optionnel"
              onBlur={(e) => majProg({ prix_eur: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        </div>
        <label className="field"><span className="label">Description</span>
          <input type="text" defaultValue={prog.description} placeholder="Ex. Prise de masse, 4 séances par semaine"
            onBlur={(e) => e.target.value !== prog.description && majProg({ description: e.target.value })} /></label>
      </div>

      {seances.map((s, i) => (
        <div key={s.id} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <input type="text" aria-label="Nom de la séance" defaultValue={s.nom} style={{ maxWidth: 280, fontWeight: 700 }}
              onBlur={(e) => e.target.value.trim() && e.target.value !== s.nom && majSeance(s, { nom: e.target.value.trim() })} />
            <span className="row">
              <button className="icon-btn" aria-label="Monter la séance" disabled={i === 0} onClick={() => deplacer(seances, i, -1, 'seances')}>↑</button>
              <button className="icon-btn" aria-label="Descendre la séance" disabled={i === seances.length - 1} onClick={() => deplacer(seances, i, 1, 'seances')}>↓</button>
              <button className="linkbtn" onClick={() => supprimerSeance(s)}>Supprimer</button>
            </span>
          </div>
          {s.seance_exercices.length === 0 && <p className="empty">Aucun exercice dans cette séance.</p>}
          <label className="field"><span className="label">Note pour la séance</span>
            <textarea rows={2} defaultValue={s.note} placeholder="Ex. Échauffement 10 min sur le rameur"
              onBlur={(e) => e.target.value !== s.note && majSeance(s, { note: e.target.value })} /></label>
          <div>
            {blocs(s.seance_exercices).map((b) => (
              <div key={b.items[0].l.id} className={b.items.length > 1 ? 'superset' : undefined}>
                {b.items.length > 1 && <span className="label">Superset · {b.items.length} exercices enchaînés, repos après le dernier</span>}
                {b.items.map(({ l, j }) => exo[l.exercice_id] && (
                  <div key={l.id}>
                    {j > 0 && (
                      <button className="lier" onClick={() => lier(s, j)}>
                        {b.items[0].j < j ? 'Délier du précédent' : 'Lier au précédent (superset)'}
                      </button>
                    )}
                    <div className="ex prog-ex">
                      <Anim ex={exo[l.exercice_id]} cls="t" />
                      <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                          <strong>{exo[l.exercice_id].nom}</strong>
                          <span className="row" style={{ flexWrap: 'nowrap' }}>
                            <button className="icon-btn" aria-label="Monter" disabled={j === 0} onClick={() => deplacer(s.seance_exercices, j, -1, 'seance_exercices')}>↑</button>
                            <button className="icon-btn" aria-label="Descendre" disabled={j === s.seance_exercices.length - 1} onClick={() => deplacer(s.seance_exercices, j, 1, 'seance_exercices')}>↓</button>
                            <button className="icon-btn" aria-label="Retirer" onClick={() => retirer(l)}>×</button>
                          </span>
                        </div>
                        <div className="params">
                          {CHAMPS_EX.map(([k, lib, pas]) => (
                            <label key={k} className="field"><span className="label">{lib}</span>
                              <input type="number" min="0" step={pas} defaultValue={l[k]}
                                onBlur={(e) => e.target.value !== '' && Number(e.target.value) !== Number(l[k]) && majLigne(l, { [k]: Number(e.target.value) })} /></label>
                          ))}
                        </div>
                        <input type="text" className="note-ex" aria-label={`Note pour ${exo[l.exercice_id].nom}`} defaultValue={l.note}
                          placeholder="Note pour l’athlète (tempo, placement…)"
                          onBlur={(e) => e.target.value !== l.note && majLigne(l, { note: e.target.value })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="row"><button className="btn ghost sm" onClick={() => { setQ(''); setAjoutDans(s) }}>+ Ajouter un exercice</button></div>
        </div>
      ))}

      <div className="row">
        <button className="btn ghost" onClick={ajouterSeance}>+ Ajouter une séance</button>
      </div>

      {modele && (
        <div className="card">
          <h2>Attribuer à un athlète</h2>
          {athletes.length === 0 ? <p className="empty">Tu n’as pas encore d’athlète. Le programme reste prêt pour plus tard.</p> : (
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <select className="inp" value={cible} onChange={(e) => setCible(e.target.value)} aria-label="Athlète">
                <option value="">Choisir un athlète</option>
                {athletes.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
              <button className="btn" disabled={!cible || seances.length === 0} onClick={attribuer}>Attribuer</button>
            </div>
          )}
          <p className="sub" style={{ margin: 0 }}>L’athlète reçoit une copie : tu pourras l’ajuster pour lui sans changer ce modèle.</p>
        </div>
      )}

      <div className="row"><button className="linkbtn" onClick={supprimer}>Supprimer ce programme</button></div>

      <dialog ref={dlg} onClose={() => setAjoutDans(null)}>
        {ajoutDans && (
          <div className="dlg">
            <div className="dlg-head"><h2>Ajouter à {ajoutDans.nom}</h2>
              <button className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button></div>
            <input type="search" autoFocus placeholder="Exercice ou muscle" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="pick-list">
              {choix.map((e) => (
                <button key={e.id} className="pick" onClick={() => ajouterExercice(e)}>
                  <Anim ex={e} cls="t" />
                  <span><strong>{e.nom}</strong><br /><small className="sub">{e.muscles.join(', ')} · {e.materiel}</small></span>
                  <span className="pill acc">Ajouter</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}
