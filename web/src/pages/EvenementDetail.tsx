import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Clock, FileSpreadsheet, MapPin, Pencil, Printer, ScanLine, Trash2, UserPlus, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Chargement, Erreur, Pastilles } from '@/components/champs'
import { Avatar, Liste as Encadre } from '@/components/design'
import { OutilsListe } from '@/components/OutilsListe'
import { Scanner } from '@/components/Scanner'
import { useAuth } from '@/lib/auth'
import { exporterExcel } from '@/lib/export'
import { date, LIBELLES_ROLE } from '@/lib/format'
import { usePhotos } from '@/lib/photos'
import { correspond, trier } from '@/lib/recherche'
import { useMembres } from '@/lib/requetes'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import type { Evenement, Membre, ResultatPointage } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EvenementForm, heure, libelleType } from '@/pages/Evenements'

interface Presence { membre_id: string; pointe_le: string; mode: 'manuel' | 'scan' }

export function EvenementDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { a, membre: moi } = useAuth()
  const [edition, setEdition] = useState(false)
  const [scan, setScan] = useState(false)
  const [choixInvites, setChoixInvites] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [vue, setVue] = useState<'tous' | 'presents' | 'absents'>('tous')
  const [tri, setTri] = useState<'nom' | 'arrivee' | 'numero'>('nom')

  const { data: ev, isLoading, error } = useQuery({
    queryKey: ['evenement', id],
    queryFn: async () => verifier(await supabase.from('evenements').select('*').eq('id', id).single()) as Evenement,
  })
  const { data: membres = [] } = useMembres()
  const { data: invites = [] } = useQuery({
    queryKey: ['evenement-invites', id],
    queryFn: async () => (verifier(await supabase.from('evenement_invites').select('membre_id').eq('evenement_id', id)) as { membre_id: string }[]).map((x) => x.membre_id),
  })
  const { data: presences = [] } = useQuery({
    queryKey: ['evenement-presences', id],
    queryFn: async () => verifier(await supabase.from('evenement_presences').select('membre_id, pointe_le, mode').eq('evenement_id', id)) as Presence[],
  })
  const { data: photos = {} } = usePhotos(membres.map((m) => m.photo_chemin))
  const rafraichir = () => qc.invalidateQueries({ queryKey: ['evenement-presences', id] })

  if (error) return <Erreur erreur={error} />
  if (isLoading || !ev) return <Chargement />

  const gere = a('admin', 'bureau') || (a('coordinateur') && ev.cree_par === moi?.id)
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
    const { error } = presence.has(m.id)
      ? await supabase.from('evenement_presences').delete().eq('evenement_id', id).eq('membre_id', m.id)
      : await supabase.from('evenement_presences').insert({ evenement_id: id, membre_id: m.id, mode: 'manuel' })
    if (error) return toast.error(messageErreur(error))
    rafraichir()
  }

  async function supprimer() {
    if (!confirm(`Supprimer l'événement « ${ev!.titre} » et sa liste de présence ?`)) return
    const { error } = await supabase.from('evenements').delete().eq('id', id)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: ['evenements'] })
    navigate('/evenements')
  }

  async function exporter() {
    await exporterExcel(`presences-${ev!.date}-${ev!.titre.toLowerCase().replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`, trier(concernes, (m) => `${m.nom} ${m.prenom}`), [
      { titre: 'N° membre', valeur: (m) => m.numero_adherent, largeur: 14 },
      { titre: 'Prénom', valeur: (m) => m.prenom, largeur: 18 },
      { titre: 'Nom', valeur: (m) => m.nom, largeur: 18 },
      { titre: 'Rôle', valeur: (m) => LIBELLES_ROLE[m.role] },
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
              <span>{date(ev.date)}</span>
              {ev.heure_debut ? <span className="inline-flex items-center gap-1"><Clock className="size-4" />{heure(ev.heure_debut)}{ev.heure_fin ? ` – ${heure(ev.heure_fin)}` : ''}</span> : null}
              {ev.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="size-4" />{ev.lieu}</span> : null}
            </div>
            {ev.description ? <p className="mt-3 whitespace-pre-line text-sm">{ev.description}</p> : null}
          </div>
          <div className="no-print flex flex-wrap gap-2 md:max-w-[50%] md:justify-end">
            {gere ? <Button onClick={() => setScan(true)}><ScanLine /> Scanner les cartes</Button> : null}
            <Button variant="secondary" onClick={exporter}><FileSpreadsheet /> Excel</Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer /> Imprimer</Button>
            {gere ? (
              <>
                {ev.invites === 'selection' ? <Button variant="secondary" onClick={() => setChoixInvites(true)}><UserPlus /> Invités</Button> : null}
                <Button variant="ghost" onClick={() => setEdition(true)}><Pencil /> Modifier</Button>
                <Button variant="ghost" className="text-destructive" onClick={supprimer}><Trash2 /></Button>
              </>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px border-t border-border/70 bg-border/70 text-center">
          {[[listeInvites.length, ev.invites === 'tous' ? 'membres actifs invités' : 'invités'], [nbPresents, 'présents'], [`${taux} %`, 'participation']].map(([v, l]) => (
            <div key={l} className="bg-card px-3 py-3">
              <div className="font-heading text-xl font-semibold chiffres">{v}</div>
              <div className="text-xs text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
      </Card>

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

      <EvenementForm ouvert={edition} fermer={() => setEdition(false)} evenement={ev} />
      <Scanner
        ouvert={scan}
        fermer={() => { setScan(false); rafraichir() }}
        titre={`Pointage — ${ev.titre}`}
        description="Présentez les cartes de membre une par une devant la caméra."
        pointer={async (jeton) => {
          const r = verifier(await supabase.rpc('pointer_evenement', { p_evenement: id, p_jeton: jeton })) as ResultatPointage
          rafraichir()
          return r
        }}
      />
      {choixInvites ? <ChoixInvites evenementId={id} membres={membres.filter((m) => m.actif)} invites={invites} fermer={() => setChoixInvites(false)} /> : null}
    </>
  )
}

function ChoixInvites({ evenementId, membres, invites, fermer }: { evenementId: string; membres: Membre[]; invites: string[]; fermer: () => void }) {
  const qc = useQueryClient()
  const [choix, setChoix] = useState(new Set(invites))
  const [recherche, setRecherche] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const visibles = trier(membres.filter((m) => correspond(recherche, m.prenom, m.nom, m.numero_adherent, m.fonction, LIBELLES_ROLE[m.role])), (m) => `${m.nom} ${m.prenom}`)

  async function enregistrer() {
    setEnvoi(true)
    const ajouts = [...choix].filter((x) => !invites.includes(x))
    const retraits = invites.filter((x) => !choix.has(x))
    const r1 = ajouts.length ? await supabase.from('evenement_invites').insert(ajouts.map((membre_id) => ({ evenement_id: evenementId, membre_id }))) : { error: null }
    const r2 = retraits.length ? await supabase.from('evenement_invites').delete().eq('evenement_id', evenementId).in('membre_id', retraits) : { error: null }
    setEnvoi(false)
    if (r1.error || r2.error) return toast.error(messageErreur(r1.error ?? r2.error))
    qc.invalidateQueries({ queryKey: ['evenement-invites', evenementId] })
    qc.invalidateQueries({ queryKey: ['evenements'] })
    toast.success(`${choix.size} invité(s)`)
    fermer()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Membres invités</DialogTitle>
          <DialogDescription>{choix.size} sélectionné(s) sur {membres.length}.</DialogDescription>
        </DialogHeader>
        <OutilsListe recherche={recherche} setRecherche={setRecherche} placeholder="Nom, numéro, rôle (bureau…)" />
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setChoix(new Set([...choix, ...visibles.map((m) => m.id)]))}>Tout cocher</Button>
          <Button size="sm" variant="ghost" onClick={() => setChoix(new Set([...choix].filter((x) => !visibles.some((m) => m.id === x))))}>Tout décocher</Button>
        </div>
        <div className="max-h-[45dvh] divide-y divide-border/70 overflow-y-auto rounded-xl border border-border">
          {visibles.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
              <Checkbox checked={choix.has(m.id)} onCheckedChange={(c) => { const n = new Set(choix); if (c) n.add(m.id); else n.delete(m.id); setChoix(n) }} />
              <span className="flex-1">{m.prenom} {m.nom} <span className="text-xs text-muted-foreground">· {m.numero_adherent} · {LIBELLES_ROLE[m.role]}</span></span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={fermer}>Annuler</Button>
          <Button onClick={enregistrer} disabled={envoi}>Enregistrer</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
