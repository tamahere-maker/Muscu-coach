import { useEffect, useState } from 'react'
import { rechercherExercices } from './wger'

// Recherche par nom dans wger.de. onChoisir(exercice) reçoit une ligne prête pour la table exercices.
// connus : identifiants wger déjà dans la bibliothèque.
export default function RechercheWger({ terme = '', onChoisir, connus, libelle = 'Ajouter' }) {
  const [t, setT] = useState(terme)
  const [res, setRes] = useState(null) // { terme, exos }
  const [etat, setEtat] = useState(null) // null | 'charge' | message d'erreur
  const [occupe, setOccupe] = useState(null)

  async function chercher() {
    const terme = t.trim()
    if (terme.length < 2) return
    setEtat('charge')
    try {
      setRes({ terme, exos: await rechercherExercices(terme) })
      setEtat(null)
    } catch (e) {
      setEtat(e.message)
    }
  }
  useEffect(() => { if (terme.trim().length >= 2) chercher() }, [])

  async function choisir(e) {
    setOccupe(e.wger_id)
    try { await onChoisir(e) } finally { setOccupe(null) }
  }

  return (
    <div className="off">
      <form className="row off-form" onSubmit={(e) => { e.preventDefault(); chercher() }}>
        <input type="search" placeholder="ex. hip thrust, face pull, rowing…" value={t} onChange={(e) => setT(e.target.value)} aria-label="Exercice à chercher dans wger" />
        <button className="btn" disabled={t.trim().length < 2 || etat === 'charge'}>Chercher</button>
      </form>
      {etat === 'charge' && <p className="sub">Recherche dans wger…</p>}
      {etat && etat !== 'charge' && <p className="err">{etat}</p>}
      {res && res.exos.length === 0 && etat !== 'charge' && <p className="sub">Aucun exercice trouvé pour « {res.terme} ». Essaie aussi en anglais.</p>}
      {res?.exos.length > 0 && (
        <div className="pick-list">
          {res.exos.map((e) => {
            const deja = connus?.has(e.wger_id)
            return (
              <button key={e.wger_id} type="button" className="pick pick-off" disabled={occupe != null} onClick={() => choisir(e)}>
                {e.image_url ? <img src={e.image_url} alt="" loading="lazy" /> : <span className="off-vide" />}
                <span><strong>{e.nom}</strong>{!e.nom_fr && <small className="sub"> · nom anglais</small>}<br />
                  <small className="sub">{e.muscles.join(', ')} · {e.materiel}{e.lien_video ? ' · vidéo' : ''}</small></span>
                <span className={`pill ${deja ? '' : 'acc'}`}>{occupe === e.wger_id ? '…' : deja ? 'Déjà là' : libelle}</span>
              </button>
            )
          })}
        </div>
      )}
      <small className="sub licence">Exercices <a href="https://wger.de" target="_blank" rel="noreferrer">wger.de</a> (licence CC-BY-SA 4.0), saisis par des contributeurs. L’auteur est cité sur chaque fiche.</small>
    </div>
  )
}
