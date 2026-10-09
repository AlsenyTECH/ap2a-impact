import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, CalendarCheck, Handshake, Home, ListChecks, LogOut, Menu, Shapes, Target, UsersRound, X } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { LIBELLES_ROLE } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/design'
import logo from '@/assets/logo_AP2A.jpeg'

const GROUPES = [
  {
    titre: 'Pilotage',
    liens: [
      { vers: '/', libelle: 'Accueil', icone: Home },
      { vers: '/actions', libelle: 'Actions', icone: CalendarCheck },
      { vers: '/suivis', libelle: 'Suivis', icone: ListChecks },
      { vers: '/impact', libelle: 'Impact', icone: BarChart3 },
    ],
  },
  {
    titre: 'Répertoire',
    liens: [
      { vers: '/cibles', libelle: 'Cibles', icone: Target },
      { vers: '/membres', libelle: 'Membres', icone: UsersRound },
      { vers: '/partenaires', libelle: 'Partenaires', icone: Handshake },
    ],
  },
  { titre: 'Réglages', liens: [{ vers: '/categories', libelle: 'Catégories', icone: Shapes }] },
]
const TOUS = GROUPES.flatMap((g) => g.liens)
// Barre du bas sur téléphone : les 5 écrans du quotidien.
const BAS = ['/', '/cibles', '/actions', '/suivis', '/impact'].map((v) => TOUS.find((l) => l.vers === v)!)

export function Layout() {
  const { membre, deconnecter } = useAuth()
  const [menu, setMenu] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => { setMenu(false); window.scrollTo(0, 0) }, [pathname])

  return (
    <div className="min-h-dvh bg-background md:flex">
      {/* Ordinateur : barre latérale */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-5 pb-6 pt-6">
          <img src={logo} alt="" className="h-10 w-14 rounded-lg bg-white object-contain p-1" />
          <div className="leading-tight">
            <div className="font-heading text-lg font-semibold">AP2A</div>
            <div className="text-[11px] text-sidebar-muted">Parcelles Assainies en Action</div>
          </div>
        </div>
        <nav className="defilement-fin flex-1 space-y-6 overflow-y-auto px-3">
          {GROUPES.map((g) => (
            <div key={g.titre}>
              <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted/80">{g.titre}</div>
              <div className="space-y-0.5">
                {g.liens.map(({ vers, libelle, icone: Icone }) => (
                  <NavLink
                    key={vers}
                    to={vers}
                    end={vers === '/'}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive ? 'bg-sidebar-active text-white' : 'text-sidebar-foreground/75 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-or" /> : null}
                        <Icone className={cn('size-[18px]', isActive ? 'text-or' : 'text-sidebar-muted group-hover:text-white')} />
                        {libelle}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="m-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
          {membre ? <Avatar prenom={membre.prenom} nom={membre.nom} taille="sm" /> : null}
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{membre?.prenom} {membre?.nom}</div>
            <div className="text-[11px] text-sidebar-muted">{membre ? LIBELLES_ROLE[membre.role] : ''}</div>
          </div>
          <button onClick={deconnecter} title="Se déconnecter" className="rounded-lg p-2 text-sidebar-muted hover:bg-white/10 hover:text-white">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Téléphone : barre du haut */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/85 px-4 py-2.5 backdrop-blur-md md:hidden">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="" className="h-8 w-11 rounded-md bg-white object-contain" />
          <span className="font-heading text-lg font-semibold">AP2A</span>
        </div>
        <button onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu} className="-mr-2 rounded-lg p-2 text-muted-foreground hover:bg-muted">
          {menu ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        {menu ? (
          <>
            <div className="fixed inset-0 top-[57px] bg-black/20" onClick={() => setMenu(false)} />
            <div className="absolute right-3 top-full mt-2 w-64 animate-apparition rounded-2xl border border-border bg-popover p-2 shadow-haute">
              <div className="flex items-center gap-3 border-b border-border px-2 pb-3 pt-1">
                {membre ? <Avatar prenom={membre.prenom} nom={membre.nom} taille="sm" /> : null}
                <div className="leading-tight">
                  <div className="text-sm font-semibold">{membre?.prenom} {membre?.nom}</div>
                  <div className="text-xs text-muted-foreground">{membre ? LIBELLES_ROLE[membre.role] : ''}</div>
                </div>
              </div>
              <div className="py-1">
                {TOUS.filter((l) => !BAS.includes(l)).map(({ vers, libelle, icone: Icone }) => (
                  <NavLink key={vers} to={vers} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">
                    <Icone className="size-[18px] text-muted-foreground" /> {libelle}
                  </NavLink>
                ))}
              </div>
              <button onClick={deconnecter} className="flex w-full items-center gap-3 rounded-lg border-t border-border px-3 py-2.5 text-sm font-medium text-destructive hover:bg-muted">
                <LogOut className="size-[18px]" /> Se déconnecter
              </button>
            </div>
          </>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 animate-apparition px-4 pb-28 pt-5 md:px-10 md:pb-12 md:pt-9" key={pathname}>
        <Outlet />
      </main>

      {/* Téléphone : barre du bas */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5">
          {BAS.map(({ vers, libelle, icone: Icone }) => (
            <NavLink key={vers} to={vers} end={vers === '/'} className="flex flex-col items-center gap-1 py-2">
              {({ isActive }) => (
                <>
                  <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive ? 'bg-primary-soft text-primary' : 'text-muted-foreground')}>
                    <Icone className="size-5" />
                  </span>
                  <span className={cn('text-[11px]', isActive ? 'font-semibold text-primary' : 'text-muted-foreground')}>{libelle}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
