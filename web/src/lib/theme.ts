import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Thèmes de l'application : le bleu du logo AP2A (par défaut), ou le vert d'origine. */
export type Theme = 'parcelles' | 'ap2a'

export const THEMES: { id: Theme; nom: string; description: string; couleurs: string[] }[] = [
  { id: 'ap2a', nom: 'Bleu AP2A', description: 'Les couleurs du logo : bleu franc, ruban cyan, bleu nuit.', couleurs: ['#032d45', '#0770aa', '#e3f2fb', '#00b0e0'] },
  { id: 'parcelles', nom: 'Vert des Parcelles', description: "Le thème d'origine : vert profond et touche d'or.", couleurs: ['#0c2a20', '#0b7a57', '#e3f3ec', '#e9a812'] },
]

const CLE = 'ap2a-theme-choisi'
const BARRE: Record<Theme, string> = { parcelles: '#0c2a20', ap2a: '#032d45' }
const EVENEMENT = 'ap2a-theme'

/** Le thème choisi sur cet appareil, ou le bleu AP2A par défaut. */
export function themeEnregistre(): Theme {
  try {
    return localStorage.getItem(CLE) === 'parcelles' ? 'parcelles' : 'ap2a'
  } catch {
    return 'ap2a'
  }
}

export function themeActuel(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'ap2a' ? 'ap2a' : 'parcelles'
}

/** Applique le thème à toute la page (et à la barre du navigateur sur téléphone). */
export function appliquerTheme(t: Theme, garder = false) {
  const racine = document.documentElement
  if (t === 'parcelles') racine.removeAttribute('data-theme')
  else racine.setAttribute('data-theme', t)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BARRE[t])
  if (garder) try { localStorage.setItem(CLE, t) } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(EVENEMENT))
}

/** Choix du membre : appliqué, gardé sur l'appareil et sur sa fiche (il le suit partout). */
export async function choisirTheme(t: Theme) {
  appliquerTheme(t, true)
  const { error } = await supabase.rpc('choisir_theme', { p_theme: t })
  return error
}

/** Le thème affiché, tenu à jour quand il change. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(themeActuel())
  useEffect(() => {
    const maj = () => setTheme(themeActuel())
    window.addEventListener(EVENEMENT, maj)
    return () => window.removeEventListener(EVENEMENT, maj)
  }, [])
  return theme
}
