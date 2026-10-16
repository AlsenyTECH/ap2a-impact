import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Chargement, Champ, EnTete, Erreur, Liste } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { droitsDe, parGroupe, roleA, roleDuMembre, usePermissions, useRoles, type DefinitionDroit, type Permission, type RoleApp } from '@/lib/droits'
import { useMembres } from '@/lib/requetes'
import { messageErreur, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/**
 * Rôles et droits : chaque rôle est un ensemble de droits, fonctionnalité par
 * fonctionnalité. Les quatre rôles d'origine restent ; on peut en créer
 * d'autres (magasinier, chargé de communication...) et les attribuer dans
 * Membres.
 */
export function Roles() {
  const { peut, membre: moi } = useAuth()
  const { data: roles, isLoading, error } = useRoles()
  const { data: droits = [] } = usePermissions()
  const { data: membres = [] } = useMembres()
  const [edition, setEdition] = useState<RoleApp | 'nouveau' | null>(null)
  const qc = useQueryClient()
  const gere = peut('roles.gerer')

  if (error) return <Erreur erreur={error} />
  if (isLoading || !roles) return <Chargement />

  const nbMembres = (r: RoleApp) => membres.filter((m) => m.actif && m.role_id === r.id).length

  async function supprimer(r: RoleApp) {
    if (nbMembres(r)) return toast.error(`Ce rôle est attribué à ${nbMembres(r)} membre(s) : donnez-leur d'abord un autre rôle.`)
    if (!confirm(`Supprimer le rôle « ${r.nom} » ?`)) return
    const { error } = await supabase.from('roles').delete().eq('id', r.id)
    if (error) return toast.error(error.code === '23503' ? 'Ce rôle est encore attribué (peut-être à un membre inactif).' : messageErreur(error))
    toast.success('Rôle supprimé')
    qc.invalidateQueries({ queryKey: ['roles'] })
  }

  return (
    <>
      <EnTete
        titre="Rôles et droits"
        sousTitre="Chaque rôle donne des droits, fonctionnalité par fonctionnalité. Le rôle de chaque membre se choisit dans Membres."
        actions={gere ? <Button onClick={() => setEdition('nouveau')}><Plus className="size-4" /> Nouveau rôle</Button> : null}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => {
          const n = nbMembres(r)
          const nbDroits = droitsDe(r, droits).length
          return (
            <Card key={r.id} className={cn(moi?.role_id === r.id && 'ring-2 ring-primary/40')}>
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><ShieldCheck className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{r.nom}</span>
                      {r.systeme ? <Badge variant="outline">d'origine</Badge> : null}
                      {moi?.role_id === r.id ? <Badge variant="secondary">votre rôle</Badge> : null}
                    </div>
                    {r.description ? <p className="mt-0.5 text-sm text-muted-foreground">{r.description}</p> : null}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span><b className="text-foreground">{r.code === 'admin' ? 'Tous les' : nbDroits}</b> droit{r.code === 'admin' || nbDroits > 1 ? 's' : ''}</span>
                  <span className="inline-flex items-center gap-1"><Users className="size-4" /> {n} membre{n > 1 ? 's' : ''}</span>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEdition(r)}>
                    {gere && r.code !== 'admin' ? <><Pencil /> Modifier</> : <><ShieldCheck /> Voir les droits</>}
                  </Button>
                  {gere ? <Button size="sm" variant="ghost" onClick={() => setEdition({ ...r, permissions: droitsDe(r, droits), id: '', code: null, systeme: false, nom: `${r.nom} (copie)` })}><Copy /> Copier</Button> : null}
                  {gere && !r.systeme ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => supprimer(r)} aria-label="Supprimer"><Trash2 /></Button> : null}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Qui peut quoi</h2>
      <Matrice roles={roles} droits={droits} />

      <RoleForm role={edition} fermer={() => setEdition(null)} droits={droits} roles={roles} lectureSeule={!gere} nbMembres={edition && edition !== 'nouveau' && edition.id ? nbMembres(edition) : 0} />
    </>
  )
}

/** Tableau des droits (lignes) par rôle (colonnes). */
function Matrice({ roles, droits }: { roles: RoleApp[]; droits: DefinitionDroit[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-carte">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left">
            <th className="sticky left-0 z-10 bg-muted px-3 py-2 font-semibold">Droit</th>
            {roles.map((r) => <th key={r.id} className="px-2 py-2 text-center text-xs font-semibold">{r.nom}</th>)}
          </tr>
        </thead>
        <tbody>
          {parGroupe(droits).map(([groupe, liste]) => (
            <Fragment key={groupe}>
              <tr className="bg-primary-soft/60"><td colSpan={roles.length + 1} className="sticky left-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent-foreground">{groupe}</td></tr>
              {liste.map((d) => (
                <tr key={d.code} className="border-b border-border/60">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2" title={d.description ?? undefined}>{d.libelle}</td>
                  {roles.map((r) => (
                    <td key={r.id} className="px-2 py-2 text-center">
                      {droitsDe(r, droits).includes(d.code) ? <Check className="mx-auto size-4 text-primary" aria-label="oui" /> : <span className="text-muted-foreground/50" aria-label="non">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RoleForm({ role, fermer, droits, roles, lectureSeule, nbMembres }: {
  role: RoleApp | 'nouveau' | null
  fermer: () => void
  droits: DefinitionDroit[]
  roles: RoleApp[]
  lectureSeule: boolean
  nbMembres: number
}) {
  const qc = useQueryClient()
  const { membre: moi, recharger } = useAuth()
  const existant = role && role !== 'nouveau' && role.id ? role : null
  const admin = existant?.code === 'admin'
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [choisis, setChoisis] = useState<Set<Permission>>(new Set())
  const [envoi, setEnvoi] = useState(false)
  const mesDroits = new Set(moi ? droitsDe(roleDuMembre(moi), droits) : [])
  const fige = lectureSeule || admin

  useEffect(() => {
    if (!role) return
    const base = role === 'nouveau' ? null : role
    setNom(base?.nom ?? '')
    setDescription(base?.description ?? '')
    // Nouveau rôle (ou copie) : seulement des droits qu'on a soi-même.
    const depart = base ? droitsDe(base, droits) : []
    setChoisis(new Set(base?.id ? depart : depart.filter((d) => !!moi && roleA(roleDuMembre(moi), d))))
  }, [role, droits, moi])

  function basculer(d: Permission, oui: boolean) {
    setChoisis((s) => {
      const n = new Set(s)
      if (oui) n.add(d)
      else n.delete(d)
      return n
    })
  }
  function partirDe(id: string) {
    const r = roles.find((x) => x.id === id)
    if (r) setChoisis(new Set(droitsDe(r, droits).filter((d) => mesDroits.has(d))))
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (existant && nbMembres && !confirm(`Ce rôle est attribué à ${nbMembres} membre(s) : leurs accès changent tout de suite. Continuer ?`)) return
    setEnvoi(true)
    const donnees = { nom: nom.trim(), description: description.trim() || null, ...(admin ? {} : { permissions: [...choisis] }) }
    const { error } = existant
      ? await supabase.from('roles').update(donnees).eq('id', existant.id)
      : await supabase.from('roles').insert(donnees)
    setEnvoi(false)
    if (error) return toast.error(error.code === '23505' ? 'Un rôle porte déjà ce nom.' : messageErreur(error))
    toast.success(existant ? 'Rôle modifié' : 'Rôle créé')
    qc.invalidateQueries({ queryKey: ['roles'] })
    qc.invalidateQueries({ queryKey: ['membres'] })
    if (existant && existant.id === moi?.role_id) recharger()
    fermer()
  }

  return (
    <Dialog open={!!role} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{lectureSeule ? existant?.nom : existant ? `Modifier « ${existant.nom} »` : 'Nouveau rôle'}</DialogTitle>
          <DialogDescription>
            {admin ? "L'administrateur a toujours tous les droits, y compris ceux qui seront ajoutés plus tard."
              : lectureSeule ? 'Les droits de ce rôle.'
              : 'Cochez ce que ce rôle permet de faire. Vous ne pouvez donner que des droits que vous avez vous-même.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enregistrer} className="grid gap-4">
          {!lectureSeule ? (
            <>
              <Champ label="Nom du rôle"><Input required maxLength={60} value={nom} placeholder="Magasinier, Chargé de communication…" onChange={(e) => setNom(e.target.value)} /></Champ>
              <Champ label="Description (facultatif)"><Textarea rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} /></Champ>
              {!existant ? (
                <Champ label="Partir des droits d'un rôle existant">
                  <Liste defaultValue="" onChange={(e) => partirDe(e.target.value)}>
                    <option value="">— Aucun —</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                  </Liste>
                </Champ>
              ) : null}
            </>
          ) : null}
          <div className="space-y-4">
            {parGroupe(droits).map(([groupe, liste]) => (
              <fieldset key={groupe} className="rounded-xl border border-border p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{groupe}</legend>
                <div className="space-y-2.5">
                  {liste.map((d) => {
                    const pasLeMien = !mesDroits.has(d.code) && !choisis.has(d.code)
                    return (
                      <label key={d.code} className={cn('flex items-start gap-3 text-sm', (fige || pasLeMien) ? 'cursor-default' : 'cursor-pointer')}>
                        <Checkbox className="mt-0.5" checked={choisis.has(d.code)} disabled={fige || pasLeMien}
                          onCheckedChange={(v) => basculer(d.code, v === true)} />
                        <span className="min-w-0">
                          <span className="font-medium">{d.libelle}</span>
                          {pasLeMien && !fige ? <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Lock className="size-3" /> vous n'avez pas ce droit</span> : null}
                          {d.description ? <span className="block text-xs text-muted-foreground">{d.description}</span> : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="sticky -bottom-5 -mx-5 -mb-5 flex items-center justify-between gap-2 border-t border-border bg-card/95 px-5 py-3 backdrop-blur sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6">
            <span className="text-sm text-muted-foreground">{admin ? 'Tous les droits' : `${choisis.size} droit${choisis.size > 1 ? 's' : ''}`}</span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={fermer}>{lectureSeule ? 'Fermer' : 'Annuler'}</Button>
              {!lectureSeule ? <Button type="submit" disabled={envoi || !nom.trim()}>Enregistrer</Button> : null}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
