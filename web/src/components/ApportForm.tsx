import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Champ, Liste, Pastilles } from '@/components/champs'
import { Signature, type SignatureRef } from '@/components/Signature'
import { aujourdhui, LIBELLES_NATURE } from '@/lib/format'
import { deposerSignature, useKits } from '@/lib/kits'
import { usePartenaires } from '@/lib/requetes'
import { messageErreur, supabase } from '@/lib/supabase'
import type { NatureApport } from '@/lib/types'

/** Réduit une photo de téléphone (plusieurs Mo) à ~1600 px en JPEG. */
export async function compresser(fichier: File): Promise<Blob> {
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
  const { data: kits = [] } = useKits()
  const [nature, setNature] = useState<NatureApport>('kit')
  const [modele, setModele] = useState('')
  const [faireSigner, setFaireSigner] = useState(false)
  const signature = useRef<SignatureRef>(null)
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
      setNature('kit'); setModele(''); setFaireSigner(false); setDescription(''); setValeur(''); setQuantite(''); setNumero('')
      setPartenaire(partenaireParDefaut ?? ''); setDateRemise(aujourdhui()); setPhoto(null)
    }
  }, [ouvert, partenaireParDefaut])

  const kit = nature === 'kit' ? kits.find((k) => k.id === modele) : undefined
  const parPersonne = Math.max(1, Math.ceil(Number(quantite) || 1))
  const besoin = kit ? parPersonne * beneficiaires.length : 0

  // Un kit du catalogue remplit la description, la valeur et le fournisseur.
  function choisirModele(id: string) {
    const avant = kits.find((x) => x.id === modele)
    const k = kits.find((x) => x.id === id)
    setModele(id)
    if (k) setDescription(k.nom)
    else if (avant && description === avant.nom) setDescription('')
    // Valeur et fournisseur viennent du catalogue : on ne garde pas ceux du kit choisi avant.
    setValeur(k?.valeur_unitaire_fcfa != null ? String(k.valeur_unitaire_fcfa * parPersonne) : '')
    setPartenaire(k?.partenaire_id ?? partenaireParDefaut ?? '')
  }
  function changerQuantite(v: string) {
    setQuantite(v)
    if (kit?.valeur_unitaire_fcfa != null) setValeur(String(kit.valeur_unitaire_fcfa * Math.max(1, Math.ceil(Number(v) || 1))))
  }

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
      let signature_chemin: string | null = null
      if (kit && seul && faireSigner) {
        const image = await signature.current?.image()
        if (image) signature_chemin = await deposerSignature(beneficiaires[0], image)
      }
      const { error } = await supabase.from('apports').insert(beneficiaires.map((beneficiaire_id) => ({
        beneficiaire_id,
        nature,
        modele_id: kit?.id ?? null,
        description: description.trim(),
        valeur_fcfa: valeur ? Number(valeur) : null,
        quantite: kit ? parPersonne : quantite ? Number(quantite) : null,
        partenaire_id: partenaire || null,
        numero_document: seul ? numero.trim() || null : null,
        fichier_chemin,
        signature_chemin,
        signe_le: signature_chemin ? new Date().toISOString() : null,
        date_remise: dateRemise,
      })))
      if (error) throw error
      if (kit) qc.invalidateQueries({ queryKey: ['kits'] })
      qc.invalidateQueries({ queryKey: ['bon-remise'] })
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
          {nature === 'kit' && kits.length ? (
            <Champ label="Kit du catalogue" aide={kit ? `Stock : ${kit.stock}${kit.composition.length ? ` · ${kit.composition.map((c) => `${c.quantite > 1 ? `${c.quantite} × ` : ''}${c.libelle}`).join(', ')}` : ''}` : 'Un kit du catalogue est retiré du stock automatiquement.'}>
              <Liste value={modele} onChange={(e) => choisirModele(e.target.value)}>
                <option value="">Autre (hors catalogue, sans suivi de stock)</option>
                {kits.map((k) => <option key={k.id} value={k.id}>{k.nom} (stock : {k.stock})</option>)}
              </Liste>
            </Champ>
          ) : null}
          {kit && kit.stock < besoin ? (
            <p className="rounded-lg bg-or-soft p-3 text-sm text-[#5c4100]">
              {kit.stock <= 0 ? 'Le stock enregistré est épuisé' : `Il ne reste que ${kit.stock} kit${kit.stock > 1 ? 's' : ''} en stock`} pour {besoin} à remettre. La remise sera enregistrée quand même (stock négatif) : pensez à saisir l'entrée des kits dans « Kits et stock ».
            </p>
          ) : null}
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
            <Champ label={kit ? 'Nombre de kits par personne' : 'Quantité'}>
              {kit ? <Input type="number" min={1} step={1} inputMode="numeric" value={quantite} placeholder="1" onChange={(e) => changerQuantite(e.target.value)} />
                : <Input type="number" min={0} step="any" value={quantite} onChange={(e) => setQuantite(e.target.value)} />}
            </Champ>
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
              {kit ? (
                faireSigner ? (
                  <Champ label="Signature du bénéficiaire" aide="Preuve de réception, reprise sur le bon de remise.">
                    <Signature ref={signature} />
                  </Champ>
                ) : (
                  <Button type="button" variant="secondary" onClick={() => setFaireSigner(true)}><PenLine /> Faire signer le bénéficiaire</Button>
                )
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
