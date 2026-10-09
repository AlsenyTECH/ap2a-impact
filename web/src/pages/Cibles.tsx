import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet, Plus, Search, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { CibleForm } from '@/components/CibleForm'
import { ImportExcel } from '@/components/ImportExcel'
import { Chargement, EnTete, Erreur, Liste, Pastilles } from '@/components/champs'
import { Avatar, Liste as Encadre } from '@/components/design'
import { useAuth } from '@/lib/auth'
import { nomCible } from '@/lib/format'
import { useCategories, useCibles, useFamilles, useProfils } from '@/lib/requetes'

export function Cibles() {
  const { a } = useAuth()
  const [recherche, setRecherche] = useState('')
  const [famille, setFamille] = useState<number | null>(null)
  const [categorie, setCategorie] = useState<number | null>(null)
  const { data: familles = [] } = useFamilles()
  const { data: categories = [] } = useCategories()
  const { data: profils = [] } = useProfils()
  const [creation, setCreation] = useState(false)
  const [importer, setImporter] = useState(false)
  const dansFamille = categories.filter((k) => k.famille_id === famille)
  const filtre = categorie ? [categorie] : famille ? dansFamille.map((k) => k.id) : null
  const { data: cibles, isLoading, error } = useCibles(recherche, '', filtre)
  const situation = (id: number | null) => profils.find((p) => p.id === id)?.libelle
  const peutCreer = a('admin', 'bureau', 'coordinateur')

  return (
    <>
      <EnTete
        titre="Cibles"
        sousTitre="Personnes et collectifs accompagnés par l'association"
        actions={peutCreer ? (
          <>
            <Button variant="secondary" onClick={() => setImporter(true)}><FileSpreadsheet className="size-4" /> Excel</Button>
            <Button onClick={() => setCreation(true)}><Plus className="size-4" /> Nouvelle</Button>
          </>
        ) : null}
      />
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-10" placeholder="Nom, prénom ou téléphone" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      </div>
      <div className="sans-barre -mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Pastilles<string>
          defilant
          value={famille ? String(famille) : ''}
          onChange={(f) => { setFamille(f && Number(f) !== famille ? Number(f) : null); setCategorie(null) }}
          options={[['', 'Toutes'], ...familles.filter((f) => f.actif).map((f) => [String(f.id), f.nom] as [string, string])]}
        />
        {dansFamille.length > 1 ? (
          <Liste className="mt-2 md:max-w-sm" value={categorie ?? ''} onChange={(e) => setCategorie(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Toutes les catégories</option>
            {dansFamille.map((k) => <option key={k.id} value={k.id}>{k.libelle}</option>)}
          </Liste>
        ) : null}
      </div>
      {error ? <Erreur erreur={error} /> : isLoading ? <Chargement /> : !cibles?.length ? (
        <EmptyState icon={Target} title="Aucune cible" description={recherche ? 'Essayez une autre recherche.' : 'Ajoutez la première cible, ou importez une liste Excel.'} />
      ) : (
        <Encadre>
          {cibles.map((c) => (
            <Link key={c.id} to={`/cibles/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
              <Avatar prenom={c.prenom} nom={c.nom} nature={c.type} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{nomCible(c)}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[situation(c.situation_id) ?? c.sous_type, c.telephone, c.zone?.nom].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <Badge variant="outline" className="hidden max-w-[40%] shrink-0 truncate sm:inline-flex">{c.categorie?.libelle}</Badge>
            </Link>
          ))}
        </Encadre>
      )}
      <CibleForm ouvert={creation} fermer={() => setCreation(false)} />
      <ImportExcel ouvert={importer} fermer={() => setImporter(false)} />
    </>
  )
}
