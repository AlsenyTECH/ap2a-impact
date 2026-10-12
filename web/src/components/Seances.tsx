import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, CalendarRange, Check, ClipboardCheck, Clock, MapPin, ScanLine, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Champ, Pastilles } from '@/components/champs'
import { Scanner } from '@/components/Scanner'
import { OutilsListe } from '@/components/OutilsListe'
import { correspond, trier } from '@/lib/recherche'
import { Avatar, BlocDate } from '@/components/design'
import { aujourdhui, date, nomCible } from '@/lib/format'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import { estErreurReseau, executer } from '@/lib/horsligne'
import type { Presence, ResultatPointage, Seance, StatutBeneficiaire, TypeCible } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Inscrit { id: string; statut: StatutBeneficiaire; cible_id: string; cible: { prenom: string | null; nom: string; type: TypeCible } }

const JOURS: [number, string][] = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Jeu'], [5, 'Ven'], [6, 'Sam'], [0, 'Dim']]

/** Chaque jour coché entre deux dates (120 au plus). */
export function datesEntre(du: string, au: string, jours: number[]) {
  if (!du || !au || au < du) return []
  const liste: string[] = []
  for (let d = new Date(`${du}T12:00:00`); d <= new Date(`${au}T12:00:00`) && liste.length < 120; d.setDate(d.getDate() + 1)) {
    if (jours.includes(d.getDay())) liste.push(d.toISOString().slice(0, 10))
  }
  return liste
}

