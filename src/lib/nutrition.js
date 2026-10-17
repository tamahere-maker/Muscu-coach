import { fmt } from './ui'

// Macros d'une quantité d'aliment (valeurs de la bibliothèque pour 100 g)
export function macrosDe(a, grammes) {
  const k = Number(grammes) / 100
  return { kcal: a.kcal * k, proteines: a.proteines * k, glucides: a.glucides * k, lipides: a.lipides * k }
}

export function somme(liste) {
  return liste.reduce((t, m) => ({ kcal: t.kcal + m.kcal, proteines: t.proteines + m.proteines, glucides: t.glucides + m.glucides, lipides: t.lipides + m.lipides }),
    { kcal: 0, proteines: 0, glucides: 0, lipides: 0 })
}

// « 2 œufs » pour un aliment qui se compte, « 150 g » sinon
export function quantite(a, grammes) {
  if (!a.unite_g) return `${fmt(grammes)} g`
  const n = Number(grammes) / Number(a.unite_g)
  return `${fmt(n, 1)} ${n > 1 ? a.unite_pluriel : a.unite_nom}`
}

export const resume = (m) => `${fmt(m.kcal)} kcal · P ${fmt(m.proteines)} · G ${fmt(m.glucides)} · L ${fmt(m.lipides)}`
