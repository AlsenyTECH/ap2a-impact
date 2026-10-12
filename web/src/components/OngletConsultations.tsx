import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Stethoscope } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chargement, Erreur } from '@/components/champs'
import { ConsultationDialog, PastilleConsultation } from '@/components/Consultations'
import { Avatar, Liste as Encadre } from '@/components/design'
import { OutilsListe } from '@/components/OutilsListe'
import { trancheAge } from '@/lib/format'
import { STATUTS_CONSULTATION } from '@/lib/partenaires'
import { correspond, trier } from '@/lib/recherche'
import { supabase, verifier } from '@/lib/supabase'
import type { Beneficiaire, Consultation, StatutConsultation } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Consultations d'une action de santé, côté association. L'équipe voit le
 * résultat ; seuls les responsables de l'action voient le détail médical et
 * peuvent saisir (chaque lecture du détail est notée au journal médical).
 */
export function OngletConsultations({ actionId, responsable }: { actionId: string; responsable: boolean }) {
  const qc = useQueryClient()
  const { data: consultations = [], isLoading, error } = useQuery({
    queryKey: ['consultations', actionId],
    queryFn: async () => verifier(await supabase.rpc('lire_consultations', { p_action: actionId })) as Consultation[],
  })
  const { data: benefs = [] } = useQuery({
    queryKey: ['beneficiaires', actionId],
    queryFn: async () => verifier(await supabase.from('beneficiaires')
      .select('*, cible:cibles!beneficiaires_cible_id_fkey(*), via:cibles!beneficiaires_via_collectif_id_fkey(id, nom), apports(*, partenaire:partenaires(nom, sigle))')
      .eq('action_id', actionId).order('ajoute_le', { ascending: false })) as Beneficiaire[],
  })
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState<'' | 'sans' | StatutConsultation>('')
  const [tri, setTri] = useState<'nom' | 'recents'>('nom')
  const [dossier, setDossier] = useState<Beneficiaire | null>(null)
  const derniere = (b: Beneficiaire) => consultations.find((c) => c.beneficiaire_id === b.id)
  const personnes = benefs.filter((b) => b.cible?.type === 'personne')
  const retenus = personnes.filter((b) => correspond(recherche, b.cible?.prenom, b.cible?.nom, b.cible?.telephone)
    && (!filtre || (filtre === 'sans' ? !derniere(b) : derniere(b)?.statut === filtre)))
  const affiches = tri === 'nom' ? trier(retenus, (b) => `${b.cible?.nom} ${b.cible?.prenom}`) : trier(retenus, (b) => derniere(b)?.date ?? null, 'desc')
  const vus = personnes.filter((b) => derniere(b)).length

  if (error) return <Erreur erreur={error} />
  if (isLoading) return <Chargement />
  return (
    <>
      <div className="mb-3 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        {responsable
          ? 'En tant que responsable de l\'action, vous voyez le détail médical. Chaque consultation de ces notes est enregistrée.'
          : 'Secret médical : vous voyez le résultat des consultations ; le détail est réservé aux soignants et aux responsables de l\'action.'}
      </div>
      <p className="mb-3 text-sm text-muted-foreground"><b className="text-foreground">{vus}</b> patient{vus > 1 ? 's' : ''} vu{vus > 1 ? 's' : ''} sur {personnes.length}</p>
      <OutilsListe recherche={recherche} setRecherche={setRecherche} placeholder="Nom, téléphone…"
        tris={[['nom', 'Nom A → Z'], ['recents', 'Vus récemment']]} tri={tri} setTri={setTri} total={affiches.length}>
        <div className="sans-barre -mx-4 flex gap-2 overflow-x-auto px-4">
          {([['', 'Tous'], ['sans', 'Pas encore vus'], ...Object.entries(STATUTS_CONSULTATION).map(([k, s]) => [k, s.libelle])] as [string, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFiltre(k === filtre ? '' : k as typeof filtre)}
              className={cn('h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium', filtre === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>{l}</button>
          ))}
        </div>
      </OutilsListe>
      <Encadre>
        {affiches.map((b) => {
          const c = derniere(b)
          const age = trancheAge(b.cible?.date_naissance ?? null)
          return (
            <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar prenom={b.cible?.prenom} nom={b.cible?.nom ?? ''} taille="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.cible?.prenom} {b.cible?.nom}</div>
                <div className="truncate text-xs text-muted-foreground">{[age ? `${age.age} ans` : null, b.cible?.telephone].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              {c ? <PastilleConsultation statut={c.statut} /> : <span className="text-xs text-muted-foreground">pas encore vu</span>}
              <Button size="sm" variant="secondary" onClick={() => setDossier(b)}><Stethoscope /> Dossier</Button>
            </div>
          )
        })}
      </Encadre>
      {dossier ? (
        <ConsultationDialog
          patient={{ beneficiaire_id: dossier.id, prenom: dossier.cible?.prenom ?? null, nom: dossier.cible?.nom ?? '', age: trancheAge(dossier.cible?.date_naissance ?? null)?.age, sexe: dossier.cible?.sexe }}
          consultations={consultations}
          peutSaisir={responsable}
          fermer={() => setDossier(null)}
          apres={() => qc.invalidateQueries({ queryKey: ['consultations', actionId] })}
        />
      ) : null}
    </>
  )
}
