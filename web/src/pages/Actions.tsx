import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarDays, MapPin, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionForm } from '@/components/ActionForm'
import { Avatar, IconeType, StatutPastille } from '@/components/design'
import { Chargement, EnTete, Erreur, Pastilles } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { date, LIBELLES_STATUT_ACTION } from '@/lib/format'
import { useActions } from '@/lib/requetes'
import type { StatutAction } from '@/lib/types'

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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {actions.map((x) => (
            <Link
              key={x.id}
              to={`/actions/${x.id}`}
              className="group flex flex-col rounded-xl border border-border/80 bg-card p-4 shadow-carte transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-haute"
            >
              <div className="flex items-start gap-3">
                <IconeType code={x.type?.code} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-muted-foreground">{x.type?.libelle}</div>
                  <div className="mt-0.5 line-clamp-2 font-semibold leading-snug group-hover:text-primary">{x.titre}</div>
                </div>
              </div>
              <div className="mb-4 mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />
                  {date(x.date_debut)}{x.date_fin && x.date_fin !== x.date_debut ? ` → ${date(x.date_fin)}` : ''}
                </span>
                {x.lieu || x.zone?.nom ? <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{x.lieu || x.zone?.nom}</span></span> : null}
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                {x.responsable ? (
                  <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <Avatar prenom={x.responsable.prenom} nom={x.responsable.nom} taille="sm" className="size-6 text-[10px]" />
                    <span className="truncate">{x.responsable.prenom} {x.responsable.nom}</span>
                  </span>
                ) : <span />}
                <StatutPastille statut={x.statut} />
              </div>
            </Link>
          ))}
        </div>
      )}
      <ActionForm ouvert={creation} fermer={() => setCreation(false)} />
    </>
  )
}
