import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/design'
import { envoyerPhoto, usePhoto } from '@/lib/photos'
import { messageErreur, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/** Photo d'une fiche (membre ou personne), avec un bouton pour la prendre ou la changer. */
export function PhotoFiche({ dossier, id, chemin, prenom, nom, modifiable, taille = 'lg', className }: {
  dossier: 'membres' | 'cibles'
  id: string
  chemin: string | null | undefined
  prenom: string | null
  nom: string
  modifiable: boolean
  taille?: 'md' | 'lg' | 'xl'
  className?: string
}) {
  const qc = useQueryClient()
  const entree = useRef<HTMLInputElement>(null)
  const [envoi, setEnvoi] = useState(false)
  // Chemin connu après un premier envoi, sans attendre le rechargement de la fiche.
  const [envoye, setEnvoye] = useState<string | null>(null)
  const photo = usePhoto(chemin ?? envoye)

  async function choisir(fichier: File | undefined) {
    if (!fichier) return
    setEnvoi(true)
    try {
      const nouveau = await envoyerPhoto(dossier, id, fichier)
      const { error } = dossier === 'membres'
        ? await supabase.rpc('definir_photo_membre', { p_membre: id, p_chemin: nouveau })
        : await supabase.from('cibles').update({ photo_chemin: nouveau }).eq('id', id)
      if (error) throw error
      setEnvoye(nouveau)
      await qc.invalidateQueries({ queryKey: ['photos'] })
      qc.invalidateQueries({ queryKey: [dossier === 'membres' ? 'membres' : 'cible'] })
      toast.success('Photo enregistrée')
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
      if (entree.current) entree.current.value = ''
    }
  }

  return (
    <div className={cn('relative inline-block shrink-0', className)}>
      <Avatar prenom={prenom} nom={nom} photo={photo} taille={taille} />
      {modifiable ? (
        <>
          <button
            type="button"
            onClick={() => entree.current?.click()}
            disabled={envoi}
            title={chemin ?? envoye ? 'Changer la photo' : 'Ajouter une photo'}
            className="absolute -bottom-1 -right-1 inline-flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow"
          >
            {envoi ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
          </button>
          <input ref={entree} type="file" accept="image/*" className="hidden" onChange={(e) => choisir(e.target.files?.[0])} />
        </>
      ) : null}
    </div>
  )
}
