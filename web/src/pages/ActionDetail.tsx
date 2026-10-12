import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, IdCard, FileSpreadsheet, FileText, Lock, LockOpen, Gift, MapPin, Paperclip, Pencil, Plus, Trash2, UserPlus, UserRound, Wallet } from 'lucide-react'
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
import { Chargement, Erreur, Liste, ListeMembres, Pastilles } from '@/components/champs'
import { OutilsListe } from '@/components/OutilsListe'
import { Seances } from '@/components/Seances'
import { Historique } from '@/components/Historique'
import { OngletConsultations } from '@/components/OngletConsultations'
import { correspond, membreAvecNumero, trier } from '@/lib/recherche'
import { Avatar, IconeType, StatutPastille } from '@/components/design'
import { useAuth } from '@/lib/auth'
import { date, fcfa, LIBELLES_NATURE, LIBELLES_STATUT_BENEFICIAIRE, nomCible } from '@/lib/format'
import { useAction, useCibles, usePartenaires, useTypesAction } from '@/lib/requetes'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import type { Beneficiaire, Cible, Membre, RolePartenaire, StatutAction, StatutBeneficiaire } from '@/lib/types'

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
  const dansEquipe = equipe.some((e) => e.membre.id === membre!.id)
  const voitBeneficiaires = a('admin', 'bureau', 'coordinateur') || dansEquipe
  // Une action clôturée est figée (la base le garantit aussi) : seul le
  // bilan se complète, seul un administrateur peut la rouvrir.
  const cloturee = action.statut === 'terminee' || action.statut === 'annulee'
  const modifiable = gere && !cloturee
  const suites = (SUITE[action.statut] ?? []).filter(() => !cloturee || a('admin'))

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
      <Link to="/actions" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Actions</Link>
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:p-6">
          <IconeType code={action.type?.code} className="size-12 [&_svg]:size-6" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">{action.type?.libelle}</span>
              <StatutPastille statut={action.statut} />
            </div>
            <h1 className="mt-1 text-2xl font-semibold leading-tight md:text-[26px]">{action.titre}</h1>
            {action.description ? <p className="mt-2 max-w-3xl whitespace-pre-line text-sm text-muted-foreground">{action.description}</p> : null}
          </div>
          {gere ? (
            <div className="flex flex-wrap gap-2 md:justify-end">
              {suites.map(([s, libelle]) => (
                <Button
                  key={s}
                  variant={s === 'annulee' ? 'ghost' : cloturee ? 'secondary' : 'default'}
                  size="sm"
                  onClick={() => (s === 'terminee' || s === 'annulee' || cloturee
                    ? confirm(s === 'terminee' ? 'Clôturer cette action ? Sa liste et ce qui a été remis seront figés.' : s === 'annulee' ? 'Annuler cette action ? Elle sera figée.' : 'Rouvrir cette action clôturée ? Ce sera noté dans l\'historique.')
                    : true) && changerStatut(s)}
                >
                  {cloturee ? <LockOpen /> : null}{libelle}
                </Button>
              ))}
              {!cloturee ? <Button variant="secondary" size="sm" onClick={() => setEdition(true)}><Pencil /> Modifier</Button> : null}
              <Button asChild variant="secondary" size="sm"><Link to={`/actions/${id}/rapport`}><FileText /> Rapport</Link></Button>
              <Button asChild variant="secondary" size="sm" title="Imprimer les cartes des participants (pointage par QR code)"><Link to={`/cartes?action=${id}`}><IdCard /> Cartes</Link></Button>
            </div>
          ) : voitBeneficiaires ? (
            <Button asChild variant="secondary" size="sm"><Link to={`/actions/${id}/rapport`}><FileText /> Rapport</Link></Button>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 border-t border-border/70 bg-muted/30 md:grid-cols-4">
          {[
            [CalendarDays, 'Dates', `${date(action.date_debut)}${action.date_fin && action.date_fin !== action.date_debut ? ` → ${date(action.date_fin)}` : ''}`],
            [MapPin, 'Lieu', action.lieu || action.zone?.nom || '—'],
            [UserRound, 'Responsable', membreAvecNumero(action.responsable)],
            [Wallet, 'Budget', fcfa(action.budget_fcfa)],
          ].map(([Icone, libelle, valeur], i) => {
            const I = Icone as typeof MapPin
            return (
              <div key={i} className={`flex gap-2.5 p-4 ${i % 2 ? '' : 'border-r'} border-border/70 md:border-r ${i === 3 ? 'md:border-r-0' : ''} ${i < 2 ? 'border-b md:border-b-0' : ''}`}>
                <I className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{libelle as string}</dt>
                  <dd className="text-sm font-medium leading-snug">{valeur as string}</dd>
                </div>
              </div>
            )
          })}
        </dl>
      </Card>

      {cloturee ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-muted/60 p-4 text-sm">
          <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <div className="font-semibold">Action {action.statut === 'terminee' ? 'clôturée' : 'annulée'} : liste figée</div>
            <div className="text-muted-foreground">
              Les bénéficiaires, ce qui a été remis, l'équipe et les séances ne peuvent plus être modifiés. Le bilan reste modifiable
              et les suivis continuent. {a('admin') ? 'En tant qu\'administrateur, vous pouvez la rouvrir.' : 'Seul un administrateur peut la rouvrir.'}
            </div>
          </div>
        </div>
      ) : null}

      <Tabs defaultValue={voitBeneficiaires ? 'beneficiaires' : 'seances'}>
        <TabsList className="mb-4">
          {voitBeneficiaires ? <TabsTrigger value="beneficiaires">Bénéficiaires</TabsTrigger> : null}
          {voitBeneficiaires && action.type?.code === 'sante' ? <TabsTrigger value="consultations">Consultations</TabsTrigger> : null}
          <TabsTrigger value="seances">Séances</TabsTrigger>
          <TabsTrigger value="equipe">Équipe ({equipe.length})</TabsTrigger>
          <TabsTrigger value="partenaires">Partenaires ({partenairesAction.length})</TabsTrigger>
          <TabsTrigger value="bilan">Bilan</TabsTrigger>
          {gere ? <TabsTrigger value="historique">Historique</TabsTrigger> : null}
        </TabsList>
        {voitBeneficiaires ? (
          <TabsContent value="beneficiaires">
            <OngletBeneficiaires actionId={id} gere={modifiable} partenaireParDefaut={partenairesAction.find((p) => p.role === 'formateur')?.partenaire_id ?? partenairesAction[0]?.partenaire_id} />
          </TabsContent>
        ) : null}
        {voitBeneficiaires && action.type?.code === 'sante' ? (
          <TabsContent value="consultations">
            <OngletConsultations actionId={id} responsable={[action.responsable_id, action.cree_par].includes(membre!.id)} />
          </TabsContent>
        ) : null}
        <TabsContent value="seances">
          <Seances actionId={id} planifier={modifiable} appel={(gere || dansEquipe) && !cloturee} voitBeneficiaires={voitBeneficiaires} debut={action.date_debut} fin={action.date_fin} />
        </TabsContent>
        <TabsContent value="equipe"><OngletEquipe actionId={id} gere={modifiable} equipe={equipe} /></TabsContent>
        <TabsContent value="partenaires"><OngletPartenaires actionId={id} gere={modifiable} liste={partenairesAction} /></TabsContent>
        <TabsContent value="bilan"><OngletBilan actionId={id} gere={gere} bilan={action.bilan} /></TabsContent>
        {gere ? <TabsContent value="historique"><Historique actionId={id} /></TabsContent> : null}
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
        .select('*, cible:cibles!beneficiaires_cible_id_fkey(*), via:cibles!beneficiaires_via_collectif_id_fkey(id, nom), apports(*, partenaire:partenaires(nom, sigle))')
        .eq('action_id', actionId).order('ajoute_le', { ascending: false })) as Beneficiaire[],
  })
  const dejaInscrits = new Set(liste.map((b) => b.cible_id))
  const total = liste.flatMap((b) => b.apports ?? []).reduce((s, x) => s + (x.valeur_fcfa ?? 0), 0)

  // Assiduité : part des séances où le bénéficiaire était présent.
  const { data: presences = [] } = useQuery({
    queryKey: ['presences', actionId],
    queryFn: async () => verifier(await supabase.from('presences').select('beneficiaire_id, present, seance:seances!inner(action_id)').eq('seance.action_id', actionId)) as unknown as { beneficiaire_id: string; present: boolean }[],
  })
  const assiduite = (id: string) => {
    const p = presences.filter((x) => x.beneficiaire_id === id)
    return p.length ? Math.round((100 * p.filter((x) => x.present).length) / p.length) : null
  }
  const groupe = (b: Beneficiaire) => b.via?.nom ?? b.cible?.groupes ?? null

  const [filtre, setFiltre] = useState('')
  const [statutFiltre, setStatutFiltre] = useState<StatutBeneficiaire | ''>('')
  const [tri, setTri] = useState<'recents' | 'anciens' | 'nom' | 'prenom' | 'groupe' | 'statut' | 'presence'>('recents')
  // Après un import Excel, on n'affiche que les personnes importées.
  const [importes, setImportes] = useState<Set<string> | null>(null)
  const retenus = liste.filter((b) => (!importes || importes.has(b.cible_id)) && (!statutFiltre || b.statut === statutFiltre)
    && correspond(filtre, b.cible?.prenom, b.cible?.nom, b.cible?.telephone, groupe(b), b.apports?.map((x) => x.description).join(' ')))
  const affiches = tri === 'recents' ? retenus
    : tri === 'anciens' ? [...retenus].reverse()
    : tri === 'nom' ? trier(retenus, (b) => `${b.cible?.nom} ${b.cible?.prenom}`)
    : tri === 'prenom' ? trier(retenus, (b) => `${b.cible?.prenom} ${b.cible?.nom}`)
    : tri === 'groupe' ? trier(retenus, groupe)
    : tri === 'statut' ? trier(retenus, (b) => b.statut)
    : trier(retenus, (b) => assiduite(b.id), 'desc')

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

  // Un groupe inscrit (ASC, GIE...) : inscrire aussi chacun de ses membres.
  async function inscrireMembres(b: Beneficiaire) {
    const { data, error } = await supabase.from('appartenances').select('personne_id').eq('collectif_id', b.cible_id)
    if (error) return toast.error(messageErreur(error))
    const nouveaux = data.map((m) => m.personne_id).filter((p) => !dejaInscrits.has(p))
    if (!nouveaux.length) return toast.info(data.length ? 'Tous ses membres sont déjà inscrits' : "Ce groupe n'a pas encore de membres enregistrés")
    const r = await supabase.from('beneficiaires').upsert(nouveaux.map((cible_id) => ({ action_id: actionId, cible_id, via_collectif_id: b.cible_id })), { onConflict: 'action_id,cible_id', ignoreDuplicates: true })
    if (r.error) return toast.error(messageErreur(r.error))
    toast.success(`${nouveaux.length} membre(s) inscrit(s)`)
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
                      {dejaInscrits.has(c.id) ? <span className="text-xs text-muted-foreground">inscrit</span> : <span className="text-xs text-muted-foreground">{c.categorie?.libelle}</span>}
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

      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span><b className="text-foreground">{liste.length}</b> bénéficiaire{liste.length > 1 ? 's' : ''}{total ? <> · <b className="text-foreground">{fcfa(total)}</b> remis</> : null}</span>
        {gere && liste.length ? (
          <button className="font-medium text-primary" onClick={() => setSelection(selection.length === liste.length ? [] : liste.map((b) => b.id))}>
            {selection.length === liste.length ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
        ) : null}
      </div>
      {importes ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span><b>{importes.size}</b> personne(s) importée(s) à l'instant — seules elles sont affichées.</span>
          <Button size="sm" variant="ghost" onClick={() => setImportes(null)}>Tout afficher</Button>
        </div>
      ) : null}
      {liste.length ? (
        <OutilsListe
          recherche={filtre}
          setRecherche={setFiltre}
          placeholder="Chercher : nom, groupe, ce qui a été remis…"
          tris={[['recents', 'Derniers inscrits'], ['anciens', 'Premiers inscrits'], ['nom', 'Nom A → Z'], ['prenom', 'Prénom A → Z'], ['groupe', 'Par groupe'], ['statut', 'Par statut'], ['presence', 'Meilleure assiduité']]}
          tri={tri}
          setTri={setTri}
          total={affiches.length}
        >
          <Pastilles<StatutBeneficiaire | ''>
            value={statutFiltre}
            onChange={(v) => setStatutFiltre(v === statutFiltre ? '' : v)}
            options={[['', 'Tous'], ...(Object.entries(LIBELLES_STATUT_BENEFICIAIRE) as [StatutBeneficiaire, string][])]}
          />
        </OutilsListe>
      ) : null}
      {isLoading ? <Chargement /> : !liste.length ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <UserPlus className="mx-auto mb-2 size-6" /> Aucun bénéficiaire.{gere ? " Cherchez une cible ci-dessus ou importez la liste Excel des participants." : ""}
        </p>
      ) : (
        <div className="space-y-2">
          {affiches.map((b) => (
            <Card key={b.id}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center gap-3">
                  {gere ? <Checkbox checked={selection.includes(b.id)} onCheckedChange={() => basculer(b.id)} /> : null}
                  {b.cible ? <Avatar prenom={b.cible.prenom} nom={b.cible.nom} nature={b.cible.type} taille="sm" /> : null}
                  <Link to={`/cibles/${b.cible_id}`} className="min-w-0 flex-1 truncate font-medium">
                    {b.cible ? nomCible(b.cible) : '—'}
                    {groupe(b) ? <span className="block truncate text-xs font-normal text-primary">{b.via ? 'Inscrit avec' : 'Membre de'} : {groupe(b)}</span> : null}
                  </Link>
                  {assiduite(b.id) != null ? (
                    <span title="Présence aux séances" className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold chiffres ${assiduite(b.id)! >= 75 ? 'bg-[#e2f4e2] text-[#0b6b0b]' : assiduite(b.id)! >= 50 ? 'bg-or-soft text-[#7a5600]' : 'bg-[#fbe6e6] text-[#a32b2b]'}`}>
                      {assiduite(b.id)} %
                    </span>
                  ) : null}
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
                {gere && (b.cible?.type === 'menage' || b.cible?.type === 'collectif' || b.cible?.type === 'structure') ? (
                  <button className="pl-7 text-xs text-primary" onClick={() => inscrireMembres(b)}>Inscrire aussi ses membres individuellement</button>
                ) : null}
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
      <ImportExcel ouvert={importer} fermer={() => setImporter(false)} actionId={actionId} onTermine={(ids) => setImportes(new Set(ids))} />
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
              <span>{e.membre.prenom} {e.membre.nom} <span className="text-xs text-muted-foreground">({e.membre.numero_adherent})</span> {e.role ? <span className="text-muted-foreground">· {e.role}</span> : null}</span>
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
