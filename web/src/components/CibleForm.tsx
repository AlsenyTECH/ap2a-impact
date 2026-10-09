import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Champ, Liste, ListeMembres, ListeZones, Pastilles } from '@/components/champs'
import { AIDE_TYPE_CIBLE, LIBELLES_SITUATION_PERSONNE, LIBELLES_TYPE_CIBLE, LIBELLES_VULNERABILITE, nomCible } from '@/lib/format'
import { useCategories } from '@/lib/requetes'
import { cn } from '@/lib/utils'
import { messageErreur, supabase } from '@/lib/supabase'
import type { Cible, SituationPersonne, TypeCible, Vulnerabilite } from '@/lib/types'

type Valeurs = Pick<Cible, 'type' | 'nom' | 'prenom' | 'sexe' | 'date_naissance' | 'telephone' | 'sous_type' | 'responsable' | 'effectif' | 'zone_id' | 'adresse' | 'referent_id' | 'notes' | 'categorie_id' | 'situation' | 'vulnerabilites'>

const VIDE: Valeurs = {
  type: 'personne', nom: '', prenom: '', sexe: null, date_naissance: null, telephone: '', sous_type: '',
  responsable: '', effectif: null, zone_id: null, adresse: '', referent_id: null, notes: '',
  categorie_id: null, situation: null, vulnerabilites: [],
}

const normaliser = (t: string) => {
  const d = t.replace(/\D/g, '')
  return d.startsWith('00221') ? d.slice(5) : d.startsWith('221') && d.length === 12 ? d.slice(3) : d
}

/**
 * Création ou modification d'une cible. Avant d'enregistrer, on signale
 * une cible existante avec le même téléphone ou les mêmes nom et prénom.
 */
