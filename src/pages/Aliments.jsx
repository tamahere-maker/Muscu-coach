import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, toast } from '../lib/ui'
import Scanner from '../lib/Scanner'
import { chercherProduit, complet } from '../lib/openfoodfacts'
import { unites } from '../lib/nutrition'

const CAT_SCAN = 'Produits scannés'
const MACROS = [['kcal', 'kcal'], ['proteines', 'Prot.'], ['glucides', 'Gluc.'], ['lipides', 'Lip.']]

export default function Aliments() {
  const { profil } = useSession()
  const [aliments, setAliments] = useState([])
  const [q, setQ] = useState('')
  const [scan, setScan] = useState(null) // null | { etape: 'camera' | 'recherche' | 'produit' | 'existe' | 'inconnu', ... }
  const dlg = useRef()

  const charger = () => supabase.from('aliments').select('*').order('categorie').order('nom').then(({ data }) => setAliments(data ?? []))
  useEffect(() => { charger() }, [])
  useEffect(() => { if (scan && !dlg.current.open) dlg.current.showModal() }, [scan])

  const groupes = useMemo(() => {
    const t = q.trim().toLowerCase()
    const g = {}
    for (const a of aliments) if (!t || a.nom.toLowerCase().includes(t) || a.marque?.toLowerCase().includes(t) || a.code_barres === t) (g[a.categorie] ??= []).push(a)
    return Object.entries(g).sort(([a], [b]) => (a === CAT_SCAN) - (b === CAT_SCAN))
  }, [aliments, q])

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

  async function ajouter() {
    const a = scan.aliment
    const { error } = await supabase.from('aliments').insert({ ...a, categorie: CAT_SCAN, source: 'Open Food Facts', cree_par: profil.id })
    if (error) return toast(error.message)
    toast(`${a.nom} ajouté à la bibliothèque`)
    dlg.current.close()
    setQ('')
    charger()
  }

  const majProduit = (k, v) => setScan((s) => ({ ...s, aliment: { ...s.aliment, [k]: v === '' ? null : k === 'nom' ? v : Number(v) } }))

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Aliments</h1>
          <p className="sub">Valeurs pour 100 g. Quantités possibles en grammes, et selon l’aliment en ml, cuillères ou unités.</p>
        </div>
        <button className="btn" onClick={() => setScan({ etape: 'camera' })}>Scanner un article</button>
      </div>
      <input type="search" placeholder="Rechercher un aliment ou une marque" value={q} onChange={(e) => setQ(e.target.value)} />
      {groupes.map(([cat, liste]) => (
        <div key={cat} className="card">
          <h2>{cat}</h2>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Aliment</th><th className="n">kcal</th><th className="n">Prot.</th><th className="n">Gluc.</th><th className="n">Lip.</th><th>Mesures</th></tr></thead>
              <tbody>
                {liste.map((a) => (
                  <tr key={a.id}>
                    <td>{a.nom}{a.marque && <small className="sub"> · {a.marque}</small>}</td>
                    <td className="n">{fmt(a.kcal)}</td><td className="n">{fmt(a.proteines, 1)}</td>
                    <td className="n">{fmt(a.glucides, 1)}</td><td className="n">{fmt(a.lipides, 1)}</td>
                    <td className="sub">{unites(a).filter((u) => u.code !== 'g').map((u) => u.code === 'ml' ? `100 ml = ${fmt(u.g * 100)} g` : `1 ${u.nom} = ${fmt(u.g, 1)} g`).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="note">Produits scannés : données <a href="https://fr.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> (licence ODbL).</p>

      <dialog ref={dlg} onClose={() => setScan(null)}>
        {scan && (
          <div className="dlg">
            <div className="dlg-head"><h2>Scanner un article</h2>
              <button className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button></div>

            {scan.etape === 'camera' && <><p className="sub" style={{ margin: 0 }}>Vise le code-barres de l’emballage.</p><Scanner onCode={surCode} /></>}
            {scan.etape === 'recherche' && <p className="sub">Recherche du produit {scan.code}…</p>}

            {scan.etape === 'existe' && (
              <div className="produit">
                <p><strong>{scan.aliment.nom}</strong>{scan.aliment.marque && ` · ${scan.aliment.marque}`} est déjà dans la bibliothèque.</p>
                <Macros a={scan.aliment} />
                <div className="row"><button className="btn ghost" onClick={() => setScan({ etape: 'camera' })}>Scanner un autre article</button></div>
              </div>
            )}

            {scan.etape === 'inconnu' && (
              <div className="produit">
                <p>{scan.erreur || `Le code ${scan.code} n’est pas encore dans Open Food Facts.`}</p>
                <div className="row"><button className="btn ghost" onClick={() => setScan({ etape: 'camera' })}>Réessayer</button></div>
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
                <div className="row"><button className="btn" disabled={!complet(scan.aliment)} onClick={ajouter}>Ajouter à la bibliothèque</button></div>
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
