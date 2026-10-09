import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Chargement, EnTete, Liste } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { AIDE_TYPE_CIBLE, LIBELLES_TYPE_CIBLE } from '@/lib/format'
import { useCategories, useFamilles, useProfils } from '@/lib/requetes'
import { supabase } from '@/lib/supabase'
import type { TypeCible } from '@/lib/types'

type Table = 'familles_cible' | 'categories_cible' | 'profils_personne'

/** Enregistre une modification et rafraîchit le référentiel. */
function useReferentiel() {
  const qc = useQueryClient()
  return async (table: Table, operation: 'ajout' | 'modif' | 'suppr', donnees: Record<string, unknown>, id?: number) => {
    const r = operation === 'ajout'
      ? await supabase.from(table).insert(donnees)
      : operation === 'modif'
        ? await supabase.from(table).update(donnees).eq('id', id!)
        : await supabase.from(table).delete().eq('id', id!)
    if (r.error) {
      if (r.error.code === '23503') toast.error('Déjà utilisé par des fiches : désactivez-le plutôt que de le supprimer.')
      else if (r.error.code === '23505') toast.error('Ce nom existe déjà')
      else toast.error(r.error.message)
      return false
    }
    qc.invalidateQueries({ queryKey: [table] })
    return true
  }
}

/** Ligne modifiable : nom (enregistré en quittant le champ), actif, suppression. */
function Ligne({ libelle, actif, gere, renommer, basculer, supprimer, children }: {
  libelle: string
  actif: boolean
  gere: boolean
  renommer: (v: string) => void
  basculer: (v: boolean) => void
  supprimer: () => void
  children?: ReactNode
}) {
  if (!gere) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <span className={actif ? '' : 'text-muted-foreground line-through'}>{libelle}</span>
        {children}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <Input
        key={libelle}
        defaultValue={libelle}
        className={`h-8 flex-1 text-sm ${actif ? '' : 'text-muted-foreground line-through'}`}
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (v && v !== libelle) renommer(v)
          else e.target.value = libelle
        }}
      />
      {children}
      <Switch checked={actif} onCheckedChange={basculer} aria-label={actif ? 'Désactiver' : 'Activer'} />
      <button
        onClick={() => confirm(`Supprimer « ${libelle} » ?`) && supprimer()}
        aria-label="Supprimer"
        className="p-1 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}

export function Categories() {
  const { a } = useAuth()
  const gere = a('admin', 'bureau')
  return (
    <>
      <EnTete
        titre="Catégories"
        sousTitre={gere
          ? 'Ajoutez, renommez, désactivez ou supprimez. Un élément déjà utilisé ne peut qu\'être désactivé.'
          : 'Familles et catégories de cibles utilisées par l\'association.'}
      />
      <Tabs defaultValue="familles">
        <TabsList className="mb-4">
          <TabsTrigger value="familles">Familles et catégories</TabsTrigger>
          <TabsTrigger value="profils">Profils des personnes</TabsTrigger>
        </TabsList>
        <TabsContent value="familles"><FamillesEtCategories gere={gere} /></TabsContent>
        <TabsContent value="profils"><Profils gere={gere} /></TabsContent>
      </Tabs>
    </>
  )
}

function FamillesEtCategories({ gere }: { gere: boolean }) {
  const { data: familles, isLoading } = useFamilles()
  const { data: categories = [] } = useCategories()
  const enregistrer = useReferentiel()
  const [nouvelleFamille, setNouvelleFamille] = useState('')

  if (isLoading || !familles) return <Chargement />
  return (
    <div className="space-y-4">
      {familles.map((f) => (
        <Card key={f.id}>
          <CardContent className="p-0">
            <div className="border-b border-border bg-muted/40 font-semibold">
              <Ligne
                libelle={f.nom}
                actif={f.actif}
                gere={gere}
                renommer={(nom) => enregistrer('familles_cible', 'modif', { nom }, f.id)}
                basculer={(actif) => enregistrer('familles_cible', 'modif', { actif }, f.id)}
                supprimer={() => enregistrer('familles_cible', 'suppr', {}, f.id)}
              />
            </div>
            <div className="divide-y divide-border">
              {categories.filter((k) => k.famille_id === f.id).map((k) => (
                <Ligne
                  key={k.id}
                  libelle={k.libelle}
                  actif={k.actif}
                  gere={gere}
                  renommer={(libelle) => enregistrer('categories_cible', 'modif', { libelle }, k.id)}
                  basculer={(actif) => enregistrer('categories_cible', 'modif', { actif }, k.id)}
                  supprimer={() => enregistrer('categories_cible', 'suppr', {}, k.id)}
                >
                  <Badge variant="outline" className="hidden shrink-0 text-[11px] sm:inline-flex" title={AIDE_TYPE_CIBLE[k.nature]}>{LIBELLES_TYPE_CIBLE[k.nature]}</Badge>
                </Ligne>
              ))}
            </div>
            {gere ? <NouvelleCategorie familleId={f.id} /> : null}
          </CardContent>
        </Card>
      ))}
      {gere ? (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const ordre = Math.max(0, ...familles.map((f) => f.ordre)) + 1
            if (await enregistrer('familles_cible', 'ajout', { nom: nouvelleFamille.trim(), ordre })) setNouvelleFamille('')
          }}
        >
          <Input required placeholder="Nouvelle famille (ex. Agriculture urbaine)" value={nouvelleFamille} onChange={(e) => setNouvelleFamille(e.target.value)} />
          <Button type="submit"><Plus className="size-4" /> Famille</Button>
        </form>
      ) : null}
    </div>
  )
}

