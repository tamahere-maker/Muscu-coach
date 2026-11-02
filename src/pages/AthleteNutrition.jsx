import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, jourIso, toast } from '../lib/ui'
import { equivalent, macrosDe, quantite, resume, somme, substituts, unite } from '../lib/nutrition'
import Quantite from '../lib/Quantite'
import RechercheOFF from '../lib/RechercheOFF'
import { garderProduit } from '../lib/openfoodfacts'
import { TYPES_JOUR, chargerCalendrier, decaler, objectifs, repasDuJour, typeDuJour } from '../lib/jours'

const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const jourFr = (iso) => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

// Onglet Nutrition de l'athlète : il confirme ce qu'il a mangé, change un aliment ou sa quantité.
// En lecture (`lecture`), le coach voit la même chose pour son athlète `athleteId`.
export default function AthleteNutrition({ athleteId, lecture = false }) {
  const { profil } = useSession()
  const aid = athleteId ?? profil.id
  const [plan, setPlan] = useState(undefined)
  const [aliments, setAliments] = useState([])
  const [jour, setJour] = useState(jourIso())
  const [journal, setJournal] = useState(null) // repas_aliment_id → { aliment_id, grammes, unite, confirme }
  const [prises, setPrises] = useState(null) // complement_id → true
  const [choix, setChoix] = useState(null) // ligne du plan dont on change l'aliment
  const [q, setQ] = useState('')
  const [off, setOff] = useState(false) // recherche Open Food Facts ouverte dans « Remplacer »
  const [semaine, setSemaine] = useState(null) // journal des 7 derniers jours
  const [cal, setCal] = useState(null) // jours d'entraînement, séances faites, choix de l'athlète
  const [eau, setEau] = useState(null) // ml bus le jour affiché
  const dlg = useRef()

  useEffect(() => {
    supabase.from('plans_nutrition')
      .select('id, nom, description, kcal, proteines, glucides, lipides, jours_differents, kcal_repos, proteines_repos, glucides_repos, lipides_repos, eau_ml, repas(id, ordre, nom, note, type_jour, repas_aliments(id, ordre, aliment_id, grammes, alternatives, unite, recette)), complements(id, nom, dose, moment)')
      .eq('athlete_id', aid).eq('actif', true).maybeSingle().then(({ data }) => setPlan(data))
    supabase.from('aliments').select('id, categorie, nom, marque, code_barres, kcal, proteines, glucides, lipides, unite_nom, unite_pluriel, unite_g, cac_g, cas_g, densite').order('nom')
      .then(({ data }) => setAliments(data ?? []))
  }, [aid])

  useEffect(() => {
    setJournal(null); setPrises(null)
    supabase.from('journal_aliments').select('repas_aliment_id, aliment_id, grammes, unite, confirme').eq('athlete_id', aid).eq('date', jour)
      .then(({ data }) => setJournal(Object.fromEntries((data ?? []).map((j) => [j.repas_aliment_id, j]))))
    supabase.from('prises_complements').select('complement_id').eq('athlete_id', aid).eq('date', jour)
      .then(({ data }) => setPrises(Object.fromEntries((data ?? []).map((p) => [p.complement_id, true]))))
    setEau(null)
    supabase.from('hydratation').select('ml').eq('athlete_id', aid).eq('date', jour).maybeSingle()
      .then(({ data }) => setEau(data?.ml ?? 0))
  }, [aid, jour])

  const debutCal = jour < decaler(jourIso(), -6) ? jour : decaler(jourIso(), -6)
  useEffect(() => { chargerCalendrier(aid, debutCal, jourIso()).then(setCal) }, [aid, debutCal])

  useEffect(() => {
    supabase.from('journal_aliments').select('date, repas_aliment_id, aliment_id, grammes, confirme').eq('athlete_id', aid).gte('date', decaler(jourIso(), -6))
      .then(({ data }) => setSemaine(data ?? []))
  }, [aid, journal])

  const codes = useMemo(() => new Set(aliments.map((a) => a.code_barres).filter(Boolean)), [aliments])
  const alim = useMemo(() => Object.fromEntries(aliments.map((a) => [a.id, a])), [aliments])
  const resultats = useMemo(() => {
    const t = sansAccent(q.trim())
    return t ? aliments.filter((a) => sansAccent(`${a.nom} ${a.marque ?? ''} ${a.categorie}`).includes(t)).slice(0, 40) : []
  }, [q, aliments])

  if (plan === undefined || journal === null || prises === null || semaine === null || cal === null || eau === null || !aliments.length) return null
  if (!plan) return lecture ? <p className="empty">Aucun plan alimentaire attribué.</p> : (
    <>
      <div><h1>Nutrition</h1></div>
      <p className="empty">Ton coach n’a pas encore préparé ton plan alimentaire.</p>
    </>
  )

  const parOrdre = (a, b) => a.ordre - b.ordre
  const tousRepas = [...plan.repas].sort(parOrdre).map((r) => ({ ...r, lignes: [...r.repas_aliments].sort(parOrdre) }))
  // Jour d'entraînement ou de repos (seulement si le coach a prévu des jours différents)
  const tj = typeDuJour(jour, cal)
  const repas = repasDuJour(plan, tousRepas, tj.type)
  const buts = objectifs(plan, tj.type)
  // Ce que l'athlète a mangé pour une ligne du plan : l'aliment prévu, ou celui qu'il a choisi
  const entree = (l, jr = journal) => {
    const j = jr[l.id]
    const aliment = alim[j?.aliment_id ?? l.aliment_id]
    return { aliment, grammes: Number(j?.grammes ?? l.grammes), code: j?.unite ?? l.unite, ok: !!j?.confirme, change: j?.aliment_id != null && j.aliment_id !== l.aliment_id, prevu: alim[l.aliment_id] }
  }
  const toutes = repas.flatMap((r) => r.lignes)
  const mange = somme(toutes.map((l) => entree(l)).filter((x) => x.ok && x.aliment).map((x) => macrosDe(x.aliment, x.grammes)))
  const nbOk = toutes.filter((l) => entree(l).ok).length
  // Résumé des 7 derniers jours : calories des aliments confirmés et aliments confirmés
  const jours7 = Array.from({ length: 7 }, (_, i) => decaler(jourIso(), -i)).map((d) => {
    const jr = Object.fromEntries(semaine.filter((x) => x.date === d).map((x) => [x.repas_aliment_id, x]))
    const t = typeDuJour(d, cal).type
    const lignes = repasDuJour(plan, tousRepas, t).flatMap((r) => r.lignes)
    const es = lignes.map((l) => entree(l, jr))
    return { d, type: t, cible: objectifs(plan, t).kcal, nb: lignes.length, kcal: somme(es.filter((x) => x.ok && x.aliment).map((x) => macrosDe(x.aliment, x.grammes))).kcal, ok: es.filter((x) => x.ok).length, change: es.filter((x) => x.change).length }
  })

  async function ecrire(lignes) {
    const avant = journal
    const rows = lignes.map(({ l, patch }) => {
      const j = journal[l.id] ?? { aliment_id: null, grammes: null, unite: null, confirme: false }
      return { athlete_id: aid, date: jour, repas_aliment_id: l.id, aliment_id: j.aliment_id, grammes: j.grammes, unite: j.unite ?? null, confirme: j.confirme, ...patch }
    })
    setJournal((x) => ({ ...x, ...Object.fromEntries(rows.map((r) => [r.repas_aliment_id, r])) }))
    const { error } = await supabase.from('journal_aliments').upsert(rows)
    if (error) { setJournal(avant); toast(error.message) }
  }

  // Nouvelle quantité : comptée comme mangée ; nouvelle unité : seulement l'affichage
  const changerQuantite = (l, champs) => ecrire([{ l, patch: champs.grammes ? { grammes: champs.grammes, confirme: true } : champs }])

  function ouvrir(l) { setChoix(l); setQ(''); setOff(false); dlg.current.showModal() }
  function choisir(a) {
    const l = choix, prevu = alim[l.aliment_id]
    const patch = a.id === l.aliment_id ? { aliment_id: null, grammes: null, unite: null, confirme: true }
      : { aliment_id: a.id, grammes: equivalent(prevu, Number(l.grammes), a, l.unite), unite: null, confirme: true }
    ecrire([{ l, patch }])
    dlg.current.close()
    toast(a.id === l.aliment_id ? `${prevu.nom} rétabli` : `${prevu.nom} remplacé par ${a.nom}`)
  }

  // Produit du commerce trouvé dans Open Food Facts : gardé dans la bibliothèque (partagé, donc visible du coach), puis choisi
  async function choisirOFF(p) {
    let a = aliments.find((x) => x.code_barres === p.code_barres)
    if (!a) {
      try { a = await garderProduit(p, profil.id) } catch (e) { return toast(e.message) }
      setAliments((l) => [...l, a])
    }
    choisir(a)
  }

  async function choisirType(type) {
    const avant = cal
    setCal((c) => ({ ...c, choix: { ...c.choix, [jour]: type } }))
    const { error } = await supabase.from('types_jours').upsert({ athlete_id: aid, date: jour, type })
    if (error) { setCal(avant); toast(error.message) }
  }

  async function boire(delta) {
    const avant = eau, ml = Math.max(0, eau + delta)
    setEau(ml)
    const { error } = await supabase.from('hydratation').upsert({ athlete_id: aid, date: jour, ml })
    if (error) { setEau(avant); toast(error.message) }
  }

  async function basculerPrise(c) {
    const avait = prises[c.id]
    setPrises((p) => ({ ...p, [c.id]: !avait }))
    const req = avait
      ? supabase.from('prises_complements').delete().eq('athlete_id', aid).eq('complement_id', c.id).eq('date', jour)
      : supabase.from('prises_complements').insert({ athlete_id: aid, complement_id: c.id, date: jour })
    const { error } = await req
    if (error) { setPrises((p) => ({ ...p, [c.id]: avait })); toast(error.message) }
  }

  const barre = (label, cls, v, cible, u) => (
    <div className="target" key={label}>
      <div className="row" style={{ justifyContent: 'space-between' }}><span><span className={`dot ${cls}`} /> {label}</span>
        <span className="num"><strong>{fmt(v)}</strong>{cible ? ` / ${fmt(cible)}` : ''} {u}</span></div>
      {cible ? <div className="bar"><i className={cls} style={{ width: `${Math.min(100, (v / cible) * 100)}%` }} /></div> : null}
    </div>
  )

  const ligne = choix
  const prevuChoix = ligne && alim[ligne.aliment_id]
  const actuel = ligne && entree(ligne)
  const duCoach = ligne ? ligne.alternatives.map((x) => alim[x]).filter(Boolean) : []
  const auto = ligne ? substituts(prevuChoix, aliments, [...ligne.alternatives, actuel.aliment.id]) : []
  const option = (a, etiquette) => (
    <button key={a.id} className="pick pick-aliment" onClick={() => choisir(a)}>
      <span><strong>{a.nom}</strong>{a.marque && <small className="sub"> · {a.marque}</small>}<br />
        <small className="sub">{quantite(a, equivalent(prevuChoix, Number(ligne.grammes), a, ligne.unite), ligne.unite)} · {resume(macrosDe(a, equivalent(prevuChoix, Number(ligne.grammes), a, ligne.unite)))}</small></span>
      <span className="pill acc">{etiquette}</span>
    </button>
  )

  return (
    <>
      <div>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <button className="icon-btn" aria-label="Jour précédent" onClick={() => setJour(decaler(jour, -1))}>‹</button>
          <span className="label" style={{ textAlign: 'center' }}>{jour === jourIso() ? 'Aujourd’hui' : jourFr(jour)}</span>
          <button className="icon-btn" aria-label="Jour suivant" disabled={jour >= jourIso()} onClick={() => setJour(decaler(jour, 1))}>›</button>
        </div>
        {lecture ? <h2 style={{ margin: 0 }}>{plan.nom || 'Plan alimentaire'}</h2> : <h1>{plan.nom || 'Ta journée'}</h1>}
        {!lecture && <p className="sub">Touche ✓ quand tu as mangé ce qui est prévu. Si tu as mangé autre chose, touche « Changer » ou modifie la quantité.</p>}
        {!lecture && <div className="row"><Link className="btn ghost sm" to="/courses">Liste de courses</Link></div>}
      </div>

      {plan.jours_differents && (
        <div className="card">
          <div className="seg" role="group" aria-label="Type de jour">
            {Object.entries(TYPES_JOUR).map(([k, l]) => <button key={k} aria-pressed={tj.type === k} disabled={lecture} onClick={() => tj.type !== k && choisirType(k)}>{l}</button>)}
          </div>
          <p className="sub" style={{ margin: 0 }}>{tj.source === 'choix' ? (lecture ? 'Choisi par l’athlète.' : 'Choisi par toi.')
            : tj.source === 'programme' ? 'Selon les jours d’entraînement du programme.'
            : tj.type === 'entrainement' ? 'Une séance a été faite ce jour-là.' : 'Aucune séance faite ce jour-là.'}
            {!lecture && tj.source !== 'choix' && ' Touche l’autre type si ta journée est différente.'}</p>
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>Mangé {jour === jourIso() ? 'aujourd’hui' : 'ce jour-là'}</h2>
            <span className={`pill ${nbOk === toutes.length && nbOk ? 'ok' : ''}`}>{nbOk} / {toutes.length} confirmés</span></div>
          {barre('Calories', 'm-k', mange.kcal, buts.kcal, 'kcal')}
          {barre('Protéines', 'm-p', mange.proteines, buts.proteines, 'g')}
          {barre('Glucides', 'm-g', mange.glucides, buts.glucides, 'g')}
          {barre('Lipides', 'm-l', mange.lipides, buts.lipides, 'g')}
          <p className="sub" style={{ margin: 0 }}>Seuls les aliments confirmés sont comptés.{lecture ? '' : ' Ton coach voit ton suivi.'}</p>
        </div>
        <div className="card eau">
          <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>Eau</h2>
            <span className="num"><strong>{fmt(eau / 1000, 2)} L</strong>{plan.eau_ml ? ` / ${fmt(plan.eau_ml / 1000, 2)} L` : ''}</span></div>
          {plan.eau_ml ? <div className="bar"><i className="m-eau" style={{ width: `${Math.min(100, (eau / plan.eau_ml) * 100)}%` }} /></div> : null}
          {!lecture && (
            <div className="row">
              <button className="btn sm" onClick={() => boire(250)}>+ 1 verre (25 cl)</button>
              <button className="btn ghost sm" onClick={() => boire(500)}>+ 50 cl</button>
              <button className="icon-btn" aria-label="Retirer un verre" disabled={!eau} onClick={() => boire(-250)}>−</button>
            </div>
          )}
          {plan.eau_ml && eau >= plan.eau_ml ? <p className="sub" style={{ margin: 0 }}>Objectif atteint.</p> : null}
        </div>
        {plan.complements.length > 0 && (
          <div className="card">
            <h2>Compléments</h2>
            {plan.complements.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={!!prises[c.id]} disabled={lecture} onChange={() => basculerPrise(c)} />
                <span><strong>{c.nom}</strong>{c.dose && ` · ${c.dose}`}{c.moment && <><br /><span className="sub">{c.moment}</span></>}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>7 derniers jours</h2>
        <div className="jours7">
          {jours7.map((x) => (
            <button key={x.d} aria-pressed={x.d === jour} onClick={() => setJour(x.d)}>
              <span>{x.d === jourIso() ? 'Aujourd’hui' : new Date(x.d + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</span>
              {x.cible ? <span className="bar"><i style={{ width: `${Math.min(100, (x.kcal / x.cible) * 100)}%` }} /></span> : <span />}
              <span className="sub">{plan.jours_differents ? (x.type === 'repos' ? 'Repos · ' : 'Entraînement · ') : ''}{fmt(x.kcal)} kcal · {x.ok}/{x.nb}{x.change ? ` · ${x.change} changé${x.change > 1 ? 's' : ''}` : ''}</span>
            </button>
          ))}
        </div>
      </div>

      {repas.map((r) => {
        const es = r.lignes.map((l) => ({ l, ...entree(l) }))
        const t = somme(es.filter((x) => x.aliment).map((x) => macrosDe(x.aliment, x.grammes)))
        const tout = es.length > 0 && es.every((x) => x.ok)
        return (
          <div key={r.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>{r.nom}</h2><span className="num sub">{resume(t)}</span>
            </div>
            {r.note && <p className="consigne">{r.note}</p>}
            <div>
              {es.map(({ l, aliment, grammes, code, ok, change, prevu }) => aliment && (
                <div key={l.id} className="food">
                  <div className="nm">
                    <strong>{aliment.nom}</strong>{change && <span className="swapped"> remplace {prevu?.nom}</span>}{l.recette && <span className="sub"> · {l.recette}</span>}
                    <small>{unite(aliment, code).code !== 'g' ? `${fmt(grammes)} g · ` : ''}{resume(macrosDe(aliment, grammes))}</small>
                    {!lecture && <button className="linkbtn" onClick={() => ouvrir(l)}>Changer</button>}
                  </div>
                  {lecture ? <span className="num">{quantite(aliment, grammes, code)}</span>
                    : <Quantite key={jour} aliment={aliment} grammes={grammes} code={code} onChange={(champs) => changerQuantite(l, champs)} />}
                  <button className="done" disabled={lecture} aria-pressed={ok} aria-label={`Confirmer ${aliment.nom}`} onClick={() => ecrire([{ l, patch: { confirme: !ok } }])}>✓</button>
                </div>
              ))}
            </div>
            {es.length > 0 && !lecture && <div><button className={`btn sm ${tout ? 'ghost' : ''}`} onClick={() => ecrire(r.lignes.map((l) => ({ l, patch: { confirme: !tout } })))}>
              {tout ? 'Repas confirmé' : 'J’ai tout mangé comme prévu'}</button></div>}
          </div>
        )
      })}

      <dialog ref={dlg} onClose={() => setChoix(null)}>
        {ligne && (
          <div className="dlg">
            <div className="dlg-head"><h2>Remplacer {prevuChoix.nom}</h2>
              <button className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button></div>
            <p className="sub" style={{ margin: 0 }}>Prévu : {quantite(prevuChoix, ligne.grammes, ligne.unite)}. Les quantités proposées apportent l’équivalent.</p>
            <div className="pick-list">
              {actuel.change && (
                <button className="pick pick-aliment" onClick={() => choisir(prevuChoix)}>
                  <span><strong>{prevuChoix.nom}</strong><br /><small className="sub">{quantite(prevuChoix, ligne.grammes, ligne.unite)} · aliment prévu par ton coach</small></span>
                  <span className="pill">Revenir</span>
                </button>
              )}
              {!q && duCoach.filter((a) => a.id !== actuel.aliment.id).map((a) => option(a, 'Proposé par ton coach'))}
              {!q && auto.map((a) => option(a, 'Équivalent'))}
              {q && resultats.filter((a) => a.id !== actuel.aliment.id).map((a) => option(a, 'Choisir'))}
              {q && !resultats.length && <p className="empty">Aucun aliment trouvé.</p>}
            </div>
            <input type="search" placeholder="Ou cherche un autre aliment" value={q} onChange={(x) => setQ(x.target.value)} />
            <div className="off-lien">
              {off
                ? <RechercheOFF terme={q} connus={codes} libelle="Choisir" msgIncomplet="Valeurs nutritionnelles incomplètes, choisis un autre produit" onChoisir={choisirOFF} />
                : <button className="linkbtn" style={{ justifySelf: 'start' }} onClick={() => setOff(true)}>Produit du commerce ? Chercher {q.trim() ? `« ${q.trim()} » ` : ''}dans Open Food Facts</button>}
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}
