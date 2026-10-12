import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

/**
 * Médias de la page publique : photos et vidéos déposées par le bureau
 * dans le compartiment public « vitrine », publiées quand il le décide.
 */
export type EmplacementMedia = 'galerie' | 'accueil' | 'video' | 'fondatrice'
export interface MediaVitrine {
  id: string
  type: 'photo' | 'video' | 'youtube'
  emplacement: EmplacementMedia
  chemin: string | null
  apercu: string | null
  youtube_id: string | null
  titre: string
  legende: string
  ordre: number
  publie: boolean
  cree_le: string
}

export const LIBELLES_EMPLACEMENT: Record<EmplacementMedia, string> = {
  galerie: 'Galerie de photos',
  accueil: 'Fond du haut de page',
  video: 'Film mis en avant',
  fondatrice: 'Portrait de la fondatrice',
}

const BASE = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/storage/v1/object/public/vitrine/`
// Un chemin commençant par « / » désigne un fichier livré avec le site (médias par défaut).
export const urlVitrine = (chemin: string | null | undefined) => (chemin ? (chemin.startsWith('/') ? chemin : BASE + chemin) : null)

/** Médias livrés avec le site, montrés tant que le bureau n'a rien publié au même emplacement. */
export const MEDIAS_PAR_DEFAUT: MediaVitrine[] = []

/** Image d'aperçu d'un média (photo, vignette de vidéo ou de YouTube). */
export function apercuMedia(m: MediaVitrine) {
  if (m.type === 'photo') return urlVitrine(m.chemin)
  if (m.type === 'youtube') return `https://i.ytimg.com/vi/${m.youtube_id}/hqdefault.jpg`
  return urlVitrine(m.apercu)
}

/** Identifiant d'une vidéo YouTube à partir d'un lien (watch, youtu.be, shorts, embed). */
export function idYoutube(lien: string): string | null {
  const t = lien.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t
  try {
    const u = new URL(t)
    const hote = u.hostname.replace(/^(www\.|m\.)/, '')
    let id: string | null = null
    if (hote === 'youtu.be') id = u.pathname.slice(1)
    else if (hote === 'youtube.com' || hote === 'youtube-nocookie.com') {
      id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? null
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch {
    return null
  }
}

/** Réduit une photo (2000 px max, WebP) avant l'envoi : page rapide même en 3G. */
export async function reduirePhoto(fichier: File, max = 2000): Promise<Blob> {
  const image = await createImageBitmap(fichier)
  const r = Math.min(1, max / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * r)
  canvas.height = Math.round(image.height * r)
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Image illisible'))), 'image/webp', 0.85))
}

/** Vignette d'une vidéo : l'image à 1 s (ou au début si elle est plus courte). */
export function vignetteVideo(fichier: File): Promise<Blob> {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(fichier)
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.src = url
    const fin = (e?: Error, b?: Blob | null) => { URL.revokeObjectURL(url); if (b) ok(b); else ko(e ?? new Error('Vidéo illisible')) }
    v.onerror = () => fin(new Error('Format de vidéo non lu par ce navigateur (utilisez du MP4)'))
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 0) / 2) }
    v.onseeked = () => {
      const r = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight))
      const c = document.createElement('canvas')
      c.width = Math.round(v.videoWidth * r)
      c.height = Math.round(v.videoHeight * r)
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
      c.toBlob((b) => fin(undefined, b), 'image/webp', 0.8)
    }
  })
}

export const TAILLE_MAX = 50 * 1024 * 1024

/** Envoie un fichier dans « vitrine » sous un nom aléatoire ; renvoie le chemin. */
export async function deposer(blob: Blob, extension: 'webp' | 'mp4' | 'webm' | 'jpg' | 'png', type: string) {
  const chemin = `${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from('vitrine').upload(chemin, blob, { contentType: type, cacheControl: '31536000' })
  if (error) throw error
  return chemin
}

/** Médias publiés (page publique) ou tous (écran de gestion du bureau). */
export const useMediasVitrine = (tous = false) => useQuery({
  queryKey: ['vitrine-medias', tous],
  staleTime: tous ? 0 : 5 * 60 * 1000,
  queryFn: async () => {
    let q = supabase.from('vitrine_medias').select('*').order('emplacement').order('ordre').order('cree_le')
    if (!tous) q = q.eq('publie', true)
    const { data, error } = await q
    if (error) throw error
    return data as MediaVitrine[]
  },
})
