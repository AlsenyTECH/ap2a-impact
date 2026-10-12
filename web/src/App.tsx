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
import { Categories } from '@/pages/Categories'
import { RapportAction } from '@/pages/RapportAction'
import { RapportAnnuel } from '@/pages/RapportAnnuel'
import { Verification } from '@/pages/Verification'
import { PortailPartenaire, usePortail } from '@/pages/Portail'
import { Cartes } from '@/pages/Cartes'
import { Evenements } from '@/pages/Evenements'
import { EvenementDetail } from '@/pages/EvenementDetail'
import { Vitrine } from '@/pages/Vitrine'

export function App() {
  const { session, membre, chargement, deconnecter } = useAuth()
  const { pathname } = useLocation()

  if (configurationManquante) {
    return <p className="p-6 text-sm">Configuration manquante : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir web/.env.example).</p>
  }
  if (pathname === '/nouveau-mot-de-passe') return <NouveauMotDePasse />
  // Vérification d'une carte : page publique, sans compte.
  if (pathname.startsWith('/v/')) return <Routes><Route path="v/:jeton" element={<Verification />} /></Routes>
  if (chargement) return <Chargement />
  // Sans compte : la page vitrine de l'association sur l'accueil, la connexion ailleurs.
  if (!session) return pathname === '/' || pathname === '/association' ? <Vitrine /> : <Connexion />
  if (pathname === '/association') return <Vitrine connecte />
  if (pathname === '/connexion') return <Navigate to="/" replace />
  if (!membre) return <SansFicheOuPartenaire email={session.user.email} deconnecter={deconnecter} />

  return (
    <Routes>
      {/* Rapports : pleine page, sans menu, prêts à imprimer */}
      <Route path="actions/:id/rapport" element={<RapportAction />} />
      <Route path="rapport" element={<RapportAnnuel />} />
      <Route path="cartes" element={<Cartes />} />
      <Route element={<Layout />}>
        <Route index element={<Accueil />} />
        <Route path="cibles" element={<Cibles />} />
        <Route path="cibles/:id" element={<CibleDetail />} />
        <Route path="actions" element={<Actions />} />
        <Route path="actions/:id" element={<ActionDetail />} />
        <Route path="suivis" element={<Suivis />} />
        <Route path="evenements" element={<Evenements />} />
        <Route path="evenements/:id" element={<EvenementDetail />} />
        <Route path="impact" element={<Impact />} />
        <Route path="categories" element={<Categories />} />
        <Route path="membres" element={<Membres />} />
        <Route path="partenaires" element={<Partenaires />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

/** Compte sans fiche de membre : partenaire invité, ou personne inconnue. */
function SansFicheOuPartenaire({ email, deconnecter }: { email?: string; deconnecter: () => void }) {
  const { data, isLoading } = usePortail(true)
  if (isLoading) return <Chargement />
  if (data?.acces) return <PortailPartenaire portail={data} deconnecter={deconnecter} />
  return <SansFiche email={email} deconnecter={deconnecter} />
}
