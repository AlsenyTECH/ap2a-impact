import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chargement, Erreur } from '@/components/champs'
import { Barres, Chiffres, mediane, PageRapport, profilPersonnes, Situations, Tableau, TitreSection } from '@/components/rapport'
import { useAuth } from '@/lib/auth'
import { exporterExcel, nomDeFichier } from '@/lib/export'
import { date, echeance, fcfa, LIBELLES_NATURE, LIBELLES_STATUT_ACTION, LIBELLES_STATUT_BENEFICIAIRE, LIBELLES_TYPE_CIBLE, nomCible, SITUATION, trancheAge } from '@/lib/format'
import { useAction } from '@/lib/requetes'
import { supabase, verifier } from '@/lib/supabase'
import type { Apport, Cible, NatureApport, Situation, StatutBeneficiaire, Suivi } from '@/lib/types'

interface LigneBenef {
  id: string
  statut: StatutBeneficiaire
  cible: Cible
  via: { nom: string } | null
  apports: (Apport & { partenaire: { nom: string; sigle: string | null } | null })[]
  suivis: Suivi[]
}

const ROLES: Record<string, string> = { formateur: 'Formateur', prestataire: 'Prestataire', financeur: 'Financeur', soutien: 'Soutien', autre: 'Autre' }

/** Rapport d'une action, à imprimer ou enregistrer en PDF pour les financeurs. */
export function RapportAction() {
  const { id = '' } = useParams()
  const { membre } = useAuth()
  const [nominatif, setNominatif] = useState(false)
  const { data: action, error } = useAction(id)

  const { data } = useQuery({
    queryKey: ['rapport-action', id],
    queryFn: async () => {
      const [benefs, partenaires, equipe] = await Promise.all([
        supabase.from('beneficiaires')
          .select('id, statut, cible:cibles!beneficiaires_cible_id_fkey(*, zone:zones(nom), categorie:categories_cible(libelle, famille:familles_cible(nom))), via:cibles!beneficiaires_via_collectif_id_fkey(nom), apports(*, partenaire:partenaires(nom, sigle)), suivis(*)')
          .eq('action_id', id).order('ajoute_le').then(verifier),
        supabase.from('action_partenaires').select('role, partenaire:partenaires(nom, sigle)').eq('action_id', id).then(verifier),
        supabase.from('action_equipe').select('role, membre:membres(prenom, nom)').eq('action_id', id).then(verifier),
      ])
      return {
        benefs: benefs as unknown as LigneBenef[],
        partenaires: partenaires as unknown as { role: string; partenaire: { nom: string; sigle: string | null } }[],
        equipe: equipe as unknown as { role: string | null; membre: { prenom: string; nom: string } }[],
      }
    },
  })

  if (error) return <div className="p-6"><Erreur erreur={error} /></div>
  if (!action || !data) return <div className="p-6"><Chargement /></div>

  const { benefs, partenaires, equipe } = data
  const personnes = benefs.filter((b) => b.cible.type === 'personne').map((b) => b.cible)
  const profil = profilPersonnes(personnes)
  const collectifs = benefs.filter((b) => b.cible.type !== 'personne')
  const apports = benefs.flatMap((b) => b.apports)
  const valeur = apports.reduce((s, x) => s + (x.valeur_fcfa ?? 0), 0)
  const termines = benefs.filter((b) => b.statut === 'termine').length

  // Ce qui a été remis, regroupé par nature et description.
  const remis = new Map<string, { nature: NatureApport; description: string; partenaire: string | null; nb: number; valeur: number }>()
  for (const x of apports) {
    const cle = `${x.nature}|${x.description}`
    const r = remis.get(cle) ?? { nature: x.nature, description: x.description, partenaire: x.partenaire ? x.partenaire.sigle || x.partenaire.nom : null, nb: 0, valeur: 0 }
    r.nb++
    r.valeur += x.valeur_fcfa ?? 0
    remis.set(cle, r)
  }

  // Dernier suivi fait de chaque bénéficiaire.
  const derniers = benefs.map((b) => ({
    b,
    s: b.suivis.filter((s) => s.fait_le && s.situation).sort((x, y) => y.fait_le!.localeCompare(x.fait_le!))[0],
  }))
  const suivis = derniers.filter((d) => d.s)
  const compte = { reussi: 0, en_progres: 0, en_difficulte: 0, perdu_de_vue: 0 } as Record<Situation, number>
  for (const d of suivis) compte[d.s!.situation!]++
  const emplois = suivis.reduce((s, d) => s + (d.s!.emplois_crees ?? 0), 0)
  const revenus = suivis.map((d) => d.s!.revenu_mensuel_fcfa).filter((r): r is number => r != null)
  const temoignages = suivis.filter((d) => d.s!.activite && d.s!.situation !== 'perdu_de_vue').slice(0, 4)
  const prochain = benefs.flatMap((b) => b.suivis).filter((s) => !s.fait_le).sort((x, y) => x.date_prevue.localeCompare(y.date_prevue))[0]

  const nom = (c: Cible) => (nominatif || c.type !== 'personne' ? nomCible(c) : `${(c.prenom ?? '')[0] ?? ''}. ${c.nom[0]}.`)

  async function exporter() {
    await exporterExcel(`beneficiaires-${nomDeFichier(action!.titre)}`, derniers, [
      { titre: 'Prénom', valeur: ({ b }) => b.cible.prenom },
      { titre: 'Nom', valeur: ({ b }) => b.cible.nom, largeur: 24 },
      { titre: 'Catégorie', valeur: ({ b }) => (b.cible as Cible & { categorie?: { libelle: string } }).categorie?.libelle, largeur: 22 },
      { titre: 'Sexe', valeur: ({ b }) => b.cible.sexe },
      { titre: 'Âge', valeur: ({ b }) => trancheAge(b.cible.date_naissance)?.age },
      { titre: 'Téléphone', valeur: ({ b }) => b.cible.telephone, largeur: 16 },
      { titre: 'Zone', valeur: ({ b }) => b.cible.zone?.nom },
      { titre: 'Inscrit avec', valeur: ({ b }) => b.via?.nom, largeur: 20 },
      { titre: 'Statut', valeur: ({ b }) => LIBELLES_STATUT_BENEFICIAIRE[b.statut] },
      { titre: 'Reçu', valeur: ({ b }) => b.apports.map((x) => x.description).join(' ; '), largeur: 40 },
      { titre: 'Valeur reçue (FCFA)', valeur: ({ b }) => b.apports.reduce((s, x) => s + (x.valeur_fcfa ?? 0), 0), format: '#,##0', largeur: 18 },
      { titre: 'Dernière situation', valeur: ({ s }) => (s?.situation ? SITUATION[s.situation].libelle : null), largeur: 16 },
      { titre: 'Date du suivi', valeur: ({ s }) => s?.fait_le },
      { titre: 'Activité', valeur: ({ s }) => s?.activite, largeur: 30 },
      { titre: 'Revenu mensuel (FCFA)', valeur: ({ s }) => s?.revenu_mensuel_fcfa, format: '#,##0', largeur: 18 },
      { titre: 'Emplois créés', valeur: ({ s }) => s?.emplois_crees },
    ], 'Bénéficiaires')
  }

  return (
    <PageRapport
      retour={`/actions/${id}`}
      titre={action.titre}
      auteur={membre ? `${membre.prenom} ${membre.nom}` : undefined}
      sousTitre={<>{action.type?.libelle} · {LIBELLES_STATUT_ACTION[action.statut]} · {date(action.date_debut)}{action.date_fin && action.date_fin !== action.date_debut ? ` au ${date(action.date_fin)}` : ''}{action.lieu ? ` · ${action.lieu}` : ''}</>}
      outils={
        <>
          <Button size="sm" variant="secondary" onClick={() => setNominatif(!nominatif)}>
            {nominatif ? <EyeOff /> : <Eye />} {nominatif ? 'Masquer les noms' : 'Afficher les noms'}
          </Button>
          <Button size="sm" variant="secondary" onClick={exporter}><FileSpreadsheet /> Excel</Button>
        </>
      }
    >
      <section>
        <Chiffres elements={[
          { valeur: benefs.length, libelle: 'bénéficiaires', detail: `${termines} ont terminé` },
          { valeur: personnes.length ? `${Math.round((100 * profil.femmes) / personnes.length)} %` : '—', libelle: 'de femmes', detail: `${profil.femmes} sur ${personnes.length} personnes` },
          { valeur: fcfa(valeur), libelle: 'remis aux bénéficiaires', detail: action.budget_fcfa ? `Budget : ${fcfa(action.budget_fcfa)}` : undefined },
          { valeur: suivis.length ? `${Math.round((100 * (compte.reussi + compte.en_progres)) / suivis.length)} %` : '—', libelle: 'en activité au dernier suivi', detail: suivis.length ? `${suivis.length} bénéficiaires suivis` : 'pas encore de suivi' },
        ]} />
      </section>

      {action.description ? (
        <section>
          <TitreSection>L'action</TitreSection>
          <p className="whitespace-pre-line">{action.description}</p>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div><span className="text-[#5c6b64]">Responsable : </span>{action.responsable ? `${action.responsable.prenom} ${action.responsable.nom}` : '—'}</div>
            <div><span className="text-[#5c6b64]">Équipe mobilisée : </span>{equipe.length ? equipe.map((e) => `${e.membre.prenom} ${e.membre.nom}${e.role ? ` (${e.role})` : ''}`).join(', ') : '—'}</div>
          </div>
        </section>
      ) : null}

      {partenaires.length ? (
        <section>
          <TitreSection>Partenaires</TitreSection>
          <Tableau entetes={['Partenaire', 'Rôle']} lignes={partenaires.map((p) => [<><b>{p.partenaire.sigle ? `${p.partenaire.sigle} — ` : ''}</b>{p.partenaire.nom}</>, ROLES[p.role] ?? p.role])} />
        </section>
      ) : null}

      <section>
        <TitreSection>Qui a bénéficié de l'action</TitreSection>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="mb-2 text-xs text-[#5c6b64]">Personnes par tranche d'âge</p>
            {personnes.length ? <Barres lignes={profil.tranches} /> : <p className="text-xs text-[#5c6b64]">Aucune personne inscrite individuellement.</p>}
          </div>
          <div>
            <p className="mb-2 text-xs text-[#5c6b64]">Répartition</p>
            <Barres lignes={[
              { libelle: 'Femmes', valeur: profil.femmes, couleur: '#9b2c55' },
              { libelle: 'Hommes', valeur: profil.hommes, couleur: '#1f4e99' },
              ...Object.entries(collectifs.reduce<Record<string, number>>((acc, b) => ({ ...acc, [LIBELLES_TYPE_CIBLE[b.cible.type]]: (acc[LIBELLES_TYPE_CIBLE[b.cible.type]] ?? 0) + 1 }), {}))
                .map(([libelle, valeur]) => ({ libelle, valeur, couleur: '#e9a812' })),
            ].filter((l) => l.valeur)} />
          </div>
        </div>
      </section>

      {remis.size ? (
        <section>
          <TitreSection>Ce qui a été remis</TitreSection>
          <Tableau
            entetes={['Nature', 'Description', 'Fourni par', 'Bénéficiaires', 'Valeur']}
            alignDroite={[3, 4]}
            lignes={[...remis.values()].map((r): ReactNode[] => [LIBELLES_NATURE[r.nature], r.description, r.partenaire ?? 'AP2A', r.nb, r.valeur ? fcfa(r.valeur) : '—'])
              .concat([[<b key="t">Total</b>, '', '', '', <b key="v">{fcfa(valeur)}</b>]])}
          />
        </section>
      ) : null}

      <section>
        <TitreSection>Ce que sont devenus les bénéficiaires</TitreSection>
        <Situations compte={compte} />
        {suivis.length ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md border border-[#e2e6df] px-3 py-2"><b className="text-base chiffres">{emplois}</b> emploi{emplois > 1 ? 's' : ''} créé{emplois > 1 ? 's' : ''} (apprentis, employés)</div>
            <div className="rounded-md border border-[#e2e6df] px-3 py-2"><b className="text-base chiffres">{mediane(revenus) != null ? fcfa(mediane(revenus)) : '—'}</b><br />revenu mensuel médian déclaré</div>
            <div className="rounded-md border border-[#e2e6df] px-3 py-2">{prochain ? <>Prochain suivi : <b>{echeance(prochain.echeance_mois)}</b>, le {date(prochain.date_prevue)}</> : 'Pas d\'autre suivi prévu'}</div>
          </div>
        ) : null}
        {temoignages.length ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {temoignages.map(({ b, s }) => (
              <blockquote key={b.id} className="rounded-md bg-[#fbfaf5] px-3 py-2 text-xs">
                <span className="font-semibold">{nom(b.cible)}</span> — <span className="italic">« {s!.activite} »</span>
                <span className="block text-[#5c6b64]">{SITUATION[s!.situation!].libelle} · {echeance(s!.echeance_mois)}</span>
              </blockquote>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <TitreSection>Liste des bénéficiaires</TitreSection>
        <Tableau
          entetes={['Bénéficiaire', 'Profil', 'Zone', 'Statut', 'Reçu (FCFA)', 'Dernière situation']}
          alignDroite={[4]}
          lignes={derniers.map(({ b, s }) => [
            <>{nom(b.cible)}{b.via ? <span className="block text-[10px] text-[#5c6b64]">avec {b.via.nom}</span> : null}</>,
            b.cible.type === 'personne'
              ? [b.cible.sexe === 'F' ? 'F' : b.cible.sexe === 'M' ? 'H' : null, trancheAge(b.cible.date_naissance)?.age != null ? `${trancheAge(b.cible.date_naissance)!.age} ans` : null].filter(Boolean).join(', ')
              : LIBELLES_TYPE_CIBLE[b.cible.type],
            b.cible.zone?.nom ?? '—',
            LIBELLES_STATUT_BENEFICIAIRE[b.statut],
            b.apports.reduce((t, x) => t + (x.valeur_fcfa ?? 0), 0).toLocaleString('fr-FR'),
            s?.situation ? <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: SITUATION[s.situation].couleur }} />{SITUATION[s.situation].libelle}</span> : '—',
          ])}
        />
        {!nominatif ? <p className="mt-2 text-[10px] text-[#5c6b64]">Noms abrégés pour protéger la vie privée des bénéficiaires.</p> : null}
      </section>

      {action.bilan ? (
        <section>
          <TitreSection>Bilan</TitreSection>
          <p className="whitespace-pre-line">{action.bilan}</p>
        </section>
      ) : null}
    </PageRapport>
  )
}
