import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/ui'
import { macrosDe, resume, somme } from '../lib/nutrition'
import Quantite from '../lib/Quantite'

const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Recettes du coach (Bibliothèque › Recettes) : plats composés, ajoutés en un clic dans un repas d'un plan
export default function Recettes() {
  const { profil } = useSession()
  const [recettes, setRecettes] = useState(null)
  const [aliments, setAliments] = useState([])
  const [ajoutDans, setAjoutDans] = useState(null) // recette où ajouter un aliment
  const [q, setQ] = useState('')
  const dlg = useRef()

  async function charger() {
    const { data } = await supabase.from('recettes').select('id, nom, note, recette_aliments(id, ordre, aliment_id, grammes, unite)')
      .eq('coach_id', profil.id).order('nom')
    setRecettes((data ?? []).map((r) => ({ ...r, recette_aliments: [...r.recette_aliments].sort((a, b) => a.ordre - b.ordre) })))
  }
  useEffect(() => {
    charger()
    supabase.from('aliments').select('id, categorie, nom, marque, kcal, proteines, glucides, lipides, unite_nom, unite_pluriel, unite_g, cac_g, cas_g, densite').order('nom')
      .then(({ data }) => setAliments(data ?? []))
  }, [profil.id])
  useEffect(() => { if (ajoutDans && !dlg.current.open) dlg.current.showModal() }, [ajoutDans])

  const alim = useMemo(() => Object.fromEntries(aliments.map((a) => [a.id, a])), [aliments])
  const resultats = useMemo(() => {
    const t = sansAccent(q.trim())
    return aliments.filter((a) => !t || sansAccent(`${a.nom} ${a.marque ?? ''} ${a.categorie}`).includes(t)).slice(0, 40)
  }, [aliments, q])

  const req = async (p) => { const { error } = await p; if (error) toast(error.message); charger() }

  // Nouvelle recette : on demande son nom puis on ouvre tout de suite le choix du premier aliment
  async function nouvelle() {
    const nom = prompt('Nom de la recette', 'Nouvelle recette')?.trim()
    if (!nom) return
    const { data, error } = await supabase.from('recettes').insert({ coach_id: profil.id, nom }).select('id, nom, note').single()
    if (error) return toast(error.message)
    await charger()
    setQ('')
    setAjoutDans({ ...data, recette_aliments: [] })
  }
  async function supprimer(r) {
    if (!confirm(`Supprimer la recette « ${r.nom} » ? Les plans où elle a été ajoutée ne changent pas.`)) return
    req(supabase.from('recettes').delete().eq('id', r.id))
  }
  async function ajouter(a) {
    const l = ajoutDans.recette_aliments
    await req(supabase.from('recette_aliments').insert({ recette_id: ajoutDans.id, aliment_id: a.id, grammes: a.unite_g ?? 100, ordre: l.length ? Math.max(...l.map((x) => x.ordre)) + 1 : 0 }))
    dlg.current.close()
  }

  if (recettes === null || !aliments.length) return null

  return (
    <>
      <div>
        <h1>Recettes</h1>
        <p className="sub">Enregistre un plat composé (porridge, bowl…) pour l’ajouter en un clic dans un repas. Tu peux aussi enregistrer un repas d’un plan avec « Enregistrer comme recette ».</p>
      </div>
      <div className="row"><button className="btn" onClick={nouvelle}>+ Nouvelle recette</button></div>
      {recettes.length === 0 && <p className="empty">Aucune recette pour l’instant.</p>}
      {recettes.map((r) => {
        const total = somme(r.recette_aliments.filter((l) => alim[l.aliment_id]).map((l) => macrosDe(alim[l.aliment_id], l.grammes)))
        return (
          <div key={r.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <input type="text" aria-label="Nom de la recette" defaultValue={r.nom} style={{ maxWidth: 280, fontWeight: 700 }}
                onBlur={(e) => e.target.value.trim() && e.target.value !== r.nom && req(supabase.from('recettes').update({ nom: e.target.value.trim() }).eq('id', r.id))} />
              <button className="linkbtn" onClick={() => supprimer(r)}>Supprimer</button>
            </div>
            <input type="text" aria-label={`Note pour ${r.nom}`} defaultValue={r.note} placeholder="Note (ex. cuire les flocons 3 min dans le lait)"
              onBlur={(e) => e.target.value !== r.note && req(supabase.from('recettes').update({ note: e.target.value }).eq('id', r.id))} />
            {r.recette_aliments.length === 0 && <p className="empty">Aucun aliment : ajoute-en pour pouvoir utiliser cette recette dans un plan.</p>}
            {r.recette_aliments.map((l) => {
              const a = alim[l.aliment_id]
              if (!a) return null
              return (
                <div key={l.id} className="plan-ligne">
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                    <strong>{a.nom}{a.marque && <small className="sub"> · {a.marque}</small>}</strong>
                    <button className="icon-btn" aria-label={`Retirer ${a.nom}`} onClick={() => req(supabase.from('recette_aliments').delete().eq('id', l.id))}>×</button>
                  </div>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <Quantite aliment={a} grammes={l.grammes} code={l.unite} onChange={(champs) => req(supabase.from('recette_aliments').update(champs).eq('id', l.id))} />
                    <span className="sub macros-ligne">{resume(macrosDe(a, l.grammes))}</span>
                  </div>
                </div>
              )
            })}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn ghost sm" onClick={() => { setQ(''); setAjoutDans(r) }}>+ Ajouter un aliment</button>
              <span className="sub">{resume(total)}</span>
            </div>
          </div>
        )
      })}

      <dialog ref={dlg} onClose={() => setAjoutDans(null)}>
        {ajoutDans && (
          <div className="dlg">
            <div className="dlg-head"><h2>Ajouter à {ajoutDans.nom}</h2>
              <button className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button></div>
            <input type="search" autoFocus placeholder="Aliment, marque ou catégorie" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="pick-list">
              {resultats.map((a) => (
                <button key={a.id} className="pick pick-aliment" onClick={() => ajouter(a)}>
                  <span><strong>{a.nom}</strong>{a.marque && <small className="sub"> · {a.marque}</small>}<br />
                    <small className="sub">{a.categorie} · {resume(a)} pour 100 g</small></span>
                  <span className="pill acc">Ajouter</span>
                </button>
              ))}
              {resultats.length === 0 && <p className="empty">Rien dans la bibliothèque pour « {q.trim()} ».</p>}
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}
