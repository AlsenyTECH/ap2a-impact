import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Champ, Liste, ListeMembres, ListeZones, Pastilles } from '@/components/champs'
import { nomCible } from '@/lib/format'
import { useCategories, useCibles, useFamilles, useProfils } from '@/lib/requetes'
import { cn } from '@/lib/utils'
import { messageErreur, supabase } from '@/lib/supabase'
import type { Cible, TypeCible } from '@/lib/types'

type Valeurs = Pick<Cible, 'nom' | 'prenom' | 'sexe' | 'date_naissance' | 'telephone' | 'sous_type' | 'responsable' | 'effectif' | 'zone_id' | 'adresse' | 'referent_id' | 'notes' | 'situation_id' | 'vulnerabilites' | 'metier'> & { categorie_id: number | null }

const VIDE: Valeurs = {
  categorie_id: null, nom: '', prenom: '', sexe: null, date_naissance: null, telephone: '', sous_type: '',
  responsable: '', effectif: null, zone_id: null, adresse: '', referent_id: null, notes: '',
  situation_id: null, vulnerabilites: [], metier: '',
}

/** Chef d'un nouveau ménage : une personne existante, ou à créer. */
interface Chef { existant: Cible | null; prenom: string; nom: string; telephone: string; sexe: 'F' | 'M' | null }
const CHEF_VIDE: Chef = { existant: null, prenom: '', nom: '', telephone: '', sexe: null }

const METIERS = ['Électricité', 'Plomberie', 'Couture', 'Mécanique', 'Menuiserie', 'Maçonnerie', 'Coiffure', 'Esthétique', 'Restauration', 'Commerce', 'Informatique', 'Agriculture urbaine', 'Transformation de produits']

const normaliser = (t: string) => {
  const d = t.replace(/\D/g, '')
  return d.startsWith('00221') ? d.slice(5) : d.startsWith('221') && d.length === 12 ? d.slice(3) : d
}
const texte = (t: string | null | undefined) => t?.trim() || null

/**
 * Création ou modification d'une cible. On choisit d'abord la famille
 * (Personnes, Ménages, Sport et culture...), puis la catégorie ; les
 * champs dépendent de sa nature. Un doublon possible est signalé.
 */
