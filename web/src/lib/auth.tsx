import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { oublierLien, supabase } from './supabase'
import { client, persister } from './cache'
import { nbEnAttente, viderHorsLigne } from './horsligne'
import { roleA, roleDuMembre, type Permission } from './droits'
import { noterActivite, noterMotif, oublierActivite, sessionExpiree } from './session'
import { appliquerMode, appliquerTheme } from './theme'
import type { Membre } from './types'

interface Auth {
  session: Session | null
  membre: Membre | null
  chargement: boolean
  /** Le membre a ce droit (selon son rôle). */
  peut: (p: Permission) => boolean
  /** Le membre a au moins un de ces droits. */
  peutUn: (...p: Permission[]) => boolean
  /** Relit sa fiche (après un changement de son rôle). */
  recharger: () => void
  deconnecter: () => Promise<void>
  /** Niveau de la session : « aal2 » une fois le code de double authentification validé. */
  aal: { actuel: string; suivant: string } | null
  rechargerAal: () => void
  /** Session expirée alors que des saisies hors ligne attendent : écran verrouillé, mot de passe demandé. */
  verrouille: boolean
  deverrouiller: (motDePasse: string) => Promise<string | null>
}

const Contexte = createContext<Auth | null>(null)

/** Efface tout ce que l'application garde dans l'appareil, puis ferme la session. */
async function nettoyer(userId: string | undefined, scope: 'global' | 'local') {
  client.clear()
  await persister.removeClient()
  await viderHorsLigne()
  if (userId) localStorage.removeItem(`ap2a-membre-${userId}`)
  oublierActivite()
  oublierLien()
  const { error } = await supabase.auth.signOut({ scope })
  // Sans réseau, le serveur ne répond pas et la session resterait dans l'appareil : on l'efface quand même.
  if (error) {
    Object.keys(localStorage).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => localStorage.removeItem(k))
    window.location.replace('/connexion')
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [membre, setMembre] = useState<Membre | null>(null)
  const [chargement, setChargement] = useState(true)
  const [version, setVersion] = useState(0)
  // Vrai une fois la session de départ lue (et fermée si elle avait expiré).
  const [pret, setPret] = useState(false)
  const [verrouille, setVerrouille] = useState(false)
  const [aal, setAal] = useState<{ actuel: string; suivant: string } | null>(null)
  const [versionAal, setVersionAal] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      // Application rouverte après expiration : rien de l'ancienne session ne s'affiche.
      const motif = s ? sessionExpiree(s.user.last_sign_in_at) : null
      if (s && motif && !nbEnAttente()) {
        noterMotif(motif)
        nettoyer(s.user.id, 'local').finally(() => { navigate('/connexion', { replace: true }); setPret(true) })
        return
      }
      // Expirée, mais des saisies hors ligne attendent : on les garde, écran verrouillé.
      if (s && motif) setVerrouille(true)
      setSession(s)
      setPret(true)
    })
    // La session au démarrage passe par getSession (vérifiée ci-dessus) ; ensuite, les changements.
    const { data } = supabase.auth.onAuthStateChange((evt, s) => { if (evt !== 'INITIAL_SESSION') setSession(s) })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  // Double authentification : niveau atteint par la session, et niveau possible (aal2 si un code est enregistré).
  const jetonSession = session?.access_token
  useEffect(() => {
    if (!jetonSession) { setAal(null); return }
    let annule = false
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (!annule) setAal({ actuel: data?.currentLevel ?? 'aal1', suivant: data?.nextLevel ?? 'aal1' })
    })
    return () => { annule = true }
  }, [jetonSession, versionAal])

  const fermer = useCallback(async (scope: 'global' | 'local') => {
    await nettoyer(userId, scope)
    // On repart de la connexion, puis de l'accueil : pas de la dernière page consultée.
    navigate('/connexion', { replace: true })
  }, [userId, navigate])

  // Session limitée : 30 min sans activité, 12 h au plus.
  const connecteLe = session?.user.last_sign_in_at
  useEffect(() => {
    if (!userId) return
    const verifier = () => {
      const motif = sessionExpiree(connecteLe)
      if (!motif) return
      // Des saisies faites sans réseau attendent d'être envoyées : on ne les perd pas,
      // mais l'application se verrouille (mot de passe demandé) au lieu de rester ouverte.
      if (nbEnAttente()) { setVerrouille(true); return }
      noterMotif(motif)
      fermer('local')
    }
    let dernier = 0
    const actif = () => {
      // Au plus une écriture toutes les 30 s.
      if (Date.now() - dernier < 30_000) return
      dernier = Date.now()
      noterActivite()
    }
    // Retour sur l'application (téléphone sorti de veille) : on vérifie avant de noter l'activité.
    const visible = () => { if (document.visibilityState === 'visible') { verifier(); actif() } }
    verifier()
    const minuterie = setInterval(verifier, 60_000)
    const evenements = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    evenements.forEach((e) => window.addEventListener(e, actif, { passive: true, capture: true }))
    document.addEventListener('visibilitychange', visible)
    return () => {
      clearInterval(minuterie)
      evenements.forEach((e) => window.removeEventListener(e, actif, { capture: true }))
      document.removeEventListener('visibilitychange', visible)
    }
  }, [userId, connecteLe, fermer])
  useEffect(() => {
    let annule = false
    if (!userId) {
      setMembre(null)
      setChargement(false)
      return
    }
    setChargement(true)
    // La fiche est gardée dans le téléphone : sans réseau, l'application reste utilisable.
    const cle = `ap2a-membre-${userId}`
    // Sa propre fiche complète (email, téléphone, réglages), lue par une fonction : ces colonnes
    // ne sont pas lisibles directement (audit M1).
    supabase.rpc('ma_fiche')
      .then(({ data, error }) => {
        if (annule) return
        let fiche = data as Membre | null
        if (error) {
          try { fiche = JSON.parse(localStorage.getItem(cle) ?? 'null') } catch { fiche = null }
        } else {
          try { localStorage.setItem(cle, JSON.stringify(fiche)) } catch { /* stockage indisponible */ }
        }
        if (fiche?.theme) appliquerTheme(fiche.theme, true)
        if (fiche?.mode) appliquerMode(fiche.mode, true)
        setMembre(fiche)
        setChargement(false)
      })
    return () => { annule = true }
  }, [userId, version])

  const valeur: Auth = {
    session,
    membre,
    chargement: chargement || !pret || (!!session && !aal),
    peut: (p) => !!membre && roleA(roleDuMembre(membre), p),
    peutUn: (...p) => !!membre && p.some((x) => roleA(roleDuMembre(membre), x)),
    recharger: () => setVersion((v) => v + 1),
    aal,
    rechargerAal: () => setVersionAal((v) => v + 1),
    verrouille,
    deverrouiller: async (motDePasse) => {
      const email = session?.user.email
      if (!email) return 'Session introuvable'
      const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
      if (error) return /fetch|network/i.test(error.message) ? 'Pas de connexion internet : reconnectez-vous au réseau pour déverrouiller.' : 'Mot de passe incorrect'
      noterActivite()
      setVerrouille(false)
      return null
    },
    deconnecter: async () => {
      const n = nbEnAttente()
      if (n && !confirm(`${n} enregistrement(s) faits sans réseau n'ont pas encore été envoyés. En vous déconnectant maintenant, ils seront perdus. Continuer ?`)) return
      // Rien ne doit rester sur un téléphone partagé : données gardées, envois en attente, fiche.
      await fermer('global')
    },
  }
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useAuth() {
  const c = useContext(Contexte)
  if (!c) throw new Error('useAuth hors de AuthProvider')
  return c
}
