import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/ui'
import { BadgeCarte, LIEN_REGISTRE, dateFr } from '../lib/cartePro'

// Administrateurs : vérification à la main des cartes professionnelles sur le registre public
export default function VerificationCartes() {
  const [cartes, setCartes] = useState(null)
  const [filtre, setFiltre] = useState('a_verifier')

  async function charger() {
    const { data, error } = await supabase.rpc('cartes_a_verifier')
    if (error) toast(error.message)
    setCartes(data ?? [])
  }
  useEffect(() => { charger() }, [])

  async function verifier(c, ok) {
    let motif = null
    if (!ok) {
      motif = prompt('Motif du refus (affiché au coach) :', 'Carte introuvable sur le registre public')
      if (motif === null) return
    }
    const { error } = await supabase.rpc('verifier_carte', { c: c.coach_id, ok, motif })
    if (error) return toast(error.message)
    toast(ok ? 'Carte marquée vérifiée' : 'Refus enregistré')
    charger()
  }

  const copier = (t) => navigator.clipboard.writeText(t).then(() => toast('Numéro copié'))
  if (cartes === null) return null
  const liste = cartes.filter((c) => filtre === 'toutes' || (!c.verifiee_at && !c.refus_motif))

  return (
    <>
      <div>
        <Link className="linkbtn" to="/compte">← Mon compte</Link>
        <h1 style={{ marginTop: 8 }}>Vérifier les cartes des coachs</h1>
        <p className="sub">Recherche chaque numéro sur le <a href={LIEN_REGISTRE} target="_blank" rel="noreferrer">registre public des éducateurs sportifs</a>,
          puis compare le nom, le diplôme et la date de validité.</p>
      </div>
      <div className="seg" role="group">
        <button type="button" aria-pressed={filtre === 'a_verifier'} onClick={() => setFiltre('a_verifier')}>À vérifier</button>
        <button type="button" aria-pressed={filtre === 'toutes'} onClick={() => setFiltre('toutes')}>Toutes</button>
      </div>
      <div className="card">
        {liste.length === 0 ? <p className="empty">Aucune carte à vérifier.</p> : (
          <div className="liste">
            {liste.map((c) => (
              <div key={c.coach_id}>
                <span className="athlete">
                  <strong>{c.nom || 'Sans nom'} <BadgeCarte carte={c} /></strong>
                  <span className="sub">{c.email} · {c.diplome || 'diplôme non renseigné'}</span>
                  <span className="sub">Carte n° {c.numero || '—'}{c.expire_le && ` · valable jusqu’au ${dateFr(c.expire_le)}`}
                    {c.refus_motif && ` · refus : ${c.refus_motif}`}</span>
                </span>
                <span className="row">
                  {c.numero && <button className="btn ghost sm" onClick={() => copier(c.numero)}>Copier le n°</button>}
                  <button className="btn sm" onClick={() => verifier(c, true)}>Vérifiée</button>
                  <button className="linkbtn" onClick={() => verifier(c, false)}>Refuser</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
