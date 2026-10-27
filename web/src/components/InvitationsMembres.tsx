import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Mail, MessageCircle, MessageSquareText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { lienWhatsApp } from '@/lib/format'
import { messageErreur, supabase } from '@/lib/supabase'
import type { Membre } from '@/lib/types'

type Canal = 'whatsapp' | 'sms' | 'email'
interface Resultat { membre_id: string; nom: string; statut: 'envoye' | 'lien' | 'echec'; erreur?: string; lien?: string; message?: string; telephone?: string }

const CANAUX: [Canal, string, typeof Mail, string][] = [
  ['whatsapp', 'WhatsApp', MessageCircle, "Un message prêt par membre : vous appuyez sur Envoyer dans WhatsApp, l'un après l'autre."],
  ['sms', 'SMS', MessageSquareText, 'Envoyés automatiquement par Brevo (crédits SMS).'],
  ['email', 'Email', Mail, "Envoyés automatiquement. Seulement aux membres qui ont une adresse email."],
]

/** Pourquoi ce membre ne peut pas recevoir l'invitation par ce canal (null : il peut). */
function empechement(m: Membre, canal: Canal, etat: string | undefined) {
  if (!m.actif) return 'inactif'
  if (etat === 'actif') return 'accès déjà activé'
  if (canal === 'email' && !m.email) return "pas d'email"
  if (canal !== 'email' && !m.telephone) return 'pas de téléphone'
  return null
}

/**
 * Invitations groupées. Le membre sans email se connectera avec son numéro de
 * téléphone. Chaque lien est personnel et ne sert qu'une fois.
 */
