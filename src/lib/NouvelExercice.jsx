import { useState } from 'react'
import { supabase } from './supabase'
import { MATERIELS_EX, MUSCLES } from './listes'

// Formulaire de création d'un exercice propre au coach ; appelle onCree avec l'exercice enregistré
export default function NouvelExercice({ nomInitial = '', coachId, onCree, onAnnuler }) {
  const [f, setF] = useState({ nom: nomInitial, muscles: [], materiel: 'Poids du corps', consigne: '', lien_video: '' })
  const [err, setErr] = useState('')
  const [occupe, setOccupe] = useState(false)
  const maj = (k, v) => setF((x) => ({ ...x, [k]: v }))

  async function enregistrer(e) {
    e.preventDefault()
    if (!f.muscles.length) return setErr('Choisis au moins un muscle travaillé.')
    const lien = f.lien_video.trim()
    if (lien && !/^https?:\/\//.test(lien)) return setErr('Le lien vidéo doit commencer par https://')
    setOccupe(true)
    const { data, error } = await supabase.from('exercices').insert({
      id: `perso-${crypto.randomUUID()}`, nom: f.nom.trim(), muscles: f.muscles, secondaires: [], materiel: f.materiel,
      categorie: 'Musculation', consigne: f.consigne.trim() || null, lien_video: lien || null, cree_par: coachId,
    }).select('*').single()
    setOccupe(false)
    if (error) return setErr(error.message)
    onCree(data)
  }

  return (
    <form className="produit" onSubmit={enregistrer}>
      <label className="field"><span className="label">Nom de l’exercice</span>
        <input type="text" required autoFocus value={f.nom} onChange={(e) => maj('nom', e.target.value)} /></label>
      <div className="field"><span className="label">Muscles travaillés</span>
        <div className="chips">{MUSCLES.map((m) => (
          <button type="button" key={m} className="chip" aria-pressed={f.muscles.includes(m)}
            onClick={() => maj('muscles', f.muscles.includes(m) ? f.muscles.filter((x) => x !== m) : [...f.muscles, m])}>{m}</button>
        ))}</div></div>
      <label className="field"><span className="label">Matériel</span>
        <select className="inp" value={f.materiel} onChange={(e) => maj('materiel', e.target.value)}>{MATERIELS_EX.map((m) => <option key={m}>{m}</option>)}</select></label>
      <label className="field"><span className="label">Consigne</span>
        <textarea rows={3} value={f.consigne} onChange={(e) => maj('consigne', e.target.value)} placeholder="Placement, exécution, respiration…" /></label>
      <label className="field"><span className="label">Lien vidéo (optionnel)</span>
        <input type="url" value={f.lien_video} onChange={(e) => maj('lien_video', e.target.value)} placeholder="https://youtube.com/…" /></label>
      {err && <p className="err">{err}</p>}
      <div className="row">
        <button className="btn" disabled={occupe}>Créer l’exercice</button>
        {onAnnuler && <button type="button" className="btn ghost" onClick={onAnnuler}>Annuler</button>}
      </div>
    </form>
  )
}
