import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, toast } from '../lib/ui'
import Scanner from '../lib/Scanner'
import RechercheOFF from '../lib/RechercheOFF'
import { CAT_SCAN, chercherProduit, complet, garderProduit } from '../lib/openfoodfacts'
import { unites } from '../lib/nutrition'

const CAT_PERSO = 'Mes aliments'
const VIDE = { nom: '', marque: null, categorie: CAT_PERSO, kcal: null, proteines: null, glucides: null, lipides: null, unite_nom: null, unite_pluriel: null, unite_g: null }
const pluriel = (m) => (/[sxz]$/i.test(m) ? m : m.split(' ').map((w, i) => (i === 0 ? `${w}s` : w)).join(' '))
const CHAMPS_SAISIE = ['nom', 'marque', 'categorie', 'kcal', 'proteines', 'glucides', 'lipides', 'unite_nom', 'unite_pluriel', 'unite_g', 'code_barres']
const MACROS = [['kcal', 'kcal'], ['proteines', 'Prot.'], ['glucides', 'Gluc.'], ['lipides', 'Lip.']]

export default function Aliments() {
  const { profil } = useSession()
  const [aliments, setAliments] = useState([])
  const [q, setQ] = useState('')
  const [scan, setScan] = useState(null) // null | { etape: 'camera' | 'off' | 'recherche' | 'produit' | 'existe' | 'inconnu' | 'saisie', ... }
  const dlg = useRef()

  const charger = () => supabase.from('aliments').select('*').order('categorie').order('nom').then(({ data }) => setAliments(data ?? []))
  useEffect(() => { charger() }, [])
  useEffect(() => { if (scan && !dlg.current.open) dlg.current.showModal() }, [scan])

  const groupes = useMemo(() => {
    const t = q.trim().toLowerCase()
    const g = {}
    for (const a of aliments) if (!t || a.nom.toLowerCase().includes(t) || a.marque?.toLowerCase().includes(t) || a.code_barres === t) (g[a.categorie] ??= []).push(a)
    const rang = (c) => (c === CAT_PERSO ? -1 : c === CAT_SCAN ? 1 : 0)
    return Object.entries(g).sort(([a], [b]) => rang(a) - rang(b))
  }, [aliments, q])
  const categories = useMemo(() => [...new Set([CAT_PERSO, ...aliments.map((a) => a.categorie)])].filter((c) => c !== CAT_SCAN), [aliments])
  const codes = useMemo(() => new Set(aliments.map((a) => a.code_barres).filter(Boolean)), [aliments])
  const modifiable = (a) => a.cree_par === profil.id && a.source !== 'base'

  async function surCode(code) {
    setScan({ etape: 'recherche', code })
    const { data: deja } = await supabase.from('aliments').select('*').eq('code_barres', code).maybeSingle()
    if (deja) return setScan({ etape: 'existe', code, aliment: deja })
    try {
      const p = await chercherProduit(code)
      setScan(p ? { etape: 'produit', code, aliment: p } : { etape: 'inconnu', code })
    } catch (e) {
      setScan({ etape: 'inconnu', code, erreur: e.message })
    }
  }

  // Produit choisi dans la recherche par nom : même suite que pour un code-barres scanné
  function surProduitOFF(p, terme) {
    const deja = aliments.find((a) => a.code_barres === p.code_barres)
    setScan(deja ? { etape: 'existe', code: p.code_barres, aliment: deja, depuis: 'off', terme } : { etape: 'produit', code: p.code_barres, aliment: p, depuis: 'off', terme })
  }

  async function ajouter() {
    const a = scan.aliment
    try { await garderProduit(a, profil.id) } catch (e) { return toast(e.message) }
    toast(`${a.nom} ajouté à la bibliothèque`)
    dlg.current.close()
    setQ('')
    charger()
  }

  // Saisie à la main (nouvel aliment, article inconnu d'Open Food Facts) ou modification d'un de ses aliments
  const saisir = (aliment, code) => setScan({ etape: 'saisie', code, aliment: aliment ?? { ...VIDE, code_barres: code ?? null } })

  async function enregistrer() {
    const a = scan.aliment
    const nom = a.nom.trim()
    const portion = a.unite_g > 0 && a.unite_nom?.trim()
    const ligne = Object.fromEntries(CHAMPS_SAISIE.map((k) => [k, a[k] ?? null]))
    Object.assign(ligne, {
      nom, marque: a.marque?.trim() || null,
      unite_nom: portion ? a.unite_nom.trim() : null, unite_pluriel: portion ? pluriel(a.unite_nom.trim()) : null, unite_g: portion ? a.unite_g : null,
    })
    const doublon = aliments.find((x) => x.id !== a.id && !x.code_barres && !ligne.code_barres && x.nom.toLowerCase() === nom.toLowerCase())
    if (doublon) return toast(`« ${doublon.nom} » existe déjà dans la bibliothèque.`)
    const { error } = a.id
      ? await supabase.from('aliments').update(ligne).eq('id', a.id)
      : await supabase.from('aliments').insert({ ...ligne, source: 'manuel', cree_par: profil.id })
    if (error) return toast(error.code === '23505' ? 'Cet aliment existe déjà dans la bibliothèque.' : error.message)
    toast(a.id ? `${nom} modifié` : `${nom} ajouté à la bibliothèque`)
    dlg.current.close()
    setQ('')
    charger()
  }

  const majProduit = (k, v) => setScan((s) => ({ ...s, aliment: { ...s.aliment, [k]: v === '' ? null : ['nom', 'marque', 'categorie', 'unite_nom'].includes(k) ? v : Number(v) } }))

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Aliments</h1>
          <p className="sub">Valeurs pour 100 g. Quantités possibles en grammes, et selon l’aliment en ml, cuillères ou unités.</p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => saisir()}>Ajouter un aliment</button>
          <button className="btn ghost" onClick={() => setScan({ etape: 'off', terme: q })}>Chercher un produit</button>
          <button className="btn" onClick={() => setScan({ etape: 'camera' })}>Scanner un article</button>
        </div>
      </div>
      <input type="search" placeholder="Rechercher un aliment ou une marque" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && (
        <p className="sub">{groupes.length ? 'Pas le bon produit ?' : `« ${q.trim()} » n’est pas dans la bibliothèque.`}{' '}
          <button className="linkbtn" onClick={() => setScan({ etape: 'off', terme: q })}>Chercher « {q.trim()} » dans Open Food Facts</button></p>
      )}
      {groupes.map(([cat, liste]) => (
        <div key={cat} className="card">
          <h2>{cat}</h2>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Aliment</th><th className="n">kcal</th><th className="n">Prot.</th><th className="n">Gluc.</th><th className="n">Lip.</th><th>Mesures</th><th></th></tr></thead>
              <tbody>
                {liste.map((a) => (
                  <tr key={a.id}>
                    <td>{a.nom}{a.marque && <small className="sub"> · {a.marque}</small>}</td>
                    <td className="n">{fmt(a.kcal)}</td><td className="n">{fmt(a.proteines, 1)}</td>
                    <td className="n">{fmt(a.glucides, 1)}</td><td className="n">{fmt(a.lipides, 1)}</td>
                    <td className="sub">{unites(a).filter((u) => u.code !== 'g').map((u) => u.code === 'ml' ? `100 ml = ${fmt(u.g * 100)} g` : `1 ${u.nom} = ${fmt(u.g, 1)} g`).join(' · ')}</td>
                    <td>{modifiable(a) && <button className="btn ghost sm" onClick={() => saisir({ ...a })}>Modifier</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="note">Les aliments scannés, trouvés dans Open Food Facts ou ajoutés à la main restent dans la bibliothèque et se retrouvent dans les plans alimentaires. Produits du commerce : données <a href="https://fr.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> (licence ODbL).</p>

      <dialog ref={dlg} onClose={() => setScan(null)}>
        {scan && (
          <div className="dlg">
            <div className="dlg-head"><h2>{scan.etape === 'saisie' ? (scan.aliment.id ? 'Modifier l’aliment' : 'Ajouter un aliment') : scan.etape === 'off' || scan.depuis === 'off' ? 'Chercher un produit' : 'Scanner un article'}</h2>
              <button className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button></div>

            {scan.etape === 'camera' && <><p className="sub" style={{ margin: 0 }}>Vise le code-barres de l’emballage.</p><Scanner onCode={surCode} /></>}
            {scan.etape === 'off' && <RechercheOFF terme={scan.terme} connus={codes} incompletOk libelle="Voir" onChoisir={surProduitOFF} />}
            {scan.etape === 'recherche' && <p className="sub">Recherche du produit {scan.code}…</p>}

            {scan.etape === 'existe' && (
              <div className="produit">
                <p><strong>{scan.aliment.nom}</strong>{scan.aliment.marque && ` · ${scan.aliment.marque}`} est déjà dans la bibliothèque.</p>
                <Macros a={scan.aliment} />
                <div className="row">{scan.depuis === 'off'
                  ? <button className="btn ghost" onClick={() => setScan({ etape: 'off', terme: scan.terme })}>Chercher un autre produit</button>
                  : <button className="btn ghost" onClick={() => setScan({ etape: 'camera' })}>Scanner un autre article</button>}</div>
              </div>
            )}

            {scan.etape === 'inconnu' && (
              <div className="produit">
                <p>{scan.erreur || `Le code ${scan.code} n’est pas encore dans Open Food Facts.`}</p>
                <div className="row">
                  <button className="btn" onClick={() => saisir(null, scan.code)}>Saisir à la main</button>
                  <button className="btn ghost" onClick={() => setScan({ etape: 'camera' })}>Réessayer</button>
                </div>
              </div>
            )}

            {scan.etape === 'produit' && (
              <div className="produit">
                <label className="field"><span className="label">Nom</span>
                  <input type="text" value={scan.aliment.nom} onChange={(e) => majProduit('nom', e.target.value)} /></label>
                {scan.aliment.marque && <p className="sub" style={{ margin: 0 }}>{scan.aliment.marque}{scan.aliment.unite_g ? ` · portion de ${fmt(scan.aliment.unite_g)} g` : ''}</p>}
                <span className="label">Pour 100 g</span>
                <div className="macros4">
                  {MACROS.map(([k, lib]) => (
                    <div key={k}><input type="number" min="0" step="0.1" aria-label={lib} value={scan.aliment[k] ?? ''} onChange={(e) => majProduit(k, e.target.value)} /><span className="label">{lib}</span></div>
                  ))}
                </div>
                {!complet(scan.aliment) && <p className="err">Il manque des valeurs : complète-les depuis l’emballage.</p>}
                <div className="row"><button className="btn" disabled={!complet(scan.aliment)} onClick={ajouter}>Ajouter à la bibliothèque</button>
                  {scan.depuis === 'off' && <button className="btn ghost" onClick={() => setScan({ etape: 'off', terme: scan.terme })}>Retour aux résultats</button>}</div>
              </div>
            )}

            {scan.etape === 'saisie' && (
              <div className="produit">
                {scan.aliment.code_barres && <p className="sub" style={{ margin: 0 }}>Code-barres {scan.aliment.code_barres}</p>}
                <label className="field"><span className="label">Nom</span>
                  <input type="text" value={scan.aliment.nom ?? ''} onChange={(e) => majProduit('nom', e.target.value)} /></label>
                <div className="grid2">
                  <label className="field"><span className="label">Marque (facultatif)</span>
                    <input type="text" value={scan.aliment.marque ?? ''} onChange={(e) => majProduit('marque', e.target.value)} /></label>
                  {!scan.aliment.code_barres && (
                    <label className="field"><span className="label">Catégorie</span>
                      <select value={scan.aliment.categorie} onChange={(e) => majProduit('categorie', e.target.value)}>
                        {categories.map((c) => <option key={c}>{c}</option>)}
                      </select></label>
                  )}
                </div>
                <span className="label">Pour 100 g</span>
                <div className="macros4">
                  {MACROS.map(([k, lib]) => (
                    <div key={k}><input type="number" min="0" step="0.1" aria-label={lib} value={scan.aliment[k] ?? ''} onChange={(e) => majProduit(k, e.target.value)} /><span className="label">{lib}</span></div>
                  ))}
                </div>
                <div className="grid2">
                  <label className="field"><span className="label">Se compte en (facultatif)</span>
                    <input type="text" placeholder="ex. barre, tranche" value={scan.aliment.unite_nom ?? ''} onChange={(e) => majProduit('unite_nom', e.target.value)} /></label>
                  <label className="field"><span className="label">Poids d’une unité (g)</span>
                    <input type="number" min="0" step="0.1" value={scan.aliment.unite_g ?? ''} onChange={(e) => majProduit('unite_g', e.target.value)} /></label>
                </div>
                {!complet(scan.aliment) && <p className="err">Renseigne le nom et les 4 valeurs pour 100 g.</p>}
                <div className="row"><button className="btn" disabled={!complet(scan.aliment)} onClick={enregistrer}>{scan.aliment.id ? 'Enregistrer' : 'Ajouter à la bibliothèque'}</button></div>
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  )
}

const Macros = ({ a }) => (
  <div className="macros4">{MACROS.map(([k, lib]) => <div key={k}><b>{fmt(a[k], k === 'kcal' ? 0 : 1)}</b><span className="label">{lib}</span></div>)}</div>
)