export function InvitationsMembres({ membres, etats, fermer }: { membres: Membre[]; etats: Map<string, string>; fermer: () => void }) {
  const qc = useQueryClient()
  const [canal, setCanal] = useState<Canal>(membres.some((m) => m.email) && membres.every((m) => m.email) ? 'email' : 'whatsapp')
  const [envoi, setEnvoi] = useState(false)
  const [resultats, setResultats] = useState<Resultat[] | null>(null)
  const [ouverts, setOuverts] = useState<Set<string>>(new Set())

  const possibles = membres.filter((m) => !empechement(m, canal, etats.get(m.id)))
  const exclus = membres.filter((m) => empechement(m, canal, etats.get(m.id)))

  async function lancer() {
    setEnvoi(true)
    try {
      const { data, error } = await supabase.functions.invoke('rappels', { body: { type: 'invitations', canal, membre_ids: possibles.map((m) => m.id) } })
      if (error) {
        const corps = await (error as { context?: Response }).context?.json?.().catch(() => null)
        throw new Error(corps?.erreur ?? error.message)
      }
      const r = (data?.resultats ?? []) as Resultat[]
      setResultats(r)
      const ok = r.filter((x) => x.statut !== 'echec').length
      if (canal !== 'whatsapp') toast[ok ? 'success' : 'error'](`${ok} invitation(s) envoyée(s)${r.length - ok ? `, ${r.length - ok} échec(s)` : ''}`)
      qc.invalidateQueries({ queryKey: ['membres'] })
      qc.invalidateQueries({ queryKey: ['etats-acces'] })
      qc.invalidateQueries({ queryKey: ['rappels-envoyes'] })
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  const echecs = resultats?.filter((r) => r.statut === 'echec') ?? []
  const liens = resultats?.filter((r) => r.statut === 'lien') ?? []

  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Inviter {membres.length > 1 ? `${membres.length} membres` : `${membres[0]?.prenom} ${membres[0]?.nom}`}</DialogTitle>
          <DialogDescription>
            Chacun reçoit un lien personnel, valable une seule fois, pour choisir son mot de passe. Sans email, il se connectera avec son numéro de téléphone.
          </DialogDescription>
        </DialogHeader>

        {!resultats ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {CANAUX.map(([c, libelle, Icone]) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCanal(c)}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-sm font-medium transition-colors ${canal === c ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/50'}`}
                >
                  <Icone className="size-5" /> {libelle}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{CANAUX.find(([c]) => c === canal)?.[3]}</p>
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <b>{possibles.length}</b> sur {membres.length} membre(s) sélectionné(s) recevront l'invitation{possibles.length ? ' :' : '.'}
              {possibles.length ? <div className="mt-0.5 text-xs">{possibles.map((m) => `${m.prenom} ${m.nom}`).join(', ')}</div> : null}
            </div>
            {exclus.length ? (
              <div className="rounded-lg border border-[#e9a812]/40 bg-[#e9a812]/10 px-3 py-2 text-sm">
                <b>{exclus.length} écarté(s)</b> — ils ne recevront rien :
                <ul className="mt-1 max-h-32 overflow-y-auto text-xs">
                  {exclus.map((m) => <li key={m.id}>{m.prenom} {m.nom} — {empechement(m, canal, etats.get(m.id))}</li>)}
                </ul>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={fermer}>Annuler</Button>
              <Button onClick={lancer} disabled={envoi || !possibles.length}>
                {envoi ? 'Patientez…' : canal === 'whatsapp' ? `Préparer ${possibles.length} message(s)` : `Envoyer ${possibles.length} invitation(s)`}
              </Button>
            </div>
          </>
        ) : (
          <>
            {liens.length ? (
              <div className="space-y-2">
                {(() => {
                  // Envoi à la suite : un appui ouvre WhatsApp sur la personne suivante, message prêt.
                  const suivant = liens.find((r) => !ouverts.has(r.membre_id))
                  const faits = liens.length - liens.filter((r) => !ouverts.has(r.membre_id)).length
                  return (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium">{suivant ? 'Envoi à la suite' : 'Tous les messages ont été ouverts'}</span>
                        <span className="text-muted-foreground">{faits} / {liens.length}</span>
                      </div>
                      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${(100 * faits) / liens.length}%` }} /></div>
                      {suivant ? (
                        <Button asChild className="w-full">
                          <a target="_blank" rel="noreferrer" href={lienWhatsApp(suivant.telephone!, suivant.message!)} onClick={() => setOuverts((o) => new Set(o).add(suivant.membre_id))}>
                            <MessageCircle /> {faits ? 'Envoyer au suivant' : 'Commencer'} : {suivant.nom}
                          </a>
                        </Button>
                      ) : null}
                      <p className="mt-2 text-xs text-muted-foreground">Dans WhatsApp, appuyez sur <b>Envoyer</b>, puis revenez ici : le bouton passe à la personne suivante.</p>
                    </div>
                  )
                })()}
                <p className="text-xs text-muted-foreground">Ou une personne précise :</p>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {liens.map((r) => (
                    <div key={r.membre_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{ouverts.has(r.membre_id) ? <Check className="mr-1 inline size-4 text-primary" /> : null}{r.nom}</span>
                      <span className="flex shrink-0 gap-1">
                        <Button size="sm" variant="ghost" aria-label="Copier le message" onClick={async () => { await navigator.clipboard.writeText(r.message!); toast.success('Message copié') }}><Copy /></Button>
                        <Button asChild size="sm" variant={ouverts.has(r.membre_id) ? 'secondary' : 'default'}>
                          <a target="_blank" rel="noreferrer" href={lienWhatsApp(r.telephone!, r.message!)} onClick={() => setOuverts((o) => new Set(o).add(r.membre_id))}><MessageCircle /> WhatsApp</a>
                        </Button>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Ces liens donnent accès au compte de chacun : ne les envoyez qu'à la bonne personne.</p>
              </div>
            ) : null}
            {resultats.some((r) => r.statut === 'envoye') ? (
              <p className="text-sm"><Check className="mr-1 inline size-4 text-primary" /> {resultats.filter((r) => r.statut === 'envoye').length} invitation(s) envoyée(s).</p>
            ) : null}
            {echecs.length ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                <b>{echecs.length} non envoyée(s) :</b>
                <ul className="mt-1 text-xs">{echecs.map((r) => <li key={r.membre_id}>{r.nom} — {r.erreur}</li>)}</ul>
              </div>
            ) : null}
            <div className="flex justify-end"><Button onClick={fermer}>Terminé</Button></div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
