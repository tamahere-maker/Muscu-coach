import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Anim, toast } from '../lib/ui'
import { useSession } from '../lib/session'
import NouvelExercice from '../lib/NouvelExercice'

const PAGE = 60
const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Exercices() {
  const { profil } = useSession()
  const [creation, setCreation] = useState(false)
  const [exos, setExos] = useState([])
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState('')
  const [materiel, setMateriel] = useState('')
  const [n, setN] = useState(PAGE)
  const [choisi, setChoisi] = useState(null)
  const dlg = useRef()

  useEffect(() => {
    supabase.from('exercices').select('id, nom, consigne, consigne_en, muscles, secondaires, materiel, niveau, categorie, essentiel, sprite, cree_par, lien_video')
      .order('id').then(({ data }) => setExos((data ?? []).sort((a, b) => !!b.cree_par - !!a.cree_par)))
  }, [])

  const muscles = useMemo(() => [...new Set(exos.flatMap((e) => e.muscles))].sort(), [exos])
  const materiels = useMemo(() => [...new Set(exos.map((e) => e.materiel))].sort(), [exos])
  const liste = useMemo(() => {
    const t = sansAccent(q.trim())
    return exos.filter((e) => (!t || sansAccent(e.nom).includes(t)) && (!muscle || e.muscles.includes(muscle)) && (!materiel || e.materiel === materiel))
  }, [exos, q, muscle, materiel])

  useEffect(() => setN(PAGE), [q, muscle, materiel])
  useEffect(() => { if ((choisi || creation) && !dlg.current.open) dlg.current.showModal() }, [choisi, creation])

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Exercices</h1>
          <p className="sub">{exos.length} exercices{exos.some((e) => e.cree_par) ? `, dont ${exos.filter((e) => e.cree_par).length} personnalisé${exos.filter((e) => e.cree_par).length > 1 ? 's' : ''}` : ''}.</p>
        </div>
        {profil.role === 'coach' && <button className="btn" onClick={() => setCreation(true)}>Créer un exercice</button>}
      </div>
      <div className="grid2">
        <input type="search" placeholder="Rechercher un exercice" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <select className="inp" value={muscle} onChange={(e) => setMuscle(e.target.value)} aria-label="Muscle">
            <option value="">Tous les muscles</option>{muscles.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select className="inp" value={materiel} onChange={(e) => setMateriel(e.target.value)} aria-label="Matériel">
            <option value="">Tout le matériel</option>{materiels.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="lib">
        {liste.slice(0, n).map((e) => (
          <button key={e.id} className="lib-item" onClick={() => setChoisi(e)}>
            <Anim ex={e} />
            <div><strong>{e.nom}</strong><span>{e.cree_par ? 'Perso · ' : ''}{e.muscles.join(', ')} · {e.materiel}</span></div>
          </button>
        ))}
      </div>
      {liste.length === 0 && <p className="empty">Aucun exercice ne correspond.</p>}
      {n < liste.length && <button className="btn ghost more" onClick={() => setN(n + PAGE)}>Voir plus ({liste.length - n})</button>}

      <dialog ref={dlg} onClose={() => { setChoisi(null); setCreation(false) }}>
        {creation && (
          <div className="dlg">
            <div className="dlg-head"><h2>Nouvel exercice</h2>
              <button className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button></div>
            <NouvelExercice nomInitial={q} coachId={profil.id} onCree={(e) => { setExos((x) => [e, ...x]); toast(`${e.nom} créé`); dlg.current.close() }} />
          </div>
        )}
        {choisi && (
          <div className="dlg">
            <div className="dlg-head"><h2>{choisi.nom}</h2>
              <button className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button></div>
            <Anim ex={choisi} cls="big" />
            <div className="row">
              {choisi.muscles.map((m) => <span key={m} className="chip">{m}</span>)}
              {choisi.secondaires.map((m) => <span key={m} className="pill">{m}</span>)}
            </div>
            <p className="sub">{choisi.cree_par ? 'Exercice personnalisé · ' : ''}{choisi.materiel} · {choisi.categorie}{choisi.niveau ? ` · ${choisi.niveau}` : ''}</p>
            {choisi.consigne ? <p>{choisi.consigne}</p> : choisi.consigne_en && <p className="sub" lang="en">{choisi.consigne_en}</p>}
            {choisi.lien_video && <a className="btn ghost" href={choisi.lien_video} target="_blank" rel="noreferrer">Voir la vidéo</a>}
            {choisi.cree_par === profil.id && <button className="linkbtn" onClick={async () => {
              if (!confirm(`Supprimer « ${choisi.nom} » ?`)) return
              const { error } = await supabase.from('exercices').delete().eq('id', choisi.id)
              if (error) return toast('Cet exercice est utilisé dans un programme : retire-le d’abord des séances.')
              setExos((x) => x.filter((e) => e.id !== choisi.id)); dlg.current.close()
            }}>Supprimer cet exercice</button>}
          </div>
        )}
      </dialog>
    </>
  )
}
