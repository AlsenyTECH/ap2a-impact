import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Chargement, EnTete, Erreur, Liste } from '@/components/champs'
import { CHAMPS_JOURNAL, FilJournal, OBJETS } from '@/components/Historique'
import { useAuth } from '@/lib/auth'
import { supabase, verifier } from '@/lib/supabase'
import type { LigneJournal } from '@/lib/types'

const OPERATIONS: [string, string][] = [['', 'Toutes les opérations'], ['DELETE', 'Suppressions'], ['INSERT', 'Ajouts'], ['UPDATE', 'Modifications']]
const ELEMENTS: [string, string][] = [
  ['', 'Tous les éléments'], ['actions', 'Actions'], ['cibles', 'Cibles'], ['membres', 'Membres'], ['beneficiaires', 'Bénéficiaires'],
  ['apports', 'Apports'], ['seances', 'Séances'], ['presences', 'Présences'], ['action_equipe', 'Équipes'], ['action_partenaires', 'Partenaires des actions'],
  ['acces_partenaires', 'Accès partenaires'], ['cartes', 'Cartes'], ['roles', 'Rôles'], ['suivis', 'Suivis'], ['consultations', 'Consultations'],
]

/**
 * Historique général : toutes les modifications (dont les suppressions, même
 * d'une action qui n'existe plus), avec leur auteur. Personne ne peut le
 * modifier ni l'effacer ; réservé au droit « Voir l'historique ».
 */
export function Journal() {
  const { peut } = useAuth()
  const [operation, setOperation] = useState('')
  const [element, setElement] = useState('')
  const [recherche, setRecherche] = useState('')
  const autorise = peut('journal.voir')

  const { data: lignes, isLoading, error } = useQuery({
    queryKey: ['journal-general', operation, element],
    enabled: autorise,
    queryFn: async () => {
      let q = supabase.from('journal').select(CHAMPS_JOURNAL).order('quand', { ascending: false }).limit(500)
      if (operation) q = q.eq('operation', operation)
      if (element) q = q.eq('table_nom', element)
      return verifier(await q) as unknown as LigneJournal[]
    },
  })

  if (!autorise) return <Navigate to="/" replace />
  const t = recherche.trim().toLowerCase()
  const visibles = (lignes ?? []).filter((l) => !t || [l.libelle, l.auteur_nom, OBJETS[l.table_nom]].some((x) => x?.toLowerCase().includes(t)))

  return (
    <div>
      <EnTete titre="Historique" sousTitre="Qui a ajouté, modifié ou supprimé quoi, et quand. Les 500 dernières opérations ; rien ne peut y être effacé." />
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Liste value={operation} onChange={(e) => setOperation(e.target.value)}>
          {OPERATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Liste>
        <Liste value={element} onChange={(e) => setElement(e.target.value)}>
          {ELEMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Liste>
        <Input placeholder="Rechercher (nom, titre, auteur)…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      </div>
      {error ? <Erreur erreur={error} /> : isLoading ? <Chargement /> : (
        <Card><CardContent className="p-5"><FilJournal lignes={visibles} /></CardContent></Card>
      )}
    </div>
  )
}