export function CibleForm({ ouvert, fermer, cible, typeInitial, apresCreation }: {
  ouvert: boolean
  fermer: () => void
  cible?: Cible
  typeInitial?: TypeCible
  apresCreation?: (c: Cible) => void
}) {
  const qc = useQueryClient()
  const { data: familles = [] } = useFamilles()
  const { data: categories = [] } = useCategories()
  const { data: profils = [] } = useProfils()
  const [famille, setFamille] = useState<number | null>(null)
  const [v, setV] = useState<Valeurs>(VIDE)
  const [chef, setChef] = useState<Chef>(CHEF_VIDE)
  const [doublons, setDoublons] = useState<Cible[]>([])
  const [envoi, setEnvoi] = useState(false)

  const actives = categories.filter((k) => k.actif)
  const famillesProposees = familles.filter((f) => f.actif && actives.some((k) => k.famille_id === f.id))
  const categorie = categories.find((k) => k.id === v.categorie_id)
  const nature: TypeCible | undefined = categorie?.nature ?? cible?.type
  // En modification, on peut changer de catégorie, mais pas de nature.
  const choixCategories = cible ? actives.filter((k) => k.nature === cible.type) : actives.filter((k) => k.famille_id === famille)

  function choisirFamille(id: number) {
    setFamille(id)
    const dans = actives.filter((k) => k.famille_id === id)
    setV((x) => ({ ...x, categorie_id: dans.length === 1 ? dans[0].id : null }))
  }

  useEffect(() => {
    if (!ouvert) return
    setDoublons([])
    setChef(CHEF_VIDE)
    if (cible) {
      setV({ ...VIDE, ...cible, vulnerabilites: cible.vulnerabilites ?? [] })
      setFamille(categories.find((k) => k.id === cible.categorie_id)?.famille_id ?? null)
    } else {
      setV(VIDE)
      setFamille(null)
      if (typeInitial) {
        const k = categories.find((x) => x.actif && x.nature === typeInitial)
        if (k) {
          setFamille(k.famille_id)
          setV({ ...VIDE, categorie_id: categories.filter((x) => x.actif && x.famille_id === k.famille_id).length === 1 ? k.id : null })
        }
      }
    }
  }, [ouvert, cible, typeInitial, categories])

  const maj = <K extends keyof Valeurs>(k: K, val: Valeurs[K]) => setV((x) => ({ ...x, [k]: val }))

  // Doublons pendant la saisie : même téléphone, ou mêmes nom (et prénom).
  const nomTeste = nature === 'menage' && !cible ? chef.nom : v.nom
  const prenomTeste = nature === 'menage' && !cible ? chef.prenom : v.prenom
  const telTeste = nature === 'menage' && !cible ? chef.telephone : v.telephone
  const typeTeste: TypeCible | undefined = nature === 'menage' && !cible ? 'personne' : nature
  useEffect(() => {
    if (!ouvert || !typeTeste || (nature === 'menage' && chef.existant)) return setDoublons([])
    const tel = normaliser(telTeste ?? '')
    const nom = nomTeste.trim()
    const avecPrenom = typeTeste === 'personne'
    if (tel.length < 7 && nom.length < 2) return setDoublons([])
    const minuteur = setTimeout(async () => {
      const filtres: string[] = []
      if (tel.length >= 7) filtres.push(`telephone_normalise.eq.${tel}`)
      if (nom.length >= 2 && (!avecPrenom || (prenomTeste ?? '').trim().length >= 2)) {
        const n = nom.replace(/[%_,()]/g, ' ')
        filtres.push(avecPrenom ? `and(nom.ilike.${n},prenom.ilike.${(prenomTeste ?? '').trim().replace(/[%_,()]/g, ' ')})` : `nom.ilike.${n}`)
      }
      if (!filtres.length) return setDoublons([])
      let q = supabase.from('cibles').select('*').eq('type', typeTeste).or(filtres.join(',')).limit(5)
      if (cible) q = q.neq('id', cible.id)
      const { data } = await q
      setDoublons((data as Cible[]) ?? [])
    }, 400)
    return () => clearTimeout(minuteur)
  }, [ouvert, telTeste, nomTeste, prenomTeste, typeTeste, nature, chef.existant, cible])

  function apres(c: Cible, message: string) {
    toast.success(message)
    for (const k of ['cibles', 'cible', 'membres_collectif', 'membre_de']) qc.invalidateQueries({ queryKey: [k] })
    apresCreation?.(c)
    fermer()
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (!v.categorie_id) return toast.error('Choisissez une catégorie')
    setEnvoi(true)
    try {
      if (nature === 'menage' && !cible) return await creerMenage()
      const personne = nature === 'personne'
      const donnees = {
        categorie_id: v.categorie_id,
        nom: v.nom.trim(),
        prenom: personne ? texte(v.prenom) : null,
        sexe: personne ? v.sexe : null,
        date_naissance: personne ? v.date_naissance || null : null,
        situation_id: personne ? v.situation_id : null,
        vulnerabilites: personne ? v.vulnerabilites : [],
        metier: personne ? texte(v.metier) : null,
        telephone: texte(v.telephone),
        sous_type: personne ? null : texte(v.sous_type),
        responsable: nature === 'collectif' || nature === 'structure' ? texte(v.responsable) : null,
        effectif: nature === 'personne' || nature === 'lieu' ? null : v.effectif,
        zone_id: v.zone_id,
        adresse: texte(v.adresse),
        referent_id: v.referent_id,
        notes: texte(v.notes),
      }
      const r = cible
        ? await supabase.from('cibles').update(donnees).eq('id', cible.id).select().single()
        : await supabase.from('cibles').insert(donnees).select().single()
      if (r.error) throw r.error
      apres(r.data as Cible, cible ? 'Cible modifiée' : 'Cible enregistrée')
    } catch (err) {
      toast.error(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  // Ménage : le chef (créé s'il est nouveau), puis le ménage, en lien.
  async function creerMenage() {
    let chefId = chef.existant?.id
    if (!chefId) {
      const categoriePersonne = actives.find((k) => k.nature === 'personne')
      if (!categoriePersonne) throw new Error('Aucune catégorie « Personne » active')
      const r = await supabase.from('cibles').insert({
        categorie_id: categoriePersonne.id, prenom: chef.prenom.trim(), nom: chef.nom.trim(), sexe: chef.sexe,
        telephone: texte(chef.telephone), zone_id: v.zone_id, adresse: texte(v.adresse), referent_id: v.referent_id,
      }).select('id').single()
      if (r.error) throw r.error
      chefId = r.data.id
    }
    const r = await supabase.rpc('creer_menage', {
      p_chef: chefId, p_effectif: v.effectif, p_zone: v.zone_id, p_adresse: texte(v.adresse),
      p_nom: texte(v.nom), p_categorie: v.categorie_id,
    })
    if (r.error) throw r.error
    const menage = await supabase.from('cibles')
      .update({ referent_id: v.referent_id, notes: texte(v.notes) }).eq('id', r.data as string).select().single()
    if (menage.error) throw menage.error
    apres(menage.data as Cible, 'Ménage enregistré avec son chef')
  }

  const situations = profils.filter((p) => p.genre === 'situation' && (p.actif || p.id === v.situation_id))
  const vulnerabilites = profils.filter((p) => p.genre === 'vulnerabilite' && (p.actif || v.vulnerabilites.includes(p.id)))

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{cible ? 'Modifier la cible' : 'Nouvelle cible'}</DialogTitle>
        </DialogHeader>
        {doublons.length ? (
          <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
            <p className="font-medium">Existe peut-être déjà :</p>
            <ul className="mt-1 space-y-1">
              {doublons.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span>{nomCible(d)} {d.telephone ? `· ${d.telephone}` : ''}</span>
                  {nature === 'menage' && !cible ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => setChef({ ...CHEF_VIDE, existant: d })}>C'est le chef</Button>
                  ) : apresCreation ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => { apresCreation(d); fermer() }}>Choisir</Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <form onSubmit={enregistrer} className="grid grid-cols-1 gap-4">
          {!cible ? (
            <Champ label="Que voulez-vous enregistrer ?">
              <div className="flex flex-wrap gap-2">
                {famillesProposees.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => choisirFamille(f.id)}
                    className={cn('rounded-full border px-3 py-1.5 text-sm', famille === f.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-accent')}
                  >
                    {f.nom}
                  </button>
                ))}
              </div>
            </Champ>
          ) : null}
          {(cible || famille) && choixCategories.length > 1 ? (
            <Champ label="Catégorie">
              <Liste required value={v.categorie_id ?? ''} onChange={(e) => maj('categorie_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Choisir —</option>
                {cible ? (
                  familles.filter((f) => choixCategories.some((k) => k.famille_id === f.id)).map((f) => (
                    <optgroup key={f.id} label={f.nom}>
                      {choixCategories.filter((k) => k.famille_id === f.id).map((k) => <option key={k.id} value={k.id}>{k.libelle}</option>)}
                    </optgroup>
                  ))
                ) : choixCategories.map((k) => <option key={k.id} value={k.id}>{k.libelle}</option>)}
              </Liste>
            </Champ>
          ) : null}

          {nature === 'personne' ? <ChampsPersonne v={v} maj={maj} situations={situations} vulnerabilites={vulnerabilites} /> : null}
          {nature === 'menage' && !cible ? <ChampsChef chef={chef} setChef={setChef} /> : null}
          {nature === 'menage' ? (
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Nombre de personnes dans le ménage">
                <Input type="number" min={1} inputMode="numeric" value={v.effectif ?? ''} onChange={(e) => maj('effectif', e.target.value ? Number(e.target.value) : null)} />
              </Champ>
              <Champ label="Nom du ménage" aide={cible ? undefined : 'Par défaut : « Ménage » + nom du chef'}>
                <Input required={!!cible} value={v.nom} onChange={(e) => maj('nom', e.target.value)} />
              </Champ>
              {cible ? <Champ label="Téléphone" className="col-span-2"><Input type="tel" value={v.telephone ?? ''} onChange={(e) => maj('telephone', e.target.value)} /></Champ> : null}
            </div>
          ) : null}
          {nature === 'collectif' || nature === 'structure' || nature === 'lieu' ? (
            <>
              <Champ label="Nom">
                <Input required value={v.nom} onChange={(e) => maj('nom', e.target.value)} placeholder={nature === 'lieu' ? 'Marché de l\'Unité 17, canal de…' : 'ASC Jappo, École Unité 15…'} />
              </Champ>
              {nature !== 'lieu' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Champ label="Responsable / contact"><Input value={v.responsable ?? ''} onChange={(e) => maj('responsable', e.target.value)} /></Champ>
                  <Champ label="Téléphone"><Input type="tel" inputMode="tel" value={v.telephone ?? ''} onChange={(e) => maj('telephone', e.target.value)} /></Champ>
                  <Champ label={nature === 'structure' ? 'Effectif (élèves, patients…)' : 'Effectif déclaré'} aide="Même si tous les membres ne sont pas enregistrés">
                    <Input type="number" min={0} inputMode="numeric" value={v.effectif ?? ''} onChange={(e) => maj('effectif', e.target.value ? Number(e.target.value) : null)} />
                  </Champ>
                  <Champ label="Précision"><Input value={v.sous_type ?? ''} onChange={(e) => maj('sous_type', e.target.value)} placeholder="Football, couture…" /></Champ>
                </div>
              ) : (
                <Champ label="Précision"><Input value={v.sous_type ?? ''} onChange={(e) => maj('sous_type', e.target.value)} /></Champ>
              )}
            </>
          ) : null}

          {nature ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Champ label="Zone"><ListeZones value={v.zone_id} onChange={(z) => maj('zone_id', z)} /></Champ>
                <Champ label="Adresse / repère"><Input value={v.adresse ?? ''} onChange={(e) => maj('adresse', e.target.value)} placeholder="Près de la mosquée…" /></Champ>
              </div>
              <Champ label="Référent du suivi" aide="Le coordinateur qui suivra ce que la cible devient après les actions.">
                <ListeMembres value={v.referent_id} onChange={(m) => maj('referent_id', m)} roles={['admin', 'bureau', 'coordinateur']} />
              </Champ>
              <Champ label="Notes"><Textarea rows={2} value={v.notes ?? ''} onChange={(e) => maj('notes', e.target.value)} /></Champ>
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi || !nature}>Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ChampsPersonne({ v, maj, situations, vulnerabilites }: {
  v: Valeurs
  maj: <K extends keyof Valeurs>(k: K, val: Valeurs[K]) => void
  situations: { id: number; libelle: string }[]
  vulnerabilites: { id: number; libelle: string }[]
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Champ label="Prénom"><Input required value={v.prenom ?? ''} onChange={(e) => maj('prenom', e.target.value)} /></Champ>
      <Champ label="Nom"><Input required value={v.nom} onChange={(e) => maj('nom', e.target.value)} /></Champ>
      <Champ label="Téléphone" className="col-span-2">
        <Input type="tel" inputMode="tel" value={v.telephone ?? ''} onChange={(e) => maj('telephone', e.target.value)} placeholder="77 123 45 67" />
      </Champ>
      <Champ label="Sexe">
        <Pastilles<'F' | 'M'> value={v.sexe} onChange={(s) => maj('sexe', s)} options={[['F', 'Femme'], ['M', 'Homme']]} />
      </Champ>
      <Champ label="Date de naissance">
        <Input type="date" value={v.date_naissance ?? ''} onChange={(e) => maj('date_naissance', e.target.value)} />
      </Champ>
      <Champ label="Situation">
        <Liste value={v.situation_id ?? ''} onChange={(e) => maj('situation_id', e.target.value ? Number(e.target.value) : null)}>
          <option value="">— Non précisée —</option>
          {situations.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
        </Liste>
      </Champ>
      <Champ label="Métier / domaine">
        <Input list="metiers" value={v.metier ?? ''} onChange={(e) => maj('metier', e.target.value)} placeholder="Électricité, couture…" />
        <datalist id="metiers">{METIERS.map((m) => <option key={m} value={m} />)}</datalist>
      </Champ>
      <Champ label="Vulnérabilités (facultatif)" className="col-span-2">
        <div className="flex flex-wrap gap-2">
          {vulnerabilites.map((p) => {
            const coche = v.vulnerabilites.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => maj('vulnerabilites', coche ? v.vulnerabilites.filter((x) => x !== p.id) : [...v.vulnerabilites, p.id])}
                className={cn('rounded-full border px-3 py-1 text-xs', coche ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-card')}
              >
                {coche ? '✓ ' : ''}{p.libelle}
              </button>
            )
          })}
        </div>
      </Champ>
    </div>
  )
}

/** Chef d'un nouveau ménage : chercher une personne connue, ou la saisir. */
function ChampsChef({ chef, setChef }: { chef: Chef; setChef: (c: Chef) => void }) {
  const [recherche, setRecherche] = useState('')
  const { data: suggestions = [] } = useCibles(recherche.trim().length >= 2 ? recherche : '§', 'personne')
  const proposees = useMemo(() => (recherche.trim().length >= 2 ? suggestions.slice(0, 6) : []), [recherche, suggestions])

  if (chef.existant) {
    return (
      <Champ label="Chef de ménage">
        <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2 text-sm">
          <span className="font-medium">{nomCible(chef.existant)} {chef.existant.telephone ? <span className="text-muted-foreground">· {chef.existant.telephone}</span> : null}</span>
          <button type="button" className="text-xs text-primary" onClick={() => setChef(CHEF_VIDE)}>Changer</button>
        </div>
      </Champ>
    )
  }
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Chef de ménage</p>
      <div className="relative">
        <Input placeholder="Déjà enregistré(e) ? Chercher par nom ou téléphone…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        {proposees.length ? (
          <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-md border border-border bg-popover shadow-lg">
            {proposees.map((c) => (
              <button key={c.id} type="button" onClick={() => setChef({ ...CHEF_VIDE, existant: c })} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                {nomCible(c)} <span className="text-muted-foreground">{c.telephone}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Sinon, saisissez-le ou la :</p>
      <div className="grid grid-cols-2 gap-3">
        <Champ label="Prénom"><Input required value={chef.prenom} onChange={(e) => setChef({ ...chef, prenom: e.target.value })} /></Champ>
        <Champ label="Nom"><Input required value={chef.nom} onChange={(e) => setChef({ ...chef, nom: e.target.value })} /></Champ>
        <Champ label="Téléphone"><Input type="tel" inputMode="tel" value={chef.telephone} onChange={(e) => setChef({ ...chef, telephone: e.target.value })} /></Champ>
        <Champ label="Sexe">
          <Pastilles<'F' | 'M'> value={chef.sexe} onChange={(s) => setChef({ ...chef, sexe: s })} options={[['F', 'Femme'], ['M', 'Homme']]} />
        </Champ>
      </div>
    </div>
  )
}
