import { useEffect, useState } from 'react'
import { fmt } from './ui'
import { complet, rechercherProduits } from './openfoodfacts'

// Recherche par nom dans Open Food Facts. onChoisir(produit, terme) reçoit une ligne prête pour la table aliments.
// connus : codes-barres déjà dans la bibliothèque. incompletOk : un produit sans toutes ses valeurs peut être choisi.
export default function RechercheOFF({ terme = '', onChoisir, connus, incompletOk = false, libelle = 'Choisir', msgIncomplet = 'Valeurs nutritionnelles incomplètes' }) {
  const [t, setT] = useState(terme)
  const [res, setRes] = useState(null) // { terme, produits, total, page }
  const [etat, setEtat] = useState(null) // null | 'charge' | message d'erreur

  async function chercher(page = 1) {
    const terme = t.trim()
    if (terme.length < 2) return
    setEtat('charge')
    try {
      const r = await rechercherProduits(terme, page)
      setRes((avant) => ({ terme, total: r.total, page, produits: page > 1 && avant ? [...avant.produits, ...r.produits] : r.produits }))
      setEtat(null)
    } catch (e) {
      setEtat(e.message)
    }
  }
  useEffect(() => { if (terme.trim().length >= 2) chercher() }, [])

  return (
    <div className="off">
      <form className="row off-form" onSubmit={(e) => { e.preventDefault(); chercher() }}>
        <input type="search" placeholder="ex. skyr, galette de riz, whey…" value={t} onChange={(e) => setT(e.target.value)} aria-label="Produit à chercher dans Open Food Facts" />
        <button className="btn" disabled={t.trim().length < 2 || etat === 'charge'}>Chercher</button>
      </form>
      {etat === 'charge' && <p className="sub">Recherche dans Open Food Facts…</p>}
      {etat && etat !== 'charge' && <p className="err">{etat}</p>}
      {res && res.produits.length === 0 && etat !== 'charge' && <p className="sub">Aucun produit trouvé pour « {res.terme} ».</p>}
      {res?.produits.length > 0 && (
        <div className="pick-list">
          {res.produits.map((p) => {
            const ok = complet(p)
            const deja = connus?.has(p.code_barres)
            return (
              <button key={p.code_barres} type="button" className="pick pick-off" disabled={!ok && !incompletOk && !deja} onClick={() => onChoisir(p, res.terme)}>
                {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span className="off-vide" />}
                <span><strong>{p.nom}</strong>{p.marque && <small className="sub"> · {p.marque}</small>}{p.quantite && <small className="sub"> · {p.quantite}</small>}<br />
                  <small className="sub">{ok
                    ? `${fmt(p.kcal)} kcal · P ${fmt(p.proteines, 1)} · G ${fmt(p.glucides, 1)} · L ${fmt(p.lipides, 1)} pour 100 g`
                    : msgIncomplet}</small></span>
                <span className={`pill ${deja ? '' : 'acc'}`}>{deja ? 'Déjà là' : libelle}</span>
              </button>
            )
          })}
        </div>
      )}
      {res && res.produits.length > 0 && res.page * 24 < res.total && etat !== 'charge' && (
        <div className="row"><button type="button" className="btn ghost sm" onClick={() => chercher(res.page + 1)}>Plus de résultats</button></div>
      )}
      <small className="sub">Données <a href="https://fr.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> (licence ODbL), saisies par des contributeurs : vérifie les valeurs sur l’emballage.</small>
    </div>
  )
}
