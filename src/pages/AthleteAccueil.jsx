import { useEffect, useState } from 'react'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { Anim, fmt, toast } from '../lib/ui'
import { MATERIEL, NIVEAUX, OBJECTIFS } from '../lib/listes'
import { blocs } from '../lib/supersets'
import { macrosDe, quantite, resume, somme } from '../lib/nutrition'

export default function AthleteAccueil() {
  const { profil } = useSession()
  const [coachs, setCoachs] = useState(null)
  const [f, setF] = useState(null)
  const [prog, setProg] = useState(undefined)
  const [plan, setPlan] = useState(undefined)

  useEffect(() => {
    supabase.from('coachings').select('id, principal, perimetre, coach:profiles!coachings_coach_id_fkey(nom)')
      .eq('athlete_id', profil.id).then(({ data }) => setCoachs(data ?? []))
    supabase.from('programmes')
      .select('nom, description, seances(id, ordre, nom, note, seance_exercices(id, ordre, series, reps, charge_kg, repos_s, note, groupe, exercice:exercices(id, nom, sprite, consigne, lien_video)))')
      .eq('athlete_id', profil.id).eq('actif', true).maybeSingle().then(({ data }) => setProg(data))
    supabase.from('plans_nutrition')
      .select('nom, description, kcal, proteines, glucides, lipides, repas(id, ordre, nom, note, repas_aliments(id, ordre, grammes, alternatives, aliment:aliments(*))), complements(id, nom, dose, moment)')
      .eq('athlete_id', profil.id).eq('actif', true).maybeSingle().then(async ({ data }) => {
        // noms des alternatives proposées par le coach
        const ids = [...new Set(data?.repas.flatMap((r) => r.repas_aliments.flatMap((l) => l.alternatives)) ?? [])]
        const { data: alts } = ids.length ? await supabase.from('aliments').select('id, nom').in('id', ids) : { data: [] }
        setPlan(data && { ...data, alts: Object.fromEntries((alts ?? []).map((a) => [a.id, a.nom])) })
      })
    supabase.from('athlete_profiles').select('*').eq('athlete_id', profil.id).single().then(({ data }) => setF(data))
  }, [profil.id])

  const maj = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const bascule = (k, v) => maj(k, f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v])
  const nombre = (v) => (v === '' ? null : Number(v))

  async function enregistrer(e) {
    e.preventDefault()
    const { athlete_id, updated_at, ...champs } = f
    const { error } = await supabase.from('athlete_profiles').update({ ...champs, updated_at: new Date().toISOString() }).eq('athlete_id', athlete_id)
    toast(error ? error.message : 'Profil enregistré')
  }

  if (coachs === null || !f || prog === undefined || plan === undefined) return null
  const parOrdre = (a, b) => a.ordre - b.ordre

  return (
    <>
      <div>
        <h1>Bonjour {profil.nom}</h1>
        <p className="sub">{coachs.length
          ? `Suivi par ${coachs.map((c) => c.coach?.nom + (c.principal ? ' (coach principal)' : '')).join(', ')}.`
          : 'Aucun coach pour l’instant : ouvre le lien d’invitation envoyé par ton coach.'}</p>
      </div>

      {prog && (
        <div className="card">
          <h2>{prog.nom}</h2>
          {prog.description && <p className="sub" style={{ margin: 0 }}>{prog.description}</p>}
          {[...prog.seances].sort(parOrdre).map((s) => (
            <div key={s.id} className="ovl">
              <h3>{s.nom}</h3>
              {s.note && <p className="consigne">{s.note}</p>}
              {blocs([...s.seance_exercices].sort(parOrdre)).map((b) => (
                <div key={b.items[0].l.id} className={b.items.length > 1 ? 'superset' : undefined}>
                  {b.items.length > 1 && <span className="label">Superset · enchaîne les {b.items.length} exercices, puis repos</span>}
                  {b.items.map(({ l }) => (
                    <div key={l.id} className="ex">
                      <Anim ex={l.exercice} cls="t" />
                      <div><strong>{l.exercice.nom}</strong>
                        <div className="sub">{l.series} × {l.reps}{Number(l.charge_kg) ? ` · ${l.charge_kg} kg` : ''}</div>
                        {l.note && <p className="consigne">{l.note}</p>}
                        {l.exercice.lien_video && <a className="linkbtn" href={l.exercice.lien_video} target="_blank" rel="noreferrer">Voir la vidéo</a>}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {plan && (
        <div className="card">
          <h2>{plan.nom}</h2>
          {plan.kcal && <p className="sub" style={{ margin: 0 }}>Objectif : {resume({ kcal: plan.kcal, proteines: plan.proteines ?? 0, glucides: plan.glucides ?? 0, lipides: plan.lipides ?? 0 })}</p>}
          {[...plan.repas].sort(parOrdre).map((r) => (
            <div key={r.id} className="repas-ath">
              <h3>{r.nom} <small className="sub">{fmt(somme(r.repas_aliments.map((l) => macrosDe(l.aliment, l.grammes))).kcal)} kcal</small></h3>
              {r.note && <p className="consigne">{r.note}</p>}
              {[...r.repas_aliments].sort(parOrdre).map((l) => (
                <div key={l.id} className="ligne">
                  <span>{l.aliment.nom}{l.alternatives.length > 0 && <small className="sub"> (ou {l.alternatives.map((x) => plan.alts[x]).filter(Boolean).join(', ')})</small>}</span>
                  <strong className="num">{quantite(l.aliment, l.grammes)}</strong>
                </div>
              ))}
            </div>
          ))}
          {plan.complements.length > 0 && (
            <div className="repas-ath"><h3>Compléments</h3>
              {plan.complements.map((c) => <div key={c.id} className="ligne"><span>{c.nom}</span><span className="sub">{[c.dose, c.moment].filter(Boolean).join(' · ')}</span></div>)}
            </div>
          )}
        </div>
      )}

      <form className="card" onSubmit={enregistrer}>
        <h2>Mon profil</h2>
        <p className="sub" style={{ margin: 0 }}>Ton coach s’en sert pour construire ton programme.</p>
        <div className="field"><span className="label">Sexe</span>
          <div className="chips">{['Homme', 'Femme'].map((x) => <button type="button" key={x} className="chip" aria-pressed={f.sexe === x} onClick={() => maj('sexe', x)}>{x}</button>)}</div></div>
        <div className="field"><span className="label">Niveau</span>
          <div className="chips">{NIVEAUX.map((n) => <button type="button" key={n} className="chip" aria-pressed={f.niveau === n} onClick={() => maj('niveau', n)}>{n}</button>)}</div></div>
        <div className="field"><span className="label">Objectifs</span>
          <div className="chips">{OBJECTIFS.map((o) => <button type="button" key={o} className="chip" aria-pressed={f.objectifs.includes(o)} onClick={() => bascule('objectifs', o)}>{o}</button>)}</div></div>
        <div className="field"><span className="label">Matériel accessible</span>
          <div className="chips">{Object.keys(MATERIEL).map((m) => <button type="button" key={m} className="chip" aria-pressed={f.materiel.includes(m)} onClick={() => bascule('materiel', m)}>{m}</button>)}</div></div>
        <div className="grid2">
          <label className="field"><span className="label">Séances par semaine</span>
            <input type="number" min="1" max="7" value={f.seances_semaine ?? ''} onChange={(e) => maj('seances_semaine', nombre(e.target.value))} /></label>
          <label className="field"><span className="label">Durée d’une séance (min)</span>
            <input type="number" min="10" max="240" step="5" value={f.duree_min ?? ''} onChange={(e) => maj('duree_min', nombre(e.target.value))} /></label>
          <label className="field"><span className="label">Poids (kg)</span>
            <input type="number" step="0.1" value={f.poids_kg ?? ''} onChange={(e) => maj('poids_kg', nombre(e.target.value))} /></label>
          <label className="field"><span className="label">Taille (cm)</span>
            <input type="number" value={f.taille_cm ?? ''} onChange={(e) => maj('taille_cm', nombre(e.target.value))} /></label>
          <label className="field"><span className="label">Âge</span>
            <input type="number" value={f.age ?? ''} onChange={(e) => maj('age', nombre(e.target.value))} /></label>
        </div>
        <label className="field"><span className="label">Blessures ou douleurs</span>
          <input type="text" value={f.blessures} onChange={(e) => maj('blessures', e.target.value)} placeholder="Optionnel" /></label>
        <div className="row"><button className="btn">Enregistrer</button></div>
      </form>
    </>
  )
}
