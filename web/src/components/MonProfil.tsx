import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BellRing, CalendarClock, IdCard, Mail, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { PhotoFiche } from '@/components/PhotoFiche'
import { useAuth } from '@/lib/auth'
import { LIBELLES_ROLE } from '@/lib/format'
import { messageErreur, supabase, verifier } from '@/lib/supabase'

interface Envoi { id: number; envoye_le: string; type: string; email: string | null; nb: number; statut: string; erreur: string | null }

const LIBELLES_ENVOI: Record<string, string> = {
  hebdo: 'Suivis de la semaine', seances: 'Séances du jour', 'hebdo-apercu': 'Aperçu suivis', 'seances-apercu': 'Aperçu séances',
}

/** Appelle la fonction d'envoi des rappels (aperçu pour soi, ou envoi à tous pour un administrateur). */
async function appelerRappels(type: 'hebdo' | 'seances', apercu: boolean) {
  const { data, error } = await supabase.functions.invoke('rappels', { body: { type, apercu } })
  if (error) {
    // Message d'erreur renvoyé par la fonction, s'il y en a un.
    const corps = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(corps?.erreur ?? corps?.erreurs?.[0] ?? error.message)
  }
  return data as { envoyes: number; echecs: number; erreurs: string[] }
}

/** Mon profil : numéro de membre, rappels par email, aperçu, et (admin) journal des envois. */
export function MonProfil({ ouvert, fermer }: { ouvert: boolean; fermer: () => void }) {
  const { membre, a } = useAuth()
  const qc = useQueryClient()
  const [envoi, setEnvoi] = useState<string | null>(null)
  const admin = a('admin')

  const { data: actif } = useQuery({
    queryKey: ['mes-rappels', membre?.id],
    enabled: ouvert && !!membre,
    queryFn: async () => (verifier(await supabase.from('membres').select('rappels_email').eq('id', membre!.id).single()) as { rappels_email: boolean }).rappels_email,
  })
  const { data: journal = [] } = useQuery({
    queryKey: ['rappels-envoyes'],
    enabled: ouvert && a('admin', 'bureau', 'coordinateur'),
    queryFn: async () => verifier(await supabase.from('rappels_envoyes').select('*').order('envoye_le', { ascending: false }).limit(15)) as Envoi[],
  })

  async function regler(v: boolean) {
    const { error } = await supabase.rpc('regler_rappels', { p_actif: v })
    if (error) return toast.error(messageErreur(error))
    qc.setQueryData(['mes-rappels', membre?.id], v)
    toast.success(v ? 'Rappels activés' : 'Rappels désactivés')
  }

  async function lancer(type: 'hebdo' | 'seances', apercu: boolean) {
    if (!apercu && !confirm(type === 'hebdo' ? 'Envoyer maintenant le rappel des suivis à tous les membres concernés ?' : "Envoyer maintenant le rappel des séances d'aujourd'hui ?")) return
    setEnvoi(`${type}-${apercu}`)
    try {
      const r = await appelerRappels(type, apercu)
      if (r.echecs && !r.envoyes) throw new Error(r.erreurs[0])
      toast.success(apercu ? `Aperçu envoyé à ${membre?.email}` : `${r.envoyes} email(s) envoyé(s)${r.echecs ? `, ${r.echecs} échec(s)` : ''}`)
      qc.invalidateQueries({ queryKey: ['rappels-envoyes'] })
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(null)
    }
  }

  if (!membre) return null
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mon profil</DialogTitle>
          <DialogDescription>Vos informations et vos rappels par email.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <PhotoFiche dossier="membres" id={membre.id} chemin={membre.photo_chemin} prenom={membre.prenom} nom={membre.nom} modifiable taille="lg" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="font-semibold">{membre.prenom} {membre.nom}</div>
            <div className="text-sm text-muted-foreground">{LIBELLES_ROLE[membre.role]} · <b className="text-foreground">{membre.numero_adherent}</b></div>
            <div className="truncate text-xs text-muted-foreground">{membre.email ?? 'Pas d\'adresse email'}</div>
            <Button asChild size="sm" variant="secondary" className="mt-2"><Link to={`/cartes?membre=${membre.id}`} onClick={fermer}><IdCard /> Ma carte de membre</Link></Button>
          </div>
        </div>

        <section className="space-y-3">
          <label className="flex items-start justify-between gap-4">
            <span className="flex gap-3">
              <BellRing className="mt-0.5 size-5 shrink-0 text-primary" />
              <span className="text-sm">
                <span className="font-medium">Recevoir les rappels par email</span>
                <span className="block text-muted-foreground">
                  Chaque lundi matin : vos suivis de la semaine{a('admin', 'bureau', 'coordinateur') ? ' et les retards de plus de 15 jours' : ''}.
                  Le matin d'une séance : un rappel pour faire l'appel.
                </span>
              </span>
            </span>
            <Switch checked={actif ?? true} onCheckedChange={regler} disabled={actif === undefined || !membre.email} />
          </label>
          {membre.email ? (
            <div className="flex flex-wrap gap-2 pl-8">
              <Button size="sm" variant="secondary" disabled={!!envoi} onClick={() => lancer('hebdo', true)}><Mail /> M'envoyer un aperçu</Button>
              <Button size="sm" variant="ghost" disabled={!!envoi} onClick={() => lancer('seances', true)}><CalendarClock /> Aperçu « séance du jour »</Button>
            </div>
          ) : (
            <p className="pl-8 text-xs text-muted-foreground">Demandez au bureau d'ajouter votre adresse email à votre fiche pour recevoir les rappels.</p>
          )}
        </section>

        {admin ? (
          <section className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Administration des rappels</h3>
            <p className="text-xs text-muted-foreground">Envoi automatique le lundi à 7h47 (suivis) et chaque jour à 6h13 (séances). Vous pouvez aussi l'envoyer tout de suite.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!!envoi} onClick={() => lancer('hebdo', false)}><Send /> Envoyer les suivis à tous</Button>
              <Button size="sm" variant="secondary" disabled={!!envoi} onClick={() => lancer('seances', false)}><Send /> Envoyer les séances du jour</Button>
            </div>
          </section>
        ) : null}

        {journal.length ? (
          <section className="space-y-1 border-t border-border pt-4">
            <h3 className="mb-1 text-sm font-semibold">Derniers envois</h3>
            {journal.map((j) => (
              <div key={j.id} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{new Date(j.envoye_le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {' · '}{LIBELLES_ENVOI[j.type] ?? j.type} · {j.email}
                </span>
                <span className={j.statut === 'envoye' ? 'shrink-0 font-medium text-primary' : 'shrink-0 font-medium text-destructive'} title={j.erreur ?? undefined}>
                  {j.statut === 'envoye' ? 'envoyé' : 'échec'}
                </span>
              </div>
            ))}
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
