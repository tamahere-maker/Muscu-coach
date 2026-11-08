import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { fmt, jourIso, toast } from '../lib/ui'
import { STATUTS, TexteContrat, genererTexte, manquants } from '../lib/contrat'
import { carteValide, etatCarte, useCartePro } from '../lib/cartePro'

const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR')

// Vue « Contrat » du suivi d'un athlète : contrats envoyés et envoi d'un nouveau contrat par le coach principal
export default function AthleteContrat({ id, nom, programme }) {
  const { profil } = useSession()
  const [contrats, setContrats] = useState(null)
  const [modele, setModele] = useState(undefined)
  const [coachs, setCoachs] = useState([])
  const [f, setF] = useState(null)
  const [apercu, setApercu] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [carte] = useCartePro(profil.id)

  async function charger() {
    const { data } = await supabase.from('contrats').select('id, titre, prix_eur, date_debut, date_fin, statut, created_at, accepte_at, coach_id')
      .eq('athlete_id', id).order('created_at', { ascending: false })
    setContrats(data ?? [])
  }
  useEffect(() => {
    charger()
    supabase.from('contrats_modeles').select('*').eq('coach_id', profil.id).maybeSingle().then(({ data }) => setModele(data))
    supabase.from('coachings').select('coach_id, principal, perimetre, coach:profiles!coachings_coach_id_fkey(nom)').eq('athlete_id', id)
      .then(({ data }) => setCoachs(data ?? []))
  }, [id])
  useEffect(() => {
    setF({ titre: programme ? `Coaching · ${programme.nom}` : 'Coaching sportif', prix: programme?.prix_eur ?? '', debut: jourIso(), fin: '' })
  }, [programme?.id])

  if (contrats === null || modele === undefined || carte === undefined || !f) return null
  const principal = coachs.some((c) => c.principal && c.coach_id === profil.id)
  const enAttente = contrats.find((c) => c.statut === 'envoye')
  const manque = manquants(modele)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const texte = () => genererTexte({
    modele, carte, athlete: nom, titre: f.titre.trim(), prix: Number(f.prix) || 0, debut: f.debut, fin: f.fin || null, programme: programme?.nom,
    associes: coachs.filter((c) => !c.principal).map((c) => ({ nom: c.coach?.nom || 'Coach associé', perimetre: c.perimetre })),
  })

  async function envoyer(e) {
    e.preventDefault()
    if (f.fin && f.fin < f.debut) return toast('La date de fin doit suivre la date de début')
    setEnvoi(true)
    const { error } = await supabase.from('contrats').insert({
      athlete_id: id, coach_id: profil.id, programme_id: programme?.id ?? null, titre: f.titre.trim(), prix_eur: Number(f.prix) || 0,
      date_debut: f.debut, date_fin: f.fin || null, texte: texte(), modele_version: modele.version,
    })
    setEnvoi(false)
    if (error) return toast(error.message)
    toast('Contrat envoyé : il s’affiche à l’athlète à sa prochaine ouverture de l’app')
    setApercu(false)
    charger()
  }

  async function annuler(c) {
    if (!confirm('Annuler ce contrat en attente ?')) return
    const { error } = await supabase.rpc('finir_contrat', { c: c.id, p_type: 'annule' })
    toast(error ? error.message : 'Contrat annulé')
    charger()
  }

  return (
    <>
      <div className="card">
        <h2>Contrats</h2>
        {contrats.length === 0 ? <p className="sub" style={{ margin: 0 }}>Aucun contrat pour l’instant.</p> : (
          <div className="liste">
            {contrats.map((c) => (
              <div key={c.id}>
                <span>{c.titre} · {fmt(c.prix_eur, 2)} € · {c.accepte_at ? `accepté le ${dateFr(c.accepte_at)}` : `envoyé le ${dateFr(c.created_at)}`}{' '}
                  <span className={`pill ${STATUTS[c.statut][1]}`}>{STATUTS[c.statut][0]}</span></span>
                <span className="row">
                  {c.statut === 'envoye' && principal && <button className="btn ghost sm" onClick={() => annuler(c)}>Annuler</button>}
                  <Link className="btn ghost sm" to={`/contrats/${c.id}`}>Voir</Link>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {principal && (!carteValide(carte) ? (
        <div className="card">
          <h2>Envoyer un contrat</h2>
          <p className="sub" style={{ margin: 0 }}>{etatCarte(carte).libelle}. Coacher contre rémunération, même à distance, demande un diplôme reconnu
            et une carte professionnelle en cours de validité : renseigne-la pour pouvoir envoyer un contrat.</p>
          <div className="row"><Link className="btn" to="/carte-pro">Ma carte professionnelle</Link></div>
        </div>
      ) : manque.length > 0 ? (
        <div className="card">
          <h2>Envoyer un contrat</h2>
          <p className="sub" style={{ margin: 0 }}>Complète d’abord ton contrat type : {manque.join(', ')}.</p>
          <div className="row"><Link className="btn" to="/contrat-type">Compléter mon contrat type</Link></div>
        </div>
      ) : (
        <form className="card" onSubmit={envoyer}>
          <h2>{contrats.some((c) => c.statut === 'accepte') ? 'Envoyer un nouveau contrat' : 'Envoyer un contrat'}</h2>
          <p className="sub" style={{ margin: 0 }}>
            {enAttente ? 'Un contrat est déjà en attente : annule-le avant d’en envoyer un autre.'
              : 'Tant qu’il n’a pas accepté le contrat, l’athlète ne voit pas ses séances. Un nouveau contrat accepté remplace le précédent.'}
          </p>
          <div className="grid2">
            <label className="field"><span className="label">Intitulé</span>
              <input required type="text" value={f.titre} onChange={maj('titre')} /></label>
            <label className="field"><span className="label">Prix TTC (€)</span>
              <input required type="number" min="0" step="0.01" value={f.prix} onChange={maj('prix')} /></label>
            <label className="field"><span className="label">Début</span>
              <input required type="date" value={f.debut} onChange={maj('debut')} /></label>
            <label className="field"><span className="label">Fin (facultatif)</span>
              <input type="date" value={f.fin} onChange={maj('fin')} /></label>
          </div>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => setApercu((x) => !x)}>{apercu ? 'Masquer le contrat' : 'Relire le contrat'}</button>
            <button className="btn" disabled={!!enAttente || envoi}>Envoyer à {nom}</button>
          </div>
          {apercu && <TexteContrat texte={texte()} />}
        </form>
      ))}
      {!principal && <p className="sub">Seul le coach principal peut envoyer un contrat.</p>}
    </>
  )
}
