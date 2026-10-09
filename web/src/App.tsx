import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Chargement } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { configurationManquante } from '@/lib/supabase'
import { Connexion, NouveauMotDePasse, SansFiche } from '@/pages/Connexion'
import { Accueil } from '@/pages/Accueil'
import { Cibles } from '@/pages/Cibles'
import { CibleDetail } from '@/pages/CibleDetail'
import { Actions } from '@/pages/Actions'
import { ActionDetail } from '@/pages/ActionDetail'
import { Membres } from '@/pages/Membres'
import { Partenaires } from '@/pages/Partenaires'
import { Suivis } from '@/pages/Suivis'
import { Impact } from '@/pages/Impact'

export function App() {
  const { session, membre, chargement, deconnecter } = useAuth()
  const { pathname } = useLocation()

  if (configurationManquante) {
    return <p className="p-6 text-sm">Configuration manquante : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir web/.env.example).</p>
  }
  if (pathname === '/nouveau-mot-de-passe') return <NouveauMotDePasse />
  if (chargement) return <Chargement />
  if (!session) return <Connexion />
  if (!membre) return <SansFiche email={session.user.email} deconnecter={deconnecter} />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Accueil />} />
        <Route path="cibles" element={<Cibles />} />
        <Route path="cibles/:id" element={<CibleDetail />} />
        <Route path="actions" element={<Actions />} />
        <Route path="actions/:id" element={<ActionDetail />} />
        <Route path="suivis" element={<Suivis />} />
        <Route path="impact" element={<Impact />} />
        <Route path="membres" element={<Membres />} />
        <Route path="partenaires" element={<Partenaires />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
