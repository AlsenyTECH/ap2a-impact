import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Champ } from '@/components/champs'
import { lienAChoisirMotDePasse, messageErreur, oublierLien, supabase } from '@/lib/supabase'
import logo from '@/assets/logo_AP2A.jpeg'

type Mode = 'connexion' | 'oubli'

export function Connexion() {
  const [mode, setMode] = useState<Mode>('connexion')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [envoi, setEnvoi] = useState(false)

  async function valider(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    const adresse = email.trim().toLowerCase()
    try {
      if (mode === 'connexion') {
        const { error } = await supabase.auth.signInWithPassword({ email: adresse, password: motDePasse })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(adresse, {
          redirectTo: `${window.location.origin}/nouveau-mot-de-passe`,
        })
        if (error) throw error
        toast.success('Si cette adresse est connue, un lien vient de vous être envoyé.')
      }
    } catch (err) {
      toast.error(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Présentation (ordinateur) */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-degrade-1 via-degrade-2 to-degrade-3 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <svg aria-hidden className="absolute -bottom-24 -right-24 size-[28rem] opacity-[0.07]" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="90" fill="none" stroke="white" strokeWidth="14" />
          <circle cx="100" cy="100" r="58" fill="none" stroke="white" strokeWidth="14" />
          <circle cx="100" cy="100" r="26" fill="none" stroke="white" strokeWidth="14" />
        </svg>
        <div className="relative flex items-center gap-3">
          <img src={logo} alt="" className="h-12 w-16 rounded-lg bg-white object-contain p-1" />
          <div className="font-heading text-xl font-semibold">AP2A</div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight text-white">Agir pour les Parcelles,<br />et savoir ce que ça change.</h1>
          <ul className="mt-8 space-y-4 text-white/85">
            {[
              ['Organiser', 'cibles, actions, équipes et partenaires au même endroit'],
              ['Suivre', 'ce que deviennent les jeunes formés, les familles aidées'],
              ['Montrer', "l'impact réel de l'association aux membres et aux financeurs"],
            ].map(([titre, texte]) => (
              <li key={titre} className="flex gap-3">
                <span className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-or text-[11px] font-bold text-[#3d2c00]">✓</span>
                <span><b className="font-semibold text-white">{titre}</b> {texte}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">Association Parcelles Assainies en Action — Dakar</p>
      </div>

      {/* Formulaire */}
      <div className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <img src={logo} alt="AP2A" className="h-20 rounded-xl bg-white object-contain p-2 shadow-carte" />
          </div>
          <h2 className="text-2xl font-semibold">{mode === 'oubli' ? 'Mot de passe oublié' : 'Bon retour parmi nous'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'oubli' ? 'Recevez un lien pour choisir un nouveau mot de passe.' : 'Connectez-vous pour accéder aux actions et aux suivis.'}
          </p>
          <form onSubmit={valider} className="mt-6 space-y-4">
            <Champ label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.sn" />
            </Champ>
            {mode !== 'oubli' ? (
              <Champ label="Mot de passe">
                <Input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                />
              </Champ>
            ) : null}
            <Button type="submit" size="lg" className="w-full" disabled={envoi}>
              {envoi ? 'Patientez…' : mode === 'connexion' ? 'Se connecter' : 'Recevoir un lien'}
            </Button>
          </form>
          <button
            type="button"
            className="mt-5 w-full text-center text-sm font-medium text-primary hover:underline"
            onClick={() => setMode(mode === 'oubli' ? 'connexion' : 'oubli')}
          >
            {mode === 'oubli' ? '← Retour à la connexion' : 'Mot de passe oublié ?'}
          </button>
          <p className="mt-6 rounded-xl bg-muted/60 p-3 text-center text-xs text-muted-foreground">
            Pas encore d'accès ? L'application est réservée aux membres et partenaires de l'AP2A, <b>sur invitation</b> :
            demandez au bureau de vous envoyer votre lien personnel.
          </p>
        </div>
      </div>
    </div>
  )
}

export function NouveauMotDePasse() {
  const bienvenue = new URLSearchParams(window.location.search).has('bienvenue') || lienAChoisirMotDePasse() === 'invite'
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const different = confirmation.length > 0 && confirmation !== motDePasse
  async function valider(e: FormEvent) {
    e.preventDefault()
    if (different) return
    setEnvoi(true)
    // Le lien reçu par email ouvre la session ; sans elle (lien expiré ou déjà utilisé), on le dit clairement.
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setEnvoi(false)
      return toast.error("Ce lien a expiré ou a déjà servi. Demandez une nouvelle invitation au bureau, ou utilisez « Mot de passe oublié ».")
    }
    const { error } = await supabase.auth.updateUser({ password: motDePasse })
    setEnvoi(false)
    if (error) toast.error(messageErreur(error))
    else {
      oublierLien()
      toast.success(bienvenue ? 'Votre accès est activé. Bienvenue !' : 'Mot de passe modifié')
      window.location.replace('/')
    }
  }
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6">
          <img src={logo} alt="AP2A" className="mx-auto mb-4 h-14 rounded-lg bg-white object-contain p-1" />
          <h1 className="text-center text-xl font-semibold">{bienvenue ? 'Bienvenue à l\'AP2A' : 'Nouveau mot de passe'}</h1>
          <p className="mb-5 mt-1 text-center text-sm text-muted-foreground">
            {bienvenue ? 'Choisissez votre mot de passe pour activer votre accès.' : 'Choisissez votre nouveau mot de passe.'}
          </p>
          <form onSubmit={valider} className="space-y-4">
            <Champ label="Mot de passe (8 caractères au moins)">
              <Input type="password" required minLength={8} autoComplete="new-password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
            </Champ>
            <Champ label="Confirmez le mot de passe">
              <Input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </Champ>
            {different ? <p className="text-xs text-destructive">Les deux mots de passe ne sont pas identiques.</p> : null}
            <Button type="submit" className="w-full" disabled={envoi || different}>{envoi ? 'Patientez…' : bienvenue ? 'Activer mon accès' : 'Enregistrer'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export function SansFiche({ email, deconnecter }: { email?: string; deconnecter: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6 text-center text-sm">
          <p className="font-medium">Votre accès n'est pas encore ouvert</p>
          <p className="text-muted-foreground">
            Aucune fiche de membre active n'est enregistrée avec l'adresse <b>{email}</b>. Demandez au bureau de l'ajouter
            (ou de corriger l'adresse sur votre fiche), puis reconnectez-vous.
          </p>
          <Button variant="secondary" onClick={deconnecter}>Se déconnecter</Button>
        </CardContent>
      </Card>
    </div>
  )
}
