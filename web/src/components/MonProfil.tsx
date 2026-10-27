import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BellRing, CalendarClock, Eye, IdCard, KeyRound, ListChecks, Mail, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { PhotoFiche } from '@/components/PhotoFiche'
import { ApercuRappels } from '@/components/ApercuRappels'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { nomRole } from '@/lib/droits'
import { choisirMode, choisirTheme, MODES, THEMES, useMode, useTheme, type Theme } from '@/lib/theme'
import { Pastilles } from '@/components/champs'
import { heureCourte, JOURS, useReglagesRappels } from '@/lib/rappels'
import { ADRESSE_VIDE, ChampsAdresse, ChampsEtudes, enregistrerAdresse, lireCompetences, useAdresseMembre, type Adresse } from '@/components/ProfilMembre'
import { messageErreur, supabase, verifier } from '@/lib/supabase'

interface Envoi { id: number; envoye_le: string; type: string; email: string | null; nb: number; statut: string; erreur: string | null }

const LIBELLES_ENVOI: Record<string, string> = {
  hebdo: 'Suivis de la semaine', seances: 'Séances du jour', 'hebdo-apercu': 'Aperçu suivis', 'seances-apercu': 'Aperçu séances', invitation: 'Invitation',
}

/** Appelle la fonction d'envoi des rappels (aperçu pour soi, ou envoi à tous pour un administrateur). */
async function appelerRappels(type: 'hebdo' | 'seances', apercu: boolean) {
  const { data, error } = await supabase.functions.invoke('rappels', { body: { type, apercu } })
  if (error) {
    // Message d'erreur renvoyé par la fonction, s'il y en a un.
    const corps = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(corps?.erreur ?? corps?.erreurs?.[0] ?? error.message)
  }
  return data as { envoyes: number; echecs: number; erreurs: string[] }
}

