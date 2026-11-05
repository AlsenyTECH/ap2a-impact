import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { messageErreur, supabase } from '@/lib/supabase'
import logo from '@/assets/logo_AP2A.jpeg'

/**
 * Double authentification par application (Google Authenticator, Microsoft
 * Authenticator, 2FAS…) : un code à 6 chiffres qui change toutes les 30 s.
 * Supabase vérifie le code et passe la session au niveau « aal2 » ; la base ne
 * reconnaît les droits des rôles qui l'exigent qu'à ce niveau.
 */

const CODE = /^\d{6}$/

function ChampCode({ valeur, changer }: { valeur: string; changer: (v: string) => void }) {
  return (
    <Input
      inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus
      className="text-center font-mono text-2xl tracking-[0.4em]"
      value={valeur} placeholder="000000"
      onChange={(e) => changer(e.target.value.replace(/\D/g, '').slice(0, 6))}
    />
  )
}

function Cadre({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6">
          <img src={logo} alt="AP2A" className="mx-auto h-14 rounded-lg bg-white object-contain p-1" />
          <h1 className="text-center text-xl font-semibold">{titre}</h1>
          {children}
        </CardContent>
      </Card>
    </div>
  )
}

/** Après le mot de passe : le code de l'application d'authentification. */
export function CodeDoubleAuth({ valide, deconnecter }: { valide: () => void; deconnecter: () => void }) {
  const [code, setCode] = useState('')
  const [envoi, setEnvoi] = useState(false)
  async function verifier(e: FormEvent) {
    e.preventDefault()
    if (!CODE.test(code)) return
    setEnvoi(true)
    try {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      const facteur = data.totp.find((f) => f.status === 'verified')
      if (!facteur) throw new Error('Aucune application d\'authentification enregistrée')
      const r = await supabase.auth.mfa.challengeAndVerify({ factorId: facteur.id, code })
      if (r.error) throw new Error('Code incorrect ou expiré : réessayez avec le code affiché maintenant')
      valide()
    } catch (err) {
      setCode('')
      toast.error(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }
  return (
    <Cadre titre="Code de vérification">
      <p className="text-center text-sm text-muted-foreground">
        Ouvrez votre application d'authentification et saisissez le code à 6 chiffres affiché pour <b>AP2A</b>.
      </p>
      <form onSubmit={verifier} className="space-y-3">
        <ChampCode valeur={code} changer={setCode} />
        <Button type="submit" className="w-full" disabled={envoi || !CODE.test(code)}>{envoi ? 'Vérification…' : 'Valider'}</Button>
      </form>
      <p className="text-center text-xs text-muted-foreground">Téléphone perdu ou changé ? L'administrateur peut réinitialiser votre double authentification.</p>
      <button type="button" onClick={deconnecter} className="w-full text-center text-xs text-muted-foreground underline">Se déconnecter</button>
    </Cadre>
  )
}

/** Enregistrement de l'application d'authentification (QR code, puis premier code). */
export function ActivationDoubleAuth({ obligatoire, termine, annuler }: { obligatoire?: boolean; termine: () => void; annuler?: () => void }) {
  const [facteur, setFacteur] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        // Un essai précédent non terminé est effacé avant d'en commencer un nouveau.
        const { data: liste } = await supabase.auth.mfa.listFactors()
        for (const f of liste?.all ?? []) {
          if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
        }
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `AP2A ${new Date().toLocaleDateString('fr-FR')}`, issuer: 'AP2A' })
        if (error) throw error
        if (!annule) setFacteur({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
      } catch (e) {
        if (!annule) setErreur(messageErreur(e))
      }
    })()
    return () => { annule = true }
  }, [])

  async function verifier(e: FormEvent) {
    e.preventDefault()
    if (!facteur || !CODE.test(code)) return
    setEnvoi(true)
    const r = await supabase.auth.mfa.challengeAndVerify({ factorId: facteur.id, code })
    setEnvoi(false)
    if (r.error) { setCode(''); return toast.error('Code incorrect : vérifiez l\'heure du téléphone et réessayez avec le code affiché maintenant') }
    toast.success('Double authentification activée')
    termine()
  }

  const contenu = (
    <>
      <p className="text-sm text-muted-foreground">
        {obligatoire
          ? 'Votre rôle exige la double authentification : elle protège votre compte même si votre mot de passe est volé.'
          : 'Elle protège votre compte même si votre mot de passe est volé.'}
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Installez une application d'authentification : <b>Google Authenticator</b>, <b>Microsoft Authenticator</b> ou <b>2FAS</b> (gratuites).</li>
        <li>Dans l'application, touchez « + » puis « Scanner un QR code », et scannez celui-ci.</li>
        <li>Saisissez le code à 6 chiffres qu'elle affiche.</li>
      </ol>
      {erreur ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{erreur}</p> : !facteur ? (
        <p className="text-center text-sm text-muted-foreground">Préparation du QR code…</p>
      ) : (
        <>
          <div className="flex justify-center"><img src={facteur.qr} alt="QR code à scanner avec l'application d'authentification" className="size-48 rounded-lg bg-white p-2" /></div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Impossible de scanner ? Saisir la clé à la main</summary>
            <p className="mt-1 break-all rounded bg-muted px-2 py-1 font-mono text-foreground">{facteur.secret}</p>
          </details>
          <form onSubmit={verifier} className="space-y-3">
            <ChampCode valeur={code} changer={setCode} />
            <Button type="submit" className="w-full" disabled={envoi || !CODE.test(code)}>{envoi ? 'Vérification…' : 'Activer'}</Button>
          </form>
        </>
      )}
      {annuler ? <button type="button" onClick={annuler} className="w-full text-center text-xs text-muted-foreground underline">{obligatoire ? 'Se déconnecter' : 'Plus tard'}</button> : null}
    </>
  )
  return obligatoire ? <Cadre titre="Activez la double authentification">{contenu}</Cadre> : <div className="space-y-3">{contenu}</div>
}

/** Dans « Mon profil » : état, activation, désactivation (si le rôle ne l'exige pas). */
export function GestionDoubleAuth({ obligatoire }: { obligatoire: boolean }) {
  const [actif, setActif] = useState<{ id: string } | null | undefined>(undefined)
  const [activation, setActivation] = useState(false)
  const lire = () => supabase.auth.mfa.listFactors().then(({ data }) => setActif(data?.totp.find((f) => f.status === 'verified') ?? null))
  useEffect(() => { lire() }, [])

  async function desactiver() {
    if (!actif || !confirm('Désactiver la double authentification ? Votre compte ne sera plus protégé que par le mot de passe.')) return
    const { error } = await supabase.auth.mfa.unenroll({ factorId: actif.id })
    if (error) return toast.error(messageErreur(error))
    toast.success('Double authentification désactivée')
    lire()
  }

  if (actif === undefined) return null
  return (
    <section className="space-y-2 border-t border-border pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" /> Double authentification</h3>
      {actif ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-primary"><Smartphone className="size-4" /> Activée : un code est demandé à chaque connexion.</span>
          {obligatoire ? <span className="text-xs text-muted-foreground">Exigée par votre rôle.</span> : <Button size="sm" variant="ghost" onClick={desactiver}>Désactiver</Button>}
        </div>
      ) : activation ? (
        <ActivationDoubleAuth termine={() => { setActivation(false); lire() }} annuler={() => setActivation(false)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Non activée. Recommandée : elle protège votre compte si votre mot de passe est volé.</span>
          <Button size="sm" variant="secondary" onClick={() => setActivation(true)}><KeyRound /> Activer</Button>
        </div>
      )}
    </section>
  )
}
