import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Mail, MessageCircle, MessageSquareText, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Liste, Pastilles } from '@/components/champs'
import { OutilsListe } from '@/components/OutilsListe'
import { useAuth } from '@/lib/auth'
import { lienWhatsApp } from '@/lib/format'
import { correspond, trier } from '@/lib/recherche'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/**
 * Informer des membres d'une action ou d'un événement : tous, ou ceux qu'on
 * choisit dans une liste triée et filtrée par localité (unité des Parcelles,
 * commune). La base ne renvoie que le nom, la localité et la présence d'un
 * téléphone ou d'un email ; l'adresse détaillée seulement à qui gère les membres.
 * Pour un événement, le choix devient aussi la liste des invités.
 */

interface MembreAnnonce {
  membre_id: string; prenom: string; nom: string; numero_adherent: string | null; fonction: string | null
  localite: string; tri: string; zone_id: number | null; adresse: string | null
  a_telephone: boolean; a_email: boolean; annonces: boolean; invite: boolean
}
type Canal = 'whatsapp' | 'sms' | 'email'
interface Resultat { membre_id: string; nom: string; statut: 'envoye' | 'lien' | 'echec'; erreur?: string; message?: string; telephone?: string }

const CANAUX: [Canal, string, typeof Mail][] = [['whatsapp', 'WhatsApp', MessageCircle], ['sms', 'SMS', MessageSquareText], ['email', 'Email', Mail]]

