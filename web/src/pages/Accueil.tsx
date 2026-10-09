import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CalendarCheck, Coins, FlaskConical, ListChecks, Plus, Target, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Avatar, BlocDate, Indicateur, Liste, Section, StatutPastille } from '@/components/design'
import { useAuth } from '@/lib/auth'
import { date, fcfa, nomCible, SITUATION } from '@/lib/format'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import type { Action, SuiviDetail } from '@/lib/types'

const compter = async (table: string, filtre?: [string, string]) => {
  let q = supabase.from(table).select('*', { count: 'exact', head: true })
  if (filtre) q = q.eq(filtre[0], filtre[1])
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

type ActionAvecType = Action & { type: { libelle: string; code: string } | null }

export function Accueil() {
  const { membre, a } = useAuth()
  const voitTout = a('admin', 'bureau', 'coordinateur')
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  const { data: chiffres } = useQuery({
    queryKey: ['accueil', 'chiffres'],
    enabled: voitTout,
    queryFn: async () => {
      const [cibles, enCours, beneficiaires, apports] = await Promise.all([
        compter('cibles'),
        compter('actions', ['statut', 'en_cours']),
        compter('beneficiaires'),
        supabase.from('apports').select('valeur_fcfa').then(verifier),
      ])
      return { cibles, enCours, beneficiaires, valeur: (apports as { valeur_fcfa: number | null }[]).reduce((s, x) => s + (x.valeur_fcfa ?? 0), 0) }
    },
  })

  // Suivis dont je suis chargé(e), en retard ou prévus dans la semaine.
  const { data: aFaire } = useQuery({
    queryKey: ['accueil', 'suivis', membre?.id],
    enabled: voitTout,
    queryFn: async () => {
      const semaine = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
      const { count, error } = await supabase.from('suivis_detail').select('id', { count: 'exact', head: true })
        .eq('charge_id', membre!.id).is('fait_le', null).lte('date_prevue', semaine)
      if (error) throw error
      return count ?? 0
    },
  })

  const { data: prochaines = [] } = useQuery({
    queryKey: ['accueil', 'actions'],
    queryFn: async () =>
      verifier(await supabase.from('actions').select('*, type:types_action(libelle, code)')
        .in('statut', ['preparation', 'en_cours']).order('date_debut').limit(6)) as ActionAvecType[],
  })

  // Les dernières nouvelles des bénéficiaires : suivis faits récemment.
  const { data: nouvelles = [] } = useQuery({
    queryKey: ['accueil', 'nouvelles'],
    enabled: voitTout,
    queryFn: async () =>
      verifier(await supabase.from('suivis_detail').select('*').not('fait_le', 'is', null)
        .order('fait_le', { ascending: false }).limit(5)) as SuiviDetail[],
  })

  return (
    <div className="space-y-7">
      {/* Bandeau d'accueil */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b7a57] via-[#0a5f45] to-[#0c2a20] p-6 text-white shadow-haute md:p-8">
        <svg aria-hidden className="absolute -right-10 -top-10 size-64 opacity-[0.08]" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="90" fill="none" stroke="white" strokeWidth="18" />
          <circle cx="100" cy="100" r="45" fill="none" stroke="white" strokeWidth="18" />
        </svg>
        <div className="relative">
          <p className="text-sm capitalize text-white/70">{aujourdhui}</p>
          <h1 className="mt-1 text-2xl font-semibold text-white md:text-3xl">Bonjour {membre?.prenom}</h1>
          <p className="mt-1 max-w-xl text-sm text-white/80 md:text-base">
            Voici où en sont les actions de l'association et ce que deviennent ses bénéficiaires.
          </p>
          {voitTout ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild size="sm" className="bg-white text-[#0a5f45] hover:bg-white/90">
                <Link to="/actions"><Plus /> Nouvelle action</Link>
              </Button>
              <Button asChild size="sm" className="border border-white/25 bg-white/10 text-white hover:bg-white/20">
                <Link to="/cibles"><Target /> Les cibles</Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {a('admin') ? <BandeauDemo /> : null}

      {aFaire ? (
        <Link to="/suivis" className="group flex items-center gap-4 rounded-xl border border-or/40 bg-or-soft p-4 transition-colors hover:border-or">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-or text-[#3d2c00]"><ListChecks className="size-5" /></span>
          <div className="flex-1">
            <div className="font-semibold text-[#5c4100]">{aFaire} suivi{aFaire > 1 ? 's' : ''} à faire cette semaine</div>
            <div className="text-sm text-[#7a5600]">Appelez les bénéficiaires et notez ce qu'ils sont devenus.</div>
          </div>
          <ArrowRight className="size-5 text-[#7a5600] transition-transform group-hover:translate-x-1" />
        </Link>
      ) : null}

      {voitTout ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Link to="/cibles"><Indicateur icone={Target} valeur={chiffres?.cibles} libelle="cibles enregistrées" /></Link>
          <Link to="/actions"><Indicateur icone={CalendarCheck} valeur={chiffres?.enCours} libelle="actions en cours" ton="or" /></Link>
          <Indicateur icone={Users} valeur={chiffres?.beneficiaires} libelle="bénéficiaires" ton="bleu" />
          <Link to="/impact"><Indicateur icone={Coins} valeur={chiffres ? fcfa(chiffres.valeur) : undefined} libelle="remis en kits, dons, soins" ton="rose" /></Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-5">
        <Section
          titre="Prochaines actions"
          className="lg:col-span-3"
          action={<Link to="/actions" className="text-sm font-medium text-primary hover:underline">Tout voir</Link>}
        >
          {!prochaines.length ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune action en préparation ou en cours.</p>
          ) : (
            <Liste>
              {prochaines.map((x) => (
                <Link key={x.id} to={`/actions/${x.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                  <BlocDate date={x.date_debut} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{x.titre}</div>
                    <div className="truncate text-xs text-muted-foreground">{x.type?.libelle}{x.lieu ? ` · ${x.lieu}` : ''}</div>
                  </div>
                  <StatutPastille statut={x.statut} className="hidden sm:inline-flex" />
                </Link>
              ))}
            </Liste>
          )}
        </Section>

        {voitTout ? (
          <Section
            titre="Dernières nouvelles"
            className="lg:col-span-2"
            action={<Link to="/impact" className="text-sm font-medium text-primary hover:underline">Impact</Link>}
          >
            {!nouvelles.length ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Les suivis des bénéficiaires apparaîtront ici.</p>
            ) : (
              <Liste>
                {nouvelles.map((s) => (
                  <Link key={s.id} to={`/cibles/${s.cible_id}`} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                    <Avatar prenom={s.cible_prenom} nom={s.cible_nom} nature={s.cible_type} taille="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{nomCible({ prenom: s.cible_prenom, nom: s.cible_nom })}</span>
                        {s.situation ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <span className="size-2 rounded-full" style={{ background: SITUATION[s.situation].couleur }} />
                            {SITUATION[s.situation].libelle}
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{s.activite || s.commentaire || s.action_titre}</div>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{date(s.fait_le)}</span>
                  </Link>
                ))}
              </Liste>
            )}
          </Section>
        ) : (
          <Section titre="Mon rôle" className="lg:col-span-2">
            <p className="text-sm text-muted-foreground">
              Vous voyez les actions de l'association. Les coordinateurs vous ajoutent aux équipes des actions où vous êtes mobilisé(e).
            </p>
          </Section>
        )}
      </div>
    </div>
  )
}

/** Données de démonstration : visibles et effaçables par l'administrateur. */
function BandeauDemo() {
  const qc = useQueryClient()
  const { data: nb = 0 } = useQuery({
    queryKey: ['donnees_demo'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('nb_donnees_demo')
      if (error) return 0
      return data as number
    },
  })
  if (!nb) return null

  async function effacer() {
    if (!confirm('Effacer toutes les données de démonstration (membres, cibles, actions, suivis fictifs) ? Vos données réelles sont conservées.')) return
    const { error } = await supabase.rpc('supprimer_donnees_demo')
    if (error) {
      toast.error(error.code === 'PGRST202'
        ? "La fonction d'effacement n'est pas encore installée : collez le fichier supabase/migrations/20261013000002_donnees_demo_2_effacer.sql dans Supabase > SQL Editor."
        : messageErreur(error))
      return
    }
    toast.success('Données de démonstration effacées')
    qc.invalidateQueries()
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-[#4f3aa3]/40 bg-[#f4f1fd] p-4 sm:flex-row sm:items-center">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#ece8fb] text-[#4f3aa3]"><FlaskConical className="size-5" /></span>
      <div className="flex-1 text-sm">
        <div className="font-semibold text-[#3b2a85]">Mode découverte : {nb} éléments de démonstration</div>
        <div className="text-[#4f3aa3]/80">Noms et numéros fictifs pour essayer l'application. Effacez-les avant de saisir vos vraies données.</div>
      </div>
      <Button variant="secondary" size="sm" onClick={effacer}>Effacer la démonstration</Button>
    </div>
  )
}
