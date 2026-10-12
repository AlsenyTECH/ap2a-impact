import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, ArrowUpRight, Award, BadgeCheck, Droplets, Eye, GraduationCap, HandHeart, HeartPulse, Instagram,
  Landmark, Menu, Quote, ShieldCheck, Sparkles, Trophy, UsersRound, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import logo from '@/assets/logo_AP2A.jpeg'

/** Coordonnées publiques de l'association (à compléter par le bureau). */
const INSTAGRAM = 'https://www.instagram.com/ap2a_sn/'

/* ------------------------------------------------------------------ */
/* Petits outils d'animation                                          */
/* ------------------------------------------------------------------ */

/** Fait apparaître un bloc quand il entre à l'écran. */
function Apparait({ children, className, delai = 0 }: { children: ReactNode; className?: string; delai?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [vu, setVu] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVu(true); obs.disconnect() } }, { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return <div ref={ref} className={cn('vitrine-apparait', vu && 'visible', className)} style={{ transitionDelay: `${delai}ms` }}>{children}</div>
}

/** Nombre qui défile jusqu'à sa valeur quand il devient visible. */
function Compteur({ valeur, suffixe = '', duree = 1800 }: { valeur: number; suffixe?: string; duree?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      const debut = performance.now()
      const pas = (t: number) => {
        const p = Math.min(1, (t - debut) / duree)
        setN(Math.round(valeur * (1 - Math.pow(1 - p, 3))))
        if (p < 1) raf = requestAnimationFrame(pas)
      }
      raf = requestAnimationFrame(pas)
    }, { threshold: 0.4 })
    obs.observe(el)
    return () => { obs.disconnect(); cancelAnimationFrame(raf) }
  }, [valeur, duree])
  return <span ref={ref} className="tabular-nums">{n.toLocaleString('fr-FR')}{suffixe}</span>
}

/** Mots qui se succèdent dans le titre. */
function MotsAlternes({ mots }: { mots: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % mots.length), 2600); return () => clearInterval(t) }, [mots.length])
  return (
    <span className="relative inline-block min-w-[6.5ch] text-[#f2c14e]">
      <span key={i} className="inline-block" style={{ animation: 'vitrine-mot 2.6s ease-in-out both' }}>{mots[i]}</span>
    </span>
  )
}

