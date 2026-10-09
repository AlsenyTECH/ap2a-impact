import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileSpreadsheet, Gift, Paperclip, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ActionForm } from '@/components/ActionForm'
import { ApportForm, ouvrirJustificatif } from '@/components/ApportForm'
import { CibleForm } from '@/components/CibleForm'
import { ImportExcel } from '@/components/ImportExcel'
import { Chargement, EnTete, Erreur, Liste, ListeMembres } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { date, fcfa, LIBELLES_NATURE, LIBELLES_STATUT_ACTION, LIBELLES_STATUT_BENEFICIAIRE, LIBELLES_TYPE_CIBLE, nomCible } from '@/lib/format'
import { useAction, useCibles, usePartenaires, useTypesAction } from '@/lib/requetes'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import type { Beneficiaire, Cible, Membre, RolePartenaire, StatutAction, StatutBeneficiaire } from '@/lib/types'
import { COULEUR_STATUT } from './Actions'

const SUITE: Partial<Record<StatutAction, [StatutAction, string][]>> = {
  preparation: [['en_cours', "Démarrer l'action"], ['annulee', 'Annuler']],
  en_cours: [['terminee', 'Clôturer']],
  terminee: [['en_cours', 'Rouvrir']],
  annulee: [['preparation', 'Rétablir']],
}

