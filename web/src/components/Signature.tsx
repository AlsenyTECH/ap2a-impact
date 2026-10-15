import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SignatureRef {
  /** L'image PNG de la signature, ou null si rien n'a été dessiné. */
  image: () => Promise<Blob | null>
  effacer: () => void
}

/** Zone où le bénéficiaire signe avec le doigt (ou la souris). */
export const Signature = forwardRef<SignatureRef, { className?: string; onChange?: (vide: boolean) => void }>(function Signature({ className, onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const dessin = useRef(false)
  const dernier = useRef<{ x: number; y: number } | null>(null)
  const [vide, setVide] = useState(true)

  // Taille réelle en pixels (écrans haute densité) ; on repart d'une zone blanche.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    // offsetWidth : taille de mise en page, sans l'effet d'une animation d'ouverture (zoom).
    const d = window.devicePixelRatio || 1
    c.width = Math.round(c.offsetWidth * d)
    c.height = Math.round(c.offsetHeight * d)
    const ctx = c.getContext('2d')!
    ctx.scale(d, d)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0c2a20'
  }, [])

  const point = (e: React.PointerEvent) => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    const k = r.width ? c.offsetWidth / r.width : 1
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }
  }
  const marquer = (v: boolean) => { setVide(v); onChange?.(v) }

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
    effacer: () => {
      const c = canvas.current
      if (!c) return
      c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
      marquer(true)
    },
  }), [vide])

  return (
    <div className={cn('relative rounded-xl border-2 border-dashed border-border bg-white', className)}>
      <canvas
        ref={canvas}
        className="h-40 w-full touch-none rounded-xl"
        aria-label="Zone de signature"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dessin.current = true
          dernier.current = point(e)
          const ctx = canvas.current!.getContext('2d')!
          ctx.beginPath()
          ctx.arc(dernier.current.x, dernier.current.y, 1.1, 0, Math.PI * 2)
          ctx.fillStyle = '#0c2a20'
          ctx.fill()
          if (vide) marquer(false)
        }}
        onPointerMove={(e) => {
          if (!dessin.current || !dernier.current) return
          const p = point(e)
          const ctx = canvas.current!.getContext('2d')!
          ctx.beginPath()
          ctx.moveTo(dernier.current.x, dernier.current.y)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
          dernier.current = p
        }}
        onPointerUp={() => { dessin.current = false; dernier.current = null }}
        onPointerCancel={() => { dessin.current = false; dernier.current = null }}
      />
      {vide ? <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted-foreground">Signez ici avec le doigt</span> : null}
      <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-border" />
      {!vide ? (
        <button type="button" onClick={() => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); marquer(true) }}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium hover:bg-border" aria-label="Effacer la signature">
          <Eraser className="size-3.5" /> Effacer
        </button>
      ) : null}
    </div>
  )
})
