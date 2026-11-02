import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, toast } from '../lib/ui'
import { STATUTS, TexteContrat, empreinte } from '../lib/contrat'

const dateFr = (d) => new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const heureFr = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
const JOUR = 864e5

// Un contrat : récapitulatif, texte complet, acceptation par l'athlète, preuve, rétractation, résiliation, impression
export default function Contrat() {
  const { id } = useParams()
  const { profil } = useSession()
  const nav = useNavigate()
  const [k, setK] = useState(undefined)
  const [preuve, setPreuve] = useState(null)
  const [cases, setCases] = useState({ lu: false, anticipe: false, sante: false })
  const [occupe, setOccupe] = useState(false)

  async function charger() {
    const { data } = await supabase.from('contrats')
      .select('*, coach:profiles!contrats_coach_id_fkey(nom), athlete:profiles!contrats_athlete_id_fkey(nom)').eq('id', id).maybeSingle()
    setK(data)
    if (data?.accepte_at) {
      const p = await supabase.from('acceptations_contrat').select('*').eq('contrat_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      setPreuve(p.data)
    }
  }
  useEffect(() => { charger() }, [id])

  if (k === undefined) return null
  if (!k) return <div className="card"><p className="sub">Contrat introuvable.</p></div>

  const athlete = profil.id === k.athlete_id
  const coach = profil.id === k.coach_id
  const [libelle, ton] = STATUTS[k.statut]
  const retractable = athlete && k.statut === 'accepte' && Date.now() <= new Date(k.accepte_at).getTime() + 14 * JOUR

  async function accepter(e) {
    e.preventDefault()
    if (!cases.lu || !cases.sante) return toast('Coche les cases obligatoires pour accepter')
    setOccupe(true)
    const { error } = await supabase.rpc('accepter_contrat', {
      c: k.id, p_empreinte: await empreinte(k.texte), p_anticipe: cases.anticipe, p_sante: true, p_navigateur: navigator.userAgent,
    })
    setOccupe(false)
    if (error) return toast(error.message)
    toast('Contrat accepté. Bon entraînement !')
    nav('/')
  }

  async function finir(type) {
    const question = { retracte: 'Confirmer ta rétractation ? Le suivi s’arrête et ton coach te rembourse selon le contrat.',
      resilie: athlete ? 'Confirmer la résiliation du contrat ? Le préavis prévu au contrat s’applique.' : 'Résilier ce contrat ?' }[type]
    const motif = prompt(`${question}\n\nMotif (facultatif) :`, '')
    if (motif === null) return
    const { error } = await supabase.rpc('finir_contrat', { c: k.id, p_type: type, p_motif: motif })
    toast(error ? error.message : type === 'retracte' ? 'Rétractation enregistrée' : 'Résiliation enregistrée')
    charger()
  }

  return (
    <>
      <div className="no-print">
        <Link className="linkbtn" to={athlete ? '/profil' : `/athletes/${k.athlete_id}?vue=contrat`}>← {athlete ? 'Mon profil' : 'Suivi de l’athlète'}</Link>
        <h1 style={{ marginTop: 8 }}>{k.titre}</h1>
        <p className="sub"><span className={`pill ${ton}`}>{libelle}</span></p>
      </div>

      <div className="card">
        <h2>Récapitulatif</h2>
        <div className="liste">
          <div><span>Coach</span><span>{k.coach?.nom}</span></div>
          <div><span>Athlète</span><span>{k.athlete?.nom}</span></div>
          <div><span>Prix TTC</span><strong>{fmt(k.prix_eur, 2)} €</strong></div>
          <div><span>Durée</span><span>{k.date_fin ? `du ${dateFr(k.date_debut)} au ${dateFr(k.date_fin)}` : `à partir du ${dateFr(k.date_debut)}`}, sans reconduction</span></div>
          <div><span>Rétractation</span><span>14 jours après l’acceptation</span></div>
        </div>
      </div>

      <div className="card"><TexteContrat texte={k.texte} /></div>

      {athlete && k.statut === 'envoye' && (
        <form className="card a-faire no-print" onSubmit={accepter}>
          <h2>Accepter le contrat</h2>
          <label className="coche"><input type="checkbox" checked={cases.lu} onChange={(e) => setCases({ ...cases, lu: e.target.checked })} />
            <span>J’ai lu le contrat et j’en accepte les conditions, y compris le prix de {fmt(k.prix_eur, 2)} € TTC. <em>(obligatoire)</em></span></label>
          <label className="coche"><input type="checkbox" checked={cases.sante} onChange={(e) => setCases({ ...cases, sante: e.target.checked })} />
            <span>J’accepte que mon coach traite mes données de santé (mensurations, photos, blessures, ressentis) pour assurer mon suivi. Je peux retirer ce consentement à tout moment, ce qui met fin au suivi. <em>(obligatoire)</em></span></label>
          <label className="coche"><input type="checkbox" checked={cases.anticipe} onChange={(e) => setCases({ ...cases, anticipe: e.target.checked })} />
            <span>Je demande à commencer tout de suite, sans attendre la fin du délai de rétractation de 14 jours. Si je me rétracte, je paierai la part de la prestation déjà fournie. <em>(facultatif)</em></span></label>
          <div className="row"><button className="btn" disabled={occupe || !cases.lu || !cases.sante}>Accepter le contrat</button></div>
          <p className="sub" style={{ margin: 0 }}>Ton acceptation est enregistrée avec la date, l’heure et l’empreinte du texte ci-dessus, qui vaut signature électronique.</p>
        </form>
      )}

      {k.accepte_at && (
        <div className="card">
          <h2>Acceptation</h2>
          <p style={{ margin: 0 }}>Accepté électroniquement par {k.athlete?.nom} le {heureFr(k.accepte_at)}.
            {k.demarrage_anticipe ? ' Démarrage demandé avant la fin du délai de rétractation.' : ''}</p>
          {preuve && <p className="sub" style={{ margin: 0, overflowWrap: 'anywhere' }}>Empreinte SHA-256 du texte : {preuve.empreinte}
            {preuve.ip ? ` · adresse IP ${preuve.ip}` : ''}</p>}
          {k.fin_at && k.statut !== 'accepte' && <p style={{ margin: 0 }}>{libelle} le {heureFr(k.fin_at)}{k.motif_fin ? ` · motif : ${k.motif_fin}` : ''}.</p>}
        </div>
      )}
      {!k.accepte_at && k.fin_at && <p className="sub">{libelle} le {heureFr(k.fin_at)}.</p>}

      <div className="row no-print">
        <button className="btn ghost" onClick={() => window.print()}>Imprimer ou enregistrer en PDF</button>
        {retractable && <button className="btn ghost" onClick={() => finir('retracte')}>Me rétracter</button>}
        {k.statut === 'accepte' && (athlete || coach) && <button className="btn ghost" onClick={() => finir('resilie')}>Résilier le contrat</button>}
      </div>
    </>
  )
}
