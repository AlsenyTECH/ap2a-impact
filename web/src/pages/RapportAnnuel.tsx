import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Chargement, Erreur, Liste } from '@/components/champs'
import { Barres, Chiffres, mediane, PageRapport, profilPersonnes, Situations, Tableau, TitreSection } from '@/components/rapport'
import { useAuth } from '@/lib/auth'
import { date, fcfa, LIBELLES_STATUT_ACTION } from '@/lib/format'
import { supabase, verifier } from '@/lib/supabase'
import type { Situation, StatutAction, TypeCible } from '@/lib/types'

interface ActionAn {
  id: string
  titre: string
  statut: StatutAction
  date_debut: string
  budget_fcfa: number | null
  type: { libelle: string } | null
  beneficiaires: {
    cible_id: string
    cible: { type: TypeCible; sexe: 'F' | 'M' | null; date_naissance: string | null; zone: { nom: string } | null; categorie: { famille: { nom: string } | null } | null }
    apports: { valeur_fcfa: number | null }[]
    suivis: { fait_le: string | null; situation: Situation | null; emplois_crees: number | null; revenu_mensuel_fcfa: number | null }[]
  }[]
  action_partenaires: { partenaire: { nom: string; sigle: string | null } }[]
  action_equipe: { membre_id: string }[]
}

