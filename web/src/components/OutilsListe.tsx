import type { ReactNode } from 'react'
import { ArrowDownUp, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

/**
 * Barre d'outils d'une liste : recherche, tri, filtres et nombre de
 * résultats. Les filtres propres à chaque page passent en `children`.
 */
export function OutilsListe<T extends string>({ recherche, setRecherche, placeholder, tris, tri, setTri, total, children }: {
  recherche: string
  setRecherche: (v: string) => void
  placeholder: string
  tris?: [T, string][]
  tri?: T
  setTri?: (t: T) => void
  total?: number
  children?: ReactNode
}) {
  return (
    <div className="mb-4 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-10 pr-9" placeholder={placeholder} value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          {recherche ? (
            <button onClick={() => setRecherche('')} aria-label="Effacer la recherche" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        {tris && setTri ? (
          <label className="relative flex shrink-0 items-center">
            <ArrowDownUp className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
            <select
              aria-label="Trier par"
              value={tri}
              onChange={(e) => setTri(e.target.value as T)}
              className="h-11 max-w-[11rem] appearance-none rounded-lg border border-input bg-card pl-9 pr-3 text-sm font-medium focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 sm:max-w-none"
            >
              {tris.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      {children}
      {total != null ? <div className="text-xs text-muted-foreground">{total} résultat{total > 1 ? 's' : ''}</div> : null}
    </div>
  )
}
