import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Champ, Pastilles } from '@/components/champs'
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
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <img src={logo} alt="AP2A" className="h-20 object-contain" />
            <p className="text-sm text-muted-foreground">Actions et suivi de l'association</p>
          </div>
          <Pastilles<Mode>
            value={mode}
            onChange={setMode}
            options={[['connexion', 'Se connecter'], ['activation', 'Première connexion']]}
          />
          {mode === 'activation' ? (
            <p className="rounded-md bg-accent p-3 text-xs text-accent-foreground">
              Utilisez l'adresse email que le bureau a enregistrée sur votre fiche de membre, puis choisissez votre mot de passe.
            </p>
          ) : null}
          <form onSubmit={valider} className="space-y-4">
            <Champ label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Champ>
            {mode !== 'oubli' ? (
              <Champ label={mode === 'activation' ? 'Choisissez un mot de passe (8 caractères au moins)' : 'Mot de passe'}>
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
            <Button type="submit" className="w-full" disabled={envoi}>
              {mode === 'connexion' ? 'Se connecter' : mode === 'activation' ? 'Activer mon accès' : 'Recevoir un lien'}
            </Button>
          </form>
          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground underline"
            onClick={() => setMode(mode === 'oubli' ? 'connexion' : 'oubli')}
          >
            {mode === 'oubli' ? 'Retour à la connexion' : 'Mot de passe oublié ?'}
          </button>
        </CardContent>
      </Card>
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
