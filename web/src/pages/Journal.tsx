import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Chargement, EnTete, Erreur, Liste } from '@/components/champs'
import { CHAMPS_JOURNAL, FilJournal, OBJETS } from '@/components/Historique'
import { useAuth } from '@/lib/auth'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import type { LigneJournal } from '@/lib/types'

const CHAMPS_SENSIBLES: [string, string][] = [['telephone', 'Téléphone'], ['email', 'Email'], ['date_naissance', 'Date de naissance'], ['adresse', 'Adresse'], ['notes', 'Notes']]
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
  const [champ, setChamp] = useState('telephone')
  const [valeur, setValeur] = useState('')
  const [empreinte, setEmpreinte] = useState<{ libelle: string; champ: string; hmac: string } | null>(null)
  const autorise = peut('journal.voir')

  // Les valeurs sensibles ne sont pas au journal en clair : on calcule l'empreinte
  // de la valeur cherchée (même clé secrète, côté base) et on cherche cette empreinte.
  async function chercherValeur(e: FormEvent) {
    e.preventDefault()
    try {
      const { data, error } = await supabase.rpc('empreinte_journal', { p_champ: champ, p_valeur: valeur })
      if (error) throw error
      setEmpreinte(data ? { libelle: `${CHAMPS_SENSIBLES.find(([c]) => c === champ)?.[1]} ${valeur}`, champ, hmac: data as string } : null)
    } catch (err) {
      toast.error(messageErreur(err))
    }
  }

  const { data: lignes, isLoading, error } = useQuery({
    queryKey: ['journal-general', operation, element, empreinte?.hmac],
    enabled: autorise,
    queryFn: async () => {
      let q = supabase.from('journal').select(CHAMPS_JOURNAL).order('quand', { ascending: false }).limit(500)
      if (operation) q = q.eq('operation', operation)
      if (element) q = q.eq('table_nom', element)
      // Valeur avant ou après la modification (empreinte calculée par la base).
      if (empreinte) q = q.or(`details->${empreinte.champ}->>0.eq.${empreinte.hmac},details->${empreinte.champ}->>1.eq.${empreinte.hmac}`)
      return verifier(await q) as unknown as LigneJournal[]
    },
  })

  if (!autorise) return <Navigate to="/" replace />
  const t = recherche.trim().toLowerCase()
  const visibles = (lignes ?? [])
    .filter((l) => !t || [l.libelle, l.auteur_nom, OBJETS[l.table_nom]].some((x) => x?.toLowerCase().includes(t)))

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
      <details className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Rechercher une valeur sensible (enquête)</summary>
        <p className="mt-2 text-muted-foreground">
          Téléphones, emails, dates de naissance, adresses et notes ne sont pas conservés en clair dans l'historique : seule une empreinte
          chiffrée y figure. Saisissez une valeur précise pour retrouver les modifications où elle apparaît.
        </p>
        <form onSubmit={chercherValeur} className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
          <Liste value={champ} onChange={(e) => setChamp(e.target.value)}>
            {CHAMPS_SENSIBLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Liste>
          <Input required value={valeur} onChange={(e) => setValeur(e.target.value)} placeholder={champ === 'telephone' ? '77 123 45 67' : champ === 'date_naissance' ? 'AAAA-MM-JJ' : ''} />
          <Button type="submit" variant="secondary"><Search /> Chercher</Button>
        </form>
        {empreinte ? (
          <p className="mt-2 flex items-center gap-2">
            Historique filtré sur : <b>{empreinte.libelle}</b>
            <Button size="sm" variant="ghost" onClick={() => setEmpreinte(null)}><X /> Retirer</Button>
          </p>
        ) : null}
      </details>
      {error ? <Erreur erreur={error} /> : isLoading ? <Chargement /> : (
        <Card><CardContent className="p-5"><FilJournal lignes={visibles} /></CardContent></Card>
      )}
    </div>
  )
}
