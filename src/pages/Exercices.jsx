import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Anim, toast } from '../lib/ui'
import { useSession } from '../lib/session'
import { NIVEAUX } from '../lib/listes'
import NouvelExercice from '../lib/NouvelExercice'
import RechercheWger from '../lib/RechercheWger'
import { chercherExercices } from '../lib/recherche'
import { garderExercice } from '../lib/wger'
import { Video } from '../lib/VideoExercice'
import { MaVideo, Variantes, useFavoris } from '../lib/FicheCoach'

const PAGE = 60
export const CHAMPS_EXOS = 'id, nom, consigne, consigne_en, muscles, secondaires, materiel, niveau, categorie, essentiel, sprite, cree_par, lien_video, image_url, licence, wger_id'
const ORIGINES = { fav: 'Mes favoris', perso: 'Mes exercices', wger: 'Importés de wger', base: 'Bibliothèque de base' }
const etiquette = (e) => (e.wger_id ? 'wger · ' : e.cree_par ? 'Perso · ' : '')

export default function Exercices() {
  const { profil } = useSession()
  const coach = profil.role === 'coach'
  const [mode, setMode] = useState(null) // null | 'creation' | 'wger'
  const [exos, setExos] = useState([])
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState('')
  const [materiel, setMateriel] = useState('')
  const [niveau, setNiveau] = useState('')
  const [origine, setOrigine] = useState('')
  const [n, setN] = useState(PAGE)
  const [choisi, setChoisi] = useState(null)
  const [fav, basculerFav] = useFavoris(coach ? profil.id : null)
  const dlg = useRef()

  useEffect(() => {
    supabase.from('exercices').select(CHAMPS_EXOS)
      .order('id').then(({ data }) => setExos((data ?? []).sort((a, b) => !!b.cree_par - !!a.cree_par)))
  }, [])

  const muscles = useMemo(() => [...new Set(exos.flatMap((e) => e.muscles))].sort(), [exos])
  const materiels = useMemo(() => [...new Set(exos.map((e) => e.materiel))].sort(), [exos])
  const wgerConnus = useMemo(() => new Set(exos.filter((e) => e.wger_id).map((e) => e.wger_id)), [exos])
  const liste = useMemo(() => {
    const filtres = exos.filter((e) => (!muscle || e.muscles.includes(muscle) || e.secondaires?.includes(muscle))
      && (!materiel || e.materiel === materiel) && (!niveau || e.niveau === niveau)
      && (!origine || (origine === 'fav' ? fav.has(e.id) : origine === 'wger' ? !!e.wger_id
        : origine === 'perso' ? e.cree_par === profil.id && !e.wger_id : !e.cree_par)))
    const r = chercherExercices(filtres, q)
    // Sans recherche, les favoris passent devant
    return q.trim() ? r : [...r.filter((e) => fav.has(e.id)), ...r.filter((e) => !fav.has(e.id))]
  }, [exos, q, muscle, materiel, niveau, origine, fav, profil.id])

  useEffect(() => setN(PAGE), [q, muscle, materiel, niveau, origine])
  useEffect(() => { if ((choisi || mode) && !dlg.current.open) dlg.current.showModal() }, [choisi, mode])

  async function importer(e) {
    try {
      const x = await garderExercice(e, profil.id)
      setExos((l) => (l.some((y) => y.id === x.id) ? l : [x, ...l]))
      toast(wgerConnus.has(e.wger_id) ? `${x.nom} est déjà dans la bibliothèque` : `${x.nom} ajouté à la bibliothèque`)
      setMode(null); setChoisi(x)
    } catch (err) { toast(err.message) }
  }

  const filtresActifs = muscle || materiel || niveau || origine
  const nbPerso = exos.filter((e) => e.cree_par && !e.wger_id).length
  const nbWger = exos.filter((e) => e.wger_id).length

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Exercices</h1>
          <p className="sub">{exos.length} exercices{nbPerso ? `, dont ${nbPerso} personnalisé${nbPerso > 1 ? 's' : ''}` : ''}{nbWger ? `${nbPerso ? ' et' : ', dont'} ${nbWger} de wger` : ''}.</p>
        </div>
        {coach && <div className="row">
          <button className="btn ghost" onClick={() => setMode('wger')}>Chercher sur wger</button>
          <button className="btn" onClick={() => setMode('creation')}>Créer un exercice</button>
        </div>}
      </div>
      <input type="search" placeholder="Nom, muscle, matériel, « dc »…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un exercice" />
      <div className="filtres">
        <select className="inp" value={muscle} onChange={(e) => setMuscle(e.target.value)} aria-label="Muscle">
          <option value="">Tous les muscles</option>{muscles.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className="inp" value={materiel} onChange={(e) => setMateriel(e.target.value)} aria-label="Matériel">
          <option value="">Tout le matériel</option>{materiels.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className="inp" value={niveau} onChange={(e) => setNiveau(e.target.value)} aria-label="Niveau">
          <option value="">Tous les niveaux</option>{NIVEAUX.map((m) => <option key={m}>{m}</option>)}
        </select>
        {coach && <select className="inp" value={origine} onChange={(e) => setOrigine(e.target.value)} aria-label="Origine">
          <option value="">Tous les exercices</option>{Object.entries(ORIGINES).map(([k, v]) => <option key={k} value={k}>{v}{k === 'fav' ? ` (${fav.size})` : ''}</option>)}
        </select>}
        {filtresActifs && <button className="linkbtn" onClick={() => { setMuscle(''); setMateriel(''); setNiveau(''); setOrigine('') }}>Effacer les filtres</button>}
      </div>
      {(q.trim() || filtresActifs) && <p className="sub" style={{ margin: 0 }}>{liste.length} résultat{liste.length > 1 ? 's' : ''}</p>}
      <div className="lib">
        {liste.slice(0, n).map((e) => (
          <button key={e.id} className="lib-item" onClick={() => setChoisi(e)}>
            <Anim ex={e} />
            <div><strong>{fav.has(e.id) && <span className="fav" aria-label="Favori">★ </span>}{e.nom}</strong><span>{etiquette(e)}{e.muscles.join(', ')} · {e.materiel}</span></div>
          </button>
        ))}
      </div>
      {liste.length === 0 && <div className="empty">
        <p>Aucun exercice ne correspond.</p>
        {coach && q.trim() && <button className="btn ghost" onClick={() => setMode('wger')}>Chercher « {q.trim()} » sur wger</button>}
      </div>}
      {n < liste.length && <button className="btn ghost more" onClick={() => setN(n + PAGE)}>Voir plus ({liste.length - n})</button>}

      <dialog ref={dlg} onClose={() => { setChoisi(null); setMode(null) }}>
        {mode === 'creation' && (
          <div className="dlg">
            <div className="dlg-head"><h2>Nouvel exercice</h2>
              <button className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button></div>
            <NouvelExercice nomInitial={q} coachId={profil.id} onCree={(e) => { setExos((x) => [e, ...x]); toast(`${e.nom} créé`); dlg.current.close() }} />
          </div>
        )}
        {mode === 'wger' && (
          <div className="dlg">
            <div className="dlg-head"><h2>Chercher sur wger</h2>
              <button className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button></div>
            <p className="sub" style={{ margin: 0 }}>Base ouverte d’environ 800 exercices, avec images et parfois une vidéo. Un clic ajoute l’exercice à ta bibliothèque.</p>
            <RechercheWger terme={q} connus={wgerConnus} onChoisir={importer} />
          </div>
        )}
        {choisi && !mode && (
          <div className="dlg">
            <div className="dlg-head"><h2>{choisi.nom}</h2>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                {coach && <button className="etoile" aria-pressed={fav.has(choisi.id)} aria-label={fav.has(choisi.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  title={fav.has(choisi.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={() => basculerFav(choisi)}>{fav.has(choisi.id) ? '★' : '☆'}</button>}
                <button className="icon-btn" aria-label="Fermer" onClick={() => dlg.current.close()}>×</button>
              </div></div>
            <Anim ex={choisi} cls="big" />
            <div className="row">
              {choisi.muscles.map((m) => <span key={m} className="chip">{m}</span>)}
              {choisi.secondaires.map((m) => <span key={m} className="pill">{m}</span>)}
            </div>
            <p className="sub">{choisi.wger_id ? 'Importé de wger · ' : choisi.cree_par ? 'Exercice personnalisé · ' : ''}{choisi.materiel} · {choisi.categorie}{choisi.niveau ? ` · ${choisi.niveau}` : ''}</p>
            {choisi.consigne ? <p style={{ whiteSpace: 'pre-line' }}>{choisi.consigne}</p> : choisi.consigne_en && <p className="sub" lang="en" style={{ whiteSpace: 'pre-line' }}>{choisi.consigne_en}</p>}
            {choisi.lien_video && <div className="video-ex"><Video url={choisi.lien_video} titre={choisi.nom} /></div>}
            {choisi.licence && <small className="sub licence">Source : <a href={`https://wger.de/fr/exercise/${choisi.wger_id}/view/`} target="_blank" rel="noreferrer">{choisi.licence}</a></small>}
            {coach && <MaVideo exercice={choisi} coachId={profil.id} />}
            {coach && <Variantes exercice={choisi} coachId={profil.id} exos={exos} />}
            {choisi.cree_par === profil.id && !choisi.wger_id && <button className="linkbtn" onClick={async () => {
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
