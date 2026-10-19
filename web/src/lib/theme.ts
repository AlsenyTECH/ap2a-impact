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
// Les choix sont gardés sur le téléphone ; la fiche du membre les suit d'un appareil à l'autre.
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
  if (!(await supabase.auth.getSession()).data.session) return null   // visiteur de la page publique
  const { error } = await supabase.rpc('choisir_theme', { p_theme: t })
  return error
}

/** Mode clair ou sombre ; « auto » suit le réglage du téléphone. */
export type Mode = 'clair' | 'sombre' | 'auto'
export const MODES: [Mode, string][] = [['clair', 'Clair'], ['sombre', 'Sombre'], ['auto', 'Comme le téléphone']]
const CLE_MODE = 'ap2a-mode'
const prefereSombre = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
let modeCourant: Mode = 'clair'

export function modeEnregistre(): Mode {
  try {
    const m = localStorage.getItem(CLE_MODE)
    return m === 'sombre' || m === 'auto' ? m : 'clair'
  } catch {
    return 'clair'
  }
}

export function appliquerMode(m: Mode, garder = false) {
  modeCourant = m
  const sombre = m === 'sombre' || (m === 'auto' && prefereSombre())
  if (sombre) document.documentElement.setAttribute('data-mode', 'sombre')
  else document.documentElement.removeAttribute('data-mode')
  if (garder) try { localStorage.setItem(CLE_MODE, m) } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(EVENEMENT))
}
// En « auto », on suit le téléphone quand il change de réglage.
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (modeCourant === 'auto') appliquerMode('auto') })

export async function choisirMode(m: Mode) {
  appliquerMode(m, true)
  if (!(await supabase.auth.getSession()).data.session) return null
  const { error } = await supabase.rpc('choisir_mode', { p_mode: m })
  return error
}

/** Le mode choisi et s'il est sombre en ce moment. */
export function useMode() {
  const lire = () => ({ mode: modeCourant, sombre: document.documentElement.getAttribute('data-mode') === 'sombre' })
  const [etat, setEtat] = useState(lire)
  useEffect(() => {
    const maj = () => setEtat(lire())
    window.addEventListener(EVENEMENT, maj)
    return () => window.removeEventListener(EVENEMENT, maj)
  }, [])
  return etat
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
