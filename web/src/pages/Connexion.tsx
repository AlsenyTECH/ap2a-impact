import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Champ } from '@/components/champs'
import { messageErreur, supabase } from '@/lib/supabase'
import logo from '@/assets/logo_AP2A.jpeg'

type Mode = 'connexion' | 'activation' | 'oubli'

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
      } else if (mode === 'activation') {
        const { data, error } = await supabase.auth.signUp({
          email: adresse,
          password: motDePasse,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        if (!data.session) toast.success('Compte créé : ouvrez le lien reçu par email pour confirmer votre adresse.')
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
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0b7a57] via-[#0a5f45] to-[#0c2a20] p-12 text-white lg:flex lg:flex-col lg:justify-between">
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
          <h2 className="text-2xl font-semibold">{mode === 'oubli' ? 'Mot de passe oublié' : mode === 'activation' ? 'Activer mon accès' : 'Bon retour parmi nous'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'oubli' ? 'Recevez un lien pour choisir un nouveau mot de passe.' : mode === 'activation' ? "Votre fiche de membre doit déjà exister, avec cette adresse email." : 'Connectez-vous pour accéder aux actions et aux suivis.'}
          </p>
          {mode !== 'oubli' ? (
            <div className="mt-6 grid grid-cols-2 rounded-xl bg-muted p-1">
              {([['connexion', 'Se connecter'], ['activation', 'Première connexion']] as [Mode, string][]).map(([m, libelle]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`h-9 rounded-lg text-sm font-semibold transition-all ${mode === m ? 'bg-card text-foreground shadow-carte' : 'text-muted-foreground'}`}
                >
                  {libelle}
                </button>
              ))}
            </div>
          ) : null}
          <form onSubmit={valider} className="mt-6 space-y-4">
            <Champ label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.sn" />
            </Champ>
            {mode !== 'oubli' ? (
              <Champ label={mode === 'activation' ? 'Choisissez un mot de passe' : 'Mot de passe'} aide={mode === 'activation' ? '8 caractères au moins' : undefined}>
                <Input
                  type="password"
                  required
                  minLength={mode === 'activation' ? 8 : undefined}
                  autoComplete={mode === 'activation' ? 'new-password' : 'current-password'}
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                />
              </Champ>
            ) : null}
            <Button type="submit" size="lg" className="w-full" disabled={envoi}>
              {envoi ? 'Patientez…' : mode === 'connexion' ? 'Se connecter' : mode === 'activation' ? 'Activer mon accès' : 'Recevoir un lien'}
            </Button>
          </form>
          <button
            type="button"
            className="mt-5 w-full text-center text-sm font-medium text-primary hover:underline"
            onClick={() => setMode(mode === 'oubli' ? 'connexion' : 'oubli')}
          >
            {mode === 'oubli' ? '← Retour à la connexion' : 'Mot de passe oublié ?'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function NouveauMotDePasse() {
  const [motDePasse, setMotDePasse] = useState('')
  async function valider(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: motDePasse })
    if (error) toast.error(messageErreur(error))
    else {
      toast.success('Mot de passe modifié')
      window.location.replace('/')
    }
  }
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6">
          <form onSubmit={valider} className="space-y-4">
            <Champ label="Nouveau mot de passe (8 caractères au moins)">
              <Input type="password" required minLength={8} autoComplete="new-password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
            </Champ>
            <Button type="submit" className="w-full">Enregistrer</Button>
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