export function PartageMembres({ actionId, evenement, messageInitial, fermer }: {
  actionId?: string
  evenement?: { id: string; invites: 'tous' | 'selection' }
  messageInitial: string
  fermer: () => void
}) {
  const qc = useQueryClient()
  const { peut } = useAuth()
  const smsPermis = peut('annonces.sms')
  const { data: membres = [], isLoading, error } = useQuery({
    queryKey: ['membres-annonce', actionId ?? evenement?.id],
    queryFn: async () => verifier(await supabase.rpc('membres_pour_annonce', actionId ? { p_action: actionId } : { p_evenement: evenement!.id })) as MembreAnnonce[],
  })
  const [mode, setMode] = useState<'tous' | 'selection'>(evenement?.invites ?? 'selection')
  const [choix, setChoix] = useState<Set<string> | null>(null)
  const choisis = useMemo(() => choix ?? new Set(membres.filter((m) => m.invite).map((m) => m.membre_id)), [choix, membres])
  const [recherche, setRecherche] = useState('')
  const [tri, setTri] = useState<'localite' | 'nom'>('localite')
  const [localite, setLocalite] = useState('')
  const [message, setMessage] = useState(messageInitial)
  const [canal, setCanal] = useState<Canal>('whatsapp')
  const [garderInvites, setGarderInvites] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [resultats, setResultats] = useState<Resultat[] | null>(null)
  const [ouverts, setOuverts] = useState<Set<string>>(new Set())

  const localites = useMemo(() => {
    const m = new Map<string, { libelle: string; tri: string; n: number }>()
    for (const x of membres) {
      const cle = x.localite
      const v = m.get(cle) ?? { libelle: x.localite, tri: x.tri, n: 0 }
      v.n++
      m.set(cle, v)
    }
    return [...m.values()].sort((a, b) => a.tri.localeCompare(b.tri))
  }, [membres])

  const visibles = membres.filter((m) => (!localite || m.localite === localite)
    && correspond(recherche, m.prenom, m.nom, m.numero_adherent, m.fonction, m.localite, m.adresse))
  const tries = tri === 'nom' ? trier(visibles, (m) => `${m.nom} ${m.prenom}`) : trier(visibles, (m) => `${m.tri} ${m.nom} ${m.prenom}`)
  const destinataires = mode === 'tous' ? membres.filter((m) => m.annonces) : membres.filter((m) => choisis.has(m.membre_id) && m.annonces)
  const joignables = destinataires.filter((m) => (canal === 'email' ? m.a_email : m.a_telephone)).length
  const refus = membres.filter((m) => !m.annonces).length

  const basculer = (id: string, oui: boolean) => setChoix(() => { const n = new Set(choisis); if (oui) n.add(id); else n.delete(id); return n })
  const cocherVisibles = (oui: boolean) => setChoix(() => {
    const n = new Set(choisis)
    for (const m of visibles) if (m.annonces || !oui) { if (oui) n.add(m.membre_id); else n.delete(m.membre_id) }
    return n
  })

  // Événement : le choix devient la liste des invités.
  async function enregistrerInvites() {
    if (!evenement) return
    const r0 = await supabase.from('evenements').update({ invites: mode }).eq('id', evenement.id)
    if (r0.error) throw r0.error
    if (mode === 'selection') {
      const avant = new Set(membres.filter((m) => m.invite).map((m) => m.membre_id))
      const ajouts = [...choisis].filter((x) => !avant.has(x))
      const retraits = [...avant].filter((x) => !choisis.has(x))
      if (ajouts.length) {
        const r = await supabase.from('evenement_invites').insert(ajouts.map((membre_id) => ({ evenement_id: evenement.id, membre_id })))
        if (r.error) throw r.error
      }
      if (retraits.length) {
        const r = await supabase.from('evenement_invites').delete().eq('evenement_id', evenement.id).in('membre_id', retraits)
        if (r.error) throw r.error
      }
    }
    for (const k of [['evenement', evenement.id], ['evenement-invites', evenement.id], ['evenements'], ['membres-annonce', evenement.id]]) qc.invalidateQueries({ queryKey: k })
  }

  async function enregistrerSeulement() {
    setEnvoi(true)
    try {
      await enregistrerInvites()
      toast.success(mode === 'tous' ? 'Tous les membres sont invités' : `${choisis.size} invité(s)`)
      fermer()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  async function envoyer() {
    if (!destinataires.length) return
    setEnvoi(true)
    try {
      if (evenement && garderInvites) await enregistrerInvites()
      const { data, error: e } = await supabase.functions.invoke('rappels', {
        body: {
          type: 'annonce', canal, message, tous: mode === 'tous',
          membre_ids: destinataires.map((m) => m.membre_id),
          ...(actionId ? { action_id: actionId } : { evenement_id: evenement!.id }),
        },
      })
      if (e) {
        const corps = await (e as { context?: Response }).context?.json?.().catch(() => null)
        throw new Error(corps?.erreur ?? e.message)
      }
      const r = (data?.resultats ?? []) as Resultat[]
      setResultats(r)
      const ok = r.filter((x) => x.statut === 'envoye').length
      if (canal !== 'whatsapp') toast[ok ? 'success' : 'error'](`${ok} message(s) envoyé(s)${r.length - ok ? `, ${r.length - ok} non envoyé(s)` : ''}`)
      qc.invalidateQueries({ queryKey: ['rappels-envoyes'] })
    } catch (err) {
      toast.error(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  const liens = resultats?.filter((r) => r.statut === 'lien') ?? []
  const echecs = resultats?.filter((r) => r.statut === 'echec') ?? []

  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{evenement ? 'Invités et annonce' : 'Informer des membres'}</DialogTitle>
          <DialogDescription>
            Tous les membres, ou seulement ceux que vous choisissez. Triez et filtrez par localité (unité des Parcelles, commune).
            {refus ? ` ${refus} membre(s) ont refusé les annonces : ils ne recevront rien.` : ''}
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{messageErreur(error)}</p> : isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement des membres…</p>
        ) : !resultats ? (
          <div className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">1. Qui ?</h3>
              <Pastilles<'tous' | 'selection'> value={mode} onChange={setMode}
                options={[['tous', `Tous les membres (${membres.filter((m) => m.annonces).length})`], ['selection', `Choisir (${[...choisis].filter((id) => membres.some((m) => m.membre_id === id && m.annonces)).length} choisi(s))`]]} />
              {mode === 'selection' ? (
                <div className="space-y-2">
                  <OutilsListe recherche={recherche} setRecherche={setRecherche} placeholder="Nom, numéro, localité, fonction…"
                    tris={[['localite', 'Par localité'], ['nom', 'Nom A → Z']]} tri={tri} setTri={setTri} total={visibles.length}>
                    <Liste value={localite} onChange={(e) => setLocalite(e.target.value)} aria-label="Filtrer par localité">
                      <option value="">Toutes les localités ({membres.length})</option>
                      {localites.map((l) => <option key={l.libelle} value={l.libelle}>{l.libelle} ({l.n})</option>)}
                    </Liste>
                  </OutilsListe>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => cocherVisibles(true)}>Cocher les {visibles.length} affichés</Button>
                    <Button size="sm" variant="ghost" onClick={() => cocherVisibles(false)}>Décocher les affichés</Button>
                  </div>
                  <div className="max-h-[40dvh] overflow-y-auto rounded-xl border border-border">
                    {tries.map((m, i) => {
                      const nouveauGroupe = tri === 'localite' && (i === 0 || tries[i - 1].localite !== m.localite)
                      return (
                        <div key={m.membre_id}>
                          {nouveauGroupe ? (
                            <div className="sticky top-0 z-10 border-b border-border bg-muted px-3 py-1 text-xs font-semibold">
                              {m.localite} · {tries.filter((x) => x.localite === m.localite).length}
                            </div>
                          ) : null}
                          <label className={cn('flex items-center gap-3 border-b border-border/60 px-3 py-2 text-sm last:border-0', m.annonces ? 'cursor-pointer' : 'opacity-50')}>
                            <Checkbox disabled={!m.annonces} checked={m.annonces && choisis.has(m.membre_id)} onCheckedChange={(c) => basculer(m.membre_id, !!c)} />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{m.prenom} {m.nom}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {[m.numero_adherent, m.fonction, tri === 'nom' ? m.localite : null, m.adresse].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            {!m.annonces ? <span className="text-[11px] text-muted-foreground">refuse les annonces</span>
                              : !m.a_telephone ? <span className="text-[11px] text-muted-foreground">sans téléphone</span> : null}
                          </label>
                        </div>
                      )
                    })}
                    {!tries.length ? <p className="p-4 text-center text-sm text-muted-foreground">Aucun membre ne correspond.</p> : null}
                  </div>
                </div>
              ) : null}
              {evenement ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={garderInvites} onCheckedChange={(c) => setGarderInvites(!!c)} />
                  Enregistrer ce choix comme liste des invités de l'événement
                </label>
              ) : null}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">2. Message</h3>
              <Textarea rows={5} maxLength={700} value={message} onChange={(e) => setMessage(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                {message.length} caractères. Écrivez <code>{'{prénom}'}</code> pour personnaliser. Un SMS est limité à 320 caractères (2 SMS), sans accents.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {CANAUX.map(([c, libelle, Icone]) => (
                  <button key={c} type="button" disabled={c === 'sms' && !smsPermis} onClick={() => setCanal(c)}
                    title={c === 'sms' && !smsPermis ? 'Il faut le droit « Envoyer des annonces par SMS »' : undefined}
                    className={cn('flex flex-col items-center gap-1 rounded-xl border p-3 text-sm font-medium transition-colors disabled:opacity-40',
                      canal === c ? 'border-primary bg-primary/10 text-primary' : 'border-border enabled:hover:bg-muted/50')}>
                    <Icone className="size-5" /> {libelle}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {canal === 'whatsapp' ? "Un message prêt par personne : vous appuyez sur Envoyer dans WhatsApp, l'un après l'autre (gratuit)."
                  : canal === 'sms' ? 'Envoyés automatiquement par Brevo (payant, numéros sénégalais).'
                  : "Envoyés automatiquement, seulement aux membres qui ont une adresse email."}
                {' '}<b>{joignables}</b> sur {destinataires.length} destinataire(s) joignable(s) par ce moyen.
              </p>
            </section>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={fermer}>Annuler</Button>
              {evenement ? <Button variant="secondary" onClick={enregistrerSeulement} disabled={envoi}>Enregistrer les invités sans envoyer</Button> : null}
              <Button onClick={envoyer} disabled={envoi || !joignables || message.trim().length < 5}>
                <Send /> {envoi ? 'Patientez…' : canal === 'whatsapp' ? `Préparer ${joignables} message(s)` : `Envoyer à ${joignables}`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {liens.length ? (() => {
              const suivant = liens.find((r) => !ouverts.has(r.membre_id))
              const faits = liens.filter((r) => ouverts.has(r.membre_id)).length
              return (
                <div className="space-y-2">
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium">{suivant ? 'Envoi à la suite' : 'Tous les messages ont été ouverts'}</span>
                      <span className="text-muted-foreground">{faits} / {liens.length}</span>
                    </div>
                    <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${(100 * faits) / liens.length}%` }} /></div>
                    {suivant ? (
                      <Button asChild className="w-full">
                        <a target="_blank" rel="noreferrer" href={lienWhatsApp(suivant.telephone!, suivant.message!)} onClick={() => setOuverts((o) => new Set(o).add(suivant.membre_id))}>
                          <MessageCircle /> {faits ? 'Envoyer au suivant' : 'Commencer'} : {suivant.nom}
                        </a>
                      </Button>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">Dans WhatsApp, appuyez sur <b>Envoyer</b>, puis revenez ici : le bouton passe à la personne suivante.</p>
                  </div>
                  <div className="max-h-[35dvh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                    {liens.map((r) => (
                      <div key={r.membre_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">{ouverts.has(r.membre_id) ? <Check className="mr-1 inline size-4 text-primary" /> : null}{r.nom}</span>
                        <span className="flex shrink-0 gap-1">
                          <Button size="sm" variant="ghost" aria-label="Copier le message" onClick={async () => { try { await navigator.clipboard.writeText(r.message!); toast.success('Message copié') } catch { toast.error('Copie impossible') } }}><Copy /></Button>
                          <Button asChild size="sm" variant={ouverts.has(r.membre_id) ? 'secondary' : 'default'}>
                            <a target="_blank" rel="noreferrer" href={lienWhatsApp(r.telephone!, r.message!)} onClick={() => setOuverts((o) => new Set(o).add(r.membre_id))}><MessageCircle /> WhatsApp</a>
                          </Button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })() : null}
            {resultats.some((r) => r.statut === 'envoye') ? (
              <p className="text-sm"><Check className="mr-1 inline size-4 text-primary" /> {resultats.filter((r) => r.statut === 'envoye').length} message(s) envoyé(s).</p>
            ) : null}
            {echecs.length ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                <b>{echecs.length} non envoyé(s) :</b>
                <ul className="mt-1 max-h-32 overflow-y-auto text-xs">{echecs.map((r) => <li key={r.membre_id}>{r.nom} — {r.erreur}</li>)}</ul>
              </div>
            ) : null}
            <div className="flex justify-end"><Button onClick={fermer}>Terminé</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
