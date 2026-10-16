/** Thèmes de l'application : le vert d'origine, ou le bleu du logo AP2A. */
export type Theme = 'parcelles' | 'ap2a'

export const THEMES: { id: Theme; nom: string; description: string; couleurs: string[] }[] = [
  { id: 'parcelles', nom: 'Vert des Parcelles', description: "Le thème d'origine : vert profond et touche d'or.", couleurs: ['#0c2a20', '#0b7a57', '#e3f3ec', '#e9a812'] },
  { id: 'ap2a', nom: 'Bleu AP2A', description: 'Les couleurs du logo : bleu franc, ruban cyan, bleu nuit.', couleurs: ['#032d45', '#0770aa', '#e3f2fb', '#00b0e0'] },
]

const CLE = 'ap2a-theme'
const BARRE: Record<Theme, string> = { parcelles: '#0c2a20', ap2a: '#032d45' }

export function themeEnregistre(): Theme {
  try {
    const t = localStorage.getItem(CLE)
    return t === 'ap2a' ? 'ap2a' : 'parcelles'
  } catch {
    return 'parcelles'
  }
}

/** Applique le thème à toute la page (et à la barre du navigateur sur téléphone). */
export function appliquerTheme(t: Theme) {
  const racine = document.documentElement
  if (t === 'parcelles') racine.removeAttribute('data-theme')
  else racine.setAttribute('data-theme', t)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BARRE[t])
  try { localStorage.setItem(CLE, t) } catch { /* stockage indisponible */ }
}