export function ActionDetail() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const { membre, a } = useAuth()
  const { data: action, isLoading, error } = useAction(id)
  const { data: types = [] } = useTypesAction()
  const [edition, setEdition] = useState(false)

  const { data: equipe = [] } = useQuery({
    queryKey: ['equipe', id],
    queryFn: async () => verifier(await supabase.from('action_equipe').select('role, membre:membres(*)').eq('action_id', id)) as unknown as { role: string | null; membre: Membre }[],
  })
  const { data: partenairesAction = [] } = useQuery({
    queryKey: ['action_partenaires', id],
    queryFn: async () => verifier(await supabase.from('action_partenaires').select('role, partenaire_id, partenaire:partenaires(nom, sigle)').eq('action_id', id)) as unknown as { role: RolePartenaire; partenaire_id: string; partenaire: { nom: string; sigle: string | null } }[],
  })

  if (error) return <Erreur erreur={error} />
  if (isLoading || !action) return <Chargement />

  // Même règle que la base : gestionnaire, ou coordinateur responsable/créateur.
  const gere = a('admin', 'bureau') || (a('coordinateur') && [action.responsable_id, action.cree_par].includes(membre!.id))
  const voitBeneficiaires = a('admin', 'bureau', 'coordinateur') || equipe.some((e) => e.membre.id === membre!.id)

  async function changerStatut(statut: StatutAction) {
    const maj: { statut: StatutAction; date_fin?: string } = { statut }
    if (statut === 'terminee' && !action!.date_fin) maj.date_fin = new Date().toISOString().slice(0, 10) < action!.date_debut ? action!.date_debut : new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('actions').update(maj).eq('id', id)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: ['action', id] })
    qc.invalidateQueries({ queryKey: ['actions'] })
    if (statut === 'terminee') {
      const mois = types.find((t) => t.id === action!.type_id)?.suivis_mois ?? []
      toast.success(mois.length ? `Action clôturée : suivis des bénéficiaires planifiés à ${mois.join(', ')} mois` : 'Action clôturée')
    }
  }

  return (
    <>
      <Link to="/actions" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> Actions</Link>
      <EnTete
        titre={action.titre}
        sousTitre={
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={COULEUR_STATUT[action.statut]}>{LIBELLES_STATUT_ACTION[action.statut]}</Badge>
            <span>{action.type?.libelle} · {date(action.date_debut)}{action.date_fin && action.date_fin !== action.date_debut ? ` → ${date(action.date_fin)}` : ''}</span>
          </div>
        }
        actions={gere ? (
          <>
            {SUITE[action.statut]?.map(([s, libelle]) => (
              <Button key={s} variant={s === 'annulee' ? 'ghost' : 'default'} size="sm" onClick={() => changerStatut(s)}>{libelle}</Button>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setEdition(true)}><Pencil className="size-4" /></Button>
          </>
        ) : null}
      />
      <div className="mb-4 grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-3">
        <span>Lieu : <b className="text-foreground">{action.lieu || action.zone?.chemin || '—'}</b></span>
        <span>Responsable : <b className="text-foreground">{action.responsable ? `${action.responsable.prenom} ${action.responsable.nom}` : '—'}</b></span>
        <span>Budget : <b className="text-foreground">{fcfa(action.budget_fcfa)}</b></span>
      </div>
      {action.description ? <p className="mb-4 whitespace-pre-line text-sm">{action.description}</p> : null}

      <Tabs defaultValue={voitBeneficiaires ? 'beneficiaires' : 'equipe'}>
        <TabsList className="mb-4 w-full justify-start overflow-x-auto">
          {voitBeneficiaires ? <TabsTrigger value="beneficiaires">Bénéficiaires</TabsTrigger> : null}
          <TabsTrigger value="equipe">Équipe ({equipe.length})</TabsTrigger>
          <TabsTrigger value="partenaires">Partenaires ({partenairesAction.length})</TabsTrigger>
          <TabsTrigger value="bilan">Bilan</TabsTrigger>
        </TabsList>
        {voitBeneficiaires ? (
          <TabsContent value="beneficiaires">
            <OngletBeneficiaires actionId={id} gere={gere} partenaireParDefaut={partenairesAction.find((p) => p.role === 'formateur')?.partenaire_id ?? partenairesAction[0]?.partenaire_id} />
          </TabsContent>
        ) : null}
        <TabsContent value="equipe"><OngletEquipe actionId={id} gere={gere} equipe={equipe} /></TabsContent>
        <TabsContent value="partenaires"><OngletPartenaires actionId={id} gere={gere} liste={partenairesAction} /></TabsContent>
        <TabsContent value="bilan"><OngletBilan actionId={id} gere={gere} bilan={action.bilan} /></TabsContent>
      </Tabs>
      <ActionForm ouvert={edition} fermer={() => setEdition(false)} action={action} />
    </>
  )
}

function OngletBeneficiaires({ actionId, gere, partenaireParDefaut }: { actionId: string; gere: boolean; partenaireParDefaut?: string }) {
  const qc = useQueryClient()
  const [recherche, setRecherche] = useState('')
  const [selection, setSelection] = useState<string[]>([])
  const [apportPour, setApportPour] = useState<string[] | null>(null)
  const [creation, setCreation] = useState(false)
  const [importer, setImporter] = useState(false)
  const { data: suggestions = [] } = useCibles(recherche, '')

  const { data: liste = [], isLoading } = useQuery({
    queryKey: ['beneficiaires', actionId],
    queryFn: async () =>
      verifier(await supabase.from('beneficiaires')
        .select('*, cible:cibles(*), apports(*, partenaire:partenaires(nom, sigle))')
        .eq('action_id', actionId).order('ajoute_le')) as Beneficiaire[],
  })
  const dejaInscrits = new Set(liste.map((b) => b.cible_id))
  const total = liste.flatMap((b) => b.apports ?? []).reduce((s, x) => s + (x.valeur_fcfa ?? 0), 0)

  async function ajouter(c: Cible) {
    setRecherche('')
    if (dejaInscrits.has(c.id)) return toast.info('Déjà inscrit')
    const { error } = await supabase.from('beneficiaires').insert({ action_id: actionId, cible_id: c.id })
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: ['beneficiaires', actionId] })
  }

  async function changer(b: Beneficiaire, statut: StatutBeneficiaire) {
    const { error } = await supabase.from('beneficiaires').update({ statut }).eq('id', b.id)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: ['beneficiaires', actionId] })
  }

  async function retirer(b: Beneficiaire) {
    if (b.apports?.length && !confirm('Ce bénéficiaire a déjà reçu des apports, qui seront aussi supprimés. Continuer ?')) return
    const { error } = await supabase.from('beneficiaires').delete().eq('id', b.id)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: ['beneficiaires', actionId] })
  }

  async function terminerSelection() {
    const { error } = await supabase.from('beneficiaires').update({ statut: 'termine' }).in('id', selection)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: ['beneficiaires', actionId] })
    setSelection([])
  }

  const basculer = (id: string) => setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <>
      {gere ? (
        <div className="mb-4 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input placeholder="Ajouter : nom ou téléphone…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              {recherche.trim().length >= 2 ? (
                <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                  {suggestions.slice(0, 8).map((c) => (
                    <button key={c.id} onClick={() => ajouter(c)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                      <span>{nomCible(c)} <span className="text-muted-foreground">{c.telephone}</span></span>
                      {dejaInscrits.has(c.id) ? <span className="text-xs text-muted-foreground">inscrit</span> : <span className="text-xs text-muted-foreground">{LIBELLES_TYPE_CIBLE[c.type]}</span>}
                    </button>
                  ))}
                  <button onClick={() => setCreation(true)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-muted">
                    <Plus className="size-4" /> Nouvelle cible « {recherche} »
                  </button>
                </div>
              ) : null}
            </div>
            <Button variant="secondary" onClick={() => setImporter(true)} aria-label="Importer une liste Excel"><FileSpreadsheet className="size-4" /></Button>
          </div>
          {selection.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-accent p-2 text-sm">
              <span className="font-medium">{selection.length} sélectionné(s)</span>
              <Button size="sm" onClick={() => setApportPour(selection)}><Gift className="size-4" /> Ajouter un apport</Button>
              <Button size="sm" variant="secondary" onClick={terminerSelection}>Marquer « a terminé »</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelection([])}>Annuler</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
        <span>{liste.length} bénéficiaire(s)</span>
        {total ? <span>Valeur remise : <b className="text-foreground">{fcfa(total)}</b></span> : null}
        {gere && liste.length ? (
          <button className="text-primary" onClick={() => setSelection(selection.length === liste.length ? [] : liste.map((b) => b.id))}>
            {selection.length === liste.length ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
        ) : null}
      </div>
      {isLoading ? <Chargement /> : !liste.length ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <UserPlus className="mx-auto mb-2 size-6" /> Aucun bénéficiaire. Cherchez une cible ci-dessus ou importez la liste Excel des participants.
        </p>
      ) : (
        <div className="space-y-2">
          {liste.map((b) => (
            <Card key={b.id}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center gap-3">
                  {gere ? <Checkbox checked={selection.includes(b.id)} onCheckedChange={() => basculer(b.id)} /> : null}
                  <Link to={`/cibles/${b.cible_id}`} className="min-w-0 flex-1 truncate font-medium">{b.cible ? nomCible(b.cible) : '—'}</Link>
                  {gere ? (
                    <>
                      <Liste className="h-8 w-auto text-xs" value={b.statut} onChange={(e) => changer(b, e.target.value as StatutBeneficiaire)}>
                        {Object.entries(LIBELLES_STATUT_BENEFICIAIRE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </Liste>
                      <Button size="sm" variant="ghost" onClick={() => setApportPour([b.id])} aria-label="Ajouter un apport"><Gift className="size-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => retirer(b)} aria-label="Retirer"><Trash2 className="size-4 text-muted-foreground" /></Button>
                    </>
                  ) : <Badge variant="secondary">{LIBELLES_STATUT_BENEFICIAIRE[b.statut]}</Badge>}
                </div>
                {b.apports?.length ? (
                  <div className="flex flex-wrap gap-1.5 pl-7">
                    {b.apports.map((x) => (
                      <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                        {LIBELLES_NATURE[x.nature]} : {x.description}{x.partenaire ? ` (${x.partenaire.sigle || x.partenaire.nom})` : ''}
                        {x.fichier_chemin ? <button onClick={() => ouvrirJustificatif(x.fichier_chemin!)} aria-label="Justificatif"><Paperclip className="size-3 text-primary" /></button> : null}
                      </span>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ApportForm ouvert={!!apportPour} fermer={() => { setApportPour(null); setSelection([]) }} beneficiaires={apportPour ?? []} partenaireParDefaut={partenaireParDefaut} />
      <CibleForm ouvert={creation} fermer={() => setCreation(false)} apresCreation={ajouter} />
      <ImportExcel ouvert={importer} fermer={() => setImporter(false)} actionId={actionId} />
    </>
  )
}

function OngletEquipe({ actionId, gere, equipe }: { actionId: string; gere: boolean; equipe: { role: string | null; membre: Membre }[] }) {
  const qc = useQueryClient()
  const [membre, setMembre] = useState<string | null>(null)
  const [role, setRole] = useState('')

  async function ajouter() {
    if (!membre) return
    const { error } = await supabase.from('action_equipe').insert({ action_id: actionId, membre_id: membre, role: role.trim() || null })
    if (error) return toast.error(messageErreur(error))
    setMembre(null); setRole('')
    qc.invalidateQueries({ queryKey: ['equipe', actionId] })
  }
  async function retirer(id: string) {
    const { error } = await supabase.from('action_equipe').delete().eq('action_id', actionId).eq('membre_id', id)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: ['equipe', actionId] })
  }

  return (
    <>
      {gere ? (
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <ListeMembres value={membre} onChange={setMembre} vide="— Choisir un membre —" />
          <Input placeholder="Rôle (accueil, logistique…)" value={role} onChange={(e) => setRole(e.target.value)} />
          <Button onClick={ajouter} disabled={!membre}><Plus className="size-4" /> Ajouter</Button>
        </div>
      ) : null}
      {!equipe.length ? <p className="text-sm text-muted-foreground">Aucun membre mobilisé pour l'instant.</p> : (
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {equipe.map((e) => (
            <div key={e.membre.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span>{e.membre.prenom} {e.membre.nom} {e.role ? <span className="text-muted-foreground">· {e.role}</span> : null}</span>
              <span className="flex items-center gap-2">
                {e.membre.telephone ? <a className="text-xs text-primary" href={`tel:${e.membre.telephone}`}>{e.membre.telephone}</a> : null}
                {gere ? <button onClick={() => retirer(e.membre.id)} aria-label="Retirer"><Trash2 className="size-4 text-muted-foreground" /></button> : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

const ROLES_PARTENAIRE: Record<RolePartenaire, string> = {
  formateur: 'Formateur (délivre le certificat)', prestataire: 'Prestataire (soins, travaux…)', financeur: 'Financeur', soutien: 'Soutien', autre: 'Autre',
}

function OngletPartenaires({ actionId, gere, liste }: { actionId: string; gere: boolean; liste: { role: RolePartenaire; partenaire_id: string; partenaire: { nom: string; sigle: string | null } }[] }) {
  const qc = useQueryClient()
  const { data: partenaires = [] } = usePartenaires()
  const [choix, setChoix] = useState('')
  const [role, setRole] = useState<RolePartenaire>('formateur')

  async function ajouter() {
    const { error } = await supabase.from('action_partenaires').insert({ action_id: actionId, partenaire_id: choix, role })
    if (error) return toast.error(messageErreur(error))
    setChoix('')
    qc.invalidateQueries({ queryKey: ['action_partenaires', actionId] })
  }
  async function retirer(id: string) {
    const { error } = await supabase.from('action_partenaires').delete().eq('action_id', actionId).eq('partenaire_id', id)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: ['action_partenaires', actionId] })
  }

  return (
    <>
      {gere ? (
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Liste value={choix} onChange={(e) => setChoix(e.target.value)}>
            <option value="">— Choisir un partenaire —</option>
            {partenaires.filter((p) => p.actif && !liste.some((l) => l.partenaire_id === p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.sigle ? `${p.sigle} — ` : ''}{p.nom}</option>
            ))}
          </Liste>
          <Liste value={role} onChange={(e) => setRole(e.target.value as RolePartenaire)}>
            {Object.entries(ROLES_PARTENAIRE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Liste>
          <Button onClick={ajouter} disabled={!choix}><Plus className="size-4" /> Ajouter</Button>
        </div>
      ) : null}
      {!liste.length ? <p className="text-sm text-muted-foreground">Aucun partenaire associé.</p> : (
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {liste.map((p) => (
            <div key={p.partenaire_id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span>{p.partenaire.sigle ? <b>{p.partenaire.sigle} </b> : null}{p.partenaire.nom} <span className="text-muted-foreground">· {ROLES_PARTENAIRE[p.role]}</span></span>
              {gere ? <button onClick={() => retirer(p.partenaire_id)} aria-label="Retirer"><Trash2 className="size-4 text-muted-foreground" /></button> : null}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function OngletBilan({ actionId, gere, bilan }: { actionId: string; gere: boolean; bilan: string | null }) {
  const qc = useQueryClient()
  const [texte, setTexte] = useState(bilan ?? '')
  async function enregistrer() {
    const { error } = await supabase.from('actions').update({ bilan: texte.trim() || null }).eq('id', actionId)
    if (error) return toast.error(messageErreur(error))
    toast.success('Bilan enregistré')
    qc.invalidateQueries({ queryKey: ['action', actionId] })
  }
  if (!gere) return <p className="whitespace-pre-line text-sm">{bilan || 'Pas encore de bilan.'}</p>
  return (
    <div className="space-y-2">
      <Textarea rows={6} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Déroulement, difficultés, résultats, ce qu'il faudra améliorer…" />
      <div className="flex justify-end"><Button onClick={enregistrer}>Enregistrer le bilan</Button></div>
    </div>
  )
}
