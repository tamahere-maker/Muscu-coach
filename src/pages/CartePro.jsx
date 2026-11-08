import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/ui'
import { BadgeCarte, CGU_VERSION, DIPLOMES, LIEN_REGISTRE, etatCarte, useCartePro } from '../lib/cartePro'

// Carte professionnelle du coach : numéro, diplôme, expiration, déclaration sur l'honneur et CGU coach
export default function CartePro() {
  const { profil } = useSession()
  const [carte, setCarte] = useCartePro(profil.id)
  const [f, setF] = useState(null)
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    if (carte === undefined) return
    setF({ numero: carte?.numero ?? '', diplome: carte?.diplome ?? '', expire_le: carte?.expire_le ?? '',
      attestation: !!carte?.attestation_at, cgu: carte?.cgu_version === CGU_VERSION })
  }, [carte])

  if (!f) return null
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function enregistrer(e) {
    e.preventDefault()
    if (!f.attestation || !f.cgu) return toast('Coche la déclaration sur l’honneur et l’acceptation des CGU coach')
    setOccupe(true)
    const maintenant = new Date().toISOString()
    const { data, error } = await supabase.from('cartes_pro').upsert({
      coach_id: profil.id, numero: f.numero.trim(), diplome: f.diplome.trim(), expire_le: f.expire_le,
      attestation_at: carte?.attestation_at ?? maintenant,
      cgu_version: CGU_VERSION, cgu_at: carte?.cgu_version === CGU_VERSION ? carte.cgu_at : maintenant,
    }).select('*').single()
    setOccupe(false)
    if (error) return toast(error.message)
    setCarte(data)
    toast(etatCarte(data).code === 'verifiee' ? 'Carte enregistrée' : 'Carte enregistrée : elle sera vérifiée sur le registre public')
  }

  return (
    <>
      <div>
        <Link className="linkbtn" to="/compte">← Mon compte</Link>
        <h1 style={{ marginTop: 8 }}>Ma carte professionnelle</h1>
        <p className="sub">Coacher contre rémunération, même à distance, est réservé aux titulaires d’un diplôme reconnu
          qui ont déclaré leur activité (Code du sport, articles L212-1 et L212-11). Ta carte est affichée à tes athlètes
          et reprise dans tes contrats.</p>
        {carte && <p className="sub"><BadgeCarte carte={carte} /></p>}
      </div>

      <form className="card" onSubmit={enregistrer}>
        <h2>Ma carte</h2>
        <div className="grid2">
          <label className="field"><span className="label">Numéro de carte professionnelle</span>
            <input required type="text" value={f.numero} onChange={maj('numero')} placeholder="Ex. : 07519ED0123" autoComplete="off" /></label>
          <label className="field"><span className="label">Valable jusqu’au</span>
            <input required type="date" value={f.expire_le} onChange={maj('expire_le')} /></label>
        </div>
        <label className="field"><span className="label">Diplôme</span>
          <input required type="text" list="diplomes" value={f.diplome} onChange={maj('diplome')} placeholder="Ex. : BPJEPS Activités de la forme" />
          <datalist id="diplomes">{DIPLOMES.map((d) => <option key={d} value={d} />)}</datalist></label>
        <p className="sub" style={{ margin: 0 }}>Le numéro et la date figurent sur ta carte. Pas encore de carte ? Fais ta déclaration sur{' '}
          <a href="https://eaps.sports.gouv.fr" target="_blank" rel="noreferrer">eaps.sports.gouv.fr</a>. Les cartes sont vérifiées sur le{' '}
          <a href={LIEN_REGISTRE} target="_blank" rel="noreferrer">registre public</a>.</p>

        <label className="coche"><input type="checkbox" checked={f.attestation} onChange={maj('attestation')} />
          <span>Je déclare sur l’honneur être titulaire de ce diplôme et de cette carte en cours de validité, ne faire l’objet d’aucune
            incapacité d’exercer (article L212-9 du Code du sport) et être assuré en responsabilité civile professionnelle.</span></label>
        <label className="coche"><input type="checkbox" checked={f.cgu} onChange={maj('cgu')} />
          <span>J’accepte les <Link to="/cgu-coach" target="_blank">conditions générales d’utilisation coach</Link>.</span></label>

        <div className="row"><button className="btn" disabled={occupe}>Enregistrer</button></div>
      </form>
    </>
  )
}
