import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Champ, Liste, Pastilles } from '@/components/champs'
import { aujourdhui, LIBELLES_NATURE } from '@/lib/format'
import { usePartenaires } from '@/lib/requetes'
import { messageErreur, supabase } from '@/lib/supabase'
import type { NatureApport } from '@/lib/types'

/** Réduit une photo de téléphone (plusieurs Mo) à ~1600 px en JPEG. */
async function compresser(fichier: File): Promise<Blob> {
  if (!fichier.type.startsWith('image/')) return fichier
  const image = await createImageBitmap(fichier)
  const echelle = Math.min(1, 1600 / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * echelle)
  canvas.height = Math.round(image.height * echelle)
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
  return new Promise((ok) => canvas.toBlob((b) => ok(b ?? fichier), 'image/jpeg', 0.8))
}

/**
 * Enregistre ce qu'ont reçu un ou plusieurs bénéficiaires (formation,
 * certificat délivré par le partenaire, kit...). Avec plusieurs
 * bénéficiaires, le même apport est ajouté à chacun en une fois.
 */
export function ApportForm({ ouvert, fermer, beneficiaires, partenaireParDefaut }: {
  ouvert: boolean
  fermer: () => void
  beneficiaires: string[]
  partenaireParDefaut?: string | null
}) {
  const qc = useQueryClient()
  const { data: partenaires = [] } = usePartenaires()
  const [nature, setNature] = useState<NatureApport>('kit')
  const [description, setDescription] = useState('')
  const [valeur, setValeur] = useState('')
  const [quantite, setQuantite] = useState('')
  const [partenaire, setPartenaire] = useState('')
  const [numero, setNumero] = useState('')
  const [dateRemise, setDateRemise] = useState(aujourdhui())
  const [photo, setPhoto] = useState<File | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const seul = beneficiaires.length === 1

  useEffect(() => {
    if (ouvert) {
      setNature('kit'); setDescription(''); setValeur(''); setQuantite(''); setNumero('')
      setPartenaire(partenaireParDefaut ?? ''); setDateRemise(aujourdhui()); setPhoto(null)
    }
  }, [ouvert, partenaireParDefaut])

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    try {
      let fichier_chemin: string | null = null
      if (photo && seul) {
        const contenu = await compresser(photo)
        const extension = contenu.type === 'application/pdf' ? 'pdf' : 'jpg'
        fichier_chemin = `${beneficiaires[0]}/${crypto.randomUUID()}.${extension}`
        const { error } = await supabase.storage.from('justificatifs').upload(fichier_chemin, contenu, { contentType: contenu.type })
        if (error) throw error
      }
      const { error } = await supabase.from('apports').insert(beneficiaires.map((beneficiaire_id) => ({
        beneficiaire_id,
        nature,
        description: description.trim(),
        valeur_fcfa: valeur ? Number(valeur) : null,
        quantite: quantite ? Number(quantite) : null,
        partenaire_id: partenaire || null,
        numero_document: seul ? numero.trim() || null : null,
        fichier_chemin,
        date_remise: dateRemise,
      })))
      if (error) throw error
      toast.success(seul ? 'Apport enregistré' : `Apport enregistré pour ${beneficiaires.length} bénéficiaires`)
      qc.invalidateQueries({ queryKey: ['beneficiaires'] })
      qc.invalidateQueries({ queryKey: ['parcours'] })
      fermer()
    } catch (err) {
      toast.error(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  const exemples: Partial<Record<NatureApport, string>> = {
    kit: "Kit d'électricien", certificat: 'Certificat électricité bâtiment', formation: 'Formation de 3 mois',
    soin: 'Opération de la cataracte', don: 'Sac de riz 25 kg',
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ce qui a été remis</DialogTitle>
          {!seul ? <DialogDescription>Sera ajouté à chacun des {beneficiaires.length} bénéficiaires sélectionnés.</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={enregistrer} className="grid grid-cols-1 gap-4">
          <Champ label="Nature">
            <Pastilles<NatureApport> value={nature} onChange={setNature} options={Object.entries(LIBELLES_NATURE) as [NatureApport, string][]} />
          </Champ>
          <Champ label="Description">
            <Input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder={exemples[nature] ?? ''} />
          </Champ>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Valeur (FCFA)">
              <Input type="number" min={0} inputMode="numeric" value={valeur} onChange={(e) => setValeur(e.target.value)} />
            </Champ>
            <Champ label="Date de remise">
              <Input type="date" required value={dateRemise} onChange={(e) => setDateRemise(e.target.value)} />
            </Champ>
          </div>
          {nature === 'don' || nature === 'kit' ? (
            <Champ label="Quantité"><Input type="number" min={0} step="any" value={quantite} onChange={(e) => setQuantite(e.target.value)} /></Champ>
          ) : null}
          <Champ label={nature === 'certificat' ? 'Délivré par' : 'Fourni par (partenaire)'} aide={nature === 'certificat' ? "Le certificat est délivré par le partenaire de formation (ex. 3FPT), pas par l'association." : undefined}>
            <Liste value={partenaire} onChange={(e) => setPartenaire(e.target.value)}>
              <option value="">L'association</option>
              {partenaires.filter((p) => p.actif).map((p) => <option key={p.id} value={p.id}>{p.sigle ? `${p.sigle} — ` : ''}{p.nom}</option>)}
            </Liste>
          </Champ>
          {seul ? (
            <>
              {nature === 'certificat' ? (
                <Champ label="Numéro du certificat"><Input value={numero} onChange={(e) => setNumero(e.target.value)} /></Champ>
              ) : null}
              <Champ label="Photo (certificat, remise du kit…)">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                  <Camera className="size-5" />
                  {photo ? photo.name : 'Prendre ou choisir une photo'}
                  <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </label>
              </Champ>
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi}>{envoi ? 'Envoi…' : 'Enregistrer'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Ouvre le justificatif dans un nouvel onglet (lien signé valable 5 minutes). */
export async function ouvrirJustificatif(chemin: string) {
  const fenetre = window.open('', '_blank')
  const { data, error } = await supabase.storage.from('justificatifs').createSignedUrl(chemin, 300)
  if (error || !data) {
    fenetre?.close()
    toast.error(messageErreur(error))
  } else if (fenetre) fenetre.location.href = data.signedUrl
}
