import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apercuMedia, urlVitrine, type MediaVitrine } from '@/lib/vitrine'

/** Fond du haut de page : courte vidéo muette en boucle, ou photo. */
export function FondAccueil({ media }: { media: MediaVitrine }) {
  const [reduit, setReduit] = useState(false)
  useEffect(() => { setReduit(window.matchMedia('(prefers-reduced-motion: reduce)').matches) }, [])
  const affiche = urlVitrine(media.type === 'video' ? media.apercu : media.chemin)
  return (
    <div className="absolute inset-0 -z-20" aria-hidden>
      {media.type === 'video' && !reduit ? (
        <video className="size-full object-cover" src={urlVitrine(media.chemin)!} poster={affiche ?? undefined} autoPlay muted loop playsInline preload="metadata" />
      ) : affiche ? (
        <img className="size-full object-cover" src={affiche} alt="" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0c2a20] via-[#0c2a20]/85 to-[#0c2a20]/45" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0c2a20] via-transparent to-[#0c2a20]/60" />
    </div>
  )
}

/** Vidéo YouTube : seule la vignette est chargée tant qu'on ne clique pas (page rapide, pas de traceur). */
function YoutubeLeger({ id, titre }: { id: string; titre: string }) {
  const [lance, setLance] = useState(false)
  if (lance) {
    return (
      <iframe
        className="size-full"
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
        title={titre || 'Vidéo'}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    )
  }
  return (
    <button className="group relative size-full" onClick={() => setLance(true)} aria-label={`Lire la vidéo ${titre}`}>
      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="size-full object-cover" />
      <BoutonLecture />
    </button>
  )
}

function BoutonLecture() {
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition group-hover:bg-black/10">
      <span className="relative flex size-20 items-center justify-center rounded-full bg-[#f2c14e] text-[#0c2a20] shadow-2xl transition group-hover:scale-110">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#f2c14e]/50" />
        <Play className="relative ml-1 size-8 fill-current" />
      </span>
    </span>
  )
}

/** Fichier vidéo : vignette puis lecture avec les contrôles du navigateur. */
function VideoFichier({ src, affiche, titre, vertical }: { src: string; affiche?: string | null; titre: string; vertical?: boolean }) {
  const [lance, setLance] = useState(false)
  if (lance) return <video className="size-full bg-black object-contain" src={src} poster={affiche ?? undefined} controls autoPlay playsInline />
  return (
    <button className="group relative size-full bg-[#0c2a20]" onClick={() => setLance(true)} aria-label={`Lire la vidéo ${titre}`}>
      {affiche ? <img src={affiche} alt="" className={cn('size-full', vertical ? 'object-cover' : 'object-cover')} /> : null}
      <BoutonLecture />
    </button>
  )
}

/** Le film mis en avant : YouTube, fichier déposé par le bureau, ou le film court de l'association. */
export function LecteurFilm({ media, defaut }: { media?: MediaVitrine; defaut: { src: string; affiche: string; titre: string } }) {
  if (media?.type === 'youtube' && media.youtube_id) {
    return <div className="aspect-video overflow-hidden rounded-[1.75rem] bg-black shadow-2xl ring-1 ring-black/10"><YoutubeLeger id={media.youtube_id} titre={media.titre} /></div>
  }
  if (media?.type === 'video' && media.chemin) {
    return <div className="aspect-video overflow-hidden rounded-[1.75rem] bg-black shadow-2xl ring-1 ring-black/10"><VideoFichier src={urlVitrine(media.chemin)!} affiche={urlVitrine(media.apercu)} titre={media.titre} /></div>
  }
  // Film vertical dans un cadre de téléphone.
  return (
    <div className="relative mx-auto w-[min(78vw,300px)]">
      <div className="vitrine-halo absolute -inset-10 -z-10 rounded-full bg-[#f2c14e]/25 blur-3xl" />
      <div className="rounded-[2.6rem] bg-[#0a1a14] p-2.5 shadow-2xl ring-1 ring-white/10">
        <div className="relative aspect-[9/16] overflow-hidden rounded-[2.1rem] bg-black">
          <VideoFichier src={defaut.src} affiche={defaut.affiche} titre={defaut.titre} vertical />
          <span className="pointer-events-none absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
        </div>
      </div>
    </div>
  )
}

/** Galerie en mosaïque ; un clic ouvre la visionneuse plein écran. */
export function Galerie({ medias }: { medias: MediaVitrine[] }) {
  const [ouvert, setOuvert] = useState<number | null>(null)
  return (
    <>
      <div className="columns-2 gap-3 sm:gap-4 md:columns-3 [&>*]:mb-3 sm:[&>*]:mb-4">
        {medias.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setOuvert(i)}
            className="group relative block w-full break-inside-avoid overflow-hidden rounded-2xl bg-[#e8f4ee] text-left shadow-sm ring-1 ring-black/5"
          >
            <img src={apercuMedia(m) ?? ''} alt={m.titre || m.legende || 'Action de l\'AP2A'} loading="lazy" className="w-full transition duration-700 group-hover:scale-105" />
            {m.type !== 'photo' ? <span className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur"><Play className="ml-0.5 size-4 fill-current" /></span> : null}
            {m.titre ? (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-sm font-semibold text-white opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                {m.titre}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {ouvert !== null ? <Visionneuse medias={medias} index={ouvert} changer={setOuvert} /> : null}
    </>
  )
}

function Visionneuse({ medias, index, changer }: { medias: MediaVitrine[]; index: number; changer: (i: number | null) => void }) {
  const m = medias[index]
  const aller = useCallback((d: number) => changer((index + d + medias.length) % medias.length), [index, medias.length, changer])
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') changer(null)
      if (e.key === 'ArrowRight') aller(1)
      if (e.key === 'ArrowLeft') aller(-1)
    }
    window.addEventListener('keydown', touche)
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', touche); document.body.style.overflow = avant }
  }, [aller, changer])
  const [depart, setDepart] = useState<number | null>(null)

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={m.titre || 'Photo'}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white"
      onTouchStart={(e) => setDepart(e.touches[0].clientX)}
      onTouchEnd={(e) => { if (depart !== null) { const dx = e.changedTouches[0].clientX - depart; if (Math.abs(dx) > 50) aller(dx < 0 ? 1 : -1) } setDepart(null) }}
    >
      <div className="flex items-center justify-between p-3 text-sm text-white/70">
        <span>{index + 1} / {medias.length}</span>
        <button onClick={() => changer(null)} className="rounded-full p-2 hover:bg-white/10" aria-label="Fermer"><X /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 md:px-16" onClick={(e) => e.target === e.currentTarget && changer(null)}>
        {m.type === 'photo' ? (
          <img key={m.id} src={urlVitrine(m.chemin)!} alt={m.titre || m.legende || ''} className="max-h-full max-w-full animate-apparition rounded-lg object-contain" />
        ) : m.type === 'video' ? (
          <video key={m.id} src={urlVitrine(m.chemin)!} poster={urlVitrine(m.apercu) ?? undefined} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" />
        ) : (
          <div className="aspect-video w-full max-w-5xl"><YoutubeLeger id={m.youtube_id!} titre={m.titre} /></div>
        )}
        {medias.length > 1 ? (
          <>
            <button onClick={() => aller(-1)} className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 hover:bg-white/20 md:block" aria-label="Précédente"><ChevronLeft /></button>
            <button onClick={() => aller(1)} className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 hover:bg-white/20 md:block" aria-label="Suivante"><ChevronRight /></button>
          </>
        ) : null}
      </div>
      {m.titre || m.legende ? (
        <div className="mx-auto w-full max-w-3xl p-4 text-center">
          {m.titre ? <div className="font-heading text-lg font-semibold">{m.titre}</div> : null}
          {m.legende ? <p className="mt-1 text-sm text-white/70">{m.legende}</p> : null}
        </div>
      ) : <div className="h-6" />}
    </div>
  )
}
