import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarHeart, Clock, Lock, MapPin, Plus, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Champ, Chargement, EnTete, Erreur, Liste, Pastilles } from '@/components/champs'
import { BlocDate } from '@/components/design'
import { OutilsListe } from '@/components/OutilsListe'
import { useAuth } from '@/lib/auth'
import { aujourdhui } from '@/lib/format'
import { correspond, trier } from '@/lib/recherche'
import { useMembres } from '@/lib/requetes'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import type { Evenement } from '@/lib/types'

export const TYPES_EVENEMENT: [string, string][] = [
  ['ag', 'Assemblée générale'], ['reunion', 'Réunion'], ['ceremonie', 'Cérémonie'], ['remise', 'Remise de kits / attestations'],
  ['sensibilisation', 'Journée / sensibilisation'], ['autre', 'Autre'],
]
export const libelleType = (t: string) => TYPES_EVENEMENT.find(([v]) => v === t)?.[1] ?? t
export const heure = (h: string | null) => (h ? h.slice(0, 5).replace(':', 'h') : '')

type Ligne = Evenement & { presents: { count: number }[]; invites_liste: { count: number }[] }

export function Evenements() {
  const { a } = useAuth()
  const [recherche, setRecherche] = useState('')
  const [tri, setTri] = useState<'recents' | 'anciens' | 'titre' | 'presence'>('recents')
  const [quand, setQuand] = useState<'' | 'venir' | 'passes' | 'clotures'>('')
  const [type, setType] = useState('')
  const [creation, setCreation] = useState(false)

  const { data: evenements, isLoading, error } = useQuery({
    queryKey: ['evenements'],
    queryFn: async () => verifier(await supabase.from('evenements')
      .select('*, presents:evenement_presences(count), invites_liste:evenement_invites(count)')
      .order('date', { ascending: false }).limit(500)) as Ligne[],
  })
  const { data: membres = [] } = useMembres()
  const nbMembres = membres.filter((m) => m.actif).length
  const invites = (e: Ligne) => (e.invites === 'tous' ? nbMembres : e.invites_liste[0]?.count ?? 0)
  const presents = (e: Ligne) => e.presents[0]?.count ?? 0

  const auj = aujourdhui()
  const retenus = (evenements ?? []).filter((e) => (!type || e.type === type)
    && (!quand || (quand === 'venir' ? e.date >= auj : quand === 'clotures' ? !!e.cloture_le : e.date < auj && !e.cloture_le))
    && correspond(recherche, e.titre, e.lieu, e.description, libelleType(e.type)))
  const liste = tri === 'recents' ? trier(retenus, (e) => e.date, 'desc')
    : tri === 'anciens' ? trier(retenus, (e) => e.date)
    : tri === 'titre' ? trier(retenus, (e) => e.titre)
    : trier(retenus, (e) => (invites(e) ? presents(e) / invites(e) : null), 'desc')

  return (
    <>
      <EnTete
        titre="Événements"
        sousTitre="Assemblées, réunions, cérémonies : présences pointées avec la carte de membre"
        actions={a('admin', 'bureau', 'coordinateur') ? <Button onClick={() => setCreation(true)}><Plus className="size-4" /> Nouvel événement</Button> : null}
      />
      <OutilsListe
        recherche={recherche}
        setRecherche={setRecherche}
        placeholder="Titre, lieu, type…"
        tris={[['recents', 'Plus récents'], ['anciens', 'Plus anciens'], ['titre', 'Titre A → Z'], ['presence', 'Meilleure participation']]}
        tri={tri}
        setTri={setTri}
        total={evenements ? liste.length : undefined}
      >
        <div className="flex flex-wrap gap-3">
          <Pastilles<'' | 'venir' | 'passes' | 'clotures'> value={quand} onChange={(v) => setQuand(v === quand ? '' : v)} options={[['', 'Tous'], ['venir', 'À venir'], ['passes', 'Passés, à clôturer'], ['clotures', 'Clôturés']]} />
          <Liste className="w-auto" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tous les types</option>
            {TYPES_EVENEMENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Liste>
        </div>
      </OutilsListe>
      {error ? <Erreur erreur={error} /> : isLoading ? <Chargement /> : !liste.length ? (
        <EmptyState icon={CalendarHeart} title="Aucun événement" description={recherche || type || quand ? 'Essayez une autre recherche.' : 'Créez la prochaine assemblée ou réunion.'} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {liste.map((e) => {
            const passe = e.date < auj
            const n = invites(e)
            return (
              <Link key={e.id} to={`/evenements/${e.id}`} className="flex gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-carte transition hover:-translate-y-0.5 hover:shadow-haute">
                <BlocDate date={e.date} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    {libelleType(e.type)}
                    {e.cloture_le ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"><Lock className="size-3" /> Clôturé</span> : null}
                  </div>
                  <div className="truncate font-semibold">{e.titre}</div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {e.heure_debut ? <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{heure(e.heure_debut)}</span> : null}
                    {e.lieu ? <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{e.lieu}</span></span> : null}
                    <span className="inline-flex items-center gap-1"><UsersRound className="size-3.5" />
                      {passe || presents(e) ? <><b className="text-foreground">{presents(e)}</b>/{n} présents{n ? ` (${Math.round((100 * presents(e)) / n)} %)` : ''}</> : <>{n} invités</>}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
      <EvenementForm ouvert={creation} fermer={() => setCreation(false)} />
    </>
  )
}

export function EvenementForm({ ouvert, fermer, evenement }: { ouvert: boolean; fermer: () => void; evenement?: Evenement }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const vide = { titre: '', type: 'reunion', date: aujourdhui(), heure_debut: '', heure_fin: '', lieu: '', description: '', invites: 'tous' as 'tous' | 'selection' }
  const [v, setV] = useState(vide)
  const [envoi, setEnvoi] = useState(false)
  // Bénéficiaires invités : les participants des actions choisies.
  const [actionsInvitees, setActionsInvitees] = useState<string[]>([])
  const { data: actions = [] } = useQuery({
    queryKey: ['actions-pour-evenement'],
    enabled: ouvert,
    queryFn: async () => verifier(await supabase.from('actions').select('id, titre, date_debut, statut').neq('statut', 'annulee').order('date_debut', { ascending: false }).limit(150)) as { id: string; titre: string; date_debut: string; statut: string }[],
  })
  const { data: liees, isPending: chargementLiees } = useQuery({
    queryKey: ['evenement-actions', evenement?.id],
    enabled: ouvert && !!evenement,
    queryFn: async () => (verifier(await supabase.from('evenement_actions').select('action_id').eq('evenement_id', evenement!.id)) as { action_id: string }[]).map((x) => x.action_id),
  })
  // Rempli une seule fois par ouverture : un rafraîchissement n'efface pas ce qui a été coché.
  const initialise = useRef(false)
  const attenteLiees = !!evenement && chargementLiees
  useEffect(() => {
    if (!ouvert) { initialise.current = false; return }
    if (initialise.current || attenteLiees) return
    initialise.current = true
    setActionsInvitees(evenement ? liees ?? [] : [])
  }, [ouvert, evenement, liees, attenteLiees])
  useEffect(() => {
    if (ouvert) {
      setV(evenement
        ? { titre: evenement.titre, type: evenement.type, date: evenement.date, heure_debut: evenement.heure_debut?.slice(0, 5) ?? '', heure_fin: evenement.heure_fin?.slice(0, 5) ?? '', lieu: evenement.lieu ?? '', description: evenement.description ?? '', invites: evenement.invites }
        : vide)
    }
  }, [ouvert, evenement])

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    const donnees = {
      titre: v.titre.trim(), type: v.type, date: v.date, heure_debut: v.heure_debut || null, heure_fin: v.heure_fin || null,
      lieu: v.lieu.trim() || null, description: v.description.trim() || null, invites: v.invites,
    }
    const r = evenement
      ? await supabase.from('evenements').update(donnees).eq('id', evenement.id).select('id').single()
      : await supabase.from('evenements').insert(donnees).select('id').single()
    if (r.error) { setEnvoi(false); return toast.error(messageErreur(r.error)) }
    // Actions invitées : on ajoute les nouvelles, on retire celles décochées.
    const avant = evenement ? liees ?? [] : []
    const ajout = actionsInvitees.filter((x) => !avant.includes(x))
    const retrait = avant.filter((x) => !actionsInvitees.includes(x))
    const e1 = ajout.length ? (await supabase.from('evenement_actions').upsert(ajout.map((action_id) => ({ evenement_id: r.data.id, action_id })), { onConflict: 'evenement_id,action_id', ignoreDuplicates: true })).error : null
    const e2 = retrait.length ? (await supabase.from('evenement_actions').delete().eq('evenement_id', r.data.id).in('action_id', retrait)).error : null
    setEnvoi(false)
    if (e1 || e2) toast.error(`Bénéficiaires invités : ${messageErreur(e1 ?? e2)}`)
    qc.invalidateQueries({ queryKey: ['evenement-actions'] })
    qc.invalidateQueries({ queryKey: ['rappels-cibles'] })
    qc.invalidateQueries({ queryKey: ['evenements'] })
    qc.invalidateQueries({ queryKey: ['evenement'] })
    toast.success(evenement ? 'Événement modifié' : 'Événement créé')
    fermer()
    if (!evenement) navigate(`/evenements/${r.data.id}`)
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{evenement ? "Modifier l'événement" : 'Nouvel événement'}</DialogTitle></DialogHeader>
        <form onSubmit={enregistrer} className="grid gap-4">
          <Champ label="Type"><Pastilles value={v.type} onChange={(type) => setV({ ...v, type })} options={TYPES_EVENEMENT} /></Champ>
          <Champ label="Titre"><Input required value={v.titre} onChange={(e) => setV({ ...v, titre: e.target.value })} placeholder="Assemblée générale ordinaire 2026" /></Champ>
          <div className="grid grid-cols-3 gap-3">
            <Champ label="Date"><Input type="date" required value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Champ>
            <Champ label="Début"><Input type="time" value={v.heure_debut} onChange={(e) => setV({ ...v, heure_debut: e.target.value })} /></Champ>
            <Champ label="Fin"><Input type="time" value={v.heure_fin} onChange={(e) => setV({ ...v, heure_fin: e.target.value })} /></Champ>
          </div>
          <Champ label="Lieu"><Input value={v.lieu} onChange={(e) => setV({ ...v, lieu: e.target.value })} placeholder="Siège de l'association, Unité 17" /></Champ>
          <Champ label="Invités" aide="« Une sélection » : vous choisirez les membres invités sur la page de l'événement.">
            <Pastilles<'tous' | 'selection'> value={v.invites} onChange={(invites) => setV({ ...v, invites })} options={[['tous', 'Tous les membres'], ['selection', 'Une sélection']]} />
          </Champ>
          <Champ label="Bénéficiaires invités" aide={v.type === 'remise' ? 'Les participants des actions cochées sont convoqués à la remise ; ceux qui l\'ont accepté reçoivent un rappel la veille.' : 'Facultatif : les participants des actions cochées sont invités et peuvent recevoir un rappel la veille.'}>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-input p-1">
              {!actions.length ? <p className="p-2 text-sm text-muted-foreground">Aucune action.</p> : actions.map((x) => (
                <label key={x.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <input type="checkbox" className="size-4 accent-[#0b7a57]" checked={actionsInvitees.includes(x.id)}
                    onChange={(e) => setActionsInvitees((l) => (e.target.checked ? [...l, x.id] : l.filter((y) => y !== x.id)))} />
                  <span className="min-w-0 flex-1 truncate">{x.titre}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{new Date(x.date_debut).getFullYear()}</span>
                </label>
              ))}
            </div>
          </Champ>
          <Champ label="Ordre du jour / description"><Textarea rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Champ>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi || attenteLiees}>Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