/** Choix des jours de la semaine (lun, mer, ven…). */
export function ChoixJours({ jours, setJours }: { jours: number[]; setJours: (j: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {JOURS.map(([n, l]) => (
        <button key={n} type="button" onClick={() => setJours(jours.includes(n) ? jours.filter((x) => x !== n) : [...jours, n])}
          className={cn('h-9 w-12 rounded-lg border text-sm font-medium', jours.includes(n) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>
          {l}
        </button>
      ))}
    </div>
  )
}
const heure = (h: string | null) => (h ? h.slice(0, 5).replace(':', 'h') : null)

/**
 * Séances d'une action (une formation sur plusieurs jours) et appel des
 * présences. `planifier` : créer et retirer des séances ; `appel` : faire
 * l'appel (responsable et équipe de terrain).
 */
export function Seances({ actionId, planifier, appel, voitBeneficiaires, debut, fin }: {
  actionId: string
  planifier: boolean
  appel: boolean
  voitBeneficiaires: boolean
  /** Dates de l'action, proposées par défaut pour planifier les séances. */
  debut?: string
  fin?: string | null
}) {
  const qc = useQueryClient()
  const [ajout, setAjout] = useState<'une' | 'plusieurs' | null>(null)
  const [appelDe, setAppelDe] = useState<Seance | null>(null)
  const [scanDe, setScanDe] = useState<Seance | null>(null)

  const { data: seances = [] } = useQuery({
    queryKey: ['seances', actionId],
    queryFn: async () => verifier(await supabase.from('seances').select('*').eq('action_id', actionId).order('date').order('heure_debut')) as Seance[],
  })
  const { data: presences = [] } = useQuery({
    queryKey: ['presences', actionId],
    enabled: voitBeneficiaires,
    queryFn: async () => verifier(await supabase.from('presences').select('seance_id, beneficiaire_id, present, note, seance:seances!inner(action_id)').eq('seance.action_id', actionId)) as unknown as Presence[],
  })
  const { data: inscrits = [] } = useQuery({
    queryKey: ['inscrits-appel', actionId],
    enabled: voitBeneficiaires,
    queryFn: async () =>
      verifier(await supabase.from('beneficiaires').select('id, statut, cible_id, cible:cibles!beneficiaires_cible_id_fkey(prenom, nom, type)')
        .eq('action_id', actionId).neq('statut', 'abandon').order('ajoute_le')) as unknown as Inscrit[],
  })

  const rafraichir = () => {
    qc.invalidateQueries({ queryKey: ['seances', actionId] })
    qc.invalidateQueries({ queryKey: ['presences', actionId] })
  }

  // Fin du scan : ceux qui n'ont pas été pointés peuvent être marqués absents d'un coup.
  // Cartes des participants, gardées dans le téléphone : le scan marche aussi sans réseau.
  const { data: cartesAction = [] } = useQuery({
    queryKey: ['cartes-action', actionId, inscrits.length],
    enabled: appel && voitBeneficiaires && inscrits.length > 0,
    queryFn: async () => verifier(await supabase.from('cartes').select('jeton, cible_id, revoquee_le').in('cible_id', inscrits.map((b) => b.cible_id).slice(0, 300))) as { jeton: string; cible_id: string; revoquee_le: string | null }[],
  })

  // Présences ajoutées sur le téléphone, affichées tout de suite (avant l'envoi).
  function noterLocalement(lignes: { seance_id: string; beneficiaire_id: string; present: boolean }[], remplacer = true) {
    qc.setQueryData<Presence[]>(['presences', actionId], (avant = []) => {
      const cle = (p: { seance_id: string; beneficiaire_id: string }) => `${p.seance_id}|${p.beneficiaire_id}`
      const nouvelles = new Map(lignes.map((l) => [cle(l), l]))
      const gardees = avant.filter((p) => !nouvelles.has(cle(p)) || !remplacer)
      const deja = new Set(gardees.map(cle))
      return [...gardees, ...lignes.filter((l) => !deja.has(cle(l))).map((l) => ({ ...l, note: null }) as Presence)]
    })
  }

  async function pointer(seance: Seance, jeton: string): Promise<ResultatPointage> {
    if (navigator.onLine) {
      try {
        const r = verifier(await supabase.rpc('pointer_seance', { p_seance: seance.id, p_jeton: jeton })) as ResultatPointage
        return r
      } catch (e) {
        if (!estErreurReseau(e)) throw e
      }
    }
    // Sans réseau : la carte est reconnue grâce à la liste gardée dans le téléphone.
    const carte = cartesAction.find((c) => c.jeton === jeton)
    if (!carte) return { statut: 'inconnue' }
    const b = inscrits.find((i) => i.cible_id === carte.cible_id)
    if (carte.revoquee_le) return { statut: 'revoquee', prenom: b?.cible.prenom ?? undefined, nom: b?.cible.nom }
    if (!b) return { statut: 'pas_inscrit' }
    const deja = (qc.getQueryData<Presence[]>(['presences', actionId]) ?? []).some((p) => p.seance_id === seance.id && p.beneficiaire_id === b.id && p.present)
    if (!deja) {
      await executer(`Présence de ${nomCible(b.cible)} — séance du ${date(seance.date)}`, {
        kind: 'upsert', table: 'presences', onConflict: 'seance_id,beneficiaire_id',
        valeurs: [{ seance_id: seance.id, beneficiaire_id: b.id, present: true, pointe_le: new Date().toISOString(), mode: 'scan' }],
      })
      noterLocalement([{ seance_id: seance.id, beneficiaire_id: b.id, present: true }])
    }
    return { statut: deja ? 'deja' : 'ok', prenom: b.cible.prenom ?? undefined, nom: b.cible.nom }
  }

  async function finScan() {
    const s = scanDe!
    setScanDe(null)
    const pointes = new Set((qc.getQueryData<Presence[]>(['presences', actionId]) ?? []).filter((p) => p.seance_id === s.id).map((p) => p.beneficiaire_id))
    const restants = inscrits.filter((b) => !pointes.has(b.id))
    if (restants.length && confirm(`${restants.length} participant(s) n'ont pas été pointés. Les marquer absents ?`)) {
      const lignes = restants.map((b) => ({ seance_id: s.id, beneficiaire_id: b.id, present: false }))
      try {
        const r = await executer(`Absents de la séance du ${date(s.date)} (${restants.length})`, { kind: 'upsert', table: 'presences', valeurs: lignes, onConflict: 'seance_id,beneficiaire_id', ignoreDuplicates: true })
        noterLocalement(lignes, false)
        if (r === 'en_attente') toast.info('Gardé dans le téléphone : envoyé au retour du réseau')
      } catch (e) {
        toast.error(messageErreur(e))
      }
    }
    if (navigator.onLine) rafraichir()
  }

  async function retirer(s: Seance) {
    if (!confirm(`Retirer la séance du ${date(s.date)} ?${presences.some((p) => p.seance_id === s.id) ? ' Son appel sera perdu.' : ''}`)) return
    const { error } = await supabase.from('seances').delete().eq('id', s.id)
    if (error) return toast.error(messageErreur(error))
    rafraichir()
  }

  // Numéro chronologique, conservé quel que soit le tri choisi.
  const numero = new Map(seances.map((s, i) => [s.id, i + 1]))
  const [tri, setTri] = useState<'chrono' | 'recentes' | 'presence'>('chrono')
  const [etat, setEtat] = useState<'' | 'venir' | 'appel' | 'faites'>('')
  const [filtre, setFiltre] = useState('')
  const tauxSeance = (id: string) => {
    const ps = presences.filter((p) => p.seance_id === id)
    return ps.length ? ps.filter((p) => p.present).length / ps.length : null
  }
  const appelFait = (id: string) => presences.some((p) => p.seance_id === id)
  const retenues = seances.filter((s) => correspond(filtre, s.theme, s.lieu, s.notes, `seance ${numero.get(s.id)}`)
    && (!etat || (etat === 'venir' ? s.date > aujourdhui() : etat === 'faites' ? appelFait(s.id) : s.date <= aujourdhui() && !appelFait(s.id))))
  const affichees = tri === 'chrono' ? retenues : tri === 'recentes' ? [...retenues].reverse() : trier(retenues, (s) => tauxSeance(s.id), 'desc')

  const faites = seances.filter((s) => presences.some((p) => p.seance_id === s.id)).length
  const moyenne = presences.length ? Math.round((100 * presences.filter((p) => p.present).length) / presences.length) : null

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          <b className="text-foreground">{seances.length}</b> séance{seances.length > 1 ? 's' : ''}
          {seances.length ? <> · appel fait pour <b className="text-foreground">{faites}</b></> : null}
          {moyenne != null ? <> · présence moyenne <b className="text-foreground">{moyenne} %</b></> : null}
        </div>
        {planifier ? (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAjout('plusieurs')}><CalendarRange /> Plusieurs séances</Button>
            <Button size="sm" onClick={() => setAjout('une')}><CalendarPlus /> Ajouter une séance</Button>
          </div>
        ) : null}
      </div>

      {!seances.length ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Pas de séance planifiée. Une formation sur plusieurs jours ? Ajoutez ses séances pour faire l'appel à chacune.
        </p>
      ) : (
        <>
        {seances.length > 1 ? (
          <OutilsListe
            recherche={filtre}
            setRecherche={setFiltre}
            placeholder="Chercher une séance : thème, lieu…"
            tris={[['chrono', 'Ordre chronologique'], ['recentes', 'Plus récentes d\'abord'], ['presence', 'Meilleure présence']]}
            tri={tri}
            setTri={setTri}
            total={affichees.length}
          >
            <Pastilles<'' | 'venir' | 'appel' | 'faites'>
              value={etat}
              onChange={(v) => setEtat(v === etat ? '' : v)}
              options={[['', 'Toutes'], ['venir', 'À venir'], ['appel', 'Appel à faire'], ['faites', 'Appel fait']]}
            />
          </OutilsListe>
        ) : null}
        <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card shadow-carte">
          {affichees.map((s) => {
            const ps = presences.filter((p) => p.seance_id === s.id)
            const presents = ps.filter((p) => p.present).length
            const passee = s.date <= aujourdhui()
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <BlocDate date={s.date} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Séance {numero.get(s.id)}{s.theme ? ` — ${s.theme}` : ''}</div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {s.heure_debut ? <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{heure(s.heure_debut)}{s.heure_fin ? ` – ${heure(s.heure_fin)}` : ''}</span> : null}
                    {s.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{s.lieu}</span> : null}
                  </div>
                </div>
                {ps.length ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e2f4e2] px-2.5 py-0.5 text-xs font-semibold text-[#0b6b0b] chiffres">
                    <Check className="size-3.5" /> {presents}/{ps.length} présents
                  </span>
                ) : passee ? <span className="text-xs text-muted-foreground">appel à faire</span> : null}
                <div className="flex gap-1">
                  {appel && voitBeneficiaires && inscrits.length ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setScanDe(s)} title="Pointer avec les cartes QR"><ScanLine /> Scanner</Button>
                      <Button size="sm" variant={ps.length ? 'ghost' : 'secondary'} onClick={() => setAppelDe(s)}><ClipboardCheck /> {ps.length ? 'Modifier' : "Faire l'appel"}</Button>
                    </>
                  ) : null}
                  {planifier ? <Button size="sm" variant="ghost" onClick={() => retirer(s)} aria-label="Retirer la séance"><Trash2 className="text-muted-foreground" /></Button> : null}
                </div>
              </div>
            )
          })}
        </div>
        </>
      )}

      <AjoutSeances mode={ajout} fermer={() => setAjout(null)} actionId={actionId} apres={rafraichir} debutAction={debut} finAction={fin} />
      <Scanner
        ouvert={!!scanDe}
        fermer={finScan}
        titre={scanDe ? `Pointage du ${date(scanDe.date)}` : ''}
        description="Présentez les cartes des participants une par une. Les présents sont enregistrés à chaque scan."
        pointer={(jeton) => pointer(scanDe!, jeton)}
      />
      <Appel seance={appelDe} fermer={() => setAppelDe(null)} inscrits={inscrits} presences={presences} apres={(lignes) => { noterLocalement(lignes); if (navigator.onLine) rafraichir() }} />
    </>
  )
}

