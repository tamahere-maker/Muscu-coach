import { useSession } from '../lib/session'
import Conversation, { BandeauNotifications } from '../lib/Messages'

// Messagerie de l'athlète avec ses coachs
export default function MesMessages() {
  const { profil } = useSession()
  return (
    <>
      <div>
        <h1>Messages</h1>
        <p className="sub">Ta conversation avec tes coachs.</p>
      </div>
      <BandeauNotifications />
      <Conversation athleteId={profil.id} />
    </>
  )
}
