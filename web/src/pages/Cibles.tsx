import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet, Plus, Search, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { CibleForm } from '@/components/CibleForm'
import { ImportExcel } from '@/components/ImportExcel'
import { Chargement, EnTete, Erreur, Pastilles } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { LIBELLES_TYPE_CIBLE, nomCible } from '@/lib/format'
import { useCibles } from '@/lib/requetes'
import type { TypeCible } from '@/lib/types'

export function Cibles() {
  const { a } = useAuth()
  const [recherche, setRecherche] = useState('')
  const [type, setType] = useState<TypeCible | ''>('')
  const [creation, setCreation] = useState(false)
  const [importer, setImporter] = useState(false)
  const { data: cibles, isLoading, error } = useCibles(recherche, type)
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
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Nom, prénom ou téléphone" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      </div>
      <div className="mb-4">
        <Pastilles<TypeCible | ''>
          value={type}
          onChange={(t) => setType(t === type ? '' : t)}
          options={[['', 'Toutes'], ...(Object.entries(LIBELLES_TYPE_CIBLE) as [TypeCible, string][])]}
        />
      </div>
      {error ? <Erreur erreur={error} /> : isLoading ? <Chargement /> : !cibles?.length ? (
        <EmptyState icon={Target} title="Aucune cible" description={recherche ? 'Essayez une autre recherche.' : 'Ajoutez la première cible, ou importez une liste Excel.'} />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {cibles.map((c) => (
            <Link key={c.id} to={`/cibles/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
              <div className="min-w-0">
                <div className="truncate font-medium">{nomCible(c)}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[c.telephone, c.zone?.nom, c.sous_type].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <Badge variant="outline" className="shrink-0">{LIBELLES_TYPE_CIBLE[c.type]}</Badge>
            </Link>
          ))}
        </div>
      )}
      <CibleForm ouvert={creation} fermer={() => setCreation(false)} typeInitial={type || undefined} />
      <ImportExcel ouvert={importer} fermer={() => setImporter(false)} />
    </>
  )
}
