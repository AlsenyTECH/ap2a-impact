import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { client, optionsPersistance } from '@/lib/cache'
import { initialiserHorsLigne } from '@/lib/horsligne'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/lib/auth'
import { App } from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Mise à jour automatique : dès qu'une nouvelle version est en ligne, elle
// remplace l'ancienne (vérifiée au retour sur l'application et chaque heure).
registerSW({
  immediate: true,
  onRegisteredSW(_url, r) {
    if (!r) return
    const verifier = () => { if (navigator.onLine) r.update().catch(() => undefined) }
    setInterval(verifier, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifier() })
  },
})

// Envois en attente (faits sans réseau) : partent dès que le réseau revient.
initialiserHorsLigne(() => client.invalidateQueries())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={client} persistOptions={optionsPersistance}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
)
