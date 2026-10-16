import { useState } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Award, CalendarDays, Check, ClipboardCheck, Clock, LogOut, MapPin, Printer, ScanLine, Stethoscope, UsersRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Champ, Chargement, Erreur } from '@/components/champs'
import { Avatar, BlocDate, Liste as Encadre, StatutPastille } from '@/components/design'
import { ConsultationDialog, PastilleConsultation } from '@/components/Consultations'
import { OutilsListe } from '@/components/OutilsListe'
import { Scanner } from '@/components/Scanner'
import { aujourdhui, date, fcfa, LIBELLES_NATURE, SITUATIONS } from '@/lib/format'
import { STATUTS_CONSULTATION, TYPES_ACCES } from '@/lib/partenaires'
import { correspond, trier } from '@/lib/recherche'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import type { Consultation, ResultatPointage, StatutAction, StatutConsultation, TypeAcces } from '@/lib/types'
import { cn } from '@/lib/utils'
import logo from '@/assets/logo_AP2A.jpeg'

interface Portail {
  acces: { type: TypeAcces; prenom: string | null; nom: string; partenaire: string; sigle: string | null } | null
  actions: { id: string; titre: string; type: string | null; date_debut: string; date_fin: string | null; lieu: string | null; statut: StatutAction; acces: TypeAcces; expire_le: string | null; participants: number }[]
}
interface Participant {
  beneficiaire_id: string; statut: string; prenom: string | null; nom: string; type: string; sexe: 'F' | 'M' | null; age: number | null
  telephone: string | null; numero: string | null; presences: string; certificats: { id: string; description: string; numero_document: string | null; date: string }[]
}
interface SeancePortail { id: string; date: string; heure_debut: string | null; heure_fin: string | null; theme: string | null; lieu: string | null; presences: Record<string, boolean> }

export const usePortail = (actif: boolean) => useQuery({
  queryKey: ['portail'],
  enabled: actif,
  queryFn: async () => verifier(await supabase.rpc('portail_actions')) as Portail,
})

const heure = (h: string | null) => (h ? h.slice(0, 5).replace(':', 'h') : '')

