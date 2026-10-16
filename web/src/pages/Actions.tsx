import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarDays, CalendarRange, MapPin, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionForm } from '@/components/ActionForm'
import { Avatar, IconeType, StatutPastille } from '@/components/design'
import { Chargement, EnTete, Erreur, Liste, Pastilles } from '@/components/champs'
import { OutilsListe } from '@/components/OutilsListe'
import { correspond, trier } from '@/lib/recherche'
import { useAuth } from '@/lib/auth'
import { date, LIBELLES_STATUT_ACTION } from '@/lib/format'
import { useActions, useTypesAction } from '@/lib/requetes'
import type { StatutAction } from '@/lib/types'

type Tri = 'recentes' | 'anciennes' | 'titre' | 'budget'

export function Actions() {
  const { peutUn } = useAuth()
  const [statut, setStatut] = useState<StatutAction | ''>('')
  const [type, setType] = useState('')
  const [recherche, setRecherche] = useState('')
  const [tri, setTri] = useState<Tri>('recentes')
  const [creation, setCreation] = useState(false)
  const { data: toutes, isLoading, error } = useActions('')
  const { data: types = [] } = useTypesAction()

  const filtrees = (toutes ?? []).filter((x) =>
    (!statut || x.statut === statut) && (!type || String(x.type_id) === type)
    && correspond(recherche, x.titre, x.lieu, x.zone?.nom, x.type?.libelle, x.responsable?.prenom, x.responsable?.nom, x.responsable?.numero_adherent))
  const actions = tri === 'recentes' ? filtrees // déjà triées par la base
    : tri === 'anciennes' ? trier(filtrees, (x) => x.date_debut, 'asc')
    : tri === 'titre' ? trier(filtrees, (x) => x.titre)
    : trier(filtrees, (x) => x.budget_fcfa, 'desc')

  return (
    <>
      <EnTete
        titre="Actions"
        sousTitre="Formations, dépistages, distributions, journées de nettoyage…"
        actions={peutUn('actions.creer', 'actions.gerer') ? <Button onClick={() => setCreation(true)}><Plus className="size-4" /> Nouvelle</Button> : null}
      />
      <OutilsListe<Tri>
        recherche={recherche}
        setRecherche={setRecherche}
        placeholder="Titre, lieu, responsable ou n° de membre…"
        tris={[['recentes', 'Plus récentes'], ['anciennes', 'Plus anciennes'], ['titre', 'Titre A → Z'], ['budget', 'Budget le plus élevé']]}
        tri={tri}
        setTri={setTri}
        total={toutes ? actions.length : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Liste className="w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type d'action">
            <option value="">Tous les types</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </Liste>
        </div>
      </OutilsListe>
      <div className="sans-barre -mx-4 mb-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Pastilles<StatutAction | ''>
          defilant
          value={statut}
          onChange={(s) => setStatut(s === statut ? '' : s)}
          options={[['', 'Toutes'], ...(Object.entries(LIBELLES_STATUT_ACTION) as [StatutAction, string][])]}
        />
      </div>
      {error ? <Erreur erreur={error} /> : isLoading ? <Chargement /> : !actions.length ? (
        <EmptyState icon={CalendarCheck} title="Aucune action" description={recherche || statut || type ? 'Aucune action ne correspond à ces critères.' : undefined} />
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
                {x.seances?.[0]?.count ? <span className="inline-flex items-center gap-1.5 font-medium text-primary"><CalendarRange className="size-3.5" />{x.seances[0].count} séance{x.seances[0].count > 1 ? 's' : ''}</span> : null}
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                {x.responsable ? (
                  <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <Avatar prenom={x.responsable.prenom} nom={x.responsable.nom} taille="sm" className="size-6 text-[10px]" />
                    <span className="truncate">{x.responsable.prenom} {x.responsable.nom} <span className="text-muted-foreground/70">· {x.responsable.numero_adherent}</span></span>
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
