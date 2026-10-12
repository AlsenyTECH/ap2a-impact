import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { client, persister } from './cache'
import { nbEnAttente, viderHorsLigne } from './horsligne'
import type { Membre, Role } from './types'

interface Auth {
  session: Session | null
  membre: Membre | null
  chargement: boolean
  /** Le membre a l'un de ces rôles. */
  a: (...roles: Role[]) => boolean
  deconnecter: () => Promise<void>
}

const Contexte = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [membre, setMembre] = useState<Membre | null>(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
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
    supabase.from('membres').select('*').eq('user_id', userId).eq('actif', true).maybeSingle()
      .then(({ data, error }) => {
        if (annule) return
        let fiche = data as Membre | null
        if (error) {
          try { fiche = JSON.parse(localStorage.getItem(cle) ?? 'null') } catch { fiche = null }
        } else {
          try { localStorage.setItem(cle, JSON.stringify(fiche)) } catch { /* stockage indisponible */ }
        }
        setMembre(fiche)
        setChargement(false)
      })
    return () => { annule = true }
  }, [userId])

  const valeur: Auth = {
    session,
    membre,
    chargement,
    a: (...roles) => !!membre && roles.includes(membre.role),
    deconnecter: async () => {
      const n = nbEnAttente()
      if (n && !confirm(`${n} enregistrement(s) faits sans réseau n'ont pas encore été envoyés. En vous déconnectant maintenant, ils seront perdus. Continuer ?`)) return
      // Rien ne doit rester sur un téléphone partagé : données gardées, envois en attente, fiche.
      client.clear()
      await persister.removeClient()
      await viderHorsLigne()
      if (userId) localStorage.removeItem(`ap2a-membre-${userId}`)
      await supabase.auth.signOut()
    },
  }
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useAuth() {
  const c = useContext(Contexte)
  if (!c) throw new Error('useAuth hors de AuthProvider')
  return c
}
