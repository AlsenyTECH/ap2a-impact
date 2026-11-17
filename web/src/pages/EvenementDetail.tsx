import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarPlus, Check, Clock, FileSpreadsheet, Lock, LockOpen, MapPin, Megaphone, Pencil, Printer, ScanLine, Trash2, UsersRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Chargement, Champ, Erreur, Liste, Pastilles } from '@/components/champs'
import { PartageMembres } from '@/components/PartageMembres'
import { Avatar, Liste as Encadre } from '@/components/design'
import { OutilsListe } from '@/components/OutilsListe'
import { Scanner } from '@/components/Scanner'
import { empreinteJeton } from '@/components/CarteQR'
import { useAuth } from '@/lib/auth'
import { exporterExcel } from '@/lib/export'
import { aujourdhui, date } from '@/lib/format'
import { nomRole } from '@/lib/droits'
import { membreAvecNumero } from '@/lib/recherche'
import { usePhotos } from '@/lib/photos'
import { correspond, trier } from '@/lib/recherche'
import { useMembres } from '@/lib/requetes'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import { estErreurReseau, executer } from '@/lib/horsligne'
import type { Evenement, EvenementDate, Membre, ResultatPointage } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EvenementForm, heure, libelleType } from '@/pages/Evenements'

interface Presence { date_id: string; membre_id: string; pointe_le: string; mode: 'manuel' | 'scan' }
interface PresenceCible { date_id: string; cible_id: string; pointe_le: string; mode: 'manuel' | 'scan' }
interface BeneficiaireInvite { cible_id: string; prenom: string | null; nom: string; numero_beneficiaire: string | null; actions: string; jeton_hash: string | null }

