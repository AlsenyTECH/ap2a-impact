import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { BadgeCheck, CircleHelp, ShieldX } from 'lucide-react'
import logo from '@/assets/logo_AP2A.jpeg'
import { date, LIBELLES_ROLE } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Role } from '@/lib/types'

interface Verif {
  statut: 'valide' | 'revoquee' | 'inactive' | 'inconnue'
  type?: 'membre' | 'beneficiaire'
  prenom?: string
  nom?: string
  numero?: string
  role?: Role
  role_nom?: string | null
  depuis?: string
  emise_le?: string
  revoquee_le?: string | null
}

/**
 * Page publique ouverte en scannant le QR code d'une carte, avec n'importe
 * quel téléphone et sans compte. Elle n'affiche que le strict nécessaire.
 */
export function Verification() {
  const { jeton = '' } = useParams()
  const { data, isLoading, error } = useQuery({
    queryKey: ['verification', jeton],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('verifier_carte', { p_jeton: jeton.toLowerCase() })
      if (error) throw error
      return data as Verif
    },
  })

  const valide = data?.statut === 'valide'
  const Icone = !data || data.statut === 'inconnue' ? CircleHelp : valide ? BadgeCheck : ShieldX
  const couleur = valide ? '#0b7a57' : data?.statut === 'inconnue' ? '#8a6a10' : '#b42318'
  const titre = !data ? '' : valide
    ? data.type === 'membre' ? 'Membre actif de l\'AP2A' : 'Bénéficiaire de l\'AP2A'
    : data.statut === 'inconnue' ? 'Carte inconnue' : data.statut === 'inactive' ? 'Membre inactif' : 'Carte annulée'

  return (
    <div className="flex min-h-dvh flex-col items-center bg-[#eef2ee] px-4 py-10">
      <div className="flex items-center gap-3">
        <img src={logo} alt="" className="h-10 w-auto rounded-md bg-white p-0.5" />
        <div className="leading-tight">
          <div className="font-heading text-lg font-semibold">AP2A</div>
          <div className="text-xs text-muted-foreground">Vérification d'une carte</div>
        </div>
      </div>
      <div className="mt-8 w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-haute">
        {isLoading ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Vérification…</p>
        ) : error ? (
          <p className="p-10 text-center text-sm text-destructive">Vérification impossible pour le moment. Réessayez dans un instant.</p>
        ) : data ? (
          <>
            <div className="flex flex-col items-center gap-2 px-6 py-7 text-center text-white" style={{ background: couleur }}>
              <Icone className="size-14" strokeWidth={1.6} />
              <div className="font-heading text-xl font-semibold">{titre}</div>
            </div>
            <div className="space-y-3 p-6 text-center">
              {data.statut === 'inconnue' ? (
                <p className="text-sm text-muted-foreground">Ce QR code ne correspond à aucune carte délivrée par l'association. Il peut s'agir d'une contrefaçon.</p>
              ) : (
                <>
                  <div className="font-heading text-2xl font-semibold">{data.prenom} {data.nom}</div>
                  <div className="inline-block rounded-md bg-muted px-2.5 py-1 font-mono text-sm font-bold">{data.numero}</div>
                  <div className="text-sm text-muted-foreground">
                    {data.type === 'membre'
                      ? <>{data.role_nom ?? (data.role ? LIBELLES_ROLE[data.role] : 'Membre')}{data.depuis ? ` · membre depuis ${date(data.depuis)}` : ''}</>
                      : 'Personne accompagnée par l\'association'}
                  </div>
                  {data.statut === 'revoquee' ? (
                    <p className="rounded-lg bg-[#fbe6e6] p-3 text-sm text-[#a32b2b]">
                      Cette carte a été annulée{data.revoquee_le ? ` le ${date(data.revoquee_le.slice(0, 10))}` : ''} (perte ou remplacement). Elle ne doit plus être acceptée.
                    </p>
                  ) : data.statut === 'inactive' ? (
                    <p className="rounded-lg bg-[#fbe6e6] p-3 text-sm text-[#a32b2b]">Cette personne n'est plus membre actif de l'association.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Carte délivrée le {data.emise_le ? date(data.emise_le.slice(0, 10)) : '—'}. Comparez le nom avec une pièce d'identité si besoin.</p>
                  )}
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
      <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">Association Parcelles Assainies en Action — Parcelles Assainies, Dakar.</p>
    </div>
  )
}
