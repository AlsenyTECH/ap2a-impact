import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Chargement, EnTete, Erreur, Liste, Pastilles } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { fcfa, SITUATIONS } from '@/lib/format'
import { useTypesAction } from '@/lib/requetes'
import { supabase, verifier } from '@/lib/supabase'
import type { Situation } from '@/lib/types'

interface LigneBenef { id: string; action: { type_id: number; statut: string; date_debut: string }; cible: { categorie: { famille: { nom: string } | null } | null } | null }
interface LigneSuivi { beneficiaire_id: string; fait_le: string; situation: Situation; emplois_crees: number | null; revenu_mensuel_fcfa: number | null; utilise_apport: boolean | null }
interface LigneApport { beneficiaire_id: string; valeur_fcfa: number | null }

interface Bilan {
  libelle: string
  beneficiaires: number
  suivis: number
  situations: Record<Situation, number>
  emplois: number
  revenus: number[]
  kitsUtilises: number
  kitsRenseignes: number
  valeur: number
}

const vide = (libelle: string): Bilan => ({
  libelle, beneficiaires: 0, suivis: 0, emplois: 0, revenus: [], kitsUtilises: 0, kitsRenseignes: 0, valeur: 0,
  situations: { reussi: 0, en_progres: 0, en_difficulte: 0, perdu_de_vue: 0 },
})

const pct = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0)

export function Impact() {
  const { a } = useAuth()
  const { data: types = [] } = useTypesAction()
  const [annee, setAnnee] = useState('')
  const [axe, setAxe] = useState<'type' | 'famille'>('type')

  const { data, isLoading, error } = useQuery({
    queryKey: ['impact'],
    enabled: a('admin', 'bureau', 'coordinateur'),
    queryFn: async () => {
      const [benefs, suivis, apports] = await Promise.all([
        supabase.from('beneficiaires').select('id, action:actions!inner(type_id, statut, date_debut), cible:cibles!beneficiaires_cible_id_fkey(categorie:categories_cible(famille:familles_cible(nom)))').neq('statut', 'abandon').then(verifier),
        supabase.from('suivis').select('beneficiaire_id, fait_le, situation, emplois_crees, revenu_mensuel_fcfa, utilise_apport').not('fait_le', 'is', null).order('fait_le').then(verifier),
        supabase.from('apports').select('beneficiaire_id, valeur_fcfa').then(verifier),
      ])
      return { benefs: benefs as unknown as LigneBenef[], suivis: suivis as LigneSuivi[], apports: apports as LigneApport[] }
    },
  })

  const annees = useMemo(() => [...new Set((data?.benefs ?? []).map((b) => b.action.date_debut.slice(0, 4)))].sort().reverse(), [data])

  // Situation de chaque bénéficiaire = son dernier suivi fait.
  const { total, parType } = useMemo(() => {
    const total = vide('Toutes les actions')
    const parType = new Map<string, Bilan>()
    if (!data) return { total, parType: [] as Bilan[] }
    const dernier = new Map<string, LigneSuivi>()
    for (const s of data.suivis) dernier.set(s.beneficiaire_id, s) // triés par date : le dernier gagne
    const valeur = new Map<string, number>()
    for (const x of data.apports) valeur.set(x.beneficiaire_id, (valeur.get(x.beneficiaire_id) ?? 0) + (x.valeur_fcfa ?? 0))

    for (const b of data.benefs) {
      if (annee && !b.action.date_debut.startsWith(annee)) continue
      // Regroupement par type d'action ou par famille de cible (ASC, ménages...).
      const cle = axe === 'type'
        ? types.find((x) => x.id === b.action.type_id)?.libelle ?? 'Autre'
        : b.cible?.categorie?.famille?.nom ?? 'Autre'
      const bilan = parType.get(cle) ?? vide(cle)
      parType.set(cle, bilan)
      for (const cible of [bilan, total]) {
        cible.beneficiaires++
        cible.valeur += valeur.get(b.id) ?? 0
        const s = dernier.get(b.id)
        if (!s) continue
        cible.suivis++
        cible.situations[s.situation]++
        cible.emplois += s.emplois_crees ?? 0
        if (s.revenu_mensuel_fcfa != null) cible.revenus.push(s.revenu_mensuel_fcfa)
        if (s.utilise_apport != null) {
          cible.kitsRenseignes++
          if (s.utilise_apport) cible.kitsUtilises++
        }
      }
    }
    return { total, parType: [...parType.values()].sort((x, y) => y.beneficiaires - x.beneficiaires) }
  }, [data, types, annee, axe])

  if (!a('admin', 'bureau', 'coordinateur')) {
    return <EmptyState icon={BarChart3} title="Réservé au bureau et aux coordinateurs" />
  }
  if (error) return <Erreur erreur={error} />
  if (isLoading) return <Chargement />

  const actifs = total.situations.reussi + total.situations.en_progres
  const revenuMedian = mediane(total.revenus)

  return (
    <>
      <EnTete
        titre="Impact"
        sousTitre="Ce que sont devenus les bénéficiaires, d'après leur dernier suivi"
        actions={annees.length > 1 ? (
          <Liste className="w-auto" value={annee} onChange={(e) => setAnnee(e.target.value)} aria-label="Année des actions">
            <option value="">Toutes les années</option>
            {annees.map((x) => <option key={x} value={x}>Actions de {x}</option>)}
          </Liste>
        ) : null}
      />

      {!total.beneficiaires ? (
        <EmptyState icon={BarChart3} title="Pas encore de données" description="L'impact apparaît dès que des bénéficiaires ont été suivis." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tuile valeur={`${pct(actifs, total.suivis)} %`} libelle="en activité (réussi ou en progrès)" detail={`${actifs} sur ${total.suivis} suivis`} />
            <Tuile valeur={`${total.suivis} / ${total.beneficiaires}`} libelle="bénéficiaires suivis" detail={`${pct(total.suivis, total.beneficiaires)} % ont au moins un suivi`} />
            <Tuile valeur={String(total.emplois)} libelle="emplois créés" detail={revenuMedian != null ? `Revenu médian : ${fcfa(revenuMedian)}/mois` : undefined} />
            <Tuile valeur={fcfa(total.valeur)} libelle="investis (kits, dons, soins…)" detail={total.kitsRenseignes ? `${pct(total.kitsUtilises, total.kitsRenseignes)} % utilisent encore le matériel` : undefined} />
          </div>

          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Situation au dernier suivi</h2>
                <Pastilles<'type' | 'famille'> value={axe} onChange={setAxe} options={[['type', "Par type d'action"], ['famille', 'Par famille de cible']]} />
              </div>
              <Legende />
              <div className="mt-4 space-y-4">
                {[total, ...parType].map((b, i) => <BarreSituations key={b.libelle} bilan={b} fort={i === 0} />)}
              </div>
            </CardContent>
          </Card>

          <h2 className="mb-2 font-semibold">Détail {axe === 'type' ? "par type d'action" : 'par famille de cible'}</h2>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{axe === 'type' ? "Type d'action" : 'Famille'}</th>
                  <th className="px-3 py-2 text-right font-medium">Bénéf.</th>
                  <th className="px-3 py-2 text-right font-medium">Suivis</th>
                  {SITUATIONS.map((s) => <th key={s.valeur} className="px-3 py-2 text-right font-medium">{s.libelle}</th>)}
                  <th className="px-3 py-2 text-right font-medium">Emplois</th>
                  <th className="px-3 py-2 text-right font-medium">Investi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...parType, total].map((b) => (
                  <tr key={b.libelle} className={b === total ? 'font-semibold' : ''}>
                    <td className="px-3 py-2">{b.libelle}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.beneficiaires}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.suivis}</td>
                    {SITUATIONS.map((s) => <td key={s.valeur} className="px-3 py-2 text-right tabular-nums">{b.situations[s.valeur]}</td>)}
                    <td className="px-3 py-2 text-right tabular-nums">{b.emplois}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fcfa(b.valeur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

function mediane(valeurs: number[]) {
  if (!valeurs.length) return null
  const v = [...valeurs].sort((x, y) => x - y)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2)
}

function Tuile({ valeur, libelle, detail }: { valeur: string; libelle: string; detail?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xl font-bold tabular-nums md:text-2xl">{valeur}</div>
        <div className="text-xs text-muted-foreground">{libelle}</div>
        {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
      </CardContent>
    </Card>
  )
}

function Legende() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {SITUATIONS.map((s) => (
        <span key={s.valeur} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.couleur }} /> {s.libelle}
        </span>
      ))}
    </div>
  )
}

