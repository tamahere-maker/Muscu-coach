import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, toast } from '../lib/ui'
import { macrosDe, manquePourMetabolisme, metabolisme, resume, somme } from '../lib/nutrition'

const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const OBJECTIFS = [['kcal', 'Calories (kcal)'], ['proteines', 'Protéines (g)'], ['glucides', 'Glucides (g)'], ['lipides', 'Lipides (g)']]
const REPAS_TYPES = ['Petit-déjeuner', 'Déjeuner', 'Collation', 'Dîner', 'Avant l’entraînement', 'Après l’entraînement']

// Édition d'un plan alimentaire : un modèle du coach, ou le plan d'un athlète
export default function PlanEditeur() {
  const { id } = useParams()
  const { profil } = useSession()
  const nav = useNavigate()
  const [plan, setPlan] = useState(null)
  const [repas, setRepas] = useState([])
  const [complements, setComplements] = useState([])
  const [aliments, setAliments] = useState([])
  const [athletes, setAthletes] = useState([])
  const [cible, setCible] = useState('')
  const [choix, setChoix] = useState(null) // { repas } pour ajouter un aliment, { ligne } pour une alternative
  const [q, setQ] = useState('')
  const dlg = useRef()

  async function charger() {
    const { data } = await supabase.from('plans_nutrition')
      .select('id, nom, description, kcal, proteines, glucides, lipides, athlete_id, athlete:profiles!plans_nutrition_athlete_id_fkey(nom, athlete_profiles(sexe, poids_kg, taille_cm, age, seances_semaine)), repas(id, ordre, nom, note, repas_aliments(id, ordre, aliment_id, grammes, alternatives)), complements(id, nom, dose, moment)')
      .eq('id', id).single()
    if (!data) return
    setPlan(data)
    setRepas([...data.repas].sort((a, b) => a.ordre - b.ordre).map((r) => ({ ...r, repas_aliments: [...r.repas_aliments].sort((a, b) => a.ordre - b.ordre) })))
    setComplements(data.complements)
  }
  useEffect(() => { charger() }, [id])
  useEffect(() => {
    supabase.from('aliments').select('id, categorie, nom, marque, kcal, proteines, glucides, lipides, unite_nom, unite_pluriel, unite_g').order('nom')
      .then(({ data }) => setAliments(data ?? []))
    supabase.from('coachings').select('athlete:profiles!coachings_athlete_id_fkey(id, nom)').eq('coach_id', profil.id)
      .then(({ data }) => setAthletes((data ?? []).map((c) => c.athlete)))
  }, [profil.id])
  useEffect(() => { if (choix && !dlg.current.open) dlg.current.showModal() }, [choix])

  const alim = useMemo(() => Object.fromEntries(aliments.map((a) => [a.id, a])), [aliments])
  const resultats = useMemo(() => {
    const t = sansAccent(q.trim())
    return aliments.filter((a) => !t || sansAccent(a.nom).includes(t) || sansAccent(a.marque ?? '').includes(t) || sansAccent(a.categorie).includes(t)).slice(0, 40)
  }, [aliments, q])

  const totalRepas = (r) => somme(r.repas_aliments.filter((l) => alim[l.aliment_id]).map((l) => macrosDe(alim[l.aliment_id], l.grammes)))
  const totalJour = somme(repas.map(totalRepas))

  const majPlan = async (champs) => {
    setPlan((p) => ({ ...p, ...champs }))
    const { error } = await supabase.from('plans_nutrition').update(champs).eq('id', id)
    if (error) toast(error.message)
  }
  const maj = async (table, ligne, champs) => {
    const { error } = await supabase.from(table).update(champs).eq('id', ligne.id)
    if (error) toast(error.message)
    charger()
  }

  async function ajouterRepas() {
    const ordre = repas.length ? Math.max(...repas.map((r) => r.ordre)) + 1 : 0
    await supabase.from('repas').insert({ plan_id: id, ordre, nom: REPAS_TYPES[repas.length] ?? `Repas ${repas.length + 1}` })
    charger()
  }
  async function supprimerRepas(r) {
    if (!confirm(`Supprimer « ${r.nom} » ?`)) return
    await supabase.from('repas').delete().eq('id', r.id)
    charger()
  }
  async function choisir(a) {
    if (choix.repas) {
      const l = choix.repas.repas_aliments
      const { error } = await supabase.from('repas_aliments').insert({
        repas_id: choix.repas.id, aliment_id: a.id, grammes: a.unite_g ?? 100,
        ordre: l.length ? Math.max(...l.map((x) => x.ordre)) + 1 : 0,
      })
      if (error) return toast(error.message)
    } else {
      const alts = choix.ligne.alternatives
      if (a.id === choix.ligne.aliment_id || alts.includes(a.id)) return toast('Déjà proposé')
      await supabase.from('repas_aliments').update({ alternatives: [...alts, a.id] }).eq('id', choix.ligne.id)
    }
    dlg.current.close()
    charger()
  }
  // Quantité saisie en unités pour un aliment qui se compte, en grammes sinon
  const versGrammes = (a, v) => (a.unite_g ? Number(v) * Number(a.unite_g) : Number(v))
  const depuisGrammes = (a, g) => (a.unite_g ? Math.round((Number(g) / Number(a.unite_g)) * 10) / 10 : Number(g))

  async function ajouterComplement() {
    await supabase.from('complements').insert({ plan_id: id, nom: 'Nouveau complément' })
    charger()
  }
  async function attribuer() {
    const { error } = await supabase.rpc('attribuer_plan', { m: id, a: cible })
    if (error) return toast(error.message)
    toast(`Plan attribué à ${athletes.find((a) => a.id === cible)?.nom}`)
    setCible('')
  }
  async function supprimer() {
    if (!confirm('Supprimer ce plan ?')) return
    await supabase.from('plans_nutrition').delete().eq('id', id)
    nav(plan.athlete_id ? '/' : '/nutrition')
  }

  if (!plan) return null
  const modele = !plan.athlete_id
  const kcalMacros = 4 * (plan.proteines ?? 0) + 4 * (plan.glucides ?? 0) + 9 * (plan.lipides ?? 0)

  return (
    <>
      <div>
        <button className="linkbtn" onClick={() => nav(modele ? '/nutrition' : '/')}>← {modele ? 'Plans alimentaires' : 'Mes athlètes'}</button>
        <h1 style={{ marginTop: 8 }}>{plan.nom}</h1>
        <p className="sub">{modele ? 'Modèle : les modifications ne touchent pas les plans déjà attribués.' : `Plan de ${plan.athlete?.nom}`}</p>
      </div>

      <div className="card">
        <label className="field"><span className="label">Nom du plan</span>
          <input type="text" defaultValue={plan.nom} onBlur={(e) => e.target.value.trim() && e.target.value !== plan.nom && majPlan({ nom: e.target.value.trim() })} /></label>
        <label className="field"><span className="label">Description</span>
          <input type="text" defaultValue={plan.description} placeholder="Ex. Prise de masse, 2 800 kcal"
            onBlur={(e) => e.target.value !== plan.description && majPlan({ description: e.target.value })} /></label>
        {!modele && (() => {
          const ap = plan.athlete?.athlete_profiles, m = metabolisme(ap)
          return m ? (
            <p className="note">Métabolisme de base de {plan.athlete.nom} : <strong>{fmt(m.base)} kcal</strong> · dépense du jour estimée : <strong>{fmt(m.depense)} kcal</strong>
              {plan.kcal !== m.depense && <button type="button" onClick={() => majPlan({ kcal: m.depense })}>Mettre en objectif</button>}</p>
          ) : <p className="note">Métabolisme de base : il manque {manquePourMetabolisme(ap).join(', ')} dans le profil de l’athlète.</p>
        })()}
        <span className="label">Objectifs par jour</span>
        <div className="params">
          {OBJECTIFS.map(([k, lib]) => (
            <label key={k} className="field"><span className="label">{lib}</span>
              <input type="number" min="0" defaultValue={plan[k] ?? ''} key={`${k}-${plan[k]}`}
                onBlur={(e) => Number(e.target.value || null) !== (plan[k] ?? 0) && majPlan({ [k]: e.target.value === '' ? null : Math.round(Number(e.target.value)) })} /></label>
          ))}
        </div>
        {kcalMacros > 0 && Math.abs(kcalMacros - (plan.kcal ?? 0)) > 20 && (
          <p className="note">Les macros font {fmt(kcalMacros)} kcal. <button type="button" onClick={() => majPlan({ kcal: kcalMacros })}>Utiliser ce total</button></p>
        )}
      </div>

      <div className="card bilan">
        <span className="label">Total des repas</span>
        <div className="macros4">
          {OBJECTIFS.map(([k, lib]) => (
            <div key={k} className={plan[k] && Math.abs(totalJour[k] - plan[k]) / plan[k] > 0.1 ? 'ecart' : undefined}>
              <b>{fmt(totalJour[k])}</b><span className="label">{plan[k] ? `/ ${fmt(plan[k])}` : lib.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>

      {repas.map((r, i) => (
        <div key={r.id} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <input type="text" aria-label="Nom du repas" defaultValue={r.nom} style={{ maxWidth: 260, fontWeight: 700 }}
              onBlur={(e) => e.target.value.trim() && e.target.value !== r.nom && maj('repas', r, { nom: e.target.value.trim() })} />
            <span className="row">
              <button className="icon-btn" aria-label="Monter le repas" disabled={i === 0}
                onClick={() => Promise.all([maj('repas', r, { ordre: repas[i - 1].ordre }), maj('repas', repas[i - 1], { ordre: r.ordre })])}>↑</button>
              <button className="linkbtn" onClick={() => supprimerRepas(r)}>Supprimer</button>
            </span>
          </div>
          <input type="text" aria-label={`Note pour ${r.nom}`} defaultValue={r.note} placeholder="Note (ex. à prendre 1 h avant la séance)"
            onBlur={(e) => e.target.value !== r.note && maj('repas', r, { note: e.target.value })} />
          {r.repas_aliments.length === 0 && <p className="empty">Aucun aliment.</p>}
          {r.repas_aliments.map((l) => {
            const a = alim[l.aliment_id]
            if (!a) return null
            return (
              <div key={l.id} className="plan-ligne">
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  <strong>{a.nom}{a.marque && <small className="sub"> · {a.marque}</small>}</strong>
                  <button className="icon-btn" aria-label={`Retirer ${a.nom}`} onClick={async () => { await supabase.from('repas_aliments').delete().eq('id', l.id); charger() }}>×</button>
                </div>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input type="number" min="0" step={a.unite_g ? 0.5 : 5} aria-label={`Quantité de ${a.nom}`} className="qte"
                    defaultValue={depuisGrammes(a, l.grammes)} key={l.grammes}
                    onBlur={(e) => e.target.value !== '' && versGrammes(a, e.target.value) !== Number(l.grammes) && maj('repas_aliments', l, { grammes: versGrammes(a, e.target.value) })} />
                  <span className="sub">{a.unite_g ? a.unite_pluriel : 'g'}</span>
                  <span className="sub macros-ligne">{resume(macrosDe(a, l.grammes))}</span>
                </div>
                <div className="chips">
                  {l.alternatives.map((x) => alim[x] && (
                    <span key={x} className="chip">ou {alim[x].nom}
                      <button className="linkbtn" aria-label={`Retirer l’alternative ${alim[x].nom}`}
                        onClick={() => maj('repas_aliments', l, { alternatives: l.alternatives.filter((y) => y !== x) })}>×</button></span>
                  ))}
                  <button className="chip" onClick={() => { setQ(''); setChoix({ ligne: l }) }}>+ Alternative</button>
                </div>
              </div>
            )
          })}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn ghost sm" onClick={() => { setQ(''); setChoix({ repas: r }) }}>+ Ajouter un aliment</button>
            <span className="sub">{resume(totalRepas(r))}</span>
          </div>
        </div>
      ))}

      <div className="row"><button className="btn ghost" onClick={ajouterRepas}>+ Ajouter un repas</button></div>

      <div className="card">
        <h2>Compléments</h2>
        {complements.length === 0 && <p className="empty">Aucun complément.</p>}
        {complements.map((c) => (
          <div key={c.id} className="complement">
            {[['nom', 'Complément', 'Ex. Créatine'], ['dose', 'Dose', 'Ex. 5 g'], ['moment', 'Moment', 'Ex. Le matin']].map(([k, lib, ph]) => (
              <label key={k} className="field"><span className="label">{lib}</span>
                <input type="text" defaultValue={c[k]} placeholder={ph} onBlur={(e) => e.target.value !== c[k] && maj('complements', c, { [k]: e.target.value })} /></label>
            ))}
            <button className="icon-btn" aria-label={`Retirer ${c.nom}`} onClick={async () => { await supabase.from('complements').delete().eq('id', c.id); charger() }}>×</button>
          </div>
        ))}
        <div className="row"><button className="btn ghost sm" onClick={ajouterComplement}>+ Ajouter un complément</button></div>
      </div>

      {modele && (
        <div className="card">
          <h2>Attribuer à un athlète</h2>
          {athletes.length === 0 ? <p className="empty">Tu n’as pas encore d’athlète. Le plan reste prêt pour plus tard.</p> : (
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <select className="inp" value={cible} onChange={(e) => setCible(e.target.value)} aria-label="Athlète">
                <option value="">Choisir un athlète</option>
                {athletes.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
              <button className="btn" disabled={!cible} onClick={attribuer}>Attribuer</button>
            </div>
          )}
          <p className="sub" style={{ margin: 0 }}>L’athlète reçoit une copie : tu pourras l’ajuster pour lui sans changer ce modèle.</p>
        </div>
      )}

      <div className="row"><button className="linkbtn" onClick={supprimer}>Supprimer ce plan</button></div>

      <dialog ref={dlg} onClose={() => setChoix(null)}>
        {choix && (
          <div className="dlg">
            <div className="dlg-head"><h2>{choix.repas ? `Ajouter à ${choix.repas.nom}` : `Alternative à ${alim[choix.ligne.aliment_id]?.nom}`}</h2>
              <button className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button></div>
            <input type="search" autoFocus placeholder="Aliment, marque ou catégorie" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="pick-list">
              {resultats.map((a) => (
                <button key={a.id} className="pick pick-aliment" onClick={() => choisir(a)}>
                  <span><strong>{a.nom}</strong>{a.marque && <small className="sub"> · {a.marque}</small>}<br />
                    <small className="sub">{a.categorie} · {resume(a)} pour 100 g{a.unite_g ? ` · 1 ${a.unite_nom} = ${fmt(a.unite_g)} g` : ''}</small></span>
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
