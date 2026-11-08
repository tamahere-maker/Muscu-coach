import { Link } from 'react-router-dom'
import { CGU_VERSION } from '../lib/cartePro'

// Conditions générales d'utilisation de l'app pour les coachs. Modèle indicatif à faire relire par un avocat.
export const CGU_COACH = `## 1. Objet
Muscu Coach est un outil qui permet à un coach de concevoir et de suivre à distance les programmes d’entraînement et les plans nutritionnels de ses athlètes. L’éditeur de l’application ne fournit lui-même aucune prestation de coaching : chaque coach exerce en son nom et sous sa responsabilité.

## 2. Qualification et carte professionnelle
Le coach qui est rémunéré par ses athlètes, même à distance, déclare et garantit :
- être titulaire d’un diplôme, titre à finalité professionnelle ou certificat de qualification lui permettant d’encadrer la musculation contre rémunération (article L212-1 du Code du sport) ;
- avoir déclaré son activité et détenir une carte professionnelle d’éducateur sportif en cours de validité (article L212-11) ;
- ne faire l’objet d’aucune incapacité ni interdiction d’exercer (articles L212-9 et L212-13) ;
- être couvert par une assurance de responsabilité civile professionnelle.
Il renseigne dans l’application le numéro de sa carte, son diplôme et la date d’expiration de sa carte, et les tient à jour. L’envoi de contrats aux athlètes n’est possible qu’avec une carte renseignée et en cours de validité.

## 3. Vérification
L’éditeur peut vérifier la carte sur le registre public des éducateurs sportifs (eapspublic.sports.gouv.fr) et afficher aux athlètes la mention « Carte professionnelle vérifiée ». Cette vérification ne décharge pas le coach de ses obligations.

## 4. Changement de situation
Le coach informe l’éditeur sans délai de tout retrait, suspension ou non-renouvellement de sa carte, de toute interdiction d’exercer et de toute résiliation de son assurance. Il met à jour sa carte avant son expiration (validité de 5 ans).

## 5. Suspension du compte
L’éditeur peut suspendre ou fermer le compte d’un coach dont la carte est absente, expirée, introuvable sur le registre public ou fausse, ou qui ne respecte pas les présentes conditions, après l’en avoir informé, sauf urgence pour la sécurité des athlètes.

## 6. Coachs associés
Ces règles s’appliquent à chaque coach associé rémunéré, sur la part du programme qu’il assure. Le coach principal ne fait intervenir que des coachs associés qui les respectent.

## 7. Nutrition et compléments
Le coach ne se présente pas comme diététicien s’il n’en a pas le diplôme. Ses conseils nutritionnels s’adressent à des personnes en bonne santé : en cas de pathologie, de traitement ou de grossesse, il oriente l’athlète vers un médecin ou un diététicien. Il n’utilise pour les compléments alimentaires que les allégations autorisées (règlement (CE) n° 1924/2006) et signale tout partenariat rémunéré avec une marque par la mention « Publicité » ou « Collaboration commerciale ».

## 8. Responsabilité
Le coach est seul responsable des programmes, plans et conseils qu’il fournit, et de ses relations contractuelles avec ses athlètes.`

export default function CguCoach() {
  return (
    <>
      <div>
        <Link className="linkbtn" to="/">← Muscu Coach</Link>
        <h1 style={{ marginTop: 8 }}>Conditions générales d’utilisation : coachs</h1>
        <p className="sub">Version {CGU_VERSION}. Modèle indicatif, à faire relire par un avocat : ce n’est pas un avis juridique.</p>
      </div>
      <div className="card contrat-texte">
        {CGU_COACH.split('\n').map((l, i) => l.startsWith('## ') ? <h3 key={i}>{l.slice(3)}</h3>
          : l.startsWith('- ') ? <p key={i} className="puce">{l.slice(2)}</p>
          : l.trim() ? <p key={i}>{l}</p> : null)}
      </div>
    </>
  )
}
