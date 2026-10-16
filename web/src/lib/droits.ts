import { useQuery } from '@tanstack/react-query'
import { supabase, verifier } from './supabase'
import { LIBELLES_ROLE } from './format'
import type { Membre, Role } from './types'

/** Les droits, fonctionnalité par fonctionnalité (même liste que la table « permissions »). */
export type Permission =
  | 'cibles.voir' | 'cibles.ajouter' | 'cibles.gerer'
  | 'actions.creer' | 'actions.gerer' | 'actions.rouvrir'
  | 'suivis.faire' | 'impact.voir'
  | 'evenements.creer' | 'evenements.gerer' | 'evenements.rouvrir'
  | 'kits.gerer'
  | 'partenaires.gerer'
  | 'membres.gerer' | 'membres.supprimer' | 'membres.comptes' | 'roles.gerer'
  | 'referentiels.gerer' | 'vitrine.gerer' | 'rappels.voir' | 'rappels.regler' | 'journal.voir' | 'medical.journal' | 'demo.gerer'

export interface DefinitionDroit { code: Permission; groupe: string; libelle: string; description: string | null; ordre: number }

/** Un rôle : un nom et un ensemble de droits. */
export interface RoleApp {
  id: string
  code: string | null
  nom: string
  description: string | null
  permissions: Permission[]
  systeme: boolean
  ordre: number
}

/** Ce qu'on charge du rôle avec chaque membre. */
export type RoleResume = Pick<RoleApp, 'id' | 'code' | 'nom' | 'permissions'>
export const CHAMPS_ROLE = 'role_info:roles!membres_role_id_fkey(id, code, nom, permissions)'

/** L'administrateur a tous les droits, y compris ceux ajoutés plus tard. */
export function roleA(role: RoleResume | null | undefined, p: Permission) {
  return !!role && (role.code === 'admin' || role.permissions.includes(p))
}

// Droits d'origine des quatre rôles : seulement pour une fiche gardée dans le
// téléphone avant la mise à jour, sans son rôle (le serveur reste seul juge).
const ORIGINE: Record<Role, Permission[]> = {
  admin: [],
  bureau: ['cibles.voir', 'cibles.ajouter', 'cibles.gerer', 'actions.creer', 'actions.gerer', 'suivis.faire', 'impact.voir',
    'evenements.creer', 'evenements.gerer', 'kits.gerer', 'partenaires.gerer', 'membres.gerer', 'referentiels.gerer', 'vitrine.gerer', 'rappels.voir', 'journal.voir'],
  coordinateur: ['cibles.voir', 'cibles.ajouter', 'actions.creer', 'suivis.faire', 'impact.voir', 'evenements.creer'],
  membre: [],
}
export function roleDuMembre(m: Pick<Membre, 'role' | 'role_id'> & { role_info?: RoleResume | null }): RoleResume {
  return m.role_info ?? { id: m.role_id, code: m.role, nom: LIBELLES_ROLE[m.role], permissions: ORIGINE[m.role] }
}

export function droitsDe(role: RoleResume | null | undefined, tous: DefinitionDroit[]): Permission[] {
  if (!role) return []
  return role.code === 'admin' ? tous.map((d) => d.code) : role.permissions
}

/** Nom du rôle d'un membre (rôle personnalisé compris). */
export function nomRole(m: Pick<Membre, 'role'> & { role_info?: RoleResume | null }) {
  return m.role_info?.nom ?? LIBELLES_ROLE[m.role]
}

export const usePermissions = () => useQuery({
  queryKey: ['permissions'],
  staleTime: 60 * 60 * 1000,
  queryFn: async () => verifier(await supabase.from('permissions').select('*').order('ordre')) as DefinitionDroit[],
})

export const useRoles = () => useQuery({
  queryKey: ['roles'],
  queryFn: async () => verifier(await supabase.from('roles').select('id, code, nom, description, permissions, systeme, ordre').order('ordre').order('nom')) as RoleApp[],
})

/** Les droits regroupés par fonctionnalité, dans l'ordre. */
export function parGroupe(droits: DefinitionDroit[]) {
  const groupes = new Map<string, DefinitionDroit[]>()
  for (const d of droits) groupes.set(d.groupe, [...(groupes.get(d.groupe) ?? []), d])
  return [...groupes.entries()]
}
