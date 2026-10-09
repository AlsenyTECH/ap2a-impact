import type { ReactNode } from 'react'
import {
  Building2, CalendarClock, CloudRain, GraduationCap, HeartPulse, Home, Leaf, MapPin, Package, School, Sparkles,
  User, Users, Wrench, type LucideIcon,
} from 'lucide-react'
import { LIBELLES_STATUT_ACTION } from '@/lib/format'
import type { StatutAction, TypeCible } from '@/lib/types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------
// Avatars : initiales pour les personnes (couleur stable déduite du nom),
// icône pour les ménages, groupes, établissements et lieux.
// ---------------------------------------------------------------------
const TEINTES = [
  'bg-[#e3f3ec] text-[#06573e]', 'bg-[#e6eefb] text-[#1f4e99]', 'bg-[#fdf3d8] text-[#7a5600]', 'bg-[#fbe8ef] text-[#9b2c55]',
  'bg-[#ece8fb] text-[#4f3aa3]', 'bg-[#e1f3f7] text-[#13647a]', 'bg-[#fbebe2] text-[#9a4a1a]', 'bg-[#eef1ec] text-[#3d4b44]',
]
const teinte = (texte: string) => TEINTES[[...texte].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TEINTES.length]

export const ICONE_NATURE: Record<TypeCible, LucideIcon> = {
  personne: User, menage: Home, collectif: Users, structure: Building2, lieu: MapPin,
}

const TAILLES = { sm: 'size-8 text-xs [&_svg]:size-4', md: 'size-10 text-sm [&_svg]:size-5', lg: 'size-16 text-xl [&_svg]:size-7' }

export function Avatar({ nom, prenom, nature = 'personne', taille = 'md', className }: {
  nom: string
  prenom?: string | null
  nature?: TypeCible
  taille?: keyof typeof TAILLES
  className?: string
}) {
  const Icone = ICONE_NATURE[nature]
  const initiales = nature === 'personne'
    ? `${(prenom ?? '').trim()[0] ?? ''}${nom.trim()[0] ?? ''}`.toUpperCase()
    : null
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-heading font-semibold',
        nature === 'personne' ? 'rounded-full' : 'rounded-xl',
        teinte(`${prenom ?? ''}${nom}`),
        TAILLES[taille],
        className,
      )}
    >
      {initiales || <Icone />}
    </span>
  )
}

// ---------------------------------------------------------------------
// Types d'action : une icône et une couleur chacun.
// ---------------------------------------------------------------------
const STYLES_TYPE: Record<string, { icone: LucideIcon; classe: string }> = {
  formation: { icone: GraduationCap, classe: 'bg-[#e6eefb] text-[#1f4e99]' },
  kit: { icone: Wrench, classe: 'bg-[#fdf3d8] text-[#7a5600]' },
  sante: { icone: HeartPulse, classe: 'bg-[#fbe8ef] text-[#9b2c55]' },
  distribution: { icone: Package, classe: 'bg-[#fbebe2] text-[#9a4a1a]' },
  environnement: { icone: Leaf, classe: 'bg-[#e3f3ec] text-[#06573e]' },
  rehabilitation: { icone: School, classe: 'bg-[#ece8fb] text-[#4f3aa3]' },
  sinistres: { icone: CloudRain, classe: 'bg-[#e1f3f7] text-[#13647a]' },
}
export const styleType = (code?: string | null) => STYLES_TYPE[code ?? ''] ?? { icone: Sparkles, classe: 'bg-muted text-muted-foreground' }

export function IconeType({ code, className }: { code?: string | null; className?: string }) {
  const { icone: Icone, classe } = styleType(code)
  return (
    <span aria-hidden className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5', classe, className)}>
      <Icone />
    </span>
  )
}

/** Date façon calendrier : jour en grand, mois abrégé. */
export function BlocDate({ date, className }: { date: string; className?: string }) {
  const d = new Date(`${date}T00:00:00`)
  return (
    <span className={cn('inline-flex w-12 shrink-0 flex-col items-center overflow-hidden rounded-xl border border-border bg-card text-center shadow-carte', className)}>
      <span className="w-full bg-primary py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
        {d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}
      </span>
      <span className="py-1 font-heading text-lg font-semibold leading-none chiffres">{d.getDate()}</span>
    </span>
  )
}

const COULEURS_STATUT: Record<StatutAction, string> = {
  preparation: 'bg-muted text-muted-foreground [--point:#8a978f]',
  en_cours: 'bg-or-soft text-[#7a5600] [--point:#e9a812]',
  terminee: 'bg-[#e2f4e2] text-[#0b6b0b] [--point:#0ca30c]',
  annulee: 'bg-[#fbe6e6] text-[#a32b2b] [--point:#d03b3b]',
}

/** Statut d'une action : pastille avec point de couleur et libellé. */
export function StatutPastille({ statut, className }: { statut: StatutAction; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', COULEURS_STATUT[statut], className)}>
      <span className="size-1.5 rounded-full bg-[var(--point)]" />
      {LIBELLES_STATUT_ACTION[statut]}
    </span>
  )
}

/** Indicateur chiffré : icône teintée, valeur, libellé. */
export function Indicateur({ icone: Icone, valeur, libelle, detail, ton = 'vert' }: {
  icone: LucideIcon
  valeur: ReactNode
  libelle: string
  detail?: ReactNode
  ton?: 'vert' | 'or' | 'bleu' | 'rose'
}) {
  const tons = {
    vert: 'bg-[#e3f3ec] text-[#06573e]', or: 'bg-[#fdf3d8] text-[#7a5600]',
    bleu: 'bg-[#e6eefb] text-[#1f4e99]', rose: 'bg-[#fbe8ef] text-[#9b2c55]',
  }
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-carte">
      <span className={cn('inline-flex size-9 items-center justify-center rounded-lg [&_svg]:size-[18px]', tons[ton])}><Icone /></span>
      <div>
        <div className="font-heading text-2xl font-semibold leading-tight chiffres">{valeur ?? '…'}</div>
        <div className="text-[13px] text-muted-foreground">{libelle}</div>
        {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
      </div>
    </div>
  )
}

/** Titre de section, avec un lien ou un bouton à droite. */
export function Section({ titre, action, children, className }: { titre: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Liste encadrée : lignes séparées, coins arrondis. */
export function Liste({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card shadow-carte', className)}>{children}</div>
}

/** Squelette de chargement : quelques lignes grises animées. */
export function Squelette({ lignes = 5 }: { lignes?: number }) {
  return (
    <Liste>
      {Array.from({ length: lignes }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <span className="size-10 animate-pulse rounded-full bg-muted" />
          <span className="flex-1 space-y-2">
            <span className="block h-3.5 w-2/5 animate-pulse rounded bg-muted" />
            <span className="block h-3 w-3/5 animate-pulse rounded bg-muted/70" />
          </span>
        </div>
      ))}
    </Liste>
  )
}

/** Mention « dans X jours » / « il y a X jours » / « aujourd'hui ». */
export function Echeance({ date }: { date: string }) {
  const j = Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000)
  const texte = j === 0 ? "Aujourd'hui" : j === 1 ? 'Demain' : j > 0 ? `Dans ${j} j` : `Il y a ${-j} j`
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CalendarClock className="size-3.5" /> {texte}
    </span>
  )
}
