import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SignatureRef {
  /** L'image PNG de la signature, ou null si rien n'a été dessiné. */
  image: () => Promise<Blob | null>
  effacer: () => void
}

const ENCRE = '#0c2a20'

/** Zone où le bénéficiaire signe avec le doigt (ou la souris). */
export const Signature = forwardRef<SignatureRef, { className?: string; onChange?: (vide: boolean) => void }>(function Signature({ className, onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // Un seul doigt à la fois : la paume ou un second doigt posé sont ignorés.
  const doigt = useRef<number | null>(null)
  const dernier = useRef<{ x: number; y: number } | null>(null)
  const [vide, setVide] = useState(true)
  const rappel = useRef(onChange)
  rappel.current = onChange

  const marquer = (v: boolean) => { setVide(v); rappel.current?.(v) }

  // Taille réelle en pixels (écrans haute densité). offsetWidth : taille de mise
  // en page, sans l'effet d'une animation d'ouverture (zoom). Si la zone change
  // de taille (rotation du téléphone), on repart d'une zone vide.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const preparer = () => {
      const d = window.devicePixelRatio || 1
      const l = Math.round(c.offsetWidth * d)
      const h = Math.round(c.offsetHeight * d)
      if (!l || !h || (c.width === l && c.height === h)) return false
      c.width = l
      c.height = h
      const ctx = c.getContext('2d')!
      ctx.setTransform(d, 0, 0, d, 0, 0)
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = ENCRE
      ctx.fillStyle = ENCRE
      return true
    }
    preparer()
    const observateur = new ResizeObserver(() => {
      if (preparer()) {
        doigt.current = null
        dernier.current = null
        marquer(true)
      }
    })
    observateur.observe(c)
    return () => observateur.disconnect()
  }, [])

  const point = (e: React.PointerEvent) => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    const k = r.width ? c.offsetWidth / r.width : 1
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }
  }
  const effacer = () => {
    const c = canvas.current
    if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    doigt.current = null
    dernier.current = null
    marquer(true)
  }
  const lever = (e: React.PointerEvent) => {
    if (e.pointerId !== doigt.current) return
    doigt.current = null
    dernier.current = null
  }

  useImperativeHandle(ref, () => ({
    image: () => new Promise((ok) => {
      if (vide || !canvas.current) return ok(null)
      // Fond blanc (la zone de dessin est transparente).
      const c = document.createElement('canvas')
      c.width = canvas.current.width
      c.height = canvas.current.height
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(canvas.current, 0, 0)
      c.toBlob((b) => ok(b), 'image/png')
    }),
    effacer,
  }), [vide])

  return (
    <div className={cn('relative rounded-xl border-2 border-dashed border-border bg-white', className)}>
      <canvas
        ref={canvas}
        className="h-40 w-full touch-none rounded-xl"
        aria-label="Zone de signature"
        onPointerDown={(e) => {
          if (doigt.current !== null) return
          e.currentTarget.setPointerCapture(e.pointerId)
          doigt.current = e.pointerId
          dernier.current = point(e)
          const ctx = canvas.current!.getContext('2d')!
          ctx.beginPath()
          ctx.arc(dernier.current.x, dernier.current.y, 1.1, 0, Math.PI * 2)
          ctx.fill()
          if (vide) marquer(false)
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== doigt.current || !dernier.current) return
          const p = point(e)
          const ctx = canvas.current!.getContext('2d')!
          ctx.beginPath()
          ctx.moveTo(dernier.current.x, dernier.current.y)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
          dernier.current = p
        }}
        onPointerUp={lever}
        onPointerCancel={lever}
      />
      {vide ? <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted-foreground">Signez ici avec le doigt</span> : null}
      <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-border" />
      {!vide ? (
        <button type="button" onClick={effacer}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium hover:bg-border" aria-label="Effacer la signature">
          <Eraser className="size-3.5" /> Effacer
        </button>
      ) : null}
    </div>
  )
})
