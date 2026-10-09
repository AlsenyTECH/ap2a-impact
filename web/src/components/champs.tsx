import type { ReactNode, SelectHTMLAttributes } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useMembres, useZones } from '@/lib/requetes'
import { Squelette } from '@/components/design'

/** Libellé + champ, avec un texte d'aide optionnel. */
export function Champ({ label, aide, children, className }: { label: string; aide?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {aide ? <p className="text-xs text-muted-foreground">{aide}</p> : null}
    </div>
  )
}

/** Liste déroulante native : la plus simple à utiliser au téléphone. */
export function Liste({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'flex h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 sm:text-sm',
        className,
      )}
      {...props}
    />
  )
}

const PA = 'Dakar > Dakar > Parcelles Assainies'

/** Choix d'une zone : les Unités des Parcelles Assainies d'abord. */
export function ListeZones({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const { data: zones = [] } = useZones()
  const parcelles = zones.filter((z) => z.chemin.startsWith(PA + ' >'))
  const autres = zones.filter((z) => !z.chemin.startsWith(PA + ' >'))
  parcelles.sort((a, b) => (parseInt(a.nom.replace(/\D/g, '')) || 0) - (parseInt(b.nom.replace(/\D/g, '')) || 0))
  return (
    <Liste value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">— Non précisée —</option>
      <optgroup label="Parcelles Assainies">
        {parcelles.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
      </optgroup>
      <optgroup label="Autres zones">
        {autres.map((z) => <option key={z.id} value={z.id}>{z.chemin}</option>)}
      </optgroup>
    </Liste>
  )
}

/** Choix d'un membre (référent, responsable...). */
export function ListeMembres({ value, onChange, roles, vide = '— Aucun —' }: {
  value: string | null
  onChange: (id: string | null) => void
  roles?: string[]
  vide?: string
}) {
  const { data: membres = [] } = useMembres()
  const choix = membres.filter((m) => m.actif && (!roles || roles.includes(m.role)))
  return (
    <Liste value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{vide}</option>
      {choix.map((m) => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
    </Liste>
  )
}

/** Boutons à choix unique, plus rapides qu'une liste pour 2 à 6 options. */
export function Pastilles<T extends string>({ options, value, onChange, defilant }: {
  options: [T, string][]
  value: T | '' | null
  onChange: (v: T) => void
  /** Sur une seule ligne qui défile (téléphone) plutôt que sur plusieurs. */
  defilant?: boolean
}) {
  return (
    <div className={cn('flex gap-2', defilant ? 'w-max md:w-auto md:flex-wrap' : 'flex-wrap')}>
      {options.map(([v, libelle]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all active:scale-[0.97]',
            value === v
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-border bg-card text-foreground/80 hover:border-primary/40 hover:text-foreground',
          )}
        >
          {libelle}
        </button>
      ))}
    </div>
  )
}

export function Chargement() {
  return <Squelette />
}

export function Erreur({ erreur }: { erreur: unknown }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-[#fbe6e6] p-4 text-sm text-[#a32b2b]">
      {erreur instanceof Error ? erreur.message : 'Une erreur est survenue'}
    </div>
  )
}

export function EnTete({ titre, sousTitre, actions }: { titre: string; sousTitre?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 md:mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{titre}</h1>
        {sousTitre ? <div className="mt-1 text-sm text-muted-foreground">{sousTitre}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