/** Application des partenaires invités : seulement leurs actions, seulement l'utile. */
export function PortailPartenaire({ portail, deconnecter }: { portail: Portail; deconnecter: () => void }) {
  const a = portail.acces!
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-sidebar text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <img src={logo} alt="" className="h-9 w-12 rounded-md bg-white object-contain p-0.5" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="font-heading font-semibold">AP2A · Espace partenaire</div>
            <div className="truncate text-xs text-white/70">{a.prenom} {a.nom} · {a.sigle || a.partenaire} · {TYPES_ACCES[a.type].libelle}</div>
          </div>
          <button onClick={deconnecter} title="Se déconnecter" className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><LogOut className="size-5" /></button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route index element={<ListeActions portail={portail} />} />
          <Route path="p/:id" element={<ActionPartenaire portail={portail} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function ListeActions({ portail }: { portail: Portail }) {
  const [recherche, setRecherche] = useState('')
  const [tri, setTri] = useState<'recentes' | 'anciennes' | 'titre'>('recentes')
  const retenues = portail.actions.filter((x) => correspond(recherche, x.titre, x.type, x.lieu))
  const actions = tri === 'titre' ? trier(retenues, (x) => x.titre) : trier(retenues, (x) => x.date_debut, tri === 'recentes' ? 'desc' : 'asc')
  return (
    <>
      <h1 className="text-2xl font-semibold">Vos actions avec l'AP2A</h1>
      <p className="mb-5 text-sm text-muted-foreground">{TYPES_ACCES[portail.acces!.type].aide}</p>
      {portail.actions.length > 3 ? (
        <OutilsListe recherche={recherche} setRecherche={setRecherche} placeholder="Chercher une action…"
          tris={[['recentes', 'Plus récentes'], ['anciennes', 'Plus anciennes'], ['titre', 'Titre A → Z']]} tri={tri} setTri={setTri} total={actions.length} />
      ) : null}
      {!actions.length ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Aucune action pour le moment. L'association vous ajoutera aux actions auxquelles vous participez.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {actions.map((x) => (
            <Link key={x.id} to={`/p/${x.id}`} className="flex gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-carte transition hover:-translate-y-0.5 hover:shadow-haute">
              <BlocDate date={x.date_debut} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-muted-foreground">{x.type}</div>
                <div className="font-semibold leading-snug">{x.titre}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {x.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{x.lieu}</span> : null}
                  <span className="inline-flex items-center gap-1"><UsersRound className="size-3.5" />{x.participants} participant{x.participants > 1 ? 's' : ''}</span>
                  <StatutPastille statut={x.statut} />
                </div>
                {x.expire_le ? <div className="mt-1 text-[11px] text-[#8a6a10]">Accès jusqu'au {date(x.expire_le)}</div> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

function ActionPartenaire({ portail }: { portail: Portail }) {
  const { id = '' } = useParams()
  const action = portail.actions.find((x) => x.id === id)
  if (!action) return <Navigate to="/" replace />
  const type = action.acces
  const cloturee = action.statut === 'terminee' || action.statut === 'annulee'
  return (
    <>
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Vos actions</Link>
      <div className="mb-5">
        <div className="text-sm font-medium text-muted-foreground">{action.type}</div>
        <h1 className="text-2xl font-semibold leading-tight">{action.titre}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-4" />{date(action.date_debut)}{action.date_fin && action.date_fin !== action.date_debut ? ` → ${date(action.date_fin)}` : ''}</span>
          {action.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="size-4" />{action.lieu}</span> : null}
          <StatutPastille statut={action.statut} />
        </div>
      </div>
      {type === 'bailleur' ? <Rapport actionId={id} /> : (
        <Tabs defaultValue={type === 'formateur' ? 'seances' : 'participants'}>
          <TabsList className="mb-4">
            {type === 'formateur' ? <TabsTrigger value="seances">Séances</TabsTrigger> : null}
            <TabsTrigger value="participants">{type === 'soignant' ? 'Patients' : 'Participants'}</TabsTrigger>
            <TabsTrigger value="rapport">Rapport</TabsTrigger>
          </TabsList>
          {type === 'formateur' ? <TabsContent value="seances"><SeancesFormateur actionId={id} cloturee={cloturee} /></TabsContent> : null}
          <TabsContent value="participants"><Participants actionId={id} type={type} cloturee={cloturee} /></TabsContent>
          <TabsContent value="rapport"><Rapport actionId={id} /></TabsContent>
        </Tabs>
      )}
    </>
  )
}

const useParticipants = (actionId: string) => useQuery({
  queryKey: ['portail-participants', actionId],
  queryFn: async () => verifier(await supabase.rpc('portail_participants', { p_action: actionId })) as Participant[],
})

function Participants({ actionId, type, cloturee }: { actionId: string; type: TypeAcces; cloturee: boolean }) {
  const qc = useQueryClient()
  const { data: liste = [], isLoading, error } = useParticipants(actionId)
  const { data: consultations = [] } = useQuery({
    queryKey: ['consultations', actionId],
    enabled: type === 'soignant',
    queryFn: async () => verifier(await supabase.rpc('lire_consultations', { p_action: actionId })) as Consultation[],
  })
  const [recherche, setRecherche] = useState('')
  const [tri, setTri] = useState<'nom' | 'prenom' | 'age' | 'suivi'>('nom')
  const [filtre, setFiltre] = useState<'' | 'sans' | StatutConsultation>('')
  const [dossier, setDossier] = useState<Participant | null>(null)
  const [certificat, setCertificat] = useState<Participant | null>(null)
  const derniere = (b: Participant) => consultations.find((c) => c.beneficiaire_id === b.beneficiaire_id)
  const taux = (b: Participant) => { const [p, t] = b.presences.split('/').map(Number); return t ? p / t : null }

  const retenus = liste.filter((b) => correspond(recherche, b.prenom, b.nom, b.telephone, b.numero)
    && (!filtre || (filtre === 'sans' ? !derniere(b) : derniere(b)?.statut === filtre)))
  const affiches = tri === 'nom' ? trier(retenus, (b) => `${b.nom} ${b.prenom}`)
    : tri === 'prenom' ? trier(retenus, (b) => `${b.prenom} ${b.nom}`)
    : tri === 'age' ? trier(retenus, (b) => b.age)
    : type === 'soignant' ? trier(retenus, (b) => derniere(b)?.date ?? null, 'desc') : trier(retenus, taux, 'desc')

  if (error) return <Erreur erreur={error} />
  if (isLoading) return <Chargement />
  return (
    <>
      <OutilsListe
        recherche={recherche}
        setRecherche={setRecherche}
        placeholder="Nom, téléphone, numéro B-…"
        tris={[['nom', 'Nom A → Z'], ['prenom', 'Prénom A → Z'], ['age', 'Âge'], ['suivi', type === 'soignant' ? 'Vus récemment' : 'Meilleure assiduité']]}
        tri={tri}
        setTri={setTri}
        total={affiches.length}
      >
        {type === 'soignant' ? (
          <div className="sans-barre -mx-4 flex gap-2 overflow-x-auto px-4">
            {([['', 'Tous'], ['sans', 'Pas encore vus'], ...Object.entries(STATUTS_CONSULTATION).map(([k, s]) => [k, s.libelle])] as [string, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setFiltre(k === filtre ? '' : k as typeof filtre)}
                className={cn('h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium', filtre === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>{l}</button>
            ))}
          </div>
        ) : null}
      </OutilsListe>
      <Encadre>
        {affiches.map((b) => {
          const c = derniere(b)
          return (
            <div key={b.beneficiaire_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar prenom={b.prenom} nom={b.nom} taille="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.prenom} {b.nom}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[b.numero, b.age != null ? `${b.age} ans` : null, b.sexe === 'F' ? 'F' : b.sexe === 'M' ? 'H' : null, b.telephone].filter(Boolean).join(' · ')}
                </div>
              </div>
              {type === 'formateur' ? (
                <>
                  {b.presences !== '0/0' ? <span className="text-xs text-muted-foreground">Présences <b className="text-foreground">{b.presences}</b></span> : null}
                  {b.certificats.length ? <Badge variant="secondary"><Award className="size-3" /> {b.certificats.length} certificat{b.certificats.length > 1 ? 's' : ''}</Badge> : null}
                  {!cloturee ? <Button size="sm" variant="ghost" onClick={() => setCertificat(b)}><Award /> Certificat</Button> : null}
                </>
              ) : (
                <>
                  {c ? <PastilleConsultation statut={c.statut} /> : <span className="text-xs text-muted-foreground">pas encore vu</span>}
                  <Button size="sm" variant="secondary" onClick={() => setDossier(b)}><Stethoscope /> Dossier</Button>
                </>
              )}
            </div>
          )
        })}
      </Encadre>
      {dossier ? (
        <ConsultationDialog patient={dossier} consultations={consultations} peutSaisir fermer={() => setDossier(null)}
          apres={() => qc.invalidateQueries({ queryKey: ['consultations', actionId] })} />
      ) : null}
      {certificat ? <Certificat b={certificat} fermer={() => setCertificat(null)} apres={() => qc.invalidateQueries({ queryKey: ['portail-participants', actionId] })} /> : null}
    </>
  )
}

function Certificat({ b, fermer, apres }: { b: Participant; fermer: () => void; apres: () => void }) {
  const [description, setDescription] = useState('Attestation de fin de formation')
  const [numero, setNumero] = useState('')
  const [jour, setJour] = useState(aujourdhui())
  const [envoi, setEnvoi] = useState(false)
  async function enregistrer() {
    setEnvoi(true)
    const { error } = await supabase.rpc('portail_certificat', { p_beneficiaire: b.beneficiaire_id, p_description: description, p_numero: numero, p_date: jour })
    setEnvoi(false)
    if (error) return toast.error(messageErreur(error))
    toast.success('Certificat enregistré')
    apres()
    fermer()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Certificat · {b.prenom} {b.nom}</DialogTitle>
          <DialogDescription>Enregistré au nom de votre organisation.</DialogDescription>
        </DialogHeader>
        {b.certificats.length ? (
          <div className="space-y-1 text-sm">
            {b.certificats.map((c) => <div key={c.id} className="rounded-lg bg-muted/50 px-3 py-2">{c.description}{c.numero_document ? ` · n° ${c.numero_document}` : ''} · {date(c.date)}</div>)}
          </div>
        ) : null}
        <Champ label="Intitulé"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Champ>
        <div className="grid grid-cols-2 gap-3">
          <Champ label="N° du certificat"><Input value={numero} onChange={(e) => setNumero(e.target.value)} /></Champ>
          <Champ label="Date"><Input type="date" value={jour} onChange={(e) => setJour(e.target.value)} /></Champ>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={fermer}>Annuler</Button>
          <Button onClick={enregistrer} disabled={envoi || !description.trim()}>Enregistrer</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SeancesFormateur({ actionId, cloturee }: { actionId: string; cloturee: boolean }) {
  const qc = useQueryClient()
  const { data: seances = [], isLoading, error } = useQuery({
    queryKey: ['portail-seances', actionId],
    queryFn: async () => verifier(await supabase.rpc('portail_seances', { p_action: actionId })) as SeancePortail[],
  })
  const { data: participants = [] } = useParticipants(actionId)
  const [appel, setAppel] = useState<SeancePortail | null>(null)
  const [scan, setScan] = useState<SeancePortail | null>(null)
  const [tri, setTri] = useState<'chrono' | 'recentes'>('chrono')
  const rafraichir = () => { qc.invalidateQueries({ queryKey: ['portail-seances', actionId] }); qc.invalidateQueries({ queryKey: ['portail-participants', actionId] }) }
  const numero = new Map(seances.map((s, i) => [s.id, i + 1]))
  const affichees = tri === 'chrono' ? seances : [...seances].reverse()

  if (error) return <Erreur erreur={error} />
  if (isLoading) return <Chargement />
  if (!seances.length) return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune séance planifiée par l'association pour le moment.</p>
  return (
    <>
      <div className="mb-3 flex justify-end">
        <select value={tri} onChange={(e) => setTri(e.target.value as typeof tri)} className="h-9 rounded-lg border border-input bg-card px-3 text-sm">
          <option value="chrono">Ordre chronologique</option>
          <option value="recentes">Plus récentes d'abord</option>
        </select>
      </div>
      <Encadre>
        {affichees.map((s) => {
          const ps = Object.values(s.presences)
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <BlocDate date={s.date} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">Séance {numero.get(s.id)}{s.theme ? ` — ${s.theme}` : ''}</div>
                <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {s.heure_debut ? <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{heure(s.heure_debut)}{s.heure_fin ? ` – ${heure(s.heure_fin)}` : ''}</span> : null}
                  {s.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{s.lieu}</span> : null}
                  {ps.length ? <span><b className="text-foreground">{ps.filter(Boolean).length}</b>/{ps.length} présents</span> : s.date <= aujourdhui() ? <span>appel à faire</span> : null}
                </div>
              </div>
              {!cloturee && participants.length ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setScan(s)}><ScanLine /> Scanner</Button>
                  <Button size="sm" variant={ps.length ? 'ghost' : 'secondary'} onClick={() => setAppel(s)}><ClipboardCheck /> {ps.length ? 'Modifier' : 'Appel'}</Button>
                </div>
              ) : null}
            </div>
          )
        })}
      </Encadre>
      {appel ? <AppelPortail seance={appel} participants={participants} fermer={() => setAppel(null)} apres={rafraichir} /> : null}
      <Scanner
        ouvert={!!scan}
        fermer={() => { setScan(null); rafraichir() }}
        titre={scan ? `Pointage du ${date(scan.date)}` : ''}
        pointer={async (jeton) => verifier(await supabase.rpc('pointer_seance', { p_seance: scan!.id, p_jeton: jeton })) as ResultatPointage}
      />
    </>
  )
}

function AppelPortail({ seance, participants, fermer, apres }: { seance: SeancePortail; participants: Participant[]; fermer: () => void; apres: () => void }) {
  const [etat, setEtat] = useState<Record<string, boolean>>(() => Object.fromEntries(participants.map((b) => [b.beneficiaire_id, seance.presences[b.beneficiaire_id] ?? true])))
  const [envoi, setEnvoi] = useState(false)
  async function enregistrer() {
    setEnvoi(true)
    const { error } = await supabase.rpc('portail_appel', { p_seance: seance.id, p_presences: etat })
    setEnvoi(false)
    if (error) return toast.error(messageErreur(error))
    toast.success('Appel enregistré')
    apres()
    fermer()
  }
  const presents = Object.values(etat).filter(Boolean).length
  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Appel du {date(seance.date)}</DialogTitle>
          <DialogDescription>Touchez un nom pour le marquer absent. {presents} présent{presents > 1 ? 's' : ''} sur {participants.length}.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50dvh] divide-y divide-border/70 overflow-y-auto rounded-xl border border-border">
          {trier(participants, (b) => `${b.nom} ${b.prenom}`).map((b) => {
            const present = etat[b.beneficiaire_id] ?? true
            return (
              <button key={b.beneficiaire_id} type="button" onClick={() => setEtat({ ...etat, [b.beneficiaire_id]: !present })}
                className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left', !present && 'bg-[#fbe6e6]/60')}>
                <Avatar prenom={b.prenom} nom={b.nom} taille="sm" />
                <span className={cn('flex-1 text-sm font-medium', !present && 'text-muted-foreground line-through')}>{b.prenom} {b.nom}</span>
                <span className={cn('inline-flex size-7 items-center justify-center rounded-full', present ? 'bg-[#e2f4e2] text-[#0b6b0b]' : 'bg-[#fbe6e6] text-[#a32b2b]')}>
                  {present ? <Check className="size-4" /> : <X className="size-4" />}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={fermer}>Annuler</Button>
          <Button onClick={enregistrer} disabled={envoi}>Enregistrer l'appel</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface DonneesRapport {
  action: { titre: string; type: string | null; date_debut: string; date_fin: string | null; lieu: string | null; statut: StatutAction; bilan: string | null }
  beneficiaires: number; personnes: number; collectifs: number; femmes: number; hommes: number; jeunes: number; termine: number; abandon: number
  apports: { nature: keyof typeof LIBELLES_NATURE; nombre: number; valeur: number }[]
  seances: number; presence: number | null
  situations: Record<string, number>; consultations: Record<string, number>
}

/** Rapport chiffré et anonyme : aucun nom de bénéficiaire. */
function Rapport({ actionId }: { actionId: string }) {
  const { data: r, isLoading, error } = useQuery({
    queryKey: ['portail-rapport', actionId],
    queryFn: async () => verifier(await supabase.rpc('portail_rapport', { p_action: actionId })) as DonneesRapport,
  })
  if (error) return <Erreur erreur={error} />
  if (isLoading || !r) return <Chargement />
  const total = r.apports.reduce((s, x) => s + Number(x.valeur), 0)
  const chiffres: [string | number, string][] = [
    [r.beneficiaires, 'bénéficiaires'], [r.femmes, 'femmes'], [r.jeunes, 'jeunes (15-35 ans)'], [r.termine, 'ont terminé'],
    ...(r.seances ? [[r.seances, 'séances'] as [number, string], [r.presence != null ? `${r.presence} %` : '—', 'présence moyenne'] as [string, string]] : []),
    ...(total ? [[fcfa(total), 'remis (kits, dons, soins)'] as [string, string]] : []),
  ]
  const totalSituations = Object.values(r.situations).reduce((s, n) => s + n, 0)
  const totalConsultations = Object.values(r.consultations).reduce((s, n) => s + n, 0)
  return (
    <div className="space-y-5">
      <div className="no-print flex justify-end"><Button size="sm" variant="secondary" onClick={() => window.print()}><Printer /> Imprimer / PDF</Button></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {chiffres.map(([v, l]) => (
          <div key={l} className="rounded-xl border border-border bg-card p-4 shadow-carte">
            <div className="font-heading text-2xl font-semibold text-primary chiffres">{v}</div>
            <div className="text-xs text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>
      {r.apports.length ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 font-semibold">Ce qui a été remis</h2>
          {r.apports.map((x) => (
            <div key={x.nature} className="flex justify-between border-b border-border/60 py-1.5 text-sm last:border-0">
              <span>{LIBELLES_NATURE[x.nature] ?? x.nature} · {x.nombre}</span><b className="chiffres">{Number(x.valeur) ? fcfa(Number(x.valeur)) : '—'}</b>
            </div>
          ))}
        </section>
      ) : null}
      {totalConsultations ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 font-semibold">Consultations ({totalConsultations})</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(r.consultations).map(([k, n]) => <span key={k} className="text-sm"><PastilleConsultation statut={k as StatutConsultation} /> <b>{n}</b></span>)}
          </div>
        </section>
      ) : null}
      {totalSituations ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 font-semibold">Que sont-ils devenus ? (dernier suivi)</h2>
          {SITUATIONS.filter((s) => r.situations[s.valeur]).map((s) => (
            <div key={s.valeur} className="flex items-center gap-2 py-1 text-sm">
              <span className="size-2.5 rounded-sm" style={{ background: s.couleur }} />{s.libelle}
              <b className="ml-auto chiffres">{r.situations[s.valeur]} ({Math.round((100 * r.situations[s.valeur]) / totalSituations)} %)</b>
            </div>
          ))}
        </section>
      ) : null}
      {r.action.bilan ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 font-semibold">Bilan de l'association</h2>
          <p className="whitespace-pre-line text-sm">{r.action.bilan}</p>
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">Chiffres anonymes : les données personnelles des bénéficiaires restent confidentielles.</p>
    </div>
  )
}
