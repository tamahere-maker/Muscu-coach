import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, jourIso, toast } from '../lib/ui'
import { chargerCalendrier, decaler, repasDuJour, typeDuJour } from '../lib/jours'

const DUREES = [[3, '3 jours'], [7, '7 jours'], [14, '14 jours']]

// Quantité à acheter, lisible en magasin : « 12 œufs », « 1,4 kg », « 2 L »
export function aAcheter(a, grammes) {
  if (a.unite_g) {
    const n = Math.ceil(grammes / Number(a.unite_g) - 0.05)
    return `${fmt(n)} ${n > 1 ? a.unite_pluriel : a.unite_nom} (${fmt(grammes)} g)`
  }
  if (a.densite) {
    const ml = grammes / Number(a.densite)
    return ml >= 1000 ? `${fmt(ml / 1000, 1)} L` : `${fmt(Math.ceil(ml / 10) * 10)} ml`
  }
  return grammes >= 1000 ? `${fmt(grammes / 1000, 1)} kg` : `${fmt(Math.ceil(grammes / 10) * 10)} g`
}

const lire = (cle) => { try { return JSON.parse(localStorage.getItem(cle)) ?? {} } catch { return {} } }
const ecrire = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)) } catch { /* stockage indisponible */ } }

// Liste de courses de l'athlète : les aliments de son plan pour les jours à venir,
// en tenant compte des jours d'entraînement et de repos
export default function ListeCourses() {
  const { profil } = useSession()
  const aid = profil.id
  const [plan, setPlan] = useState(undefined)
  const [aliments, setAliments] = useState(null)
  const [cal, setCal] = useState(null)
  const [duree, setDuree] = useState(7)
  const debut = jourIso()
  const fin = decaler(debut, duree - 1)
  const cle = `courses:${aid}:${debut}:${duree}`
  const [coche, setCoche] = useState(() => lire(cle))
  useEffect(() => setCoche(lire(cle)), [cle])

  useEffect(() => {
    supabase.from('plans_nutrition')
      .select('id, nom, jours_differents, repas(id, type_jour, repas_aliments(aliment_id, grammes))')
      .eq('athlete_id', aid).eq('actif', true).maybeSingle().then(({ data }) => setPlan(data))
    supabase.from('aliments').select('id, categorie, nom, marque, unite_nom, unite_pluriel, unite_g, densite')
      .then(({ data }) => setAliments(Object.fromEntries((data ?? []).map((a) => [a.id, a]))))
  }, [aid])
  useEffect(() => { chargerCalendrier(aid, debut, fin).then(setCal) }, [aid, debut, fin])

  const { liste, nbEntr, nbRepos } = useMemo(() => {
    if (!plan || !aliments || !cal) return { liste: [], nbEntr: 0, nbRepos: 0 }
    const total = {}
    let nbEntr = 0, nbRepos = 0
    for (let i = 0; i < duree; i++) {
      const t = typeDuJour(decaler(debut, i), cal).type
      if (t === 'entrainement') nbEntr++; else nbRepos++
      for (const r of repasDuJour(plan, plan.repas, t)) {
        for (const l of r.repas_aliments) total[l.aliment_id] = (total[l.aliment_id] ?? 0) + Number(l.grammes)
      }
    }
    const lignes = Object.entries(total).filter(([id]) => aliments[id]).map(([id, g]) => ({ a: aliments[id], g: Math.round(g) }))
    const parCat = {}
    for (const x of lignes) (parCat[x.a.categorie] ??= []).push(x)
    const liste = Object.entries(parCat).sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, l]) => [cat, l.sort((x, y) => x.a.nom.localeCompare(y.a.nom))])
    return { liste, nbEntr, nbRepos }
  }, [plan, aliments, cal, duree, debut])

  if (plan === undefined || aliments === null || cal === null) return null

  const basculer = (id) => { const n = { ...coche, [id]: !coche[id] }; setCoche(n); ecrire(cle, n) }
  const nbArticles = liste.reduce((t, [, l]) => t + l.length, 0)
  const nbCoches = liste.reduce((t, [, l]) => t + l.filter((x) => coche[x.a.id]).length, 0)

  async function partager() {
    const texte = `Liste de courses (${duree} jours)\n` + liste.map(([cat, l]) =>
      `\n${cat}\n` + l.filter((x) => !coche[x.a.id]).map((x) => `- ${x.a.nom}${x.a.marque ? ` (${x.a.marque})` : ''} : ${aAcheter(x.a, x.g)}`).join('\n')).join('\n')
    try {
      if (navigator.share) await navigator.share({ title: 'Liste de courses', text: texte })
      else { await navigator.clipboard.writeText(texte); toast('Liste copiée') }
    } catch (e) { if (e.name !== 'AbortError') toast('Impossible de partager la liste') }
  }

  return (
    <>
      <div>
        <Link className="linkbtn" to="/nutrition">← Nutrition</Link>
        <h1 style={{ marginTop: 8 }}>Liste de courses</h1>
        <p className="sub">Ce qu’il faut pour suivre ton plan{plan?.jours_differents ? ` : ${nbEntr} jour${nbEntr > 1 ? 's' : ''} d’entraînement et ${nbRepos} jour${nbRepos > 1 ? 's' : ''} de repos` : ''}, à partir d’aujourd’hui. Les aliments que tu remplaces ne sont pas comptés.</p>
      </div>
      {!plan ? <p className="empty">Ton coach n’a pas encore préparé ton plan alimentaire.</p> : (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="seg" role="group" aria-label="Durée">
              {DUREES.map(([n, l]) => <button key={n} aria-pressed={duree === n} onClick={() => setDuree(n)}>{l}</button>)}
            </div>
            {nbArticles > 0 && <button className="btn ghost sm" onClick={partager}>Partager</button>}
          </div>
          {nbArticles === 0 && <p className="empty">Ton plan ne contient pas encore d’aliment.</p>}
          {nbArticles > 0 && <p className="sub" style={{ margin: 0 }}>{nbCoches} / {nbArticles} dans le panier</p>}
          {liste.map(([cat, l]) => (
            <div key={cat} className="card courses">
              <h2>{cat}</h2>
              {l.map((x) => (
                <label key={x.a.id} className="check">
                  <input type="checkbox" checked={!!coche[x.a.id]} onChange={() => basculer(x.a.id)} />
                  <span className={coche[x.a.id] ? 'pris' : undefined}><strong>{x.a.nom}</strong>{x.a.marque && <span className="sub"> · {x.a.marque}</span>}<br />
                    <span className="sub">{aAcheter(x.a, x.g)}</span></span>
                </label>
              ))}
            </div>
          ))}
        </>
      )}
    </>
  )
}
