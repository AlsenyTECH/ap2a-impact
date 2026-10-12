import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, Mail, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { lienWhatsApp } from '@/lib/format'
import { messageInvitation, messageInvitationMembre } from '@/lib/partenaires'
import { messageErreur, supabase } from '@/lib/supabase'

/**
 * Boutons d'invitation à créer son accès : par email (envoyé par
 * l'application), par WhatsApp, ou en copiant le message.
 */
export function BoutonsInvitation({ personne, membreId, accesId, organisation, compact }: {
  personne: { prenom: string | null; email: string; telephone: string | null }
  membreId?: string
  accesId?: string
  /** Pour un partenaire : son organisation. */
  organisation?: string
  compact?: boolean
}) {
  const qc = useQueryClient()
  const [envoi, setEnvoi] = useState(false)
  const message = organisation ? messageInvitation(personne.prenom, personne.email, organisation) : messageInvitationMembre(personne.prenom, personne.email)

  async function parEmail() {
    setEnvoi(true)
    try {
      const { data, error } = await supabase.functions.invoke('rappels', { body: { type: 'invitation', membre_id: membreId, acces_id: accesId } })
      if (error) {
        const corps = await (error as { context?: Response }).context?.json?.().catch(() => null)
        throw new Error(corps?.erreur ?? corps?.erreurs?.[0] ?? error.message)
      }
      if (data?.echecs) throw new Error(data.erreurs?.[0])
      toast.success(`Invitation envoyée à ${personne.email}`)
      qc.invalidateQueries({ queryKey: ['rappels-envoyes'] })
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={parEmail} disabled={envoi}><Mail /> {compact ? 'Email' : 'Envoyer par email'}</Button>
      {personne.telephone ? (
        <Button asChild size="sm" variant="secondary">
          <a target="_blank" rel="noreferrer" href={lienWhatsApp(personne.telephone, message)}><MessageCircle /> WhatsApp</a>
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(message); toast.success('Message copié') }}>
        <Copy /> Copier
      </Button>
    </div>
  )
}
