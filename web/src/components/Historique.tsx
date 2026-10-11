import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { LIBELLES_NATURE, LIBELLES_STATUT_ACTION, LIBELLES_STATUT_BENEFICIAIRE } from '@/lib/format'
import { membreAvecNumero } from '@/lib/recherche'
import { supabase, verifier } from '@/lib/supabase'
import type { LigneJournal } from '@/lib/types'

const OBJETS: Record<string, string> = {
  actions: "l'action", beneficiaires: 'le bénéficiaire', apports: "l'apport", action_equipe: "le membre d'équipe",
  action_partenaires: 'le partenaire', seances: 'la séance',
}
const VERBES: Record<string, string> = { INSERT: 'a ajouté', UPDATE: 'a modifié', DELETE: 'a retiré' }
const CHAMPS: Record<string, string> = {
  statut: 'statut', titre: 'titre', date_debut: 'date de début', date_fin: 'date de fin', lieu: 'lieu', budget_fcfa: 'budget',
  responsable_id: 'responsable', bilan: 'bilan', description: 'description', valeur_fcfa: 'valeur', nature: 'nature',
  role: 'rôle', theme: 'thème', date: 'date', heure_debut: 'heure de début', heure_fin: 'heure de fin', zone_id: 'zone', type_id: 'type',
}

/** Valeur lisible d'un champ du journal. */
function valeur(champ: string, v: unknown) {
  if (v == null || v === '') return '—'
  if (champ === 'statut') return LIBELLES_STATUT_ACTION[v as keyof typeof LIBELLES_STATUT_ACTION] ?? LIBELLES_STATUT_BENEFICIAIRE[v as keyof typeof LIBELLES_STATUT_BENEFICIAIRE] ?? String(v)
  if (champ === 'nature') return LIBELLES_NATURE[v as keyof typeof LIBELLES_NATURE] ?? String(v)
  if (champ.endsWith('_id')) return 'modifié'
  const texte = String(v)
  return texte.length > 60 ? `${texte.slice(0, 60)}…` : texte
}

/** Historique d'une action : qui a fait quoi, et quand. */
export function Historique({ actionId }: { actionId: string }) {
  const { data: lignes = [], isLoading } = useQuery({
    queryKey: ['journal', actionId],
    queryFn: async () =>
      verifier(await supabase.from('journal').select('id, quand, table_nom, operation, libelle, details, membre:membres(prenom, nom, numero_adherent)')
        .eq('action_id', actionId).order('quand', { ascending: false }).limit(300)) as unknown as LigneJournal[],
  })

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>
  if (!lignes.length) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <History className="mx-auto mb-2 size-6" />Aucune modification enregistrée depuis la mise en place de l'historique.
      </p>
    )
  }
  return (
    <ol className="relative space-y-4 border-l-2 border-border pl-5">
      {lignes.map((l) => {
        const changements = Object.entries(l.details ?? {}).filter(([c]) => !['cree_par', 'cree_le', 'saisi_par', 'id', 'action_id', 'beneficiaire_id', 'fichier_chemin'].includes(c))
        return (
          <li key={l.id} className="relative">
            <span className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-card bg-primary" />
            <div className="text-xs text-muted-foreground">
              {new Date(l.quand).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-sm">
              <b>{l.membre ? membreAvecNumero(l.membre) : 'Opération technique'}</b>{' '}
              {l.table_nom === 'actions' && l.operation === 'UPDATE' && l.details?.statut
                ? <>a changé le statut : <b>{valeur('statut', l.details.statut[0])}</b> → <b>{valeur('statut', l.details.statut[1])}</b></>
                : <>{VERBES[l.operation]} {OBJETS[l.table_nom] ?? l.table_nom} <b>{l.libelle}</b></>}
            </div>
            {l.operation === 'UPDATE' && changements.filter(([c]) => !(l.table_nom === 'actions' && c === 'statut')).length ? (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {changements.filter(([c]) => !(l.table_nom === 'actions' && c === 'statut')).map(([c, [avant, apres]]) => (
                  <li key={c}>{CHAMPS[c] ?? c} : {valeur(c, avant)} → <span className="text-foreground">{valeur(c, apres)}</span></li>
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