/** Bilan annuel de l'association : chiffres, actions, bénéficiaires, impact. */
export function RapportAnnuel() {
  const { membre } = useAuth()
  const [params, setParams] = useSearchParams()
  const annee = Number(params.get('annee')) || new Date().getFullYear()

  const { data: actions, isLoading, error } = useQuery({
    queryKey: ['rapport-annuel', annee],
    queryFn: async () =>
      verifier(await supabase.from('actions')
        .select(`id, titre, statut, date_debut, budget_fcfa, type:types_action(libelle),
          beneficiaires(cible_id, cible:cibles!beneficiaires_cible_id_fkey(type, sexe, date_naissance, zone:zones(nom), categorie:categories_cible(famille:familles_cible(nom))),
            apports(valeur_fcfa), suivis(fait_le, situation, emplois_crees, revenu_mensuel_fcfa)),
          action_partenaires(partenaire:partenaires(nom, sigle)), action_equipe(membre_id)`)
        .gte('date_debut', `${annee}-01-01`).lte('date_debut', `${annee}-12-31`).neq('statut', 'annulee')
        .order('date_debut')) as unknown as ActionAn[],
  })

  if (error) return <div className="p-6"><Erreur erreur={error} /></div>
  if (isLoading || !actions) return <div className="p-6"><Chargement /></div>

  const benefs = actions.flatMap((a) => a.beneficiaires)
  // Chaque cible n'est comptée qu'une fois, même si elle a bénéficié de plusieurs actions.
  const cibles = new Map(benefs.map((b) => [b.cible_id, b.cible]))
  const personnes = [...cibles.values()].filter((c) => c.type === 'personne')
  const profil = profilPersonnes(personnes)
  const valeur = benefs.flatMap((b) => b.apports).reduce((s, x) => s + (x.valeur_fcfa ?? 0), 0)
  const budget = actions.reduce((s, a) => s + (a.budget_fcfa ?? 0), 0)
  const partenaires = new Map(actions.flatMap((a) => a.action_partenaires).map((p) => [p.partenaire.nom, p.partenaire]))
  const membres = new Set(actions.flatMap((a) => a.action_equipe.map((e) => e.membre_id)))

  const compte = { reussi: 0, en_progres: 0, en_difficulte: 0, perdu_de_vue: 0 } as Record<Situation, number>
  let emplois = 0
  const revenus: number[] = []
  for (const b of benefs) {
    const s = b.suivis.filter((x) => x.fait_le && x.situation).sort((x, y) => y.fait_le!.localeCompare(x.fait_le!))[0]
    if (!s) continue
    compte[s.situation!]++
    emplois += s.emplois_crees ?? 0
    if (s.revenu_mensuel_fcfa != null) revenus.push(s.revenu_mensuel_fcfa)
  }
  const suivis = Object.values(compte).reduce((s, n) => s + n, 0)

  const compter = <T,>(liste: T[], cle: (x: T) => string | null | undefined) => {
    const m = new Map<string, number>()
    for (const x of liste) {
      const k = cle(x)
      if (k) m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([libelle, valeur]) => ({ libelle, valeur }))
  }
  const parFamille = compter([...cibles.values()], (c) => c.categorie?.famille?.nom)
  const parZone = compter([...cibles.values()], (c) => c.zone?.nom).slice(0, 6)
  const valeurParType = new Map<string, number>()
  for (const a of actions) {
    const v = a.beneficiaires.flatMap((b) => b.apports).reduce((s, x) => s + (x.valeur_fcfa ?? 0), 0)
    if (v) valeurParType.set(a.type?.libelle ?? 'Autre', (valeurParType.get(a.type?.libelle ?? 'Autre') ?? 0) + v)
  }
  const annees = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i)

  return (
    <PageRapport
      retour="/impact"
      titre={`Bilan annuel ${annee}`}
      sousTitre="Actions menées, bénéficiaires et impact de l'association sur l'année"
      auteur={membre ? `${membre.prenom} ${membre.nom}` : undefined}
      outils={
        <Liste className="h-9 w-auto" value={annee} onChange={(e) => setParams({ annee: e.target.value })} aria-label="Année">
          {annees.map((a) => <option key={a} value={a}>{a}</option>)}
        </Liste>
      }
    >
      <section>
        <Chiffres elements={[
          { valeur: actions.length, libelle: 'actions menées', detail: `${actions.filter((a) => a.statut === 'terminee').length} terminées` },
          { valeur: cibles.size, libelle: 'bénéficiaires distincts', detail: `dont ${personnes.length} personnes` },
          { valeur: fcfa(valeur), libelle: 'remis (kits, dons, soins…)', detail: budget ? `Budgets : ${fcfa(budget)}` : undefined },
          { valeur: membres.size, libelle: 'membres mobilisés', detail: `${partenaires.size} partenaires` },
        ]} />
      </section>

      <section>
        <TitreSection>Les actions de l'année</TitreSection>
        {actions.length ? (
          <Tableau
            entetes={['Date', 'Action', 'Type', 'Bénéf.', 'Remis', 'Statut']}
            alignDroite={[3, 4]}
            lignes={actions.map((a) => [
              date(a.date_debut),
              a.titre,
              a.type?.libelle ?? '—',
              a.beneficiaires.length,
              fcfa(a.beneficiaires.flatMap((b) => b.apports).reduce((s, x) => s + (x.valeur_fcfa ?? 0), 0)),
              LIBELLES_STATUT_ACTION[a.statut],
            ])}
          />
        ) : <p className="text-xs text-[#5c6b64]">Aucune action enregistrée pour {annee}.</p>}
      </section>

      <section>
        <TitreSection>Les bénéficiaires</TitreSection>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="mb-2 text-xs text-[#5c6b64]">Par famille</p>
            <Barres lignes={parFamille} />
          </div>
          <div>
            <p className="mb-2 text-xs text-[#5c6b64]">Personnes : {profil.femmes} femmes, {profil.hommes} hommes, {profil.jeunes} jeunes de 15 à 35 ans</p>
            <Barres lignes={profil.tranches} />
          </div>
        </div>
        {parZone.length ? (
          <div className="mt-4">
            <p className="mb-2 text-xs text-[#5c6b64]">Principales zones</p>
            <Barres lignes={parZone} />
          </div>
        ) : null}
      </section>

      {valeurParType.size ? (
        <section>
          <TitreSection>Où sont allés les moyens</TitreSection>
          <Barres unite=" FCFA" lignes={[...valeurParType.entries()].sort((a, b) => b[1] - a[1]).map(([libelle, v]) => ({ libelle, valeur: v, couleur: '#e9a812' }))} />
        </section>
      ) : null}

      <section>
        <TitreSection>L'impact : ce que sont devenus les bénéficiaires</TitreSection>
        <Situations compte={compte} />
        {suivis ? (
          <p className="mt-3 text-xs">
            Au dernier suivi, <b>{Math.round((100 * (compte.reussi + compte.en_progres)) / suivis)} %</b> des {suivis} bénéficiaires suivis sont en activité.
            {emplois ? <> <b>{emplois}</b> emploi{emplois > 1 ? 's' : ''} créé{emplois > 1 ? 's' : ''}.</> : null}
            {mediane(revenus) != null ? <> Revenu mensuel médian déclaré : <b>{fcfa(mediane(revenus))}</b>.</> : null}
          </p>
        ) : null}
      </section>

      {partenaires.size ? (
        <section>
          <TitreSection>Nos partenaires</TitreSection>
          <p>{[...partenaires.values()].map((p) => (p.sigle ? `${p.sigle} (${p.nom})` : p.nom)).join(' · ')}</p>
        </section>
      ) : null}
    </PageRapport>
  )
}
