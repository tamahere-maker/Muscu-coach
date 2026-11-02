// Contrat de coaching : génération du texte à partir du modèle du coach, empreinte et libellés.
// Le texte est figé dans la base à l'envoi ; l'athlète accepte exactement ce texte (empreinte SHA-256 vérifiée).

export const STATUTS = {
  envoye: ['En attente d’acceptation', 'warn'],
  accepte: ['En cours', 'ok'],
  retracte: ['Rétracté', ''],
  resilie: ['Résilié', ''],
  annule: ['Annulé', ''],
  remplace: ['Remplacé par un nouveau contrat', ''],
}

// Champs du modèle indispensables avant de pouvoir envoyer un contrat
export const CHAMPS_REQUIS = [
  ['denomination', 'Nom ou raison sociale'],
  ['statut_juridique', 'Statut juridique'],
  ['siret', 'SIRET'],
  ['adresse', 'Adresse professionnelle'],
  ['email_contact', 'E-mail de contact'],
  ['diplome', 'Diplôme ou carte professionnelle'],
  ['assurance', 'Assurance responsabilité civile professionnelle'],
  ['mediateur', 'Médiateur de la consommation'],
]
export const manquants = (m) => CHAMPS_REQUIS.filter(([k]) => !m?.[k]?.trim()).map(([, l]) => l)

const dateLongue = (d) => new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const euros = (n) => Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

