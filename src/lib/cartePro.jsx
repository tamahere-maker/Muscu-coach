import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'

// Carte professionnelle d'éducateur sportif (Code du sport L212-1 et L212-11) : un coach payé, même à distance,
// doit être diplômé et déclaré. La carte est valable 5 ans ; la vérification se fait sur le registre public.

export const LIEN_REGISTRE = 'https://eapspublic.sports.gouv.fr'
export const CGU_VERSION = 1
export const JOURS_RAPPEL = 60
// Interrupteur : false pendant la phase de test (demande du 2026-11-08), l'envoi de contrat n'exige pas de carte.
// Pour rétablir l'obligation : passer à true ET, en base,
// alter policy contrats_carte_pro on public.contrats with check (public.carte_valide(coach_id));
export const CARTE_OBLIGATOIRE = false
export const DIPLOMES = [
  'CQP Instructeur fitness, option Musculation et personal training',
  'CQP Instructeur fitness, option Cours collectifs',
  'BPJEPS Activités de la forme',
  'Licence STAPS Entraînement sportif',
  'Licence STAPS Activité physique adaptée et santé',
  'DEJEPS / DESJEPS',
]

const JOUR = 864e5
export const dateFr = (d) => new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
export const joursRestants = (d) => Math.ceil((new Date(d + 'T23:59').getTime() - Date.now()) / JOUR)

// État d'une carte : code, libellé et ton de la pastille
export function etatCarte(c) {
  if (!c || !c.numero?.trim() || !c.diplome?.trim() || !c.expire_le) return { code: 'absente', libelle: 'Carte professionnelle à renseigner', ton: 'warn' }
  if (!c.attestation_at || !c.cgu_at) return { code: 'incomplete', libelle: 'Déclaration et CGU à accepter', ton: 'warn' }
  const j = joursRestants(c.expire_le)
  if (j < 0) return { code: 'expiree', libelle: `Carte expirée le ${dateFr(c.expire_le)}`, ton: 'warn' }
  if (c.refus_motif) return { code: 'refusee', libelle: 'Vérification refusée', ton: 'warn' }
  if (j <= JOURS_RAPPEL) return { code: 'bientot', libelle: `Carte à renouveler avant le ${dateFr(c.expire_le)}`, ton: 'warn', verifiee: !!c.verifiee_at }
  if (c.verifiee_at) return { code: 'verifiee', libelle: 'Carte professionnelle vérifiée', ton: 'ok', verifiee: true }
  return { code: 'a_verifier', libelle: 'Carte en cours de vérification', ton: '' }
}
// Carte utilisable pour envoyer un contrat (même règle que carte_valide côté base)
export const carteValide = (c) => !['absente', 'incomplete', 'expiree'].includes(etatCarte(c).code)
export const peutEnvoyerContrat = (c) => !CARTE_OBLIGATOIRE || carteValide(c)

export function useCartePro(coachId) {
  const [carte, setCarte] = useState(undefined)
  useEffect(() => {
    if (!coachId) return
    supabase.from('cartes_pro').select('*').eq('coach_id', coachId).maybeSingle().then(({ data }) => setCarte(data ?? null))
  }, [coachId])
  return [carte, setCarte]
}

export function BadgeCarte({ carte }) {
  const e = etatCarte(carte)
  return <span className={`pill ${e.ton}`}>{e.code === 'bientot' && e.verifiee ? `Vérifiée · ${e.libelle.toLowerCase()}` : e.libelle}</span>
}

// Bandeau côté coach quand la carte manque, expire bientôt, a expiré ou a été refusée
export function BandeauCarte({ carte }) {
  if (carte === undefined) return null
  const e = etatCarte(carte)
  if (e.code === 'verifiee' || e.code === 'a_verifier') return null
  const texte = {
    absente: `Pour coacher contre rémunération, même à distance, la loi impose un diplôme reconnu et une carte professionnelle. Renseigne la tienne${CARTE_OBLIGATOIRE ? ' : sans elle, tu ne peux pas envoyer de contrat' : ''}.`,
    incomplete: `Accepte la déclaration sur l’honneur et les CGU coach${CARTE_OBLIGATOIRE ? ' pour pouvoir envoyer des contrats' : ''}.`,
    expiree: `Ta carte a expiré : renouvelle ta déclaration sur eaps.sports.gouv.fr puis mets à jour la date.${CARTE_OBLIGATOIRE ? ' L’envoi de contrats est bloqué en attendant.' : ''}`,
    refusee: `Ta carte n’a pas pu être vérifiée : ${carte?.refus_motif}. Corrige le numéro ou le diplôme.`,
    bientot: `Ta carte expire dans ${joursRestants(carte?.expire_le ?? '')} jours : pense à renouveler ta déclaration sur eaps.sports.gouv.fr.`,
  }[e.code]
  return (
    <Link className="card a-faire" to="/carte-pro">
      <strong>{e.libelle}</strong>
      <span className="sub">{texte}</span>
    </Link>
  )
}

// Fiche affichée à l'athlète : diplôme et carte de chacun de ses coachs
export function CartesCoachs({ coachs }) {
  const [cartes, setCartes] = useState({})
  const ids = coachs.map((c) => c.coach_id).filter(Boolean)
  useEffect(() => {
    if (!ids.length) return
    supabase.from('cartes_pro').select('coach_id, numero, diplome, expire_le, attestation_at, cgu_at, verifiee_at, refus_motif').in('coach_id', ids)
      .then(({ data }) => setCartes(Object.fromEntries((data ?? []).map((c) => [c.coach_id, c]))))
  }, [ids.join()])
  if (!coachs.length) return null
  return (
    <div className="card">
      <h2>{coachs.length > 1 ? 'Mes coachs' : 'Mon coach'}</h2>
      <div className="liste">
        {coachs.map((c) => {
          const k = cartes[c.coach_id]
          return (
            <div key={c.coach_id}>
              <span className="athlete">
                <strong>{c.coach?.nom || 'Coach'} {c.principal ? <span className="pill acc">Coach principal</span> : <span className="pill">{c.perimetre}</span>}</strong>
                <span className="sub">{k?.diplome
                  ? <>{k.diplome} · carte professionnelle n° {k.numero}{k.expire_le && <>, valable jusqu’au {dateFr(k.expire_le)}</>}</>
                  : 'Carte professionnelle pas encore renseignée'}</span>
              </span>
              <BadgeCarte carte={k} />
            </div>
          )
        })}
      </div>
      <p className="sub" style={{ margin: 0 }}>Tu peux vérifier une carte sur le <a href={LIEN_REGISTRE} target="_blank" rel="noreferrer">registre public des éducateurs sportifs</a>.</p>
    </div>
  )
}
