import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, MessageCircle, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SuiviForm } from '@/components/SuiviForm'
import { Avatar } from '@/components/design'
import { Chargement, EnTete, Erreur, Pastilles } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { aujourdhui, date, echeance, lienWhatsApp, nomCible, SITUATION } from '@/lib/format'
import { supabase, verifier } from '@/lib/supabase'
import type { SuiviDetail } from '@/lib/types'

type Vue = 'miens' | 'tous' | 'faits'

/** Dans combien de jours (négatif = en retard). */
const jours = (d: string) => Math.round((new Date(`${d}T00:00:00`).getTime() - new Date(`${aujourdhui()}T00:00:00`).getTime()) / 86_400_000)

export function Suivis() {
  const { membre, a } = useAuth()
  const [vue, setVue] = useState<Vue>('miens')
  const [ouvert, setOuvert] = useState<SuiviDetail | null>(null)

  const { data: suivis, isLoading, error } = useQuery({
    queryKey: ['suivis', vue, membre?.id],
    queryFn: async () => {
      let q = supabase.from('suivis_detail').select('*').limit(300)
      if (vue === 'faits') q = q.not('fait_le', 'is', null).order('fait_le', { ascending: false })
      else {
        // À faire : en retard, ou prévus dans les 30 prochains jours.
        const limite = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
        q = q.is('fait_le', null).lte('date_prevue', limite).order('date_prevue')
        if (vue === 'miens') q = q.eq('charge_id', membre!.id)
      }
      return verifier(await q) as SuiviDetail[]
    },
  })

  if (!a('admin', 'bureau', 'coordinateur')) {
    return <EmptyState icon={CheckCircle2} title="Réservé aux coordinateurs" description="Les suivis des bénéficiaires sont faits par les coordinateurs désignés." />
  }

  const enRetard = suivis?.filter((s) => !s.fait_le && jours(s.date_prevue) < 0).length ?? 0

  return (
    <>
      <EnTete
        titre="Suivis"
        sousTitre="Que sont devenus les bénéficiaires ? Appelez, puis renseignez en une minute."
      />
      <div className="mb-4">
        <Pastilles<Vue>
          value={vue}
          onChange={setVue}
          options={[['miens', 'Mes suivis à faire'], ...(a('admin', 'bureau') ? [['tous', 'Tous à faire'] as [Vue, string]] : []), ['faits', 'Déjà faits']]}
        />
      </div>
      {vue !== 'faits' && enRetard ? (
        <p className="mb-3 text-sm font-medium text-destructive">{enRetard} suivi(s) en retard</p>
      ) : null}
      {error ? <Erreur erreur={error} /> : isLoading ? <Chargement /> : !suivis?.length ? (
        <EmptyState icon={CheckCircle2} title={vue === 'faits' ? 'Aucun suivi fait pour l\'instant' : 'Rien à faire pour le moment'} description={vue === 'faits' ? undefined : 'Les suivis apparaissent ici quand leur date approche (30 jours avant).'} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {suivis.map((s) => {
            const nom = nomCible({ prenom: s.cible_prenom, nom: s.cible_nom })
            const j = jours(s.date_prevue)
            return (
              <div key={s.id} className="rounded-xl border border-border/80 bg-card p-4 shadow-carte">
                <div className="flex items-start gap-3">
                  <Avatar prenom={s.cible_prenom} nom={s.cible_nom} nature={s.cible_type} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/cibles/${s.cible_id}`} className="font-medium">{nom}</Link>
                    <div className="truncate text-xs text-muted-foreground">
                      {echeance(s.echeance_mois)} · <Link to={`/actions/${s.action_id}`}>{s.action_titre}</Link>
                    </div>
                  </div>
                  {s.fait_le && s.situation ? (
                    <Badge variant="outline" className="shrink-0 gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: SITUATION[s.situation].couleur }} />
                      {SITUATION[s.situation].libelle}
                    </Badge>
                  ) : (
                    <Badge variant={j < 0 ? 'destructive' : 'secondary'} className="shrink-0">
                      {j < 0 ? `En retard de ${-j} j` : j === 0 ? "Aujourd'hui" : `Dans ${j} j`}
                    </Badge>
                  )}
                </div>
                {s.fait_le ? (
                  <p className="mt-2 text-sm text-muted-foreground sm:pl-[52px]">
                    {date(s.fait_le)}{s.activite ? ` · ${s.activite}` : ''}{s.commentaire ? ` · ${s.commentaire}` : ''}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 sm:pl-[52px]">
                  {s.cible_telephone && !s.fait_le ? (
                    <>
                      <Button asChild size="sm" variant="secondary"><a href={`tel:${s.cible_telephone}`}><Phone className="size-4" /> Appeler</a></Button>
                      <Button asChild size="sm" variant="secondary">
                        <a target="_blank" rel="noreferrer" href={lienWhatsApp(s.cible_telephone, `Bonjour ${s.cible_prenom ?? ''}, c'est l'association AP2A. Nous prenons de vos nouvelles depuis « ${s.action_titre} ». Comment ça se passe pour vous ?`)}>
                          <MessageCircle className="size-4" /> WhatsApp
                        </a>
                      </Button>
                    </>
                  ) : null}
                  <Button size="sm" variant={s.fait_le ? 'ghost' : 'default'} onClick={() => setOuvert(s)}>{s.fait_le ? 'Modifier' : 'Renseigner'}</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <SuiviForm
        ouvert={!!ouvert}
        fermer={() => setOuvert(null)}
        suivi={ouvert}
        titre={ouvert ? nomCible({ prenom: ouvert.cible_prenom, nom: ouvert.cible_nom }) : ''}
      />
    </>
  )
}