export function CibleForm({ ouvert, fermer, cible, typeInitial, apresCreation }: {
  ouvert: boolean
  fermer: () => void
  cible?: Cible
  typeInitial?: TypeCible
  apresCreation?: (c: Cible) => void
}) {
  const qc = useQueryClient()
  const [v, setV] = useState<Valeurs>(VIDE)
  const [doublons, setDoublons] = useState<Cible[]>([])
  const [envoi, setEnvoi] = useState(false)
  const { data: categories = [] } = useCategories()

  useEffect(() => {
    if (ouvert) {
      setV(cible ? { ...VIDE, ...cible, vulnerabilites: cible.vulnerabilites ?? [] } : { ...VIDE, type: typeInitial ?? 'personne' })
      setDoublons([])
    }
  }, [ouvert, cible, typeInitial])

  const maj = <K extends keyof Valeurs>(k: K, val: Valeurs[K]) => setV((x) => ({ ...x, [k]: val }))
  const personne = v.type === 'personne'

  // Recherche de doublons pendant la saisie (téléphone, ou nom + prénom).
  useEffect(() => {
    if (!ouvert) return
    const tel = normaliser(v.telephone ?? '')
    const nom = v.nom.trim()
    if (tel.length < 7 && nom.length < 2) return setDoublons([])
    const minuteur = setTimeout(async () => {
      const filtres: string[] = []
      if (tel.length >= 7) filtres.push(`telephone_normalise.eq.${tel}`)
      if (nom.length >= 2 && (!personne || (v.prenom ?? '').trim().length >= 2)) {
        const n = nom.replace(/[%_,()]/g, ' ')
        filtres.push(personne ? `and(nom.ilike.${n},prenom.ilike.${(v.prenom ?? '').trim().replace(/[%_,()]/g, ' ')})` : `nom.ilike.${n}`)
      }
      if (!filtres.length) return setDoublons([])
      let q = supabase.from('cibles').select('*').eq('type', v.type).or(filtres.join(',')).limit(5)
      if (cible) q = q.neq('id', cible.id)
      const { data } = await q
      setDoublons((data as Cible[]) ?? [])
    }, 400)
    return () => clearTimeout(minuteur)
  }, [ouvert, v.telephone, v.nom, v.prenom, v.type, personne, cible])

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    const { categorie: _c, zone: _z, referent: _r, ...propres } = v as Valeurs & Partial<Cible>
    const donnees = {
      ...propres,
      nom: v.nom.trim(),
      prenom: v.prenom?.trim() || null,
      telephone: v.telephone?.trim() || null,
      sous_type: v.sous_type?.trim() || null,
      responsable: v.responsable?.trim() || null,
      adresse: v.adresse?.trim() || null,
      notes: v.notes?.trim() || null,
      date_naissance: v.date_naissance || null,
    }
    const r = cible
      ? await supabase.from('cibles').update(donnees).eq('id', cible.id).select().single()
      : await supabase.from('cibles').insert(donnees).select().single()
    setEnvoi(false)
    if (r.error) return toast.error(messageErreur(r.error))
    toast.success(cible ? 'Cible modifiée' : 'Cible enregistrée')
    qc.invalidateQueries({ queryKey: ['cibles'] })
    qc.invalidateQueries({ queryKey: ['cible'] })
    apresCreation?.(r.data as Cible)
    fermer()
  }

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
                  {apresCreation ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => { apresCreation(d); fermer() }}>
                      Choisir
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <form onSubmit={enregistrer} className="grid grid-cols-1 gap-4">
          {!cible ? (
            <Champ label="Nature" aide={AIDE_TYPE_CIBLE[v.type]}>
              <Pastilles<TypeCible> value={v.type} onChange={(t) => setV((x) => ({ ...x, type: t, categorie_id: null }))} options={Object.entries(LIBELLES_TYPE_CIBLE) as [TypeCible, string][]} />
            </Champ>
          ) : null}
          {personne ? (
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Prénom"><Input required value={v.prenom ?? ''} onChange={(e) => maj('prenom', e.target.value)} /></Champ>
              <Champ label="Nom"><Input required value={v.nom} onChange={(e) => maj('nom', e.target.value)} /></Champ>
            </div>
          ) : (
            <>
            <Champ label="Catégorie">
              <Liste value={v.categorie_id ?? ''} onChange={(e) => maj('categorie_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Choisir —</option>
                {[...new Set(categories.filter((k) => k.type === v.type).map((k) => k.famille))].map((famille) => (
                  <optgroup key={famille} label={famille}>
                    {categories.filter((k) => k.type === v.type && k.famille === famille).map((k) => <option key={k.id} value={k.id}>{k.libelle}</option>)}
                  </optgroup>
                ))}
              </Liste>
            </Champ>
            <Champ label="Nom"><Input required value={v.nom} onChange={(e) => maj('nom', e.target.value)} placeholder="ASC Jappo, École Unité 15…" /></Champ>
            </>
          )}
          <Champ label="Téléphone">
            <Input type="tel" inputMode="tel" value={v.telephone ?? ''} onChange={(e) => maj('telephone', e.target.value)} placeholder="77 123 45 67" />
          </Champ>
          {personne ? (
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Sexe">
                <Pastilles<'F' | 'M'> value={v.sexe} onChange={(s) => maj('sexe', s)} options={[['F', 'Femme'], ['M', 'Homme']]} />
              </Champ>
              <Champ label="Date de naissance">
                <Input type="date" value={v.date_naissance ?? ''} onChange={(e) => maj('date_naissance', e.target.value)} />
              </Champ>
              <Champ label="Situation" className="col-span-2">
                <Liste value={v.situation ?? ''} onChange={(e) => maj('situation', (e.target.value || null) as SituationPersonne | null)}>
                  <option value="">— Non précisée —</option>
                  {Object.entries(LIBELLES_SITUATION_PERSONNE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Liste>
              </Champ>
              <Champ label="Vulnérabilités (facultatif)" className="col-span-2">
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(LIBELLES_VULNERABILITE) as [Vulnerabilite, string][]).map(([k, l]) => {
                    const coche = v.vulnerabilites.includes(k)
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => maj('vulnerabilites', coche ? v.vulnerabilites.filter((x) => x !== k) : [...v.vulnerabilites, k])}
                        className={cn('rounded-full border px-3 py-1 text-xs', coche ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-card')}
                      >
                        {coche ? '✓ ' : ''}{l}
                      </button>
                    )
                  })}
                </div>
              </Champ>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Responsable / contact"><Input value={v.responsable ?? ''} onChange={(e) => maj('responsable', e.target.value)} /></Champ>
              <Champ label="Effectif déclaré">
                <Input type="number" min={0} inputMode="numeric" value={v.effectif ?? ''} onChange={(e) => maj('effectif', e.target.value ? Number(e.target.value) : null)} />
              </Champ>
              <Champ label="Précision" className="col-span-2">
                <Input value={v.sous_type ?? ''} onChange={(e) => maj('sous_type', e.target.value)} placeholder="Football, couture, transformation de céréales…" />
              </Champ>
            </div>
          )}
          <Champ label="Zone"><ListeZones value={v.zone_id} onChange={(z) => maj('zone_id', z)} /></Champ>
          <Champ label="Référent du suivi" aide="Le coordinateur qui suivra ce que la cible devient après les actions.">
            <ListeMembres value={v.referent_id} onChange={(m) => maj('referent_id', m)} roles={['admin', 'bureau', 'coordinateur']} />
          </Champ>
          <Champ label="Notes"><Textarea rows={2} value={v.notes ?? ''} onChange={(e) => maj('notes', e.target.value)} /></Champ>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi}>Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
