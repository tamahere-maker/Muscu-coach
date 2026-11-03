import { macrosDe, somme } from './nutrition'
import { decaler, objectifs, repasDuJour, typeDuJour } from './jours'
import { jourIso } from './ui'

export const MACROS = [['kcal', 'Calories'], ['proteines', 'Protéines'], ['glucides', 'Glucides'], ['lipides', 'Lipides']]
// Écart toléré sur les calories pour qu'une journée compte « dans la cible »
export const TOLERANCE = 0.1

export const lundi = (iso) => decaler(iso, -(((new Date(iso + 'T12:00').getDay() + 6) % 7)))
// Écart relatif à la cible (-0,12 = 12 % en dessous), null sans cible
export const ecart = (v, cible) => (cible ? v / cible - 1 : null)

// Adhérence d'une journée au plan : repas suivis en entier, aliments confirmés, macros mangées et cibles.
// `jr` : lignes du journal de ce jour, par repas_aliment_id ; `alim` : aliments par id.
export function journee(iso, plan, tousRepas, jr, alim, cal) {
  const type = typeDuJour(iso, cal).type
  const repas = repasDuJour(plan, tousRepas, type).filter((r) => r.lignes.length)
  const lignes = repas.flatMap((r) => r.lignes)
  const ok = (l) => !!jr[l.id]?.confirme
  const mange = somme(lignes.filter(ok).map((l) => {
    const j = jr[l.id], a = alim[j.aliment_id ?? l.aliment_id]
    return a ? macrosDe(a, Number(j.grammes ?? l.grammes)) : { kcal: 0, proteines: 0, glucides: 0, lipides: 0 }
  }))
  return {
    d: iso, type,
    repas: repas.length, repasSuivis: repas.filter((r) => r.lignes.every(ok)).length,
    aliments: lignes.length, confirmes: lignes.filter(ok).length,
    changes: lignes.filter((l) => ok(l) && jr[l.id].aliment_id != null && jr[l.id].aliment_id !== l.aliment_id).length,
    mange, cible: objectifs(plan, type),
  }
}

// Totaux d'une liste de journées (moyennes pondérées : somme mangée / somme des cibles)
export function bilan(jours) {
  const t = (k) => jours.reduce((s, j) => s + j[k], 0)
  const mange = somme(jours.map((j) => j.mange))
  const cible = Object.fromEntries(MACROS.map(([k]) => [k, jours.reduce((s, j) => s + (Number(j.cible[k]) || 0), 0)]))
  const avecCible = jours.filter((j) => j.cible.kcal)
  return {
    n: jours.length,
    repas: t('repas'), repasSuivis: t('repasSuivis'),
    aliments: t('aliments'), confirmes: t('confirmes'), changes: t('changes'),
    rienNote: jours.filter((j) => j.aliments && !j.confirmes).length,
    dansCible: avecCible.filter((j) => Math.abs(ecart(j.mange.kcal, j.cible.kcal)) <= TOLERANCE).length,
    avecCible: avecCible.length,
    ecarts: Object.fromEntries(MACROS.map(([k]) => [k, ecart(mange[k], cible[k])])),
    mange, cible,
  }
}

// Journées de `debut` à aujourd'hui (la plus récente en premier)
export function periode(debut, fin = jourIso()) {
  const l = []
  for (let d = fin; d >= debut; d = decaler(d, -1)) l.push(d)
  return l
}
