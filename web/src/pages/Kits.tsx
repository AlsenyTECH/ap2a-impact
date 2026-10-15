import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDownToLine, ClipboardCheck, History, Package, PackageMinus, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Champ, Chargement, EnTete, Erreur, Liste, Pastilles } from '@/components/champs'
import { OutilsListe } from '@/components/OutilsListe'
import { useAuth } from '@/lib/auth'
import { aujourdhui, date, fcfa } from '@/lib/format'
import { LIBELLES_MOTIF, niveauStock, useKits, useMouvements, type Composant, type KitModele, type MotifMouvement } from '@/lib/kits'
import { correspond } from '@/lib/recherche'
import { usePartenaires } from '@/lib/requetes'
import { messageErreur, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const COULEURS_NIVEAU = {
  epuise: 'bg-[#fbe6e6] text-[#a32b2b]',
  bas: 'bg-or-soft text-[#7a5600]',
  ok: 'bg-[#e2f4e2] text-[#0b6b0b]',
}

/** Catalogue des kits et suivi du stock (entrées, remises, pertes, inventaires). */
export function Kits() {
  const { a } = useAuth()
  const gere = a('admin', 'bureau')
  const [inactifs, setInactifs] = useState(false)
  const { data: kits = [], isLoading, error } = useKits(true)
  const [recherche, setRecherche] = useState('')
  const [edition, setEdition] = useState<KitModele | 'nouveau' | null>(null)
  const [mouvement, setMouvement] = useState<{ kit: KitModele; type: 'entree' | 'sortie' | 'inventaire' } | null>(null)
  const [historique, setHistorique] = useState<KitModele | null>(null)

  const visibles = kits.filter((k) => (inactifs || k.actif) && correspond(recherche, k.nom, k.description, k.composition.map((c) => c.libelle).join(' ')))
  const alertes = kits.filter((k) => k.actif && niveauStock(k) !== 'ok')
  const valeurStock = kits.reduce((s, k) => s + Math.max(0, k.stock) * (k.valeur_unitaire_fcfa ?? 0), 0)

  return (
    <div className="space-y-5">
      <EnTete
        titre="Kits et stock"
        sousTitre="Les kits remis aux bénéficiaires : composition, valeur, et ce qu'il reste en magasin."
        actions={gere ? <Button onClick={() => setEdition('nouveau')}><Plus /> Nouveau kit</Button> : undefined}
      />

      {kits.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Chiffre valeur={kits.filter((k) => k.actif).length} libelle="kits au catalogue" />
          <Chiffre valeur={kits.reduce((s, k) => s + Math.max(0, k.stock), 0)} libelle="kits en stock" />
          <Chiffre valeur={kits.reduce((s, k) => s + k.remis, 0)} libelle="kits remis" />
          <Chiffre valeur={fcfa(valeurStock)} libelle="valeur du stock" />
        </div>
      ) : null}

      {alertes.length ? (
        <div className="flex gap-3 rounded-xl border border-or/40 bg-or-soft p-4 text-sm text-[#5c4100]">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" />
          <div>
            <b>Stock à surveiller :</b> {alertes.map((k) => `${k.nom} (${k.stock <= 0 ? 'épuisé' : `${k.stock} restant${k.stock > 1 ? 's' : ''}`})`).join(', ')}.
            {alertes.some((k) => k.stock < 0) ? ' Un stock négatif veut dire que des remises ont été faites sans entrée enregistrée : ajoutez l\'entrée ou faites un inventaire.' : ''}
          </div>
        </div>
      ) : null}

      {isLoading ? <Chargement /> : error ? <Erreur erreur={error} /> : !kits.length ? (
        <EmptyState
          icon={Package}
          title="Aucun kit au catalogue"
          description={gere ? "Créez vos modèles de kits (kit d'électricien, kit de couture…) : leur composition et leur valeur seront reprises à chaque remise, et le stock se tiendra tout seul." : 'Le bureau n\'a pas encore créé de kits.'}
          action={gere ? <Button onClick={() => setEdition('nouveau')}><Plus /> Créer un kit</Button> : undefined}
        />
      ) : (
        <>
          <OutilsListe recherche={recherche} setRecherche={setRecherche} placeholder="Chercher un kit, un outil…" total={visibles.length}>
            <label className="inline-flex items-center gap-2 text-sm"><Switch checked={inactifs} onCheckedChange={setInactifs} /> Afficher les kits retirés</label>
          </OutilsListe>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibles.map((k) => {
              const niveau = niveauStock(k)
              return (
                <article key={k.id} className={cn('flex flex-col rounded-2xl border border-border bg-card p-4 shadow-carte', !k.actif && 'opacity-60')}>
                  <div className="flex items-start gap-3">
                    <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Package className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold leading-tight">{k.nom}{!k.actif ? <Badge variant="secondary" className="ml-2">retiré</Badge> : null}</h3>
                      <p className="text-sm text-muted-foreground">
                        {k.valeur_unitaire_fcfa ? fcfa(k.valeur_unitaire_fcfa) : 'Valeur non renseignée'}
                        {k.partenaire ? ` · ${k.partenaire.sigle || k.partenaire.nom}` : ''}
                      </p>
                    </div>
                    <div className={cn('shrink-0 rounded-xl px-3 py-1.5 text-center', COULEURS_NIVEAU[niveau])}>
                      <div className="font-heading text-xl font-bold leading-none chiffres">{k.stock}</div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide">en stock</div>
                    </div>
                  </div>
                  {k.composition.length ? (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {k.composition.map((c, i) => <li key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs">{c.quantite > 1 ? `${c.quantite} × ` : ''}{c.libelle}</li>)}
                    </ul>
                  ) : null}
                  {k.description ? <p className="mt-2 text-sm text-muted-foreground">{k.description}</p> : null}
                  <p className="mt-3 text-xs text-muted-foreground">
                    {k.entrees} entré{k.entrees > 1 ? 's' : ''} · {k.remis} remis{k.seuil_alerte ? ` · alerte à ${k.seuil_alerte}` : ''}
                    {k.dernier_mouvement ? ` · dernier mouvement le ${date(k.dernier_mouvement)}` : ''}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                    {gere ? (
                      <>
                        <Button size="sm" onClick={() => setMouvement({ kit: k, type: 'entree' })}><ArrowDownToLine /> Entrée</Button>
                        <Button size="sm" variant="secondary" onClick={() => setMouvement({ kit: k, type: 'inventaire' })}><ClipboardCheck /> Inventaire</Button>
                        <Button size="sm" variant="ghost" onClick={() => setMouvement({ kit: k, type: 'sortie' })} aria-label="Perte ou casse"><PackageMinus /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEdition(k)} aria-label="Modifier"><Pencil /></Button>
                      </>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => setHistorique(k)}><History /> Historique</Button>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Les remises se font depuis une action : onglet Bénéficiaires → « Ajouter un apport » (kit du catalogue) ou « Remise de kits » (scan des cartes et signature). Chaque remise retire le kit du stock.
      </p>

      <KitForm kit={edition === 'nouveau' ? null : edition} ouvert={!!edition} fermer={() => setEdition(null)} />
      {mouvement ? <MouvementForm {...mouvement} fermer={() => setMouvement(null)} /> : null}
      {historique ? <Historique kit={historique} fermer={() => setHistorique(null)} gere={gere} /> : null}
    </div>
  )
}

function Chiffre({ valeur, libelle }: { valeur: number | string; libelle: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="font-heading text-2xl font-semibold chiffres">{valeur}</div>
      <div className="text-xs text-muted-foreground">{libelle}</div>
    </div>
  )
}

/** Création ou modification d'un modèle de kit (composition, valeur, fournisseur, alerte). */
function KitForm({ kit, ouvert, fermer }: { kit: KitModele | null; ouvert: boolean; fermer: () => void }) {
  const qc = useQueryClient()
  const { data: partenaires = [] } = usePartenaires()
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [valeur, setValeur] = useState('')
  const [partenaire, setPartenaire] = useState('')
  const [seuil, setSeuil] = useState('0')
  const [actif, setActif] = useState(true)
  const [composition, setComposition] = useState<Composant[]>([])
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (!ouvert) return
    setNom(kit?.nom ?? '')
    setDescription(kit?.description ?? '')
    setValeur(kit?.valeur_unitaire_fcfa != null ? String(kit.valeur_unitaire_fcfa) : '')
    setPartenaire(kit?.partenaire_id ?? '')
    setSeuil(String(kit?.seuil_alerte ?? 0))
    setActif(kit?.actif ?? true)
    setComposition(kit?.composition.length ? kit.composition : [{ libelle: '', quantite: 1 }])
  }, [ouvert, kit])

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    const donnees = {
      nom: nom.trim(),
      description: description.trim() || null,
      valeur_unitaire_fcfa: valeur ? Math.max(0, Math.round(Number(valeur))) : null,
      partenaire_id: partenaire || null,
      seuil_alerte: Math.max(0, Math.round(Number(seuil) || 0)),
      actif,
      composition: composition.filter((c) => c.libelle.trim()).map((c) => ({ libelle: c.libelle.trim(), quantite: Math.max(1, Math.round(c.quantite) || 1) })),
    }
    const r = kit ? await supabase.from('kits_modeles').update(donnees).eq('id', kit.id) : await supabase.from('kits_modeles').insert(donnees)
    setEnvoi(false)
    if (r.error) return toast.error(r.error.code === '23505' ? 'Un kit porte déjà ce nom' : messageErreur(r.error))
    qc.invalidateQueries({ queryKey: ['kits'] })
    toast.success(kit ? 'Kit modifié' : 'Kit ajouté au catalogue')
    fermer()
  }

  async function supprimer() {
    if (!kit || !confirm(`Supprimer « ${kit.nom} » du catalogue ?`)) return
    const { error } = await supabase.from('kits_modeles').delete().eq('id', kit.id)
    if (error) return toast.error(error.code === '23503' ? 'Ce kit a déjà des mouvements de stock : retirez-le plutôt (case « Au catalogue »).' : messageErreur(error))
    qc.invalidateQueries({ queryKey: ['kits'] })
    toast.success('Kit supprimé')
    fermer()
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{kit ? 'Modifier le kit' : 'Nouveau kit'}</DialogTitle>
          <DialogDescription>Sa composition et sa valeur seront reprises à chaque remise.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enregistrer} className="grid gap-4">
          <Champ label="Nom du kit"><Input required value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Kit d'électricien bâtiment" /></Champ>
          <Champ label="Composition" aide="Un outil ou un article par ligne, avec sa quantité.">
            <div className="space-y-2">
              {composition.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Input type="number" min={1} className="w-20" value={c.quantite} aria-label="Quantité"
                    onChange={(e) => setComposition(composition.map((x, j) => (j === i ? { ...x, quantite: Number(e.target.value) } : x)))} />
                  <Input value={c.libelle} placeholder="Pince universelle" aria-label="Article"
                    onChange={(e) => setComposition(composition.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))} />
                  <Button type="button" size="icon" variant="ghost" onClick={() => setComposition(composition.filter((_, j) => j !== i))} aria-label="Retirer la ligne"><Trash2 /></Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="secondary" onClick={() => setComposition([...composition, { libelle: '', quantite: 1 }])}><Plus /> Ajouter un article</Button>
            </div>
          </Champ>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Valeur d'un kit (FCFA)"><Input type="number" min={0} inputMode="numeric" value={valeur} onChange={(e) => setValeur(e.target.value)} /></Champ>
            <Champ label="Alerte si stock ≤" aide="0 : pas d'alerte avant l'épuisement"><Input type="number" min={0} inputMode="numeric" value={seuil} onChange={(e) => setSeuil(e.target.value)} /></Champ>
          </div>
          <Champ label="Fourni ou financé par">
            <Liste value={partenaire} onChange={(e) => setPartenaire(e.target.value)}>
              <option value="">— AP2A —</option>
              {partenaires.map((p) => <option key={p.id} value={p.id}>{p.sigle ? `${p.sigle} — ${p.nom}` : p.nom}</option>)}
            </Liste>
          </Champ>
          <Champ label="Remarque"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Fournisseur habituel, garantie…" /></Champ>
          {kit ? <label className="flex items-center gap-2 text-sm"><Switch checked={actif} onCheckedChange={setActif} /> Au catalogue (proposé lors des remises)</label> : null}
          <div className="flex justify-between gap-2">
            {kit ? <Button type="button" variant="ghost" className="text-destructive" onClick={supprimer}><Trash2 /> Supprimer</Button> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
              <Button type="submit" disabled={envoi}>Enregistrer</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Entrée (achat, don, retour), sortie (perte) ou inventaire (comptage réel). */
function MouvementForm({ kit, type, fermer }: { kit: KitModele; type: 'entree' | 'sortie' | 'inventaire'; fermer: () => void }) {
  const qc = useQueryClient()
  const { data: partenaires = [] } = usePartenaires()
  const [motif, setMotif] = useState<MotifMouvement>(type === 'entree' ? 'achat' : type === 'sortie' ? 'perte' : 'inventaire')
  const [quantite, setQuantite] = useState('')
  const [compte, setCompte] = useState(String(Math.max(0, kit.stock)))
  const [partenaire, setPartenaire] = useState(kit.partenaire_id ?? '')
  const [cout, setCout] = useState('')
  const [jour, setJour] = useState(aujourdhui())
  const [note, setNote] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const ecart = Math.round(Number(compte)) - kit.stock

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    const n = type === 'inventaire' ? ecart : Math.round(Number(quantite))
    if (!n) return toast.info(type === 'inventaire' ? 'Le stock compté correspond déjà : rien à corriger.' : 'Indiquez une quantité')
    setEnvoi(true)
    const { error } = await supabase.from('kits_mouvements').insert({
      modele_id: kit.id,
      quantite: type === 'sortie' ? -Math.abs(n) : type === 'entree' ? Math.abs(n) : n,
      motif,
      partenaire_id: type === 'entree' ? partenaire || null : null,
      cout_fcfa: type === 'entree' && motif === 'achat' && cout ? Math.round(Number(cout)) : null,
      date: jour,
      note: note.trim() || (type === 'inventaire' ? `Comptage : ${Math.round(Number(compte))} (stock calculé : ${kit.stock})` : null),
    })
    setEnvoi(false)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: ['kits'] })
    qc.invalidateQueries({ queryKey: ['kits-mouvements', kit.id] })
    toast.success('Stock mis à jour')
    fermer()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{type === 'entree' ? 'Entrée en stock' : type === 'sortie' ? 'Perte ou casse' : 'Inventaire'} · {kit.nom}</DialogTitle>
          <DialogDescription>
            {type === 'inventaire' ? 'Comptez les kits réellement en magasin : l\'écart avec le stock calculé est enregistré.' : `Stock actuel : ${kit.stock}.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enregistrer} className="grid gap-4">
          {type === 'entree' ? (
            <Champ label="Provenance">
              <Pastilles<MotifMouvement> value={motif} onChange={setMotif} options={[['achat', 'Achat'], ['don', 'Don reçu'], ['retour', 'Retour d\'un kit']]} />
            </Champ>
          ) : null}
          {type === 'inventaire' ? (
            <Champ label="Kits comptés en magasin" aide={Number.isFinite(ecart) && ecart ? `Écart : ${ecart > 0 ? '+' : ''}${ecart}` : 'Aucun écart'}>
              <Input type="number" min={0} inputMode="numeric" required value={compte} onChange={(e) => setCompte(e.target.value)} />
            </Champ>
          ) : (
            <Champ label="Nombre de kits"><Input type="number" min={1} inputMode="numeric" required value={quantite} onChange={(e) => setQuantite(e.target.value)} /></Champ>
          )}
          {type === 'entree' ? (
            <div className="grid grid-cols-2 gap-3">
              <Champ label={motif === 'don' ? 'Donné par' : motif === 'achat' ? 'Financé par' : 'Partenaire'}>
                <Liste value={partenaire} onChange={(e) => setPartenaire(e.target.value)}>
                  <option value="">— AP2A —</option>
                  {partenaires.map((p) => <option key={p.id} value={p.id}>{p.sigle || p.nom}</option>)}
                </Liste>
              </Champ>
              {motif === 'achat' ? <Champ label="Coût total (FCFA)"><Input type="number" min={0} inputMode="numeric" value={cout} onChange={(e) => setCout(e.target.value)} /></Champ> : null}
            </div>
          ) : null}
          <Champ label="Date"><Input type="date" required value={jour} onChange={(e) => setJour(e.target.value)} /></Champ>
          <Champ label="Note"><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={type === 'entree' ? 'N° de facture, bon de livraison…' : 'Ce qui s\'est passé'} /></Champ>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi}>Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Tous les mouvements d'un kit, du plus récent au plus ancien. */
function Historique({ kit, fermer, gere }: { kit: KitModele; fermer: () => void; gere: boolean }) {
  const qc = useQueryClient()
  const { data: mouvements = [], isLoading } = useMouvements(kit.id)

  async function annuler(id: string) {
    if (!confirm('Annuler ce mouvement de stock ?')) return
    const { error } = await supabase.from('kits_mouvements').delete().eq('id', id)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: ['kits'] })
    qc.invalidateQueries({ queryKey: ['kits-mouvements', kit.id] })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Historique · {kit.nom}</DialogTitle>
          <DialogDescription>Stock actuel : <b>{kit.stock}</b> · {kit.entrees} entrés · {kit.remis} remis.</DialogDescription>
        </DialogHeader>
        {isLoading ? <Chargement /> : !mouvements.length ? <p className="text-sm text-muted-foreground">Aucun mouvement.</p> : (
          <div className="divide-y divide-border">
            {mouvements.map((m) => {
              const b = m.apport?.beneficiaire
              return (
                <div key={m.id} className="flex items-start gap-3 py-2 text-sm">
                  <span className={cn('w-12 shrink-0 text-right font-heading font-semibold chiffres', m.quantite > 0 ? 'text-primary' : 'text-destructive')}>{m.quantite > 0 ? `+${m.quantite}` : m.quantite}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {LIBELLES_MOTIF[m.motif]}
                      {m.motif === 'remise' && b ? <> à {b.cible ? `${b.cible.prenom ?? ''} ${b.cible.nom}` : '—'} · <Link to={`/actions/${b.action_id}`} className="text-primary hover:underline">{b.action?.titre}</Link></> : null}
                      {m.partenaire ? ` · ${m.partenaire.sigle || m.partenaire.nom}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {date(m.date)}{m.cout_fcfa ? ` · ${fcfa(m.cout_fcfa)}` : ''}{m.auteur ? ` · par ${m.auteur.prenom} ${m.auteur.nom}` : ''}{m.note ? ` · ${m.note}` : ''}
                    </div>
                  </div>
                  {gere && m.motif !== 'remise' ? <Button size="icon" variant="ghost" onClick={() => annuler(m.id)} aria-label="Annuler ce mouvement"><Trash2 className="text-muted-foreground" /></Button> : null}
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
