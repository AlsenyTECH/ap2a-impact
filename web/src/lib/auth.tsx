import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { client, persister } from './cache'
import { nbEnAttente, viderHorsLigne } from './horsligne'
import { CHAMPS_ROLE, roleA, roleDuMembre, type Permission } from './droits'
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
}

const Contexte = createContext<Auth | null>(null)

/** Efface tout ce que l'application garde dans l'appareil, puis ferme la session. */
async function nettoyer(userId: string | undefined, scope: 'global' | 'local') {
  client.clear()
  await persister.removeClient()
  await viderHorsLigne()
  if (userId) localStorage.removeItem(`ap2a-membre-${userId}`)
  oublierActivite()
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
      setSession(s)
      setPret(true)
    })
    // La session au démarrage passe par getSession (vérifiée ci-dessus) ; ensuite, les changements.
    const { data } = supabase.auth.onAuthStateChange((evt, s) => { if (evt !== 'INITIAL_SESSION') setSession(s) })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

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
      // Des saisies faites sans réseau attendent d'être envoyées : on ne les perd pas.
      if (!motif || nbEnAttente()) return
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
    supabase.from('membres').select(`*, ${CHAMPS_ROLE}`).eq('user_id', userId).eq('actif', true).maybeSingle()
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
    chargement: chargement || !pret,
    peut: (p) => !!membre && roleA(roleDuMembre(membre), p),
    peutUn: (...p) => !!membre && p.some((x) => roleA(roleDuMembre(membre), x)),
    recharger: () => setVersion((v) => v + 1),
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
