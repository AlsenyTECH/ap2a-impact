import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const cle = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configurationManquante = !url || !cle

// La clé publique ne donne aucun droit à elle seule : les règles d'accès
// (RLS) de la base décident de tout selon le membre connecté.
export const supabase = createClient(url ?? 'http://localhost', cle ?? 'absente', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Message lisible pour une erreur Supabase/PostgREST. */
export function messageErreur(erreur: unknown): string {
  const e = erreur as { code?: string; message?: string } | null
  if (!e) return 'Une erreur est survenue'
  if (e.code === '23505') return 'Cet élément existe déjà'
  if (e.code === '23503') return 'Impossible : cet élément est utilisé ailleurs'
  if (e.code === '42501' || e.code === 'PGRST301') return e.message?.startsWith('Seul') || e.message?.startsWith('Vous') ? e.message : "Vous n'avez pas le droit de faire cela"
  if (e.message === 'Failed to fetch') return 'Pas de connexion internet'
  if (e.message === 'Invalid login credentials') return 'Email ou mot de passe incorrect'
  return e.message || 'Une erreur est survenue'
}

/** Lève l'erreur Supabase pour que React Query l'affiche. */
export function verifier<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw new Error(messageErreur(r.error))
  return r.data
}