function NouvelleCategorie({ familleId }: { familleId: number }) {
  const enregistrer = useReferentiel()
  const { data: categories = [] } = useCategories()
  const dansFamille = categories.filter((k) => k.famille_id === familleId)
  const [libelle, setLibelle] = useState('')
  // Par défaut, la nature la plus fréquente de la famille.
  const [nature, setNature] = useState<TypeCible | ''>('')
  const [ouvert, setOuvert] = useState(false)
  const natureParDefaut = (dansFamille[0]?.nature ?? 'collectif') as TypeCible
  const choisie = nature || natureParDefaut

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} className="flex w-full items-center gap-1 border-t border-border px-3 py-2 text-sm text-primary hover:bg-muted/50">
        <Plus className="size-4" /> Ajouter une catégorie
      </button>
    )
  }
  return (
    <form
      className="grid grid-cols-1 gap-2 border-t border-border p-3 sm:grid-cols-[2fr_1fr_auto]"
      onSubmit={async (e) => {
        e.preventDefault()
        const ordre = Math.max(0, ...dansFamille.map((k) => k.ordre)) + 1
        if (await enregistrer('categories_cible', 'ajout', { famille_id: familleId, nature: choisie, libelle: libelle.trim(), ordre })) {
          setLibelle('')
          setNature('')
          setOuvert(false)
        }
      }}
    >
      <Input required autoFocus className="h-9" placeholder="Nouvelle catégorie…" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
      <Liste className="h-9" aria-label="Nature" value={choisie} onChange={(e) => setNature(e.target.value as TypeCible)} title={AIDE_TYPE_CIBLE[choisie]}>
        {(Object.keys(LIBELLES_TYPE_CIBLE) as TypeCible[]).map((n) => <option key={n} value={n}>{LIBELLES_TYPE_CIBLE[n]}</option>)}
      </Liste>
      <Button type="submit" size="sm" variant="secondary" className="h-9"><Plus className="size-4" /> Ajouter</Button>
    </form>
  )
}

function Profils({ gere }: { gere: boolean }) {
  const { data: profils, isLoading } = useProfils()
  const enregistrer = useReferentiel()
  const [nouveau, setNouveau] = useState({ situation: '', vulnerabilite: '' })

  if (isLoading || !profils) return <Chargement />
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {(['situation', 'vulnerabilite'] as const).map((genre) => {
        const liste = profils.filter((p) => p.genre === genre)
        return (
          <Card key={genre}>
            <CardContent className="p-0">
              <div className="border-b border-border bg-muted/40 px-3 py-2 font-semibold">
                {genre === 'situation' ? 'Situations' : 'Vulnérabilités'}
              </div>
              <div className="divide-y divide-border">
                {liste.map((p) => (
                  <Ligne
                    key={p.id}
                    libelle={p.libelle}
                    actif={p.actif}
                    gere={gere}
                    renommer={(libelle) => enregistrer('profils_personne', 'modif', { libelle }, p.id)}
                    basculer={(actif) => enregistrer('profils_personne', 'modif', { actif }, p.id)}
                    supprimer={() => enregistrer('profils_personne', 'suppr', {}, p.id)}
                  />
                ))}
              </div>
              {gere ? (
                <form
                  className="flex gap-2 border-t border-border p-3"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const ordre = Math.max(0, ...liste.map((p) => p.ordre)) + 1
                    if (await enregistrer('profils_personne', 'ajout', { genre, libelle: nouveau[genre].trim(), ordre })) {
                      setNouveau({ ...nouveau, [genre]: '' })
                    }
                  }}
                >
                  <Input required className="h-9" placeholder="Ajouter…" value={nouveau[genre]} onChange={(e) => setNouveau({ ...nouveau, [genre]: e.target.value })} />
                  <Button type="submit" size="sm" variant="secondary" className="h-9"><Plus className="size-4" /></Button>
                </form>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
