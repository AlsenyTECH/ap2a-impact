import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

const SEPT_JOURS = 7 * 24 * 60 * 60 * 1000

/**
 * Données gardées dans le téléphone pour consulter l'application sans réseau
 * (7 jours). Ne sont jamais gardés : le détail médical, les liens des photos
 * (ils expirent) et les pages d'impression.
 */
const JAMAIS_GARDE = new Set(['consultations', 'photos', 'verification', 'cartes-impression', 'rappels-envoyes', 'journal', 'bon-remise', 'bon-remise-signatures'])

export const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: SEPT_JOURS,
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
  maxAge: SEPT_JOURS,
  buster: 'ap2a-1',
  dehydrateOptions: {
    shouldDehydrateQuery: (q: { state: { status: string }; queryKey: readonly unknown[] }) =>
      q.state.status === 'success' && !JAMAIS_GARDE.has(String(q.queryKey[0])),
  },
}