function AjoutSeances({ mode, fermer, actionId, apres, debutAction, finAction }: {
  mode: 'une' | 'plusieurs' | null
  fermer: () => void
  actionId: string
  apres: () => void
  debutAction?: string
  finAction?: string | null
}) {
  const [jour, setJour] = useState(aujourdhui())
  const [fin, setFin] = useState('')
  const [jours, setJours] = useState<number[]>([1, 3, 5])
  const [debut, setDebut] = useState('09:00')
  const [finHeure, setFinHeure] = useState('12:00')
  const [theme, setTheme] = useState('')
  const [lieu, setLieu] = useState('')
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (mode) { setJour(mode === 'plusieurs' && debutAction ? debutAction : aujourdhui()); setFin(finAction ?? ''); setTheme('') }
  }, [mode, debutAction, finAction])

  // Dates des séances : une seule, ou chaque jour coché entre deux dates.
  const dates = (() => {
    if (mode === 'une') return [jour]
    return datesEntre(jour, fin, jours)
  })()

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (!dates.length) return toast.error('Aucune date ne correspond')
    setEnvoi(true)
    const { error } = await supabase.from('seances').insert(dates.map((d) => ({
      action_id: actionId, date: d, heure_debut: debut || null, heure_fin: finHeure || null, theme: theme.trim() || null, lieu: lieu.trim() || null,
    })))
    setEnvoi(false)
    if (error) return toast.error(messageErreur(error))
    toast.success(dates.length > 1 ? `${dates.length} séances ajoutées` : 'Séance ajoutée')
    apres()
    fermer()
  }

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'plusieurs' ? 'Planifier plusieurs séances' : 'Nouvelle séance'}</DialogTitle>
          {mode === 'plusieurs' ? <DialogDescription>Par exemple : chaque lundi, mercredi et vendredi pendant un mois.</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={enregistrer} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Champ label={mode === 'plusieurs' ? 'Du' : 'Date'}><Input type="date" required value={jour} onChange={(e) => setJour(e.target.value)} /></Champ>
            {mode === 'plusieurs' ? <Champ label="Au"><Input type="date" required min={jour} value={fin} onChange={(e) => setFin(e.target.value)} /></Champ> : <span />}
          </div>
          {mode === 'plusieurs' ? (
            <Champ label="Jours de la semaine">
              <ChoixJours jours={jours} setJours={setJours} />
            </Champ>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Début"><Input type="time" value={debut} onChange={(e) => setDebut(e.target.value)} /></Champ>
            <Champ label="Fin"><Input type="time" value={finHeure} onChange={(e) => setFinHeure(e.target.value)} /></Champ>
          </div>
          <Champ label="Thème (facultatif)"><Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Sécurité électrique, schémas…" /></Champ>
          <Champ label="Lieu (si différent de l'action)"><Input value={lieu} onChange={(e) => setLieu(e.target.value)} /></Champ>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{mode === 'plusieurs' ? `${dates.length} séance${dates.length > 1 ? 's' : ''}` : ''}</span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
              <Button type="submit" disabled={envoi || !dates.length}>Enregistrer</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Appel d'une séance : présent / absent pour chaque inscrit. */
function Appel({ seance, fermer, inscrits, presences, apres }: {
  seance: Seance | null
  fermer: () => void
  inscrits: Inscrit[]
  presences: Presence[]
  apres: (lignes: { seance_id: string; beneficiaire_id: string; present: boolean }[]) => void
}) {
  const [etat, setEtat] = useState<Record<string, boolean>>({})
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (!seance) return
    const deja = presences.filter((p) => p.seance_id === seance.id)
    // Par défaut tout le monde est présent : on ne touche que les absents.
    setEtat(Object.fromEntries(inscrits.map((b) => [b.id, deja.find((p) => p.beneficiaire_id === b.id)?.present ?? true])))
  }, [seance, inscrits, presences])

  async function enregistrer() {
    setEnvoi(true)
    const lignes = inscrits.map((b) => ({ seance_id: seance!.id, beneficiaire_id: b.id, present: etat[b.id] ?? true }))
    try {
      const r = await executer(`Appel de la séance du ${date(seance!.date)}`, { kind: 'upsert', table: 'presences', valeurs: lignes, onConflict: 'seance_id,beneficiaire_id' })
      toast.success(r === 'envoye' ? 'Appel enregistré' : 'Appel gardé dans le téléphone : envoyé au retour du réseau')
      apres(lignes)
      fermer()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  const presents = Object.values(etat).filter(Boolean).length
  return (
    <Dialog open={!!seance} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Appel du {seance ? date(seance.date) : ''}</DialogTitle>
          <DialogDescription>Touchez un nom pour le marquer absent. {presents} présent{presents > 1 ? 's' : ''} sur {inscrits.length}.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEtat(Object.fromEntries(inscrits.map((b) => [b.id, true])))}>Tous présents</Button>
          <Button size="sm" variant="ghost" onClick={() => setEtat(Object.fromEntries(inscrits.map((b) => [b.id, false])))}>Tous absents</Button>
        </div>
        <div className="max-h-[50dvh] divide-y divide-border/70 overflow-y-auto rounded-xl border border-border">
          {inscrits.map((b) => {
            const present = etat[b.id] ?? true
            return (
              <button key={b.id} type="button" onClick={() => setEtat({ ...etat, [b.id]: !present })}
                className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors', !present && 'bg-[#fbe6e6]/60')}>
                <Avatar prenom={b.cible.prenom} nom={b.cible.nom} nature={b.cible.type} taille="sm" />
                <span className={cn('flex-1 text-sm font-medium', !present && 'text-muted-foreground line-through')}>{nomCible(b.cible)}</span>
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
