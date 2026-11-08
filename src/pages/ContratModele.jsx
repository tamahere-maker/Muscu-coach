import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/ui'
import { CHAMPS_REQUIS, TexteContrat, genererTexte, manquants } from '../lib/contrat'
import { BadgeCarte, dateFr, peutEnvoyerContrat, useCartePro } from '../lib/cartePro'

const VIDE = { denomination: '', statut_juridique: '', siret: '', adresse: '', email_contact: '', diplome: '', assurance: '', mediateur: '',
  delai_reponse: '48 heures ouvrées', preavis_jours: 15, clauses_perso: '', version: 0 }
const AIDE = {
  statut_juridique: 'Ex. : micro-entreprise, EI, SASU',
  assurance: 'Assureur et numéro de contrat',
  mediateur: 'Nom et site internet du médiateur auquel tu as adhéré',
}

// Contrat type du coach : ses informations légales et ses conditions particulières, reprises dans chaque contrat envoyé
export default function ContratModele() {
  const { session, profil } = useSession()
  const [m, setM] = useState(null)
  const [apercu, setApercu] = useState(false)
  const [carte] = useCartePro(profil.id)

  useEffect(() => {
    supabase.from('contrats_modeles').select('*').eq('coach_id', profil.id).maybeSingle()
      .then(({ data }) => setM(data ?? { ...VIDE, denomination: profil.nom || '', email_contact: session.user.email }))
  }, [profil.id])

  const maj = (k) => (e) => setM((x) => ({ ...x, [k]: e.target.value }))

  async function enregistrer(e) {
    e.preventDefault()
    const { updated_at, ...champs } = m
    const ligne = { ...champs, coach_id: profil.id, preavis_jours: Number(m.preavis_jours) || 0, version: (m.version || 0) + 1, updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('contrats_modeles').upsert(ligne).select('*').single()
    if (error) return toast(error.message)
    setM(data)
    toast('Contrat type enregistré')
  }

  if (!m) return null
  const manque = manquants(m)

  return (
    <>
      <div>
        <Link className="linkbtn" to="/compte">← Mon compte</Link>
        <h1 style={{ marginTop: 8 }}>Mon contrat type</h1>
        <p className="sub">Ces informations sont reprises dans le contrat que tu envoies à chaque athlète (Suivi › Contrat).
          Le texte proposé est un modèle indicatif : fais-le relire par un juriste, ce n’est pas un avis juridique.</p>
      </div>

      <form className="card" onSubmit={enregistrer}>
        <h2>Mes informations légales</h2>
        <div className="liste">
          <div>
            <span>Diplôme et carte professionnelle{carte?.numero && <> : {carte.diplome}, n° {carte.numero}{carte.expire_le && `, valable jusqu’au ${dateFr(carte.expire_le)}`}</>}</span>
            <span className="row">{carte !== undefined && <BadgeCarte carte={carte} />}<Link className="btn ghost sm" to="/carte-pro">{carte ? 'Modifier' : 'Renseigner'}</Link></span>
          </div>
        </div>
        <div className="grid2">
          {CHAMPS_REQUIS.map(([k, l]) => (
            <label key={k} className="field"><span className="label">{l}</span>
              <input type={k === 'email_contact' ? 'email' : 'text'} value={m[k]} onChange={maj(k)} placeholder={AIDE[k] || ''} /></label>
          ))}
          <label className="field"><span className="label">Délai de réponse aux messages</span>
            <input type="text" value={m.delai_reponse} onChange={maj('delai_reponse')} /></label>
          <label className="field"><span className="label">Préavis de résiliation (jours)</span>
            <input type="number" min="0" max="90" value={m.preavis_jours} onChange={maj('preavis_jours')} /></label>
        </div>
        <label className="field"><span className="label">Conditions particulières (facultatif)</span>
          <textarea rows="4" value={m.clauses_perso} onChange={maj('clauses_perso')} placeholder="Ex. : séances en visio incluses, modalités de paiement…" /></label>
        {carte !== undefined && !peutEnvoyerContrat(carte) && <p className="sub" style={{ margin: 0 }}>Renseigne une carte professionnelle en cours de validité avant d’envoyer un contrat.</p>}
        {manque.length > 0 && <p className="sub" style={{ margin: 0 }}>À compléter avant d’envoyer un contrat : {manque.join(', ')}.</p>}
        <div className="row">
          <button className="btn">Enregistrer</button>
          <button type="button" className="btn ghost" onClick={() => setApercu((x) => !x)}>{apercu ? 'Masquer l’aperçu' : 'Voir un aperçu'}</button>
          {m.version > 0 && <span className="sub">Version {m.version}</span>}
        </div>
      </form>

      {apercu && (
        <div className="card">
          <TexteContrat texte={genererTexte({ modele: m, carte, athlete: 'Prénom Nom', titre: 'Coaching 12 semaines', prix: 150,
            debut: new Date().toISOString().slice(0, 10), fin: null, programme: null })} />
        </div>
      )}
    </>
  )
}