/** Motif géométrique discret, inspiré des tissus wax. */
function Motif({ className, couleur = '#ffffff' }: { className?: string; couleur?: string }) {
  return (
    <svg aria-hidden className={className} width="100%" height="100%">
      <defs>
        <pattern id={`motif-${couleur.slice(1)}`} width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <circle cx="14" cy="14" r="3" fill={couleur} />
          <path d="M28 0 L56 28 L28 56 L0 28 Z" fill="none" stroke={couleur} strokeWidth="1" />
          <circle cx="42" cy="42" r="8" fill="none" stroke={couleur} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#motif-${couleur.slice(1)})`} />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Contenu (faits rapportés par la presse sénégalaise)                */
/* ------------------------------------------------------------------ */

const REPERES = [
  { valeur: 875, suffixe: '', libelle: 'personnes formées', detail: 'en 13 sessions de formation' },
  { valeur: 700, suffixe: '', libelle: 'femmes certifiées', detail: 'des groupements des Parcelles Assainies' },
  { valeur: 60, suffixe: '', libelle: 'groupements de femmes', detail: 'accompagnés et financés' },
  { valeur: 280, suffixe: '', libelle: 'personnes dépistées', detail: 'lors de la campagne contre la cataracte' },
]

const DOMAINES = [
  {
    icone: GraduationCap, titre: 'Formation professionnelle', couleur: '#0b7a57',
    texte: 'Des formations qualifiantes qui ouvrent un métier : électricité bâtiment, maintenance mécanique, plomberie… avec un titre de qualification et un kit pour démarrer.',
    chiffre: '50 jeunes', legende: 'formés et équipés de kits d\'insertion',
  },
  {
    icone: HandHeart, titre: 'Autonomie des femmes', couleur: '#b4561f',
    texte: 'Former, certifier et financer les groupements de femmes : la certification devient un passeport vers l\'autonomie financière.',
    chiffre: '700 femmes', legende: 'ont reçu leur attestation de formation',
  },
  {
    icone: HeartPulse, titre: 'Santé', couleur: '#a3264a',
    texte: 'Des campagnes de dépistage et de soins au plus près des habitants, en particulier des personnes âgées, avec prise en charge chirurgicale.',
    chiffre: '280 dépistés', legende: 'et 85 opérés de la cataracte en un week-end',
  },
  {
    icone: Trophy, titre: 'Jeunesse et sport', couleur: '#8a6a10',
    texte: 'Soutenir les associations sportives et culturelles (ASC) qui font vivre les quartiers et encadrent la jeunesse.',
    chiffre: '+20 M FCFA', legende: 'mobilisés pour le sport et l\'avenir de la jeunesse',
  },
  {
    icone: Droplets, titre: 'Cadre de vie', couleur: '#0b5cad',
    texte: 'Face aux inondations récurrentes : aide d\'urgence aux sinistrés, motopompes pour les unités, et concertation entre habitants et experts sur l\'assainissement.',
    chiffre: '50 motopompes', legende: 'remises pour lutter contre les inondations',
  },
  {
    icone: UsersRound, titre: 'Citoyenneté', couleur: '#4b3a8f',
    texte: 'Mobiliser les délégués de quartier, les associations et les habitants des vingt-six unités autour de projets communautaires concrets.',
    chiffre: 'Toutes les unités', legende: 'des Parcelles Assainies, et au-delà',
  },
]

const PARCOURS = [
  { quand: 'Les débuts', titre: 'Baccalauréat scientifique', texte: 'Au Groupe scolaire Marie Dior Sarr, à Dakar.' },
  { quand: 'Études en France', titre: 'Économie, banque et finance', texte: 'BTS banque-finance-assurance, licence d\'économie et finance à Paris 8, puis masters en économie internationale et en gestion des risques bancaires à l\'Université Sorbonne Paris Nord.' },
  { quand: 'Carrière', titre: 'De la banque au développement', texte: 'La Banque Postale, Société Générale, Crédit Agricole CIB, puis l\'Agence française de développement : gestion financière des projets, contrôle qualité, innovation financière.' },
  { quand: '12 mai 2024', titre: 'Une première historique', texte: 'Nommée Directrice de Cabinet adjointe du Président de la République : la première femme à occuper ce poste au Sénégal.' },
  { quand: 'Sur le terrain', titre: 'Fondatrice de l\'AP2A', texte: 'Elle porte l\'association aux Parcelles Assainies : formation, santé, autonomie des femmes, jeunesse et cadre de vie.' },
]

const METHODE = [
  { n: '01', titre: 'Identifier', texte: 'Repérer avec les quartiers les personnes, ménages et groupements qui en ont le plus besoin.' },
  { n: '02', titre: 'Former et équiper', texte: 'Formations certifiantes avec nos partenaires, kits d\'insertion, soins, financements.' },
  { n: '03', titre: 'Suivre', texte: 'Chaque bénéficiaire est suivi à 3, 6 et 12 mois : a-t-il trouvé un emploi, lancé son activité ?' },
  { n: '04', titre: 'Rendre compte', texte: 'Des rapports chiffrés et vérifiables pour nos partenaires et bailleurs.' },
]

interface Chiffres { actions: number; personnes: number; femmes: number; jeunes: number; certificats: number; kits: number; valeur_remise: number; seances: number; membres: number; partenaires: number }

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export function Vitrine({ connecte = false }: { connecte?: boolean }) {
  const [menu, setMenu] = useState(false)
  const [defile, setDefile] = useState(false)
  useEffect(() => {
    const f = () => setDefile(window.scrollY > 40)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  useEffect(() => { document.title = 'AP2A — Association Parcelles Assainies en Action' }, [])

  const { data: chiffres } = useQuery({
    queryKey: ['chiffres-publics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('chiffres_publics')
      if (error) throw error
      return data as Chiffres
    },
    staleTime: 5 * 60 * 1000,
  })
  const enDirect = chiffres ? ([
    [chiffres.personnes, 'personnes accompagnées'],
    [chiffres.actions, 'actions menées'],
    [chiffres.seances, 'séances de formation'],
    [chiffres.kits, 'kits remis'],
    [chiffres.certificats, 'certificats délivrés'],
    [chiffres.partenaires, 'partenaires'],
  ] as [number, string][]).filter(([n]) => n > 0) : []

  const liens: [string, string][] = [['#mission', 'Mission'], ['#actions', 'Nos actions'], ['#fondatrice', 'La fondatrice'], ['#methode', 'Notre méthode'], ['#rejoindre', 'Nous rejoindre']]
  const espace = connecte ? '/' : '/connexion'

  return (
    <div className="min-h-dvh scroll-smooth bg-[#fbfaf6] text-[#13211b] [font-feature-settings:'ss01']">
      {/* ---------------- Navigation ---------------- */}
      <header className={cn('fixed inset-x-0 top-0 z-50 transition-all duration-300', defile ? 'bg-[#0c2a20]/95 shadow-lg backdrop-blur' : 'bg-transparent')}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-3.5 md:px-8">
          <a href="#haut" className="flex items-center gap-2.5">
            <img src={logo} alt="" className="h-10 w-14 rounded-lg bg-white object-contain p-1" />
            <span className="leading-tight text-white">
              <span className="block font-heading text-lg font-bold tracking-tight">AP2A</span>
              <span className="hidden text-[11px] text-white/70 sm:block">Parcelles Assainies en Action</span>
            </span>
          </a>
          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            {liens.map(([h, l]) => <a key={h} href={h} className="rounded-full px-3.5 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white">{l}</a>)}
          </nav>
          <Link to={espace} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#f2c14e] px-4 py-2 text-sm font-semibold text-[#0c2a20] shadow transition hover:bg-[#ffd36b] lg:ml-3">
            {connecte ? 'Retour à l\'application' : 'Espace membres'} <ArrowRight className="size-4" />
          </Link>
          <button className="rounded-lg p-2 text-white lg:hidden" onClick={() => setMenu(!menu)} aria-label="Menu">{menu ? <X /> : <Menu />}</button>
        </div>
        {menu ? (
          <nav className="mx-4 mb-3 grid rounded-2xl bg-[#0c2a20] p-2 shadow-xl lg:hidden">
            {liens.map(([h, l]) => <a key={h} href={h} onClick={() => setMenu(false)} className="rounded-xl px-4 py-3 text-white/90 hover:bg-white/10">{l}</a>)}
          </nav>
        ) : null}
      </header>

      {/* ---------------- Accroche ---------------- */}
      <section id="haut" className="relative isolate overflow-hidden bg-[#0c2a20] text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,#0f7a56_0%,transparent_55%),radial-gradient(ellipse_at_bottom_left,#14523c_0%,transparent_60%)]" />
        <Motif className="absolute inset-0 -z-10 opacity-[0.06]" />
        <div className="vitrine-halo absolute -right-32 top-24 -z-10 size-[30rem] rounded-full bg-[#f2c14e]/20 blur-3xl" />
        <div className="vitrine-flotte absolute right-[8%] top-[22%] -z-10 hidden size-28 rounded-full border-[10px] border-[#f2c14e]/40 md:block" />
        <div className="vitrine-flotte absolute bottom-[18%] right-[30%] -z-10 hidden size-12 rotate-45 rounded-lg bg-[#f2c14e]/30 md:block" style={{ animationDelay: '-3s' }} />

        <div className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div>
            <Apparait>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur">
                <Sparkles className="size-3.5 text-[#f2c14e]" /> Association de développement communautaire · Dakar, Sénégal
              </span>
            </Apparait>
            <Apparait delai={120}>
              <h1 className="mt-6 font-heading text-white text-[2.6rem] font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                Ensemble, faire des Parcelles une cité où il fait <span className="text-[#f2c14e]">bon vivre</span>.
              </h1>
            </Apparait>
            <Apparait delai={240}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
                L'AP2A — Association Parcelles Assainies en Action — agit pour <b className="text-white">former, soigner et rendre autonomes</b> les jeunes,
                les femmes et les familles de la commune, avec des résultats mesurés et suivis dans la durée.
              </p>
            </Apparait>
            <Apparait delai={360}>
              <p className="mt-6 font-heading text-2xl font-semibold sm:text-3xl">
                Nous agissons pour <MotsAlternes mots={['former.', 'soigner.', 'équiper.', 'financer.', 'assainir.', 'rassembler.']} />
              </p>
            </Apparait>
            <Apparait delai={480} className="mt-9 flex flex-wrap gap-3">
              <a href="#rejoindre" className="inline-flex items-center gap-2 rounded-full bg-[#f2c14e] px-6 py-3.5 font-semibold text-[#0c2a20] shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-[#ffd36b]">
                Nous soutenir <HandHeart className="size-5" />
              </a>
              <a href="#actions" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3.5 font-semibold text-white transition hover:bg-white/10">
                Découvrir nos actions <ArrowRight className="size-5" />
              </a>
            </Apparait>
          </div>

          {/* Carte d'impact */}
          <Apparait delai={300}>
            <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-md md:p-8">
              <div className="absolute -top-4 left-8 rounded-full bg-[#f2c14e] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#0c2a20]">Notre impact</div>
              <div className="grid grid-cols-2 gap-5 pt-2">
                {REPERES.map((r) => (
                  <div key={r.libelle} className="rounded-2xl bg-white/[0.05] p-4">
                    <div className="font-heading text-4xl font-bold text-white md:text-5xl"><Compteur valeur={r.valeur} suffixe={r.suffixe} /></div>
                    <div className="mt-1 text-sm font-semibold text-[#f2c14e]">{r.libelle}</div>
                    <div className="mt-0.5 text-xs leading-snug text-white/60">{r.detail}</div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-[11px] text-white/45">Chiffres rapportés par la presse sénégalaise (APS, Dakaractu, PressAfrik), 2026.</p>
            </div>
          </Apparait>
        </div>

        {/* Bandeau défilant */}
        <div className="border-y border-white/10 bg-[#0a231b] py-4">
          <div className="flex overflow-hidden">
            <div className="vitrine-defile flex shrink-0 gap-10 whitespace-nowrap pr-10 font-heading text-lg font-semibold text-white/70">
              {[...Array(2)].flatMap((_, k) => ['Formation professionnelle', 'Autonomie des femmes', 'Santé de proximité', 'Jeunesse et sport', 'Lutte contre les inondations', 'Citoyenneté', 'Suivi des bénéficiaires'].map((t) => (
                <span key={`${k}-${t}`} className="inline-flex items-center gap-10">{t}<span className="size-2 rounded-full bg-[#f2c14e]" /></span>
              )))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Mission ---------------- */}
      <section id="mission" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 md:px-8 md:py-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <Apparait>
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-[#0b7a57]">Notre mission</span>
            <h2 className="mt-3 font-heading text-4xl font-bold leading-tight tracking-tight md:text-5xl">Donner à chacun les moyens de se prendre en main.</h2>
            <p className="mt-5 text-lg leading-relaxed text-[#3d4b44]">
              Aux Parcelles Assainies, l'AP2A mise sur la <b>formation professionnelle</b> et l'<b>autonomisation des jeunes, des femmes et des personnes
              vivant avec un handicap</b>, tout en améliorant le <b>cadre de vie</b> des familles. Son plan d'action couvre quatre piliers et s'étend
              désormais à d'autres communes.
            </p>
          </Apparait>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [HeartPulse, 'Santé', 'Dépistages, soins et prise en charge, au plus près des habitants.'],
              [GraduationCap, 'Éducation', 'Accompagner les élèves et les établissements du quartier.'],
              [Award, 'Formation', 'Des métiers concrets, des titres de qualification reconnus.'],
              [HandHeart, 'Autonomisation', 'Financements et kits pour lancer une activité génératrice de revenus.'],
            ].map(([Icone, t, d], i) => {
              const I = Icone as typeof HeartPulse
              return (
                <Apparait key={t as string} delai={i * 100}>
                  <div className="group h-full rounded-3xl border border-[#e2e6df] bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#0b7a57]/30 hover:shadow-xl">
                    <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#e8f4ee] text-[#0b7a57] transition group-hover:bg-[#0b7a57] group-hover:text-white"><I className="size-6" /></span>
                    <h3 className="mt-4 font-heading text-xl font-bold">{t as string}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-[#5c6b64]">{d as string}</p>
                  </div>
                </Apparait>
              )
            })}
          </div>
        </div>
      </section>

      {/* ---------------- Actions ---------------- */}
      <section id="actions" className="scroll-mt-20 bg-[#f1f5f0] py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Apparait className="max-w-2xl">
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-[#0b7a57]">Nos actions</span>
            <h2 className="mt-3 font-heading text-4xl font-bold leading-tight tracking-tight md:text-5xl">Sur le terrain, des résultats concrets.</h2>
            <p className="mt-4 text-lg text-[#3d4b44]">Six domaines d'intervention, une même exigence : que chaque action change durablement une vie.</p>
          </Apparait>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {DOMAINES.map((d, i) => (
              <Apparait key={d.titre} delai={(i % 3) * 110}>
                <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-white p-7 shadow-sm ring-1 ring-black/5 transition duration-300 hover:-translate-y-1.5 hover:shadow-2xl">
                  <div className="absolute -right-10 -top-10 size-36 rounded-full opacity-10 transition-transform duration-500 group-hover:scale-125" style={{ background: d.couleur }} />
                  <span className="inline-flex size-12 items-center justify-center rounded-2xl text-white shadow-md" style={{ background: d.couleur }}><d.icone className="size-6" /></span>
                  <h3 className="mt-5 font-heading text-2xl font-bold">{d.titre}</h3>
                  <p className="mt-2 flex-1 leading-relaxed text-[#5c6b64]">{d.texte}</p>
                  <div className="mt-6 border-t border-[#eef1ec] pt-4">
                    <div className="font-heading text-3xl font-bold" style={{ color: d.couleur }}>{d.chiffre}</div>
                    <div className="text-sm text-[#5c6b64]">{d.legende}</div>
                  </div>
                </article>
              </Apparait>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Fondatrice ---------------- */}
      <section id="fondatrice" className="relative isolate scroll-mt-20 overflow-hidden bg-[#0c2a20] py-20 text-white md:py-28">
        <Motif className="absolute inset-0 -z-10 opacity-[0.05]" couleur="#f2c14e" />
        <div className="mx-auto grid max-w-7xl gap-14 px-5 md:px-8 lg:grid-cols-[0.9fr_1.1fr]">
          <Apparait className="lg:sticky lg:top-24 lg:self-start">
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-[#f2c14e]">La fondatrice</span>
            <h2 className="mt-3 font-heading text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">Fatou Kiné Diakhaté</h2>
            <p className="mt-2 text-lg text-white/75">Première femme Directrice de Cabinet adjointe du Président de la République du Sénégal</p>

            {/* Portrait typographique */}
            <div className="relative mt-10 aspect-[4/5] max-w-sm overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0f7a56] via-[#0b5c42] to-[#0a231b] shadow-2xl ring-1 ring-white/10">
              <Motif className="absolute inset-0 opacity-10" couleur="#f2c14e" />
              <div className="vitrine-halo absolute left-1/2 top-1/3 size-56 -translate-x-1/2 rounded-full bg-[#f2c14e]/25 blur-2xl" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="flex size-40 items-center justify-center rounded-full border-4 border-[#f2c14e] bg-[#0c2a20]/60 font-heading text-6xl font-bold tracking-tight text-[#f2c14e] shadow-xl">FKD</div>
                <div className="mt-6 text-center">
                  <div className="font-heading text-xl font-semibold">Fatou Kiné Diakhaté</div>
                  <div className="text-sm text-white/70">Fondatrice de l'AP2A</div>
                </div>
              </div>
              <div className="absolute bottom-5 left-5 right-5 flex items-center gap-2 rounded-2xl bg-black/30 px-4 py-3 text-xs backdrop-blur">
                <Landmark className="size-4 shrink-0 text-[#f2c14e]" /> Nommée le 12 mai 2024 — une première dans l'histoire du Sénégal
              </div>
            </div>
          </Apparait>

          <div>
            <Apparait>
              <figure className="relative rounded-[2rem] bg-white/[0.06] p-8 ring-1 ring-white/10 md:p-10">
                <Quote className="absolute -top-5 left-8 size-10 rounded-xl bg-[#f2c14e] p-2 text-[#0c2a20]" />
                <blockquote className="font-heading text-2xl font-semibold leading-snug md:text-3xl">
                  « Refaire des Parcelles cette cité assainie où il fait bon vivre. »
                </blockquote>
                <figcaption className="mt-4 text-sm text-white/65">L'ambition portée par Fatou Kiné Diakhaté pour la commune (PressAfrik, 2026).</figcaption>
              </figure>
            </Apparait>
            <Apparait delai={100}>
              <p className="mt-8 text-lg leading-relaxed text-white/80">
                Économiste et financière de formation, passée par de grandes banques françaises puis par l'Agence française de développement,
                Fatou Kiné Diakhaté met son expertise du financement de projets au service de sa commune. Femme de terrain, elle est aux côtés
                des familles sinistrées lors des inondations, des femmes qui reçoivent leur certification, des jeunes qui démarrent leur métier.
              </p>
            </Apparait>
            <ol className="relative mt-10 space-y-7 border-l-2 border-white/15 pl-8">
              {PARCOURS.map((p, i) => (
                <Apparait key={p.titre} delai={i * 90}>
                  <li className="relative">
                    <span className="absolute -left-[41px] top-1 flex size-5 items-center justify-center rounded-full bg-[#f2c14e] ring-4 ring-[#0c2a20]"><span className="size-1.5 rounded-full bg-[#0c2a20]" /></span>
                    <div className="text-xs font-bold uppercase tracking-wider text-[#f2c14e]">{p.quand}</div>
                    <div className="mt-0.5 font-heading text-xl font-semibold">{p.titre}</div>
                    <p className="mt-1 leading-relaxed text-white/70">{p.texte}</p>
                  </li>
                </Apparait>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---------------- Méthode ---------------- */}
      <section id="methode" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 md:px-8 md:py-28">
        <Apparait className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-bold uppercase tracking-[0.18em] text-[#0b7a57]">Notre méthode</span>
          <h2 className="mt-3 font-heading text-4xl font-bold leading-tight tracking-tight md:text-5xl">Transparence et suivi, à chaque étape.</h2>
          <p className="mt-4 text-lg text-[#3d4b44]">
            Chaque action, chaque bénéficiaire et chaque franc remis sont enregistrés dans notre application de suivi.
            Nos partenaires savent précisément ce que devient leur soutien.
          </p>
        </Apparait>
        <div className="mt-14 grid gap-5 md:grid-cols-4">
          {METHODE.map((m, i) => (
            <Apparait key={m.n} delai={i * 120}>
              <div className="relative h-full rounded-3xl border border-[#e2e6df] bg-white p-7">
                <div className="font-heading text-5xl font-bold text-[#e8f4ee]">{m.n}</div>
                <h3 className="mt-2 font-heading text-xl font-bold">{m.titre}</h3>
                <p className="mt-2 leading-relaxed text-[#5c6b64]">{m.texte}</p>
                {i < METHODE.length - 1 ? <ArrowRight className="absolute -right-4 top-1/2 hidden size-7 -translate-y-1/2 rounded-full bg-[#0b7a57] p-1.5 text-white md:block" /> : null}
              </div>
            </Apparait>
          ))}
        </div>

        {enDirect.length ? (
          <Apparait className="mt-14">
            <div className="rounded-[2rem] bg-gradient-to-br from-[#0b7a57] to-[#0c2a20] p-8 text-white md:p-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#f2c14e]"><span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#f2c14e] opacity-75" /><span className="relative inline-flex size-2.5 rounded-full bg-[#f2c14e]" /></span> En direct de notre application</div>
                  <h3 className="mt-1 font-heading text-2xl font-bold text-white md:text-3xl">L'impact suivi au jour le jour</h3>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs"><Eye className="size-3.5" /> Totaux anonymes, mis à jour en temps réel</div>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
                {enDirect.map(([n, l]) => (
                  <div key={l}>
                    <div className="font-heading text-4xl font-bold"><Compteur valeur={n} /></div>
                    <div className="text-sm text-white/70">{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </Apparait>
        ) : null}
      </section>

      {/* ---------------- Nous rejoindre ---------------- */}
      <section id="rejoindre" className="scroll-mt-20 bg-[#f1f5f0] py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Apparait className="max-w-2xl">
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-[#0b7a57]">Agir avec nous</span>
            <h2 className="mt-3 font-heading text-4xl font-bold leading-tight tracking-tight md:text-5xl">Chacun peut faire avancer les Parcelles.</h2>
          </Apparait>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              [UsersRound, 'Devenir membre', 'Rejoignez une équipe engagée et participez aux actions sur le terrain.', 'Écrire à l\'AP2A'],
              [ShieldCheck, 'Devenir partenaire', 'Centres de formation, structures de santé, entreprises : construisons ensemble des programmes mesurables.', 'Proposer un partenariat'],
              [HandHeart, 'Soutenir un projet', 'Un kit, une formation, une opération : votre soutien est suivi et vous en recevez le rapport.', 'Nous contacter'],
            ].map(([Icone, t, d, cta], i) => {
              const I = Icone as typeof UsersRound
              return (
                <Apparait key={t as string} delai={i * 110}>
                  <div className="flex h-full flex-col rounded-3xl bg-white p-7 shadow-sm ring-1 ring-black/5">
                    <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#0c2a20] text-[#f2c14e]"><I className="size-6" /></span>
                    <h3 className="mt-5 font-heading text-2xl font-bold">{t as string}</h3>
                    <p className="mt-2 flex-1 leading-relaxed text-[#5c6b64]">{d as string}</p>
                    <a href={INSTAGRAM} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-[#0b7a57] hover:gap-2.5">{cta as string} <ArrowUpRight className="size-4" /></a>
                  </div>
                </Apparait>
              )
            })}
          </div>

          <Apparait className="mt-10">
            <a href={INSTAGRAM} target="_blank" rel="noreferrer"
              className="group flex flex-col items-start justify-between gap-5 overflow-hidden rounded-[2rem] bg-gradient-to-r from-[#833ab4] via-[#e1306c] to-[#f77737] p-8 text-white shadow-xl md:flex-row md:items-center md:p-10">
              <div className="flex items-center gap-4">
                <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-white/20"><Instagram className="size-7" /></span>
                <div>
                  <div className="font-heading text-2xl font-bold md:text-3xl">Suivez-nous sur Instagram</div>
                  <div className="text-white/85">@ap2a_sn — nos actions en images, au fil des jours</div>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-semibold text-[#c13584] transition group-hover:gap-3">Voir le compte <ArrowUpRight className="size-5" /></span>
            </a>
          </Apparait>
        </div>
      </section>

      {/* ---------------- Pied de page ---------------- */}
      <footer className="bg-[#0a231b] text-white/70">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[1.5fr_1fr_1fr] md:px-8">
          <div>
            <div className="flex items-center gap-3">
              <img src={logo} alt="" className="h-11 w-14 rounded-lg bg-white object-contain p-1" />
              <div>
                <div className="font-heading text-lg font-bold text-white">AP2A</div>
                <div className="text-sm">Association Parcelles Assainies en Action</div>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed">Parcelles Assainies, Dakar — Sénégal. Formation, santé, autonomie des femmes, jeunesse et cadre de vie.</p>
          </div>
          <div className="text-sm">
            <div className="mb-3 font-semibold text-white">L'association</div>
            {liens.map(([h, l]) => <a key={h} href={h} className="block py-1 hover:text-white">{l}</a>)}
          </div>
          <div className="text-sm">
            <div className="mb-3 font-semibold text-white">Accès</div>
            <Link to={espace} className="flex items-center gap-1.5 py-1 hover:text-white"><BadgeCheck className="size-4" /> {connecte ? 'Retour à l\'application' : 'Espace membres et partenaires'}</Link>
            <a href={INSTAGRAM} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 py-1 hover:text-white"><Instagram className="size-4" /> Instagram</a>
          </div>
        </div>
        <div className="border-t border-white/10 px-5 py-5 text-center text-xs text-white/45">
          © {new Date().getFullYear()} AP2A — Association Parcelles Assainies en Action. Les données personnelles des bénéficiaires ne sont jamais publiées.
        </div>
      </footer>
    </div>
  )
}