export function EvenementDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { peut, membre: moi } = useAuth()
  const [edition, setEdition] = useState(false)
  const [scan, setScan] = useState(false)
  const [partage, setPartage] = useState(false)
  const [dateChoisie, setDateChoisie] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [vue, setVue] = useState<'tous' | 'presents' | 'absents'>('tous')
  const [tri, setTri] = useState<'nom' | 'arrivee' | 'numero'>('nom')
  const [publicVu, setPublicVu] = useState<'membres' | 'beneficiaires'>('membres')

  const { data: ev, isLoading, error } = useQuery({
    queryKey: ['evenement', id],
    queryFn: async () => verifier(await supabase.from('evenements').select('*').eq('id', id).single()) as Evenement,
  })
  const { data: membres = [] } = useMembres()
  // Bénéficiaires invités : participants des actions reliées à l'événement.
  const { data: actionsInvitees = [] } = useQuery({
    queryKey: ['evenement-actions', id, 'detail'],
    queryFn: async () => (verifier(await supabase.from('evenement_actions').select('action:actions(id, titre, beneficiaires(count))').eq('evenement_id', id)) as unknown as { action: { id: string; titre: string; beneficiaires: { count: number }[] } | null }[])
      .map((x) => x.action).filter((x): x is NonNullable<typeof x> => !!x),
  })
  const { data: invites = [] } = useQuery({
    queryKey: ['evenement-invites', id],
    queryFn: async () => (verifier(await supabase.from('evenement_invites').select('membre_id').eq('evenement_id', id)) as { membre_id: string }[]).map((x) => x.membre_id),
  })
  const { data: toutesPresences = [] } = useQuery({
    queryKey: ['evenement-presences', id],
    queryFn: async () => verifier(await supabase.from('evenement_presences').select('date_id, membre_id, pointe_le, mode').eq('evenement_id', id)) as Presence[],
  })
  // Un événement peut se tenir sur plusieurs dates : une liste de présence par date.
  const { data: dates = [] } = useQuery({
    queryKey: ['evenement-dates', id],
    queryFn: async () => verifier(await supabase.from('evenement_dates').select('*').eq('evenement_id', id).order('date').order('heure_debut', { nullsFirst: true })) as EvenementDate[],
  })
  // Date affichée : celle choisie, sinon aujourd'hui, sinon la prochaine, sinon la dernière.
  const auj = aujourdhui()
  const dateActive = dates.find((d) => d.id === dateChoisie) ?? dates.find((d) => d.date === auj) ?? dates.find((d) => d.date > auj) ?? dates[dates.length - 1]
  const presences = toutesPresences.filter((p) => p.date_id === dateActive?.id)
  const { data: photos = {} } = usePhotos(membres.map((m) => m.photo_chemin))
  const rafraichir = () => {
    if (!navigator.onLine) return
    qc.invalidateQueries({ queryKey: ['evenement-presences', id] })
    qc.invalidateQueries({ queryKey: ['evenement-presences-cibles', id] })
  }
  // Bénéficiaires invités (participants des actions reliées) : lus par qui gère l'événement.
  const gereEv = !!ev && (peut('evenements.gerer') || (peut('evenements.creer') && ev.cree_par === moi?.id))
  const { data: beneficiaires = [] } = useQuery({
    queryKey: ['evenement-beneficiaires', id],
    enabled: gereEv && actionsInvitees.length > 0,
    queryFn: async () => (verifier(await supabase.rpc('beneficiaires_evenement', { p_evenement: id })) ?? []) as BeneficiaireInvite[],
  })
  const { data: presencesCibles = [] } = useQuery({
    queryKey: ['evenement-presences-cibles', id],
    enabled: gereEv && actionsInvitees.length > 0,
    queryFn: async () => verifier(await supabase.from('evenement_presences_cibles').select('date_id, cible_id, pointe_le, mode').eq('evenement_id', id)) as PresenceCible[],
  })
  // Cartes des membres, gardées dans le téléphone : le scan marche aussi sans réseau.
  const { data: cartesMembres = [] } = useQuery({
    queryKey: ['cartes-membres', 'empreintes'],
    queryFn: async () => verifier(await supabase.from('cartes').select('jeton_hash, membre_id, revoquee_le').not('membre_id', 'is', null)) as { jeton_hash: string; membre_id: string; revoquee_le: string | null }[],
  })
  const noterLocalement = (dateId: string, membreId: string, present: boolean, mode: 'scan' | 'manuel') =>
    qc.setQueryData<Presence[]>(['evenement-presences', id], (avant = []) => present
      ? [...avant.filter((p) => !(p.membre_id === membreId && p.date_id === dateId)), { date_id: dateId, membre_id: membreId, pointe_le: new Date().toISOString(), mode }]
      : avant.filter((p) => !(p.membre_id === membreId && p.date_id === dateId)))

  if (error) return <Erreur erreur={error} />
  if (isLoading || !ev) return <Chargement />

  const responsable = peut('evenements.gerer') || (peut('evenements.creer') && ev.cree_par === moi?.id)
  const cloture = !!ev.cloture_le
  // Une fois clôturé, l'événement est figé : plus de pointage ni de changement de la liste.
  const gere = responsable && !cloture
  const passe = (ev.date_fin ?? ev.date) < auj
  const cloturePar = membres.find((m) => m.id === ev.cloture_par)
  const presence = new Map(presences.map((p) => [p.membre_id, p]))
  const listeInvites = ev.invites === 'tous' ? membres.filter((m) => m.actif) : membres.filter((m) => invites.includes(m.id))
  // Présents non invités (scannés quand même) : on les montre aussi.
  const horsListe = membres.filter((m) => presence.has(m.id) && !listeInvites.includes(m))
  const concernes = [...listeInvites, ...horsListe]
  const nbPresents = concernes.filter((m) => presence.has(m.id)).length
  const taux = listeInvites.length ? Math.round((100 * listeInvites.filter((m) => presence.has(m.id)).length) / listeInvites.length) : 0

  const retenus = concernes.filter((m) => (vue === 'tous' || (vue === 'presents') === presence.has(m.id))
    && correspond(recherche, m.prenom, m.nom, m.numero_adherent, m.fonction))
  const affiches = tri === 'nom' ? trier(retenus, (m) => `${m.nom} ${m.prenom}`)
    : tri === 'numero' ? trier(retenus, (m) => m.numero_adherent)
    : trier(retenus, (m) => presence.get(m.id)?.pointe_le)

  async function basculer(m: Membre) {
    if (!dateActive) return
    const present = presence.has(m.id)
    try {
      await executer(`${present ? 'Retrait de la présence' : 'Présence'} de ${m.prenom} ${m.nom} — ${ev!.titre} (${date(dateActive.date)})`, present
        ? { kind: 'delete', table: 'evenement_presences', filtre: { date_id: dateActive.id, membre_id: m.id } }
        : { kind: 'upsert', table: 'evenement_presences', onConflict: 'date_id,membre_id', ignoreDuplicates: true,
            valeurs: [{ evenement_id: id, date_id: dateActive.id, membre_id: m.id, mode: 'manuel', pointe_le: new Date().toISOString() }] })
      noterLocalement(dateActive.id, m.id, !present, 'manuel')
      rafraichir()
    } catch (e) {
      toast.error(messageErreur(e))
    }
  }

  async function pointer(jeton: string): Promise<ResultatPointage> {
    if (navigator.onLine) {
      try {
        const r = verifier(await supabase.rpc('pointer_evenement', { p_evenement: id, p_jeton: jeton, p_date: dateActive?.id ?? null })) as ResultatPointage
        rafraichir()
        return r
      } catch (e) {
        if (!estErreurReseau(e)) throw e
      }
    }
    // Sans réseau : la carte est reconnue grâce à la liste gardée dans le téléphone.
    const empreinte = await empreinteJeton(jeton)
    const carte = cartesMembres.find((c) => c.jeton_hash === empreinte)
    if (!carte) {
      const b = beneficiaires.find((x) => x.jeton_hash === empreinte)
      if (!b || !dateActive) return { statut: 'inconnue' }
      const dejaB = (qc.getQueryData<PresenceCible[]>(['evenement-presences-cibles', id]) ?? []).some((p) => p.cible_id === b.cible_id && p.date_id === dateActive.id)
      if (!dejaB) {
        await executer(`Présence de ${b.prenom ?? ''} ${b.nom} — ${ev!.titre} (${date(dateActive.date)})`, {
          kind: 'upsert', table: 'evenement_presences_cibles', onConflict: 'date_id,cible_id', ignoreDuplicates: true,
          valeurs: [{ evenement_id: id, date_id: dateActive.id, cible_id: b.cible_id, mode: 'scan', pointe_le: new Date().toISOString() }],
        })
        qc.setQueryData<PresenceCible[]>(['evenement-presences-cibles', id], (avant = []) => [...avant, { date_id: dateActive.id, cible_id: b.cible_id, pointe_le: new Date().toISOString(), mode: 'scan' }])
      }
      return { statut: dejaB ? 'deja' : 'ok', prenom: b.prenom ?? undefined, nom: b.nom, numero: b.numero_beneficiaire ?? undefined }
    }
    const m = membres.find((x) => x.id === carte.membre_id)
    if (!m || carte.revoquee_le || !m.actif) return { statut: 'revoquee', prenom: m?.prenom, nom: m?.nom }
    if (!dateActive) return { statut: 'inconnue' }
    const deja = (qc.getQueryData<Presence[]>(['evenement-presences', id]) ?? []).some((p) => p.membre_id === m.id && p.date_id === dateActive.id)
    if (!deja) {
      await executer(`Présence de ${m.prenom} ${m.nom} — ${ev!.titre} (${date(dateActive.date)})`, {
        kind: 'upsert', table: 'evenement_presences', onConflict: 'date_id,membre_id', ignoreDuplicates: true,
        valeurs: [{ evenement_id: id, date_id: dateActive.id, membre_id: m.id, mode: 'scan', pointe_le: new Date().toISOString() }],
      })
      noterLocalement(dateActive.id, m.id, true, 'scan')
    }
    const invite = ev!.invites === 'tous' || invites.includes(m.id)
    return { statut: deja ? 'deja' : invite ? 'ok' : 'non_invite', prenom: m.prenom, nom: m.nom, numero: m.numero_adherent }
  }

  async function changerCloture(fermer: boolean) {
    if (!confirm(fermer
      ? 'Clôturer cet événement ? La liste de présence sera figée : plus de pointage ni de modification. Seul qui a le droit « Rouvrir un événement clôturé » pourra le rouvrir.'
      : 'Rouvrir cet événement ? La liste de présence pourra de nouveau être modifiée.')) return
    const { error } = await supabase.from('evenements').update({ cloture_le: fermer ? new Date().toISOString() : null }).eq('id', id)
    if (error) return toast.error(messageErreur(error))
    toast.success(fermer ? 'Événement clôturé' : 'Événement rouvert')
    qc.invalidateQueries({ queryKey: ['evenement', id] })
    qc.invalidateQueries({ queryKey: ['evenements'] })
  }

  async function supprimer() {
    if (!confirm(`Supprimer l'événement « ${ev!.titre} » et sa liste de présence ?`)) return
    const { error } = await supabase.from('evenements').delete().eq('id', id)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: ['evenements'] })
    navigate('/evenements')
  }

  async function exporter() {
    await exporterExcel(`presences-${dateActive?.date ?? ev!.date}-${ev!.titre.toLowerCase().replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`, trier(concernes, (m) => `${m.nom} ${m.prenom}`), [
      { titre: 'N° membre', valeur: (m) => m.numero_adherent, largeur: 14 },
      { titre: 'Prénom', valeur: (m) => m.prenom, largeur: 18 },
      { titre: 'Nom', valeur: (m) => m.nom, largeur: 18 },
      { titre: 'Rôle', valeur: (m) => nomRole(m) },
      { titre: 'Fonction', valeur: (m) => m.fonction, largeur: 20 },
      { titre: 'Présent', valeur: (m) => (presence.has(m.id) ? 'Oui' : 'Non') },
      { titre: 'Arrivée', valeur: (m) => (presence.get(m.id) ? new Date(presence.get(m.id)!.pointe_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null) },
      { titre: 'Pointage', valeur: (m) => (presence.get(m.id)?.mode === 'scan' ? 'Carte QR' : presence.has(m.id) ? 'Manuel' : null) },
      { titre: 'Invité', valeur: (m) => (listeInvites.includes(m) ? 'Oui' : 'Non (venu sans invitation)'), largeur: 22 },
    ], 'Présences')
  }

  return (
    <>
      <Link to="/evenements" className="no-print mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Événements</Link>
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:p-6">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-muted-foreground">{libelleType(ev.type)}</div>
            <h1 className="mt-0.5 text-2xl font-semibold leading-tight">{ev.titre}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{dates.length > 1 ? `${dates.length} dates, du ${date(ev.date)} au ${date(ev.date_fin ?? ev.date)}` : date(ev.date)}</span>
              {dates.length <= 1 && ev.heure_debut ? <span className="inline-flex items-center gap-1"><Clock className="size-4" />{heure(ev.heure_debut)}{ev.heure_fin ? ` – ${heure(ev.heure_fin)}` : ''}</span> : null}
              {ev.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="size-4" />{ev.lieu}</span> : null}
            </div>
            {ev.description ? <p className="mt-3 whitespace-pre-line text-sm">{ev.description}</p> : null}
            {actionsInvitees.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">Bénéficiaires invités :</span>
                {actionsInvitees.map((x) => (
                  <Link key={x.id} to={`/actions/${x.id}`} className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium hover:bg-muted">
                    {x.titre} · {x.beneficiaires[0]?.count ?? 0}
                  </Link>
                ))}
                {gere && !cloture ? <Link to="/rappels" className="text-xs font-medium text-primary hover:underline">Rappels de la veille →</Link> : null}
              </div>
            ) : null}
          </div>
          <div className="no-print flex flex-wrap gap-2 md:max-w-[50%] md:justify-end">
            {gere ? <Button onClick={() => setScan(true)}><ScanLine /> Scanner les cartes</Button> : null}
            <Button variant="secondary" onClick={exporter}><FileSpreadsheet /> Excel</Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer /> Imprimer</Button>
            {gere ? (
              <>
                <Button variant="secondary" onClick={() => setPartage(true)}><Megaphone /> Invités et annonce</Button>
                <Button variant="secondary" onClick={() => changerCloture(true)}><Lock /> Clôturer</Button>
                <Button variant="ghost" onClick={() => setEdition(true)}><Pencil /> Modifier</Button>
              </>
            ) : null}
            {cloture && peut('evenements.rouvrir') ? <Button variant="secondary" onClick={() => changerCloture(false)}><LockOpen /> Rouvrir</Button> : null}
            {gere || (cloture && peut('evenements.rouvrir')) ? <Button variant="ghost" className="text-destructive" onClick={supprimer} aria-label="Supprimer"><Trash2 /></Button> : null}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px border-t border-border/70 bg-border/70 text-center">
          {[[listeInvites.length, ev.invites === 'tous' ? 'membres actifs invités' : 'invités'], [nbPresents, dates.length > 1 && dateActive ? `présents le ${date(dateActive.date)}` : 'présents'], [`${taux} %`, 'participation']].map(([v, l]) => (
            <div key={l} className="bg-card px-3 py-3">
              <div className="font-heading text-xl font-semibold chiffres">{v}</div>
              <div className="text-xs text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
      </Card>

      {cloture ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-4 text-sm">
          <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <div className="font-semibold">Événement clôturé : liste de présence figée</div>
            <div className="text-muted-foreground">
              Clôturé le {new Date(ev.cloture_le!).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              {cloturePar ? ` par ${membreAvecNumero(cloturePar)}` : ' automatiquement'}. Seul le compte rendu peut encore être complété{peut('evenements.rouvrir') ? ' ; vous pouvez le rouvrir' : ''}.
            </div>
          </div>
        </div>
      ) : gere && passe ? (
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e9a812]/40 bg-[#fdf3d8] p-4 text-sm">
          <span>Cet événement est passé. Vérifiez la liste de présence puis <b>clôturez-le</b> pour la figer (sinon il le sera automatiquement 7 jours après).</span>
          <Button size="sm" onClick={() => changerCloture(true)}><Lock /> Clôturer maintenant</Button>
        </div>
      ) : null}

      <DatesEvenement ev={ev} dates={dates} active={dateActive} choisir={setDateChoisie} gere={gere} presencesParDate={toutesPresences} />

      <CompteRendu ev={ev} modifiable={responsable} />

      {beneficiaires.length ? (
        <div className="no-print mb-3">
          <Pastilles<'membres' | 'beneficiaires'> value={publicVu} onChange={setPublicVu}
            options={[['membres', `Membres (${concernes.length})`], ['beneficiaires', `Bénéficiaires (${beneficiaires.length})`]]} />
        </div>
      ) : null}
      {publicVu === 'beneficiaires' && beneficiaires.length ? (
        <PresencesBeneficiaires evenementId={id} titre={ev.titre} beneficiaires={beneficiaires} presences={presencesCibles} dateActive={dateActive} gere={gere} />
      ) : (<>
      <div className="no-print">
        <OutilsListe
          recherche={recherche}
          setRecherche={setRecherche}
          placeholder="Chercher un membre : nom, numéro…"
          tris={[['nom', 'Nom A → Z'], ['numero', 'N° de membre'], ['arrivee', "Heure d'arrivée"]]}
          tri={tri}
          setTri={setTri}
          total={affiches.length}
        >
          <Pastilles<'tous' | 'presents' | 'absents'> value={vue} onChange={setVue}
            options={[['tous', `Tous (${concernes.length})`], ['presents', `Présents (${nbPresents})`], ['absents', `Absents (${concernes.length - nbPresents})`]]} />
        </OutilsListe>
      </div>
      {!concernes.length ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <UsersRound className="mx-auto mb-2 size-6" />{ev.invites === 'selection' ? 'Aucun invité pour le moment. Choisissez les membres invités.' : 'Aucun membre actif.'}
        </p>
      ) : (
        <Encadre>
          {affiches.map((m) => {
            const p = presence.get(m.id)
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar prenom={m.prenom} nom={m.nom} photo={m.photo_chemin ? photos[m.photo_chemin] : null} taille="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.prenom} {m.nom}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.numero_adherent}{m.fonction ? ` · ${m.fonction}` : ''}{listeInvites.includes(m) ? '' : ' · venu sans invitation'}
                  </div>
                </div>
                {p ? (
                  <span className="text-xs text-muted-foreground">
                    {new Date(p.pointe_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}{p.mode === 'scan' ? ' · carte' : ''}
                  </span>
                ) : null}
                <button
                  disabled={!gere}
                  onClick={() => basculer(m)}
                  className={cn('inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold', p ? 'bg-[#e2f4e2] text-[#0b6b0b]' : 'bg-muted text-muted-foreground', gere && 'hover:opacity-80')}
                  title={gere ? (p ? 'Retirer la présence' : 'Marquer présent') : undefined}
                >
                  {p ? <><Check className="size-3.5" /> Présent</> : 'Absent'}
                </button>
              </div>
            )
          })}
        </Encadre>
      )}
      </>)}

      <EvenementForm ouvert={edition} fermer={() => setEdition(false)} evenement={ev} />
      <Scanner
        ouvert={scan}
        fermer={() => { setScan(false); rafraichir() }}
        titre={`Pointage — ${ev.titre}${dateActive && dates.length > 1 ? ` (${date(dateActive.date)})` : ''}`}
        description={beneficiaires.length ? 'Présentez les cartes (membres et bénéficiaires invités) une par une devant la caméra.' : 'Présentez les cartes de membre une par une devant la caméra.'}
        pointer={pointer}
      />
      {partage ? (
        <PartageMembres
          evenement={{ id, invites: ev.invites }}
          messageInitial={messageEvenement(ev, dates)}
          fermer={() => setPartage(false)}
        />
      ) : null}
    </>
  )
}

const jourCourt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

/** Message proposé pour annoncer l'événement : ses prochaines dates. */
export function messageEvenement(ev: Evenement, dates: EvenementDate[]) {
  const auj = aujourdhui()
  const prochaines = dates.filter((d) => d.date >= auj)
  const liste = (prochaines.length ? prochaines : dates).slice(0, 6)
    .map((d) => `- ${jourCourt(d.date)}${d.heure_debut ?? ev.heure_debut ? ` à ${heure((d.heure_debut ?? ev.heure_debut)!)}` : ''}${d.lieu ? `, ${d.lieu}` : ''}`)
  const reste = (prochaines.length ? prochaines : dates).length - liste.length
  return [
    `Bonjour {prénom}, l'AP2A vous invite : « ${ev.titre} »${ev.lieu ? ` (${ev.lieu})` : ''}.`,
    liste.length > 1 || reste > 0 ? `Dates :\n${liste.join('\n')}${reste > 0 ? `\n… et ${reste} autre(s) date(s)` : ''}` : liste[0]?.replace(/^- /, 'Le ') ?? '',
    ev.description ? ev.description.slice(0, 200) : '',
    'Merci de votre présence !',
  ].filter(Boolean).join('\n')
}

const REPETITIONS: [string, string][] = [['jour', 'Chaque jour'], ['semaine', 'Chaque semaine'], ['mois', 'Chaque mois']]

/** Dates de l'événement : choisir celle dont on fait l'appel, en ajouter (une ou une série), en retirer. */
function DatesEvenement({ ev, dates, active, choisir, gere, presencesParDate }: {
  ev: Evenement; dates: EvenementDate[]; active: EvenementDate | undefined; choisir: (id: string) => void; gere: boolean; presencesParDate: Presence[]
}) {
  const qc = useQueryClient()
  const [ajout, setAjout] = useState(false)
  const [serie, setSerie] = useState<'une' | 'serie'>('une')
  const [v, setV] = useState({ date: aujourdhui(), fin: '', repetition: 'semaine', heure_debut: '', heure_fin: '', lieu: '' })
  const [envoi, setEnvoi] = useState(false)
  if (!gere && dates.length <= 1) return null

  // Dates d'une série : du premier jour au dernier, tous les jours, semaines ou mois (60 au plus).
  function datesSerie(): string[] {
    if (serie === 'une') return [v.date]
    if (!v.fin || v.fin < v.date) return []
    const res: string[] = []
    const d = new Date(`${v.date}T12:00:00`)
    const jour = d.getDate()
    for (let i = 0; res.length < 60; i++) {
      const x = new Date(`${v.date}T12:00:00`)
      if (v.repetition === 'jour') x.setDate(jour + i)
      else if (v.repetition === 'semaine') x.setDate(jour + 7 * i)
      else { x.setMonth(x.getMonth() + i); if (x.getDate() !== jour) continue }
      const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
      if (iso > v.fin) break
      res.push(iso)
    }
    return res
  }
  const nouvelles = datesSerie().filter((d) => !dates.some((x) => x.date === d && (x.heure_debut ?? '') === (v.heure_debut ? `${v.heure_debut}:00` : '')))

  async function ajouter() {
    if (!nouvelles.length) return
    setEnvoi(true)
    const { error } = await supabase.from('evenement_dates').insert(nouvelles.map((d) => ({
      evenement_id: ev.id, date: d, heure_debut: v.heure_debut || null, heure_fin: v.heure_fin || null, lieu: v.lieu.trim() || null,
    })))
    setEnvoi(false)
    if (error) return toast.error(messageErreur(error))
    toast.success(`${nouvelles.length} date(s) ajoutée(s)`)
    setAjout(false)
    for (const k of [['evenement-dates', ev.id], ['evenement', ev.id], ['evenements']]) qc.invalidateQueries({ queryKey: k })
  }

  async function retirer(d: EvenementDate) {
    const n = presencesParDate.filter((p) => p.date_id === d.id).length
    if (!confirm(`Retirer la date du ${date(d.date)} ?${n ? `\n\nSa liste de présence (${n} présent(s)) sera effacée.` : ''}`)) return
    const { error } = await supabase.from('evenement_dates').delete().eq('id', d.id)
    if (error) return toast.error(messageErreur(error))
    for (const k of [['evenement-dates', ev.id], ['evenement', ev.id], ['evenements'], ['evenement-presences', ev.id]]) qc.invalidateQueries({ queryKey: k })
  }

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Dates ({dates.length})</h2>
        {gere ? <Button size="sm" variant="secondary" className="no-print" onClick={() => setAjout(!ajout)}><CalendarPlus /> Ajouter des dates</Button> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {dates.map((d) => {
          const n = presencesParDate.filter((p) => p.date_id === d.id).length
          const h = d.heure_debut ?? ev.heure_debut
          return (
            <span key={d.id} className={cn('inline-flex items-center rounded-full border text-sm', d.id === active?.id ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>
              <button type="button" onClick={() => choisir(d.id)} className="px-3 py-1" aria-pressed={d.id === active?.id} title="Afficher la liste de présence de cette date">
                <b className="font-semibold">{jourCourt(d.date)}</b>{h ? ` · ${heure(h)}` : ''}{d.lieu ? ` · ${d.lieu}` : ''}
                <span className="text-xs text-muted-foreground"> · {n} présent{n > 1 ? 's' : ''}</span>
              </button>
              {gere && dates.length > 1 ? (
                <button type="button" onClick={() => retirer(d)} className="no-print mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label={`Retirer la date du ${date(d.date)}`}><X className="size-3.5" /></button>
              ) : null}
            </span>
          )
        })}
      </div>
      {gere && ajout ? (
        <div className="no-print mt-4 grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <Pastilles<'une' | 'serie'> value={serie} onChange={setSerie} options={[['une', 'Une date'], ['serie', 'Une série de dates']]} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Champ label={serie === 'une' ? 'Date' : 'Première date'}><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Champ>
            {serie === 'serie' ? (
              <>
                <Champ label="Dernière date"><Input type="date" min={v.date} value={v.fin} onChange={(e) => setV({ ...v, fin: e.target.value })} /></Champ>
                <Champ label="Répétition">
                  <Liste value={v.repetition} onChange={(e) => setV({ ...v, repetition: e.target.value })}>
                    {REPETITIONS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                  </Liste>
                </Champ>
              </>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Champ label="Début (facultatif)"><Input type="time" value={v.heure_debut} onChange={(e) => setV({ ...v, heure_debut: e.target.value })} /></Champ>
            <Champ label="Fin (facultatif)"><Input type="time" value={v.heure_fin} onChange={(e) => setV({ ...v, heure_fin: e.target.value })} /></Champ>
            <Champ label="Lieu, s'il change"><Input maxLength={200} value={v.lieu} placeholder={ev.lieu ?? ''} onChange={(e) => setV({ ...v, lieu: e.target.value })} /></Champ>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {nouvelles.length ? `${nouvelles.length} date(s) à ajouter${nouvelles.length > 1 ? ` : du ${date(nouvelles[0])} au ${date(nouvelles[nouvelles.length - 1])}` : ''}` : serie === 'serie' ? 'Choisissez la dernière date.' : 'Cette date existe déjà.'}
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAjout(false)}>Annuler</Button>
              <Button size="sm" onClick={ajouter} disabled={envoi || !nouvelles.length}>Ajouter</Button>
            </span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
/** Présence des bénéficiaires invités (participants des actions reliées), pour la date choisie. */
function PresencesBeneficiaires({ evenementId, titre, beneficiaires, presences, dateActive, gere }: {
  evenementId: string; titre: string; beneficiaires: BeneficiaireInvite[]; presences: PresenceCible[]; dateActive: EvenementDate | undefined; gere: boolean
}) {
  const qc = useQueryClient()
  const [recherche, setRecherche] = useState('')
  const [vue, setVue] = useState<'tous' | 'presents' | 'absents'>('tous')
  const presence = new Map(presences.filter((p) => p.date_id === dateActive?.id).map((p) => [p.cible_id, p]))
  const nbPresents = beneficiaires.filter((b) => presence.has(b.cible_id)).length
  const visibles = trier(beneficiaires.filter((b) => (vue === 'tous' || (vue === 'presents') === presence.has(b.cible_id))
    && correspond(recherche, b.prenom, b.nom, b.numero_beneficiaire, b.actions)), (b) => `${b.nom} ${b.prenom ?? ''}`)

  async function basculer(b: BeneficiaireInvite) {
    if (!dateActive) return
    const present = presence.has(b.cible_id)
    try {
      await executer(`${present ? 'Retrait de la présence' : 'Présence'} de ${b.prenom ?? ''} ${b.nom} — ${titre} (${date(dateActive.date)})`, present
        ? { kind: 'delete', table: 'evenement_presences_cibles', filtre: { date_id: dateActive.id, cible_id: b.cible_id } }
        : { kind: 'upsert', table: 'evenement_presences_cibles', onConflict: 'date_id,cible_id', ignoreDuplicates: true,
            valeurs: [{ evenement_id: evenementId, date_id: dateActive.id, cible_id: b.cible_id, mode: 'manuel', pointe_le: new Date().toISOString() }] })
      qc.setQueryData<PresenceCible[]>(['evenement-presences-cibles', evenementId], (avant = []) => present
        ? avant.filter((p) => !(p.cible_id === b.cible_id && p.date_id === dateActive.id))
        : [...avant, { date_id: dateActive.id, cible_id: b.cible_id, pointe_le: new Date().toISOString(), mode: 'manuel' }])
      if (navigator.onLine) qc.invalidateQueries({ queryKey: ['evenement-presences-cibles', evenementId] })
    } catch (e) {
      toast.error(messageErreur(e))
    }
  }

  async function exporter() {
    await exporterExcel(`beneficiaires-${dateActive?.date ?? ''}-${titre.toLowerCase().replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`, visibles, [
      { titre: 'N° bénéficiaire', valeur: (b) => b.numero_beneficiaire, largeur: 16 },
      { titre: 'Prénom', valeur: (b) => b.prenom, largeur: 18 },
      { titre: 'Nom', valeur: (b) => b.nom, largeur: 18 },
      { titre: 'Action(s)', valeur: (b) => b.actions, largeur: 30 },
      { titre: 'Présent', valeur: (b) => (presence.has(b.cible_id) ? 'Oui' : 'Non') },
      { titre: 'Arrivée', valeur: (b) => (presence.get(b.cible_id) ? new Date(presence.get(b.cible_id)!.pointe_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null) },
    ], 'Bénéficiaires')
  }

  return (
    <>
      <div className="no-print">
        <OutilsListe recherche={recherche} setRecherche={setRecherche} placeholder="Chercher un bénéficiaire : nom, numéro, action…" total={visibles.length}>
          <div className="flex flex-wrap items-center gap-3">
            <Pastilles<'tous' | 'presents' | 'absents'> value={vue} onChange={setVue}
              options={[['tous', `Tous (${beneficiaires.length})`], ['presents', `Présents (${nbPresents})`], ['absents', `Absents (${beneficiaires.length - nbPresents})`]]} />
            <Button size="sm" variant="secondary" onClick={exporter}><FileSpreadsheet /> Excel</Button>
          </div>
        </OutilsListe>
      </div>
      <Encadre>
        {visibles.map((b) => {
          const p = presence.get(b.cible_id)
          return (
            <div key={b.cible_id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar prenom={b.prenom ?? b.nom} nom={b.nom} taille="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{b.prenom} {b.nom}</div>
                <div className="truncate text-xs text-muted-foreground">{[b.numero_beneficiaire, b.actions].filter(Boolean).join(' · ')}</div>
              </div>
              {p ? <span className="text-xs text-muted-foreground">{new Date(p.pointe_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}{p.mode === 'scan' ? ' · carte' : ''}</span> : null}
              <button
                disabled={!gere}
                onClick={() => basculer(b)}
                className={cn('inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold', p ? 'bg-[#e2f4e2] text-[#0b6b0b]' : 'bg-muted text-muted-foreground', gere && 'hover:opacity-80')}
                title={gere ? (p ? 'Retirer la présence' : 'Marquer présent') : undefined}
              >
                {p ? <><Check className="size-3.5" /> Présent</> : 'Absent'}
              </button>
            </div>
          )
        })}
      </Encadre>
    </>
  )
}

/** Compte rendu / procès-verbal : reste modifiable après la clôture. */
function CompteRendu({ ev, modifiable }: { ev: Evenement; modifiable: boolean }) {
  const qc = useQueryClient()
  const [texte, setTexte] = useState(ev.compte_rendu ?? '')
  const [edition, setEdition] = useState(false)
  if (!modifiable && !ev.compte_rendu) return null

  async function enregistrer() {
    const { error } = await supabase.from('evenements').update({ compte_rendu: texte.trim() || null }).eq('id', ev.id)
    if (error) return toast.error(messageErreur(error))
    toast.success('Compte rendu enregistré')
    setEdition(false)
    qc.invalidateQueries({ queryKey: ['evenement', ev.id] })
  }

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Compte rendu</h2>
        {modifiable && !edition ? <Button size="sm" variant="ghost" className="no-print" onClick={() => { setTexte(ev.compte_rendu ?? ''); setEdition(true) }}><Pencil /> {ev.compte_rendu ? 'Modifier' : 'Rédiger'}</Button> : null}
      </div>
      {edition ? (
        <div className="space-y-2">
          <Textarea rows={6} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Décisions prises, votes, points à suivre…" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEdition(false)}>Annuler</Button>
            <Button size="sm" onClick={enregistrer}>Enregistrer</Button>
          </div>
        </div>
      ) : ev.compte_rendu ? (
        <p className="whitespace-pre-line text-sm">{ev.compte_rendu}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Pas encore de compte rendu. Notez les décisions prises pour le procès-verbal.</p>
      )}
    </section>
  )
}
