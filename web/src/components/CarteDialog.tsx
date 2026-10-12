import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Ban, IdCard, Printer, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CarteVisuelle, type TitulaireCarte } from '@/components/CarteQR'
import { date } from '@/lib/format'
import { usePhoto } from '@/lib/photos'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import type { Carte } from '@/lib/types'

/**
 * Carte d'un membre ou d'une personne : aperçu, impression, renouvellement
 * (l'ancienne carte devient invalide) et annulation (carte perdue, départ).
 */
export function CarteDialog({ ouvert, fermer, titulaire, membreId, cibleId, photoChemin, gere }: {
  ouvert: boolean
  fermer: () => void
  titulaire: Omit<TitulaireCarte, 'jeton' | 'photo'>
  membreId?: string
  cibleId?: string
  photoChemin?: string | null
  /** Peut émettre, renouveler ou annuler. */
  gere: boolean
}) {
  const qc = useQueryClient()
  const cle = ['carte', membreId ?? cibleId]
  const { data: carte, isLoading } = useQuery({
    queryKey: cle,
    enabled: ouvert,
    queryFn: async () => {
      const q = supabase.from('cartes').select('*').is('revoquee_le', null)
      return (verifier(await (membreId ? q.eq('membre_id', membreId) : q.eq('cible_id', cibleId!)).maybeSingle()) as Carte | null)
    },
  })
  const photo = usePhoto(photoChemin)
  const lienImpression = membreId ? `/cartes?membre=${membreId}` : `/cartes?cible=${cibleId}`

  async function emettre() {
    if (carte && !confirm("Renouveler la carte ? L'ancienne carte ne sera plus valide.")) return
    const { error } = await supabase.rpc('emettre_carte', membreId ? { p_membre: membreId } : { p_cible: cibleId })
    if (error) return toast.error(messageErreur(error))
    toast.success(carte ? 'Nouvelle carte émise, l\'ancienne est annulée' : 'Carte émise')
    qc.invalidateQueries({ queryKey: cle })
    qc.invalidateQueries({ queryKey: ['cible'] })
  }

  async function annuler() {
    if (!carte || !confirm('Annuler cette carte ? Elle apparaîtra comme « annulée » si quelqu\'un la scanne.')) return
    const { error } = await supabase.rpc('revoquer_carte', { p_carte: carte.id })
    if (error) return toast.error(messageErreur(error))
    toast.success('Carte annulée')
    qc.invalidateQueries({ queryKey: cle })
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Carte {titulaire.type === 'membre' ? 'de membre' : 'de bénéficiaire'}</DialogTitle>
          <DialogDescription>Le QR code permet de vérifier la carte et de pointer les présences.</DialogDescription>
        </DialogHeader>
        {isLoading ? null : carte ? (
          <>
            <div className="flex justify-center overflow-x-auto py-1">
              <CarteVisuelle t={{ ...titulaire, jeton: carte.jeton, photo }} />
            </div>
            <p className="text-center text-xs text-muted-foreground">Carte émise le {date(carte.emise_le.slice(0, 10))}{photoChemin ? '' : ' · sans photo (ajoutez-la sur la fiche)'}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild size="sm"><Link to={lienImpression}><Printer /> Imprimer</Link></Button>
              {gere ? (
                <>
                  <Button size="sm" variant="secondary" onClick={emettre}><RefreshCw /> Renouveler</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={annuler}><Ban /> Annuler la carte</Button>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="space-y-3 py-4 text-center">
            <IdCard className="mx-auto size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Pas encore de carte{gere ? '.' : '. Demandez-la au bureau.'}</p>
            {gere ? <Button onClick={emettre}><IdCard /> Créer la carte</Button> : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
