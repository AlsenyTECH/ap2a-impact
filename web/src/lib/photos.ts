import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

/**
 * Photos des membres et des personnes : compartiment privé « photos »,
 * chemins « membres/<id>.jpg » et « cibles/<id>.jpg ». Les photos sont
 * réduites dans le navigateur (480 px, JPEG) avant l'envoi : rapides à
 * charger même avec une connexion mobile faible.
 */
export async function compresserImage(fichier: File, taille = 480): Promise<Blob> {
  const image = await createImageBitmap(fichier)
  // Recadrage carré centré, pour une photo d'identité.
  const cote = Math.min(image.width, image.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.min(taille, cote)
  canvas.getContext('2d')!.drawImage(image, (image.width - cote) / 2, (image.height - cote) / 2, cote, cote, 0, 0, canvas.width, canvas.height)
  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Image illisible'))), 'image/jpeg', 0.85))
}

/** Envoie la photo et renvoie son chemin. */
export async function envoyerPhoto(dossier: 'membres' | 'cibles', id: string, fichier: File) {
  const chemin = `${dossier}/${id}.jpg`
  const { error } = await supabase.storage.from('photos').upload(chemin, await compresserImage(fichier), { upsert: true, contentType: 'image/jpeg', cacheControl: '60' })
  if (error) throw error
  return chemin
}

/** Liens temporaires (1 h) vers des photos ; la date de modification évite l'ancienne image en cache. */
export const usePhotos = (chemins: (string | null | undefined)[], version = '') => {
  const liste = [...new Set(chemins.filter((c): c is string => !!c))].sort()
  return useQuery({
    queryKey: ['photos', liste, version],
    enabled: liste.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('photos').createSignedUrls(liste, 3600)
      if (error) throw error
      return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl])) as Record<string, string>
    },
  })
}

export const usePhoto = (chemin: string | null | undefined, version = '') => {
  const { data } = usePhotos([chemin], version)
  return chemin ? data?.[chemin] ?? null : null
}
