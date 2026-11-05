import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

const UN_JOUR = 24 * 60 * 60 * 1000

/**
 * Données gardées dans le téléphone pour travailler sans réseau sur le terrain
 * (24 h au plus) : seulement ce qu'il faut pour les actions, l'appel et les
 * listes de référence. Jamais : fiches complètes des cibles et des membres
 * (coordonnées, vulnérabilités, adresses), détail médical, journaux, portail
 * des partenaires. Liste fermée : une nouvelle donnée n'est pas gardée tant
 * qu'on ne l'ajoute pas ici.
 */
const GARDE_HORS_LIGNE = new Set([
  'actions', 'action', 'accueil', 'seances', 'presences', 'inscrits-appel', 'beneficiaires', 'equipe', 'action_partenaires',
  'evenements', 'evenement', 'evenement-presences', 'evenement-invites', 'evenement-actions', 'actions-pour-evenement',
  'cartes-membres', 'cartes-action', 'kits', 'kits-mouvements',
  'types_action', 'zones', 'partenaires', 'familles_cible', 'categories_cible', 'profils_personne', 'roles', 'permissions',
  'reglages-rappels', 'mes-rappels', 'vitrine-medias',
])

export const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: UN_JOUR,
      networkMode: 'offlineFirst',
      retry: (n) => navigator.onLine && n < 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const persister = createAsyncStoragePersister({
  key: 'ap2a-cache',
  storage: { getItem: (k) => get(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
  throttleTime: 2000,
})

export const optionsPersistance = {
  persister,
  maxAge: UN_JOUR,
  // Nouvelle valeur : l'ancien cache (7 jours, fiches complètes) est effacé à la mise à jour.
  buster: 'ap2a-2',
  dehydrateOptions: {
    shouldDehydrateQuery: (q: { state: { status: string }; queryKey: readonly unknown[] }) =>
      q.state.status === 'success' && GARDE_HORS_LIGNE.has(String(q.queryKey[0])),
  },
}
