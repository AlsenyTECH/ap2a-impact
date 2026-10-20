import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, KeyRound, RotateCcw, UserPlus } from 'lucide-react'
import { BoutonsInvitation } from '@/components/Invitation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Champ, Pastilles } from '@/components/champs'
import { date } from '@/lib/format'
import { TYPES_ACCES } from '@/lib/partenaires'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import type { AccesPartenaire, Partenaire, TypeAcces } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Accès invités d'un partenaire : inviter, partager l'invitation, retirer. */
export function AccesPartenaires({ partenaire, fermer }: { partenaire: Partenaire; fermer: () => void }) {
  const qc = useQueryClient()
  const cle = ['acces', partenaire.id]
  const organisation = partenaire.sigle || partenaire.nom
  const { data: acces = [] } = useQuery({
    queryKey: cle,
    queryFn: async () => verifier(await supabase.from('acces_partenaires').select('*').eq('partenaire_id', partenaire.id).order('cree_le')) as AccesPartenaire[],
  })
  const { data: actions = [] } = useQuery({
    queryKey: ['actions-du-partenaire', partenaire.id],
    queryFn: async () => verifier(await supabase.from('action_partenaires').select('role, action:actions(titre, statut, date_debut)').eq('partenaire_id', partenaire.id)) as unknown as { role: string; action: { titre: string; statut: string; date_debut: string } }[],
  })
  const vide = { type: 'formateur' as TypeAcces, prenom: '', nom: '', email: '', telephone: '' }
  const [v, setV] = useState(vide)
  const [ajout, setAjout] = useState(false)

  async function inviter(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('acces_partenaires').insert({
      partenaire_id: partenaire.id, type: v.type, prenom: v.prenom.trim() || null, nom: v.nom.trim(),
      email: v.email.trim().toLowerCase(), telephone: v.telephone.trim() || null,
    })
    if (error) return toast.error(messageErreur(error))
    toast.success('Accès créé : envoyez-lui maintenant l\'invitation (email, WhatsApp ou copie).')
    setV(vide)
    setAjout(false)
    qc.invalidateQueries({ queryKey: cle })
  }

  async function basculer(x: AccesPartenaire) {
    if (!x.revoque_le && !confirm(`Retirer l'accès de ${x.prenom ?? ''} ${x.nom} ? Il ne pourra plus rien voir.`)) return
    const { error } = await supabase.from('acces_partenaires').update({ revoque_le: x.revoque_le ? null : new Date().toISOString() }).eq('id', x.id)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: cle })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Accès de {organisation}</DialogTitle>
          <DialogDescription>
            Un accès invité ne voit que les actions auxquelles {organisation} participe, et seulement ce qui lui est utile.
            Il expire un mois après la fin de chaque action clôturée.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-muted/40 p-3 text-xs">
          <div className="mb-1 font-semibold">Actions de ce partenaire</div>
          {actions.length ? actions.map((a, i) => (
            <div key={i} className="truncate text-muted-foreground">{a.action.titre} · {a.role} · {date(a.action.date_debut)}</div>
          )) : <div className="text-muted-foreground">Aucune : ajoutez-le dans l'onglet « Partenaires » d'une action pour qu'il y ait accès.</div>}
        </div>

        <div className="space-y-2">
          {acces.map((x) => (
            <div key={x.id} className={cn('rounded-xl border border-border p-3', x.revoque_le && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{x.prenom} {x.nom} <span className="text-xs font-normal text-muted-foreground">· {TYPES_ACCES[x.type].libelle}</span></div>
                  <div className="truncate text-xs text-muted-foreground">{x.email}{x.telephone ? ` · ${x.telephone}` : ''}</div>
                  <div className="mt-0.5 text-xs">
                    {x.revoque_le ? <span className="text-destructive">Accès retiré le {date(x.revoque_le.slice(0, 10))}</span>
                      : x.user_id ? <span className="text-primary">Compte activé</span>
                      : <span className="text-[#8a6a10]">En attente de sa première connexion</span>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => basculer(x)} className={x.revoque_le ? '' : 'text-destructive'}>
                  {x.revoque_le ? <><RotateCcw /> Rétablir</> : <><Ban /> Retirer</>}
                </Button>
              </div>
              {!x.revoque_le && !x.user_id ? (
                <div className="mt-2 pl-7">
                  <BoutonsInvitation personne={x} accesId={x.id} organisation={organisation} />
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {ajout ? (
          <form onSubmit={inviter} className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <Champ label="Type d'accès" aide={TYPES_ACCES[v.type].aide}>
              <Pastilles<TypeAcces> value={v.type} onChange={(type) => setV({ ...v, type })} options={Object.entries(TYPES_ACCES).map(([k, t]) => [k as TypeAcces, t.libelle])} />
            </Champ>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Prénom"><Input value={v.prenom} onChange={(e) => setV({ ...v, prenom: e.target.value })} /></Champ>
              <Champ label="Nom"><Input required value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} /></Champ>
            </div>
            <Champ label="Email" aide="Il y recevra son lien d'invitation personnel pour choisir son mot de passe.">
              <Input type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            </Champ>
            <Champ label="Téléphone (pour l'invitation WhatsApp)"><Input type="tel" value={v.telephone} onChange={(e) => setV({ ...v, telephone: e.target.value })} /></Champ>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAjout(false)}>Annuler</Button>
              <Button type="submit">Créer l'accès</Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => setAjout(true)}><UserPlus /> Inviter une personne</Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
