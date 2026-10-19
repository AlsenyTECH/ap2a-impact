import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import logo from '@/assets/logo_AP2A.jpeg'
import { cn } from '@/lib/utils'

/** Adresse de vérification imprimée dans le QR code (toujours l'application en ligne). */
export const URL_VERIFICATION = 'https://ap2a-impact.vercel.app/v/'

/** Extrait le jeton d'un QR code scanné (lien complet ou jeton seul). */
export function jetonDuQR(texte: string) {
  const t = texte.trim()
  return t.match(/\/v\/([0-9a-f]{32})\b/i)?.[1]?.toLowerCase() ?? (/^[0-9a-f]{32}$/i.test(t) ? t.toLowerCase() : null)
}

export function useQR(texte: string | null) {
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    if (!texte) return setImage(null)
    let annule = false
    QRCode.toDataURL(texte, { errorCorrectionLevel: 'M', margin: 0, width: 360, color: { dark: '#0c2a20', light: '#ffffff' } })
      .then((u) => { if (!annule) setImage(u) })
    return () => { annule = true }
  }, [texte])
  return image
}

export interface TitulaireCarte {
  type: 'membre' | 'beneficiaire'
  prenom: string | null
  nom: string
  numero: string | null
  /** Rôle du membre, ou formation suivie pour un bénéficiaire. */
  detail?: string | null
  photo?: string | null
  jeton: string | null
  emise_le?: string | null
}

/**
 * Carte au format carte bancaire (85,6 × 54 mm), identique à l'écran et à
 * l'impression. Le QR code ouvre la page de vérification publique.
 */
export function CarteVisuelle({ t, className }: { t: TitulaireCarte; className?: string }) {
  const qr = useQR(t.jeton ? URL_VERIFICATION + t.jeton : null)
  const initiales = `${(t.prenom ?? '').trim()[0] ?? ''}${t.nom.trim()[0] ?? ''}`.toUpperCase()
  const membre = t.type === 'membre'
  return (
    <div
      className={cn('carte-ap2a relative flex flex-col overflow-hidden rounded-[3.2mm] bg-white text-[#13211b] shadow-carte print:shadow-none', className)}
      style={{ width: '85.6mm', height: '54mm', border: '0.2mm solid #d9e0db' }}
    >
      <div className="flex items-center gap-[2mm] px-[3.5mm] py-[2mm]" style={{ background: membre ? '#0c2a20' : '#0b7a57' }}>
        <img src={logo} alt="" className="h-[6.5mm] w-auto rounded-[1mm] bg-white p-[0.4mm]" />
        <div className="min-w-0 leading-[1.15] text-white">
          <div className="text-[2.9mm] font-bold tracking-wide">AP2A</div>
          <div className="truncate text-[1.9mm] text-white/75">Association Parcelles Assainies en Action</div>
        </div>
        <div className="ml-auto rounded-[0.8mm] px-[1.5mm] py-[0.5mm] text-[1.8mm] font-bold uppercase tracking-wider" style={{ background: '#e9a812', color: '#0c2a20' }}>
          {membre ? 'Membre' : 'Bénéficiaire'}
        </div>
      </div>
      <div className="flex flex-1 items-center gap-[3mm] px-[3.5mm]">
        {t.photo ? (
          <img src={t.photo} alt="" className="h-[25mm] w-[21mm] shrink-0 rounded-[1.5mm] object-cover" style={{ border: '0.3mm solid #e2e6df' }} />
        ) : (
          <div className="flex h-[25mm] w-[21mm] shrink-0 items-center justify-center rounded-[1.5mm] bg-[#eef4f0] font-heading text-[7mm] font-semibold text-[#0b7a57]">{initiales}</div>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[1.9mm] font-semibold uppercase tracking-wider text-[#8a6a10]">{membre ? 'Carte de membre' : 'Carte de bénéficiaire'}</div>
          <div className="mt-[0.8mm] text-[3.6mm] font-bold leading-[1.1]">{t.prenom}</div>
          <div className="text-[3.6mm] font-bold uppercase leading-[1.1]">{t.nom}</div>
          {t.detail ? <div className="mt-[0.8mm] line-clamp-2 text-[2.2mm] text-[#3d4b44]">{t.detail}</div> : null}
          <div className="mt-[1.2mm] inline-block whitespace-nowrap rounded-[0.8mm] bg-[#f1f6f3] px-[1.2mm] py-[0.3mm] font-mono text-[2.6mm] font-bold tracking-wide text-[#06573e]">{t.numero ?? '—'}</div>
        </div>
        <div className="flex shrink-0 flex-col items-center">
          {qr ? <img src={qr} alt="QR code de vérification" className="size-[21mm]" /> : <div className="size-[21mm] rounded bg-[#f1f6f3]" />}
          <div className="mt-[0.6mm] text-[1.6mm] text-[#5c6b64]">Scanner pour vérifier</div>
        </div>
      </div>
      <div className="h-[1.2mm]" style={{ background: 'linear-gradient(90deg, #0b7a57 0 70%, #e9a812 70% 100%)' }} />
    </div>
  )
}
