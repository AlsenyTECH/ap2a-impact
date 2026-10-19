import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SITUATIONS } from '@/lib/format'
import type { Situation } from '@/lib/types'
import { cn } from '@/lib/utils'
import logo from '@/assets/logo_AP2A.jpeg'

/**
 * Page de rapport au format A4 : barre d'outils (masquée à l'impression),
 * en-tête de l'association, contenu, pied de page daté. « Imprimer » ouvre
 * la fenêtre d'impression, qui permet aussi d'enregistrer en PDF.
 */
export function PageRapport({ retour, titre, sousTitre, outils, auteur, pied, children }: {
  retour: string
  titre: string
  sousTitre?: ReactNode
  outils?: ReactNode
  auteur?: string
  /** Remplace le texte du pied de page. */
  pied?: ReactNode
  children: ReactNode
}) {
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div className="clair min-h-dvh bg-[#e9ebe6] pb-10 print:bg-white print:pb-0">
      <div className="no-print sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2 px-4 py-3">
          <Button asChild variant="ghost" size="sm"><Link to={retour}><ArrowLeft /> Retour</Link></Button>
          <div className="flex-1" />
          {outils}
          <Button size="sm" onClick={() => window.print()}><Printer /> Imprimer / PDF</Button>
        </div>
      </div>
      <article className="rapport mx-auto mt-6 max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[13px] leading-relaxed text-[#13211b] shadow-haute">
        <div className="flex items-start justify-between gap-6 border-b-2 border-[#0b7a57] pb-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="AP2A" className="h-12 w-auto" />
            <div className="leading-tight">
              <div className="font-heading text-base font-semibold">Association Parcelles Assainies en Action</div>
              <div className="text-xs text-[#5c6b64]">Parcelles Assainies, Dakar — Sénégal</div>
            </div>
          </div>
          <div className="text-right text-xs text-[#5c6b64]">Établi le<br /><b className="text-[#13211b]">{aujourdhui}</b></div>
        </div>
        <div className="mt-6">
          <h1 className="font-heading text-[22px] font-semibold leading-tight">{titre}</h1>
          {sousTitre ? <div className="mt-1 text-[#5c6b64]">{sousTitre}</div> : null}
        </div>
        <div className="mt-6 space-y-7">{children}</div>
        <footer className="mt-10 flex items-end justify-between gap-6 border-t border-[#e2e6df] pt-4 text-xs text-[#5c6b64]">
          <div>{pied ?? <>Rapport généré avec l'application AP2A{auteur ? ` par ${auteur}` : ''}.<br />Les données personnelles des bénéficiaires restent confidentielles.</>}</div>
          <div className="w-48 text-center">
            <div className="h-10" />
            <div className="border-t border-[#13211b]/40 pt-1">Signature et cachet</div>
          </div>
        </footer>
      </article>
    </div>
  )
}