export async function empreinte(texte) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Texte complet du contrat. Titres de section préfixés par « ## » (affichés en gras dans l'app).
// Modèle indicatif à faire relire par un juriste : ce n'est pas un avis juridique.
export function genererTexte({ modele: m, athlete, titre, prix, debut, fin, programme, associes = [] }) {
  const duree = fin ? `du ${dateLongue(debut)} au ${dateLongue(fin)}` : `à partir du ${dateLongue(debut)}, pour la durée du programme`
  const assoc = associes.length
    ? `Le Coach peut s’appuyer sur ${associes.length > 1 ? 'les coachs associés suivants, qu’il choisit et rémunère' : 'le coach associé suivant, qu’il choisit et rémunère'} : ${associes.map((a) => `${a.nom} (${a.perimetre.toLowerCase()})`).join(', ')}. Le Coach reste le seul interlocuteur contractuel de l’Athlète et répond de leurs prestations.`
    : 'Le Coach réalise seul les prestations.'
  return `# Contrat de coaching sportif à distance

## 1. Parties
Le présent contrat est conclu entre :
- ${m.denomination}, ${m.statut_juridique}, SIRET ${m.siret}, ${m.adresse}, ${m.email_contact}, titulaire de : ${m.diplome}, assuré en responsabilité civile professionnelle auprès de : ${m.assurance} (ci-après « le Coach ») ;
- ${athlete} (ci-après « l’Athlète »), agissant en qualité de consommateur.

## 2. Objet
Le Coach fournit à l’Athlète, au moyen de l’application Muscu Coach, une prestation de coaching sportif à distance : « ${titre} »${programme ? `, programme « ${programme} »` : ''}. Elle comprend un programme d’entraînement personnalisé, un plan nutritionnel et des conseils sur les compléments alimentaires, le suivi des séances et des bilans, et un échange par messagerie.
${assoc}
Les conseils nutritionnels et sur les compléments sont des recommandations d’hygiène de vie : ils ne constituent ni un diagnostic, ni une prescription médicale, ni un traitement.

## 3. Durée
Le contrat est conclu ${duree}. Il n’est pas reconduit tacitement : toute poursuite fait l’objet d’un nouveau contrat accepté par l’Athlète.

## 4. Prix et paiement
Le prix de la prestation est de ${euros(prix)} TTC${Number(prix) ? '' : ' (prestation gratuite)'}, payable au Coach selon les modalités convenues entre les parties. En cas de défaut de paiement, le Coach peut suspendre la prestation après une relance restée sans effet pendant 8 jours.

## 5. Engagements du Coach
Le Coach s’engage à concevoir un programme adapté aux informations transmises par l’Athlète, à l’ajuster au vu des bilans et à répondre aux messages dans un délai de ${m.delai_reponse}. Il est tenu d’une obligation de moyens.

## 6. Engagements de l’Athlète
L’Athlète s’engage à fournir des informations exactes et à jour sur sa santé, ses antécédents et ses blessures, à respecter les consignes de sécurité et d’exécution, à interrompre l’exercice et à prévenir le Coach en cas de douleur ou de malaise. Il est vivement recommandé à l’Athlète de consulter un médecin avant de commencer, afin de s’assurer de l’absence de contre-indication à la pratique sportive.

## 7. Responsabilité
Le Coach est responsable des dommages résultant d’un manquement à ses obligations. Il ne peut être tenu responsable des conséquences d’informations inexactes ou incomplètes fournies par l’Athlète, ni du non-respect des consignes. Aucune clause du présent contrat ne limite la responsabilité du Coach en cas de dommage corporel.

## 8. Droit de rétractation
L’Athlète dispose d’un délai de 14 jours à compter de l’acceptation du contrat pour se rétracter, sans avoir à se justifier, depuis l’application (Mon profil › Mes contrats) ou par une déclaration dénuée d’ambiguïté adressée à ${m.email_contact}. Si l’Athlète a expressément demandé que la prestation commence avant la fin de ce délai, il reste redevable d’un montant proportionnel à la prestation fournie jusqu’à la communication de sa décision de se rétracter. Le Coach rembourse les sommes dues au plus tard 14 jours après la rétractation.

## 9. Résiliation
L’Athlète peut résilier le contrat à tout moment depuis l’application, avec un préavis de ${m.preavis_jours} jours ; la part du prix correspondant à la période non exécutée lui est alors remboursée. Le Coach peut résilier le contrat en cas de manquement grave de l’Athlète ou de défaut de paiement, après mise en demeure restée sans effet pendant 8 jours, ou pour un motif légitime avec le même préavis et le remboursement de la période non exécutée.

## 10. Données personnelles
Le Coach est responsable du traitement des données de l’Athlète (identité, profil sportif, séances, alimentation, mensurations, photos et informations de santé). Ces données servent uniquement au suivi prévu au présent contrat. Les données de santé ne sont traitées qu’avec le consentement explicite de l’Athlète, qu’il peut retirer à tout moment, ce qui met fin au suivi. Les données sont hébergées par les prestataires techniques de l’application et conservées pendant la durée du contrat puis 3 ans, sauf obligation légale contraire. L’Athlète dispose de droits d’accès, de rectification, d’effacement, de limitation, de portabilité et d’opposition, qu’il exerce auprès de ${m.email_contact}, et peut saisir la CNIL.

## 11. Propriété intellectuelle
Les programmes, plans et contenus fournis restent la propriété du Coach. L’Athlète en a un usage strictement personnel et s’interdit de les diffuser.

## 12. Médiation et litiges
En cas de litige, l’Athlète peut recourir gratuitement au médiateur de la consommation : ${m.mediateur}, après une réclamation écrite préalable auprès du Coach. Le contrat est soumis au droit français.${m.clauses_perso.trim() ? `

## 13. Conditions particulières
${m.clauses_perso.trim()}` : ''}

## Annexe : formulaire de rétractation
À l’attention de ${m.denomination}, ${m.adresse}, ${m.email_contact} :
Je notifie par la présente ma rétractation du contrat de coaching « ${titre} » accepté le [date].
Nom de l’Athlète : ${athlete}. Date et signature (en cas d’envoi papier).
`
}

// Affichage du texte : « # » titre, « ## » section, « - » puce, sinon paragraphe
export function TexteContrat({ texte }) {
  return (
    <div className="contrat-texte">
      {texte.split('\n').map((l, i) => l.startsWith('## ') ? <h3 key={i}>{l.slice(3)}</h3>
        : l.startsWith('# ') ? <h2 key={i}>{l.slice(2)}</h2>
        : l.startsWith('- ') ? <p key={i} className="puce">{l.slice(2)}</p>
        : l.trim() ? <p key={i}>{l}</p> : null)}
    </div>
  )
}
