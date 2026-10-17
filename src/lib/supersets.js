// Découpe les exercices d'une séance (triés par ordre) en blocs : un exercice seul,
// ou un superset = exercices consécutifs partageant le même `groupe`.
export function blocs(lignes) {
  const res = []
  lignes.forEach((l, j) => {
    const dernier = res[res.length - 1]
    if (l.groupe != null && dernier && dernier.groupe === l.groupe) dernier.items.push({ l, j })
    else res.push({ groupe: l.groupe, items: [{ l, j }] })
  })
  return res
}