/** Mon profil : numéro de membre, rappels par email, aperçu, et (admin) journal des envois. */
export function MonProfil({ ouvert, fermer }: { ouvert: boolean; fermer: () => void }) {
  const { membre, peut, session } = useAuth()
  const qc = useQueryClient()
  const [envoi, setEnvoi] = useState<string | null>(null)
  const [apercu, setApercu] = useState<'seances' | 'hebdo' | null>(null)
  const admin = peut('rappels.regler')
  const { data: reglages } = useReglagesRappels()
  const hebdo = reglages?.hebdo_actif ? `Chaque ${JOURS[reglages.hebdo_jour - 1]} à ${heureCourte(reglages.hebdo_heure)}` : null
  const seances = reglages?.seances_actif ? (reglages.seances_veille ? `La veille d'une séance, à ${heureCourte(reglages.seances_heure)}` : `Le matin d'une séance, à ${heureCourte(reglages.seances_heure)}`) : null

  const { data: actif } = useQuery({
    queryKey: ['mes-rappels', membre?.id],
    enabled: ouvert && !!membre,
    queryFn: async () => (verifier(await supabase.from('membres').select('rappels_email').eq('id', membre!.id).single()) as { rappels_email: boolean }).rappels_email,
  })
  const { data: journal = [] } = useQuery({
    queryKey: ['rappels-envoyes'],
    enabled: ouvert,
    queryFn: async () => verifier(await supabase.from('rappels_envoyes').select('*').order('envoye_le', { ascending: false }).limit(15)) as Envoi[],
  })

  async function regler(v: boolean) {
    const { error } = await supabase.rpc('regler_rappels', { p_actif: v })
    if (error) return toast.error(messageErreur(error))
    qc.setQueryData(['mes-rappels', membre?.id], v)
    toast.success(v ? 'Rappels activés' : 'Rappels désactivés')
  }

  async function lancer(type: 'hebdo' | 'seances', apercu: boolean) {
    if (!apercu && !confirm(type === 'hebdo' ? 'Envoyer maintenant le rappel des suivis à tous les membres concernés ?' : "Envoyer maintenant le rappel des séances d'aujourd'hui ?")) return
    setEnvoi(`${type}-${apercu}`)
    try {
      const r = await appelerRappels(type, apercu)
      if (r.echecs && !r.envoyes) throw new Error(r.erreurs[0])
      toast.success(apercu ? `Aperçu envoyé à ${membre?.email}` : `${r.envoyes} email(s) envoyé(s)${r.echecs ? `, ${r.echecs} échec(s)` : ''}`)
      qc.invalidateQueries({ queryKey: ['rappels-envoyes'] })
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(null)
    }
  }

  if (!membre) return null
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mon profil</DialogTitle>
          <DialogDescription>Vos informations et vos rappels par email.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <PhotoFiche dossier="membres" id={membre.id} chemin={membre.photo_chemin} prenom={membre.prenom} nom={membre.nom} modifiable taille="lg" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="font-semibold">{membre.prenom} {membre.nom}</div>
            <div className="text-sm text-muted-foreground">{nomRole(membre)} · <b className="text-foreground">{membre.numero_adherent}</b></div>
            <div className="truncate text-xs text-muted-foreground">{membre.email ?? 'Pas d\'adresse email'}</div>
            <Button asChild size="sm" variant="secondary" className="mt-2"><Link to={`/cartes?membre=${membre.id}`} onClick={fermer}><IdCard /> Ma carte de membre</Link></Button>
          </div>
        </div>

        <section className="space-y-3">
          <label className="flex items-start justify-between gap-4">
            <span className="flex gap-3">
              <BellRing className="mt-0.5 size-5 shrink-0 text-primary" />
              <span className="text-sm">
                <span className="font-medium">Recevoir les rappels par email</span>
                <span className="block text-muted-foreground">
                  {hebdo ? `${hebdo} : vos suivis à venir${peut('impact.voir') ? ` et les retards de plus de ${reglages?.seuil_retard} jours` : ''}. ` : ''}
                  {seances ? `${seances} : un rappel pour faire l'appel.` : ''}
                  {!hebdo && !seances && reglages ? 'Les rappels automatiques sont désactivés par l\'administrateur.' : ''}
                </span>
              </span>
            </span>
            <Switch checked={actif ?? true} onCheckedChange={regler} disabled={actif === undefined || !membre.email} />
          </label>
          <div className="flex flex-wrap gap-2 pl-8">
            <Button size="sm" onClick={() => setApercu('seances')}><Eye /> Voir mes séances</Button>
            <Button size="sm" variant="secondary" onClick={() => setApercu('hebdo')}><ListChecks /> Voir mes suivis</Button>
          </div>
          {membre.email ? (
            <div className="flex flex-wrap gap-2 pl-8">
              <Button size="sm" variant="ghost" disabled={!!envoi} onClick={() => lancer('hebdo', true)}><Mail /> Recevoir l'aperçu des suivis par email</Button>
              <Button size="sm" variant="ghost" disabled={!!envoi} onClick={() => lancer('seances', true)}><CalendarClock /> … des séances par email</Button>
            </div>
          ) : (
            <p className="pl-8 text-xs text-muted-foreground">Demandez au bureau d'ajouter votre adresse email à votre fiche pour recevoir les rappels par email.</p>
          )}
        </section>

        <MesInfos />

        <ChoixTheme />

        {/* L'identifiant du compte (email, ou adresse interne d'un compte par téléphone). */}
        <MotDePasse email={session?.user.email ?? null} />

        <ApercuRappels key={apercu ?? 'x'} ouvert={!!apercu} type={apercu ?? 'seances'} fermer={() => setApercu(null)} />

        {admin ? (
          <section className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Administration des rappels</h3>
            <p className="text-xs text-muted-foreground">Jours et heures d'envoi : <Link to="/reglages-rappels" onClick={fermer} className="font-medium text-primary underline">Réglages → Rappels</Link>. Vous pouvez aussi envoyer tout de suite.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!!envoi} onClick={() => lancer('hebdo', false)}><Send /> Envoyer les suivis à tous</Button>
              <Button size="sm" variant="secondary" disabled={!!envoi} onClick={() => lancer('seances', false)}><Send /> Envoyer les séances du jour</Button>
            </div>
          </section>
        ) : null}

        {journal.length ? (
          <section className="space-y-1 border-t border-border pt-4">
            <h3 className="mb-1 text-sm font-semibold">Derniers envois</h3>
            {journal.map((j) => (
              <div key={j.id} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{new Date(j.envoye_le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {' · '}{LIBELLES_ENVOI[j.type] ?? j.type} · {j.email}
                </span>
                <span className={j.statut === 'envoye' ? 'shrink-0 font-medium text-primary' : 'shrink-0 font-medium text-destructive'} title={j.erreur ?? undefined}>
                  {j.statut === 'envoye' ? 'envoyé' : 'échec'}
                </span>
              </div>
            ))}
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** Couleurs de l'application : le vert d'origine ou le bleu du logo AP2A. */
function ChoixTheme() {
  const theme = useTheme()
  const { mode } = useMode()
  async function choisir(t: Theme) {
    // Gardé aussi sur la fiche : le thème suit le membre sur ses autres appareils.
    const error = await choisirTheme(t)
    if (error && navigator.onLine) toast.error(messageErreur(error))
  }
  return (
    <section className="space-y-2 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Couleurs de l'application</h3>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Couleurs de l'application">
        {THEMES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} onClick={() => choisir(t.id)}
            className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${theme === t.id ? 'border-primary bg-primary-soft' : 'border-border hover:bg-muted/50'}`}>
            <span className="flex shrink-0 overflow-hidden rounded-lg border border-black/10">
              {t.couleurs.map((c) => <span key={c} className="h-9 w-3.5" style={{ background: c }} />)}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t.nom}</span>
              <span className="block text-xs text-muted-foreground">{t.description}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <span className="text-sm text-muted-foreground">Affichage</span>
        <Pastilles value={mode} onChange={(m) => choisirMode(m)} options={MODES} />
      </div>
    </section>
  )
}

/** Changer son mot de passe : l'ancien est vérifié avant d'enregistrer le nouveau. */
function MotDePasse({ email }: { email: string | null }) {
  const [ouvert, setOuvert] = useState(false)
  const [actuel, setActuel] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const probleme = nouveau.length > 0 && nouveau.length < 8 ? 'Au moins 8 caractères.'
    : confirmation && nouveau !== confirmation ? 'Les deux mots de passe ne sont pas identiques.'
    : nouveau && nouveau === actuel ? "Le nouveau mot de passe doit être différent de l'ancien." : null

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    if (probleme || !email) return
    setEnvoi(true)
    try {
      // Vérifie l'ancien mot de passe (la session reste la même).
      const { error: e1 } = await supabase.auth.signInWithPassword({ email, password: actuel })
      if (e1) throw new Error('Mot de passe actuel incorrect.')
      const { error: e2 } = await supabase.auth.updateUser({ password: nouveau, data: { mdp_choisi: true } })
      if (e2) throw new Error(/weak|short|characters/i.test(e2.message) ? 'Mot de passe trop faible : mélangez lettres, chiffres et symboles.' : e2.message)
      toast.success('Mot de passe changé')
      setOuvert(false); setActuel(''); setNouveau(''); setConfirmation('')
    } catch (err) {
      toast.error(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <section className="space-y-2 border-t border-border pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-primary" /> Mot de passe</h3>
      {!email ? (
        <p className="text-xs text-muted-foreground">Votre fiche n'a pas d'adresse de connexion.</p>
      ) : !ouvert ? (
        <Button size="sm" variant="secondary" onClick={() => setOuvert(true)}>Changer mon mot de passe</Button>
      ) : (
        <form onSubmit={enregistrer} className="grid gap-2">
          <Input type="password" autoComplete="current-password" placeholder="Mot de passe actuel" required value={actuel} onChange={(e) => setActuel(e.target.value)} />
          <Input type="password" autoComplete="new-password" placeholder="Nouveau mot de passe (8 caractères minimum)" required minLength={8} value={nouveau} onChange={(e) => setNouveau(e.target.value)} />
          <Input type="password" autoComplete="new-password" placeholder="Confirmer le nouveau mot de passe" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          {probleme ? <p className="text-xs text-destructive">{probleme}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>Annuler</Button>
            <Button type="submit" size="sm" disabled={envoi || !!probleme || !actuel || !nouveau || !confirmation}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </div>
          <p className="text-xs text-muted-foreground">Mot de passe oublié ? Déconnectez-vous et utilisez « Mot de passe oublié » sur l'écran de connexion.</p>
        </form>
      )}
    </section>
  )
}

/** Adresse, niveau d'études et compétences : chacun les complète lui-même. */
function MesInfos() {
  const { membre, recharger } = useAuth()
  const qc = useQueryClient()
  const { data: adresseLue } = useAdresseMembre(membre?.id)
  const [adresse, setAdresse] = useState<Adresse | null>(null)
  const [etudes, setEtudes] = useState<{ niveau: string; competences: string } | null>(null)
  const [envoi, setEnvoi] = useState(false)
  if (!membre) return null
  const a = adresse ?? adresseLue ?? ADRESSE_VIDE
  const e = etudes ?? { niveau: membre.niveau_etude ?? '', competences: (membre.competences ?? []).join(', ') }

  async function enregistrer(ev: React.FormEvent) {
    ev.preventDefault()
    setEnvoi(true)
    try {
      const { error } = await supabase.rpc('maj_mon_profil', { p_niveau: e.niveau, p_competences: lireCompetences(e.competences) })
      if (error) throw error
      await enregistrerAdresse(membre!.id, a)
      toast.success('Informations enregistrées')
      setAdresse(null)
      setEtudes(null)
      qc.invalidateQueries({ queryKey: ['adresse-membre', membre!.id] })
      qc.invalidateQueries({ queryKey: ['membres'] })
      recharger()
    } catch (err) {
      toast.error(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <form onSubmit={enregistrer} className="space-y-3 border-t border-border pt-4">
      <div>
        <h3 className="text-sm font-semibold">Mes informations</h3>
        <p className="text-xs text-muted-foreground">Votre adresse n'est visible que de vous et du bureau. Votre niveau d'études et vos compétences sont visibles des autres membres.</p>
      </div>
      <ChampsAdresse valeur={a} changer={setAdresse} />
      <ChampsEtudes niveau={e.niveau} competences={e.competences} changer={(niveau, competences) => setEtudes({ niveau, competences })} />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={envoi || (!adresse && !etudes)}>Enregistrer</Button>
      </div>
    </form>
  )
}