export function TitreSection({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 border-l-4 border-[#e9a812] pl-2.5 font-heading text-[15px] font-semibold">{children}</h2>
}

/** Rangée de chiffres clés. */
export function Chiffres({ elements }: { elements: { valeur: ReactNode; libelle: string; detail?: string }[] }) {
  return (
    <div className={cn('grid gap-2', elements.length >= 4 ? 'grid-cols-4' : 'grid-cols-3')}>
      {elements.map((e) => (
        <div key={e.libelle} className="rounded-lg bg-[#f1f6f3] px-3 py-2.5">
          <div className={cn('font-heading font-semibold leading-tight chiffres text-[#06573e]', String(e.valeur).length > 9 ? 'text-[15px]' : 'text-xl')}>{e.valeur}</div>
          <div className="text-[11px] leading-snug text-[#3d4b44]">{e.libelle}</div>
          {e.detail ? <div className="text-[10px] text-[#5c6b64]">{e.detail}</div> : null}
        </div>
      ))}
    </div>
  )
}

/** Barres horizontales simples (répartitions). */
export function Barres({ lignes, unite = '' }: { lignes: { libelle: string; valeur: number; couleur?: string }[]; unite?: string }) {
  const max = Math.max(1, ...lignes.map((l) => l.valeur))
  const total = lignes.reduce((s, l) => s + l.valeur, 0)
  return (
    <div className="space-y-1.5">
      {lignes.map((l) => (
        <div key={l.libelle} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-[#3d4b44]">{l.libelle}</span>
          <span className="h-3 rounded-sm bg-[#eef1ec]">
            <span className="block h-full rounded-sm" style={{ width: `${(100 * l.valeur) / max}%`, background: l.couleur ?? '#0b7a57' }} />
          </span>
          <span className="w-24 text-right chiffres">
            <b>{l.valeur.toLocaleString('fr-FR')}</b>{unite}{total && !unite ? <span className="text-[#5c6b64]"> · {Math.round((100 * l.valeur) / total)} %</span> : null}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Répartition des situations au dernier suivi (barre empilée + légende chiffrée). */
export function Situations({ compte }: { compte: Record<Situation, number> }) {
  const total = Object.values(compte).reduce((s, n) => s + n, 0)
  if (!total) return <p className="text-xs text-[#5c6b64]">Aucun suivi réalisé pour le moment.</p>
  return (
    <div>
      <div className="flex h-4 gap-[2px] overflow-hidden rounded">
        {SITUATIONS.filter((s) => compte[s.valeur]).map((s) => (
          <span key={s.valeur} style={{ width: `${(100 * compte[s.valeur]) / total}%`, background: s.couleur }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {SITUATIONS.map((s) => (
          <span key={s.valeur} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.couleur }} />
            {s.libelle} : <b>{compte[s.valeur]}</b> ({Math.round((100 * compte[s.valeur]) / total)} %)
          </span>
        ))}
      </div>
    </div>
  )
}

/** Tableau de rapport, lignes fines. */
export function Tableau({ entetes, lignes, alignDroite = [] }: { entetes: string[]; lignes: ReactNode[][]; alignDroite?: number[] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-[#f1f6f3] text-left">
          {entetes.map((e, i) => <th key={e} className={cn('border-b border-[#cfd8d2] px-2 py-1.5 font-semibold', alignDroite.includes(i) && 'text-right')}>{e}</th>)}
        </tr>
      </thead>
      <tbody>
        {lignes.map((l, i) => (
          <tr key={i} className="border-b border-[#eef1ec]">
            {l.map((c, j) => <td key={j} className={cn('px-2 py-1.5 align-top', alignDroite.includes(j) && 'text-right chiffres')}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Statistiques sur les personnes : sexe et tranches d'âge. */
export function profilPersonnes(personnes: { sexe: 'F' | 'M' | null; date_naissance: string | null }[]) {
  const age = (d: string) => Math.floor((Date.now() - new Date(`${d}T00:00:00`).getTime()) / 31_557_600_000)
  const tranches = { 'Enfants (< 15 ans)': 0, 'Jeunes (15-35 ans)': 0, 'Adultes (36-59 ans)': 0, 'Seniors (60 ans et +)': 0, 'Âge non renseigné': 0 }
  for (const p of personnes) {
    if (!p.date_naissance) tranches['Âge non renseigné']++
    else {
      const a = age(p.date_naissance)
      tranches[a < 15 ? 'Enfants (< 15 ans)' : a <= 35 ? 'Jeunes (15-35 ans)' : a < 60 ? 'Adultes (36-59 ans)' : 'Seniors (60 ans et +)']++
    }
  }
  return {
    femmes: personnes.filter((p) => p.sexe === 'F').length,
    hommes: personnes.filter((p) => p.sexe === 'M').length,
    jeunes: tranches['Jeunes (15-35 ans)'],
    tranches: Object.entries(tranches).filter(([k, n]) => n || k !== 'Âge non renseigné').map(([libelle, valeur]) => ({ libelle, valeur })),
  }
}

export function mediane(valeurs: number[]) {
  if (!valeurs.length) return null
  const v = [...valeurs].sort((x, y) => x - y)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2)
}
