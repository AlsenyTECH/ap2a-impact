import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, Coins, Target, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'
import { date, fcfa, LIBELLES_STATUT_ACTION } from '@/lib/format'
import { supabase, verifier } from '@/lib/supabase'
import type { Action } from '@/lib/types'
import { COULEUR_STATUT } from './Actions'

const compter = async (table: string, filtre?: [string, string]) => {
  let q = supabase.from(table).select('*', { count: 'exact', head: true })
  if (filtre) q = q.eq(filtre[0], filtre[1])
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export function Accueil() {
  const { membre, a } = useAuth()
  const voitTout = a('admin', 'bureau', 'coordinateur')

  const { data: chiffres } = useQuery({
    queryKey: ['accueil', 'chiffres'],
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

  const { data: prochaines = [] } = useQuery({
    queryKey: ['accueil', 'actions'],
    queryFn: async () =>
      verifier(await supabase.from('actions').select('*, type:types_action(libelle)')
        .in('statut', ['preparation', 'en_cours']).order('date_debut').limit(8)) as Action[],
  })

  const { data: mesActions = [] } = useQuery({
    queryKey: ['accueil', 'mes-actions', membre?.id],
    queryFn: async () => {
      const equipe = verifier(await supabase.from('action_equipe').select('action_id').eq('membre_id', membre!.id)) as { action_id: string }[]
      const ids = equipe.map((e) => e.action_id)
      const filtre = [`responsable_id.eq.${membre!.id}`, ...(ids.length ? [`id.in.(${ids.join(',')})`] : [])].join(',')
      return verifier(await supabase.from('actions').select('*').or(filtre).neq('statut', 'annulee').order('date_debut', { ascending: false }).limit(5)) as Action[]
    },
  })

  return (
    <>
      <h1 className="mb-1 text-xl font-bold md:text-2xl">Bonjour {membre?.prenom}</h1>
      <p className="mb-5 text-sm text-muted-foreground">Voici où en est l'association.</p>

      {voitTout ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Chiffre icone={Target} libelle="Cibles" valeur={chiffres?.cibles} vers="/cibles" />
          <Chiffre icone={CalendarCheck} libelle="Actions en cours" valeur={chiffres?.enCours} vers="/actions" />
          <Chiffre icone={Users} libelle="Bénéficiaires" valeur={chiffres?.beneficiaires} />
          <Chiffre icone={Coins} libelle="Valeur remise" valeur={chiffres ? fcfa(chiffres.valeur) : undefined} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ListeActions titre="En préparation et en cours" actions={prochaines} vide="Aucune action en cours." />
        <ListeActions titre="Mes actions" actions={mesActions} vide="Vous n'êtes mobilisé(e) sur aucune action pour l'instant." />
      </div>
    </>
  )
}

function Chiffre({ icone: Icone, libelle, valeur, vers }: { icone: typeof Target; libelle: string; valeur?: number | string; vers?: string }) {
  const contenu = (
    <Card className="h-full">
      <CardContent className="p-4">
        <Icone className="mb-2 size-5 text-primary" />
        <div className="text-xl font-bold">{valeur ?? '…'}</div>
        <div className="text-xs text-muted-foreground">{libelle}</div>
      </CardContent>
    </Card>
  )
  return vers ? <Link to={vers}>{contenu}</Link> : contenu
}

function ListeActions({ titre, actions, vide }: { titre: string; actions: Action[]; vide: string }) {
  return (
    <section>
      <h2 className="mb-2 font-semibold">{titre}</h2>
      {!actions.length ? <p className="text-sm text-muted-foreground">{vide}</p> : (
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {actions.map((x) => (
            <Link key={x.id} to={`/actions/${x.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{x.titre}</div>
                <div className="text-xs text-muted-foreground">{date(x.date_debut)}</div>
              </div>
              <Badge variant={COULEUR_STATUT[x.statut]} className="shrink-0">{LIBELLES_STATUT_ACTION[x.statut]}</Badge>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
