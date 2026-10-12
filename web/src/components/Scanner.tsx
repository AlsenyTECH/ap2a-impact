import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'
import { CameraOff, CheckCircle2, CircleAlert, CircleX, SwitchCamera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { jetonDuQR } from '@/components/CarteQR'
import { messageErreur } from '@/lib/supabase'
import type { ResultatPointage } from '@/lib/types'
import { cn } from '@/lib/utils'

const MESSAGES: Record<ResultatPointage['statut'], string> = {
  ok: 'Présent', deja: 'Déjà pointé', inconnue: 'Carte inconnue', revoquee: 'Carte annulée',
  pas_inscrit: "Pas inscrit à cette action", carte_membre: 'Carte de membre (pas un participant)',
  carte_beneficiaire: 'Carte de bénéficiaire (pas un membre)', non_invite: 'Présent, mais pas sur la liste des invités',
}
const BONS = new Set(['ok', 'deja', 'non_invite'])

interface Ligne { cle: number; r: ResultatPointage }

/** Petit signal sonore et vibration : le pointeur n'a pas besoin de regarder l'écran. */
function signal(bon: boolean) {
  try {
    navigator.vibrate?.(bon ? 80 : [60, 60, 60])
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = bon ? 880 : 220
    g.gain.value = 0.08
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + (bon ? 0.12 : 0.3))
    o.onended = () => ctx.close()
  } catch { /* pas de son : tant pis */ }
}

/**
 * Pointage par scan des cartes : la caméra reste ouverte, chaque carte lue
 * est envoyée à `pointer`, le résultat s'affiche en haut de la liste.
 */
export function Scanner({ ouvert, fermer, titre, description, pointer }: {
  ouvert: boolean
  fermer: () => void
  titre: string
  description?: string
  pointer: (jeton: string) => Promise<ResultatPointage>
}) {
  const video = useRef<HTMLVideoElement>(null)
  const scanner = useRef<QrScanner | null>(null)
  const recents = useRef(new Map<string, number>())
  const pointerRef = useRef(pointer)
  pointerRef.current = pointer
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [cameras, setCameras] = useState<QrScanner.Camera[]>([])
  const [camera, setCamera] = useState(0)

  useEffect(() => {
    if (!ouvert) return
    setLignes([])
    setErreur(null)
    let arrete = false
    // La vidéo n'existe qu'une fois la fenêtre affichée.
    const demarrer = window.setTimeout(async () => {
      if (!video.current || arrete) return
      const s = new QrScanner(video.current, async ({ data }) => {
        const jeton = jetonDuQR(data)
        const maintenant = Date.now()
        if (!jeton) {
          if ((recents.current.get(data) ?? 0) > maintenant - 4000) return
          recents.current.set(data, maintenant)
          signal(false)
          setLignes((l) => [{ cle: maintenant, r: { statut: 'inconnue' } as ResultatPointage }, ...l].slice(0, 30))
          return
        }
        // Une même carte devant la caméra n'est comptée qu'une fois toutes les 4 secondes.
        if ((recents.current.get(jeton) ?? 0) > maintenant - 4000) return
        recents.current.set(jeton, maintenant)
        try {
          const r = await pointerRef.current(jeton)
          signal(BONS.has(r.statut))
          setLignes((l) => [{ cle: maintenant, r }, ...l].slice(0, 30))
        } catch (e) {
          signal(false)
          setErreur(messageErreur(e))
        }
      }, { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8, returnDetailedScanResult: true })
      scanner.current = s
      try {
        await s.start()
        setCameras(await QrScanner.listCameras(false))
      } catch {
        setErreur("Impossible d'ouvrir la caméra. Autorisez l'accès à la caméra pour ce site, puis réessayez.")
      }
    }, 150)
    return () => {
      arrete = true
      window.clearTimeout(demarrer)
      scanner.current?.destroy()
      scanner.current = null
    }
  }, [ouvert])

  const ok = lignes.filter((l) => l.r.statut === 'ok' || l.r.statut === 'non_invite').length
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[96dvh] overflow-y-auto p-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titre}</DialogTitle>
          <DialogDescription>{description ?? 'Présentez les cartes une par une devant la caméra.'}</DialogDescription>
        </DialogHeader>
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} className="aspect-square w-full object-cover" muted playsInline />
          {erreur ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-6 text-center text-sm text-white">
              <CameraOff className="size-8" />{erreur}
            </div>
          ) : null}
          {cameras.length > 1 ? (
            <button
              onClick={() => {
                const suivante = (camera + 1) % cameras.length
                setCamera(suivante)
                scanner.current?.setCamera(cameras[suivante].id)
              }}
              className="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white" aria-label="Changer de caméra"
            >
              <SwitchCamera className="size-5" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span><b>{ok}</b> pointé{ok > 1 ? 's' : ''} pendant ce scan</span>
          <Button size="sm" onClick={fermer}>Terminer</Button>
        </div>
        {lignes.length ? (
          <div className="max-h-56 divide-y divide-border/70 overflow-y-auto rounded-xl border border-border">
            {lignes.map(({ cle, r }, i) => {
              const bon = BONS.has(r.statut)
              const Icone = r.statut === 'ok' ? CheckCircle2 : bon ? CircleAlert : CircleX
              return (
                <div key={cle} className={cn('flex items-center gap-3 px-3 py-2 text-sm', i === 0 && 'animate-apparition', i === 0 && (r.statut === 'ok' ? 'bg-[#e2f4e2]' : bon ? 'bg-[#fdf3d8]' : 'bg-[#fbe6e6]'))}>
                  <Icone className={cn('size-5 shrink-0', r.statut === 'ok' ? 'text-[#0b6b0b]' : bon ? 'text-[#8a6a10]' : 'text-[#a32b2b]')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.prenom || r.nom ? `${r.prenom ?? ''} ${r.nom ?? ''}` : 'QR code'}</span>
                    <span className="text-xs text-muted-foreground">{MESSAGES[r.statut]}{r.numero ? ` · ${r.numero}` : ''}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{new Date(cle).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
              )
            })}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
