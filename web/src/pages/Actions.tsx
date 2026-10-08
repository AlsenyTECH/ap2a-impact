import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionForm } from '@/components/ActionForm'
import { Chargement, EnTete, Erreur, Pastilles } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { date, LIBELLES_STATUT_ACTION } from '@/lib/format'
import { useActions } from '@/lib/requetes'
import type { StatutAction } from '@/lib/types'

export const COULEUR_STATUT: Record<StatutAction, 'secondary' | 'warning' | 'success' | 'outline'> = {
  preparation: 'secondary', en_cours: 'warning', terminee: 'success', annulee: 'outline',
}

export function Actions() {
  const { a } = useAuth()
  const [statut, setStatut] = useState<StatutAction | ''>('')
  const [creation, setCreation] = useState(false)
  const { data: actions, isLoading, error } = useActions(statut)

  return (
    <>
      <EnTete
        titre="Actions"
        sousTitre="Formations, dépistages, distributions, journées de nettoyage…"
        actions={a('admin', 'bureau', 'coordinateur') ? <Button onClick={() => setCreation(true)}><Plus className="size-4" /> Nouvelle</Button> : null}
      />
      <div className="mb-4">
        <Pastilles<StatutAction | ''>
          value={statut}
          onChange={(s) => setStatut(s === statut ? '' : s)}
          options={[['', 'Toutes'], ...(Object.entries(LIBELLES_STATUT_ACTION) as [StatutAction, string][])]}
        />
      </div>
      {error ? <Erreur erreur={error} /> : isLoading ? <Chargement /> : !actions?.length ? (
        <EmptyState icon={CalendarCheck} title="Aucune action" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {actions.map((x) => (
            <Link key={x.id} to={`/actions/${x.id}`} className="rounded-lg border border-border bg-card p-4 hover:border-primary/50">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{x.titre}</div>
                <Badge variant={COULEUR_STATUT[x.statut]} className="shrink-0">{LIBELLES_STATUT_ACTION[x.statut]}</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {x.type?.libelle} · {date(x.date_debut)}{x.date_fin && x.date_fin !== x.date_debut ? ` → ${date(x.date_fin)}` : ''}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {[x.lieu || x.zone?.nom, x.responsable && `Resp. ${x.responsable.prenom} ${x.responsable.nom}`].filter(Boolean).join(' · ')}
              </div>
            </Link>
          ))}
        </div>
      )}
      <ActionForm ouvert={creation} fermer={() => setCreation(false)} />
    </>
  )
}
