import { NavLink, Outlet } from 'react-router-dom'
import { Handshake, Home, LogOut, Target, UsersRound, CalendarCheck } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { LIBELLES_ROLE } from '@/lib/format'
import { cn } from '@/lib/utils'
import logo from '@/assets/logo_AP2A.jpeg'

const LIENS = [
  { vers: '/', libelle: 'Accueil', icone: Home },
  { vers: '/cibles', libelle: 'Cibles', icone: Target },
  { vers: '/actions', libelle: 'Actions', icone: CalendarCheck },
  { vers: '/membres', libelle: 'Membres', icone: UsersRound },
  { vers: '/partenaires', libelle: 'Partenaires', icone: Handshake },
]

/** Barre latérale sur ordinateur, barre du bas sur téléphone. */
export function Layout() {
  const { membre, deconnecter } = useAuth()
  return (
    <div className="min-h-dvh bg-background md:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-2 p-4">
          <img src={logo} alt="" className="h-10 w-14 rounded object-contain" />
          <span className="font-bold">AP2A</span>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {LIENS.map(({ vers, libelle, icone: Icone }) => (
            <NavLink
              key={vers}
              to={vers}
              end={vers === '/'}
              className={({ isActive }) =>
                cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm', isActive ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-muted')
              }
            >
              <Icone className="size-4" /> {libelle}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-sm">
          <div className="font-medium">{membre?.prenom} {membre?.nom}</div>
          <div className="text-xs text-muted-foreground">{membre ? LIBELLES_ROLE[membre.role] : ''}</div>
          <button onClick={deconnecter} className="mt-2 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <LogOut className="size-3.5" /> Se déconnecter
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card px-4 py-2 md:hidden">
        <div className="flex items-center gap-2">
          <img src={logo} alt="" className="h-8 w-11 rounded object-contain" />
          <span className="font-bold">AP2A</span>
        </div>
        <button onClick={deconnecter} aria-label="Se déconnecter" className="p-2 text-muted-foreground">
          <LogOut className="size-5" />
        </button>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-8 md:pt-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {LIENS.map(({ vers, libelle, icone: Icone }) => (
          <NavLink
            key={vers}
            to={vers}
            end={vers === '/'}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'text-primary' : 'text-muted-foreground')
            }
          >
            <Icone className="size-5" /> {libelle}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