/** Barre 100 % empilée : part de chaque situation parmi les bénéficiaires suivis. */
function BarreSituations({ bilan, fort }: { bilan: Bilan; fort?: boolean }) {
  const [survol, setSurvol] = useState<Situation | null>(null)
  const actifs = bilan.situations.reussi + bilan.situations.en_progres
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className={fort ? 'font-semibold' : ''}>{bilan.libelle}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {survol
            ? `${SITUATIONS.find((s) => s.valeur === survol)!.libelle} : ${bilan.situations[survol]} (${pct(bilan.situations[survol], bilan.suivis)} %)`
            : bilan.suivis ? `${pct(actifs, bilan.suivis)} % en activité · ${bilan.suivis} suivi(s)` : 'pas encore suivi'}
        </span>
      </div>
      {bilan.suivis ? (
        <div className="flex h-5 gap-[2px] overflow-hidden rounded" role="img" aria-label={SITUATIONS.map((s) => `${s.libelle} ${bilan.situations[s.valeur]}`).join(', ')}>
          {SITUATIONS.filter((s) => bilan.situations[s.valeur]).map((s) => (
            <div
              key={s.valeur}
              className="h-full transition-opacity"
              style={{ width: `${(100 * bilan.situations[s.valeur]) / bilan.suivis}%`, background: s.couleur, opacity: survol && survol !== s.valeur ? 0.4 : 1 }}
              onMouseEnter={() => setSurvol(s.valeur)}
              onMouseLeave={() => setSurvol(null)}
              onClick={() => setSurvol(survol === s.valeur ? null : s.valeur)}
              title={`${s.libelle} : ${bilan.situations[s.valeur]}`}
            />
          ))}
        </div>
      ) : (
        <div className="h-5 rounded bg-muted" />
      )}
    </div>
  )
}
