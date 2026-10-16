import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, CalendarClock, Info, MessageCircle, MessageSquareText, Save, Send, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Chargement, Champ, EnTete, Erreur, Liste } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { HEURES, heureCourte, JOURS, useReglagesRappels, type ReglagesRappels as Reglages } from '@/lib/rappels'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface EnvoiSms { id: number; envoye_le: string; objet: string; statut: string; erreur: string | null; cible: { prenom: string | null; nom: string } | null }

/** Réglages des rappels automatiques : membres (email) et bénéficiaires (WhatsApp, SMS). */
export function ReglagesRappels() {
  const { peut } = useAuth()
  const admin = peut('rappels.regler')
  const qc = useQueryClient()
  const { data: r, isLoading, error } = useReglagesRappels()
  const [v, setV] = useState<Reglages | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [telTest, setTelTest] = useState('')
  useEffect(() => { if (r) setV(r) }, [r])

  const { data: sms = [] } = useQuery({
    queryKey: ['rappels-sms-journal'],
    enabled: peut('rappels.voir'),
    queryFn: async () => verifier(await supabase.from('rappels_cibles').select('id, envoye_le, objet, statut, erreur, cible:cibles(prenom, nom)')
      .eq('canal', 'sms').order('envoye_le', { ascending: false }).limit(15)) as unknown as EnvoiSms[],
  })

  if (!peut('rappels.voir')) return <Navigate to="/" replace />
  if (isLoading || !v) return error ? <Erreur erreur={error} /> : <Chargement />

  const maj = <K extends keyof Reglages>(k: K, val: Reglages[K]) => setV((x) => (x ? { ...x, [k]: val } : x))
  const modifie = !!r && JSON.stringify(v) !== JSON.stringify(r)
  const entre = (n: number, a: number, b: number) => Number.isInteger(n) && n >= a && n <= b
  const erreurs = [
    !entre(v.fenetre_jours, 1, 31) && 'Suivis prévus dans : de 1 à 31 jours',
    !entre(v.seuil_retard, 1, 120) && 'Alerte retard : de 1 à 120 jours',
    !entre(v.suivi_jours_avant, 1, 14) && 'Rappel avant un suivi : de 1 à 14 jours',
    !/^[A-Za-z0-9]{3,11}$/.test(v.sms_expediteur) && "Nom d'expéditeur : 3 à 11 lettres ou chiffres",
  ].filter(Boolean) as string[]

  async function enregistrer() {
    if (!v) return
    setEnvoi(true)
    const { modifie_le: _a, modifie_par: _b, ...champs } = v
    const { error: e } = await supabase.from('reglages_rappels').update(champs).eq('id', true)
    setEnvoi(false)
    if (e) return toast.error(messageErreur(e))
    qc.invalidateQueries({ queryKey: ['reglages-rappels'] })
    qc.invalidateQueries({ queryKey: ['rappels-cibles'] })
    toast.success('Réglages enregistrés. Ils s\'appliquent dès le prochain quart d\'heure.')
  }

  async function smsTest() {
    setEnvoi(true)
    try {
      const { data, error: e } = await supabase.functions.invoke('rappels', { body: { type: 'sms_test', telephone: telTest } })
      if (e) {
        const corps = await (e as { context?: Response }).context?.json?.().catch(() => null)
        throw new Error(corps?.erreur ?? corps?.erreurs?.[0] ?? e.message)
      }
      if (data?.echecs) throw new Error(data.erreurs?.[0])
      toast.success('SMS d\'essai envoyé. Il arrive en général en moins d\'une minute.')
    } catch (e) {
      toast.error(messageErreur(e), { duration: 10000 })
    } finally {
      setEnvoi(false)
    }
  }

  const choixHeure = (cle: 'hebdo_heure' | 'seances_heure' | 'sms_heure') => (
    <Liste value={v[cle]} disabled={!admin} onChange={(e) => maj(cle, e.target.value)}>
      {HEURES.map((h) => <option key={h} value={h}>{heureCourte(h)}</option>)}
    </Liste>
  )

  return (
    <div className="space-y-6">
      <EnTete
        titre="Rappels"
        sousTitre="Quand et comment l'application prévient les membres et les bénéficiaires. Heures de Dakar."
        actions={admin ? <Button onClick={enregistrer} disabled={!modifie || envoi || erreurs.length > 0}><Save /> Enregistrer</Button> : undefined}
      />
      {erreurs.length ? <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{erreurs.join(' · ')}</p> : null}
      {!admin ? (
        <p className="flex gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" /> Seul un administrateur peut modifier ces réglages.</p>
      ) : null}

      <Bloc icone={BellRing} titre="Membres : rappels par email" sousTitre="Chaque membre peut aussi couper ses propres rappels dans « Mon profil ».">
        <Ligne actif={v.hebdo_actif} onActif={(x) => maj('hebdo_actif', x)} admin={admin} titre="Suivis de la semaine"
          resume={`Chaque ${JOURS[v.hebdo_jour - 1]} à ${heureCourte(v.hebdo_heure)} : les suivis prévus dans les ${v.fenetre_jours} jours, et les retards de plus de ${v.seuil_retard} jours pour les gestionnaires.`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Champ label="Jour">
              <Liste value={v.hebdo_jour} disabled={!admin} onChange={(e) => maj('hebdo_jour', Number(e.target.value))}>
                {JOURS.map((j, i) => <option key={j} value={i + 1}>{j}</option>)}
              </Liste>
            </Champ>
            <Champ label="Heure">{choixHeure('hebdo_heure')}</Champ>
            <Champ label="Suivis prévus dans (jours)"><Input type="number" min={1} max={31} disabled={!admin} value={v.fenetre_jours} onChange={(e) => maj('fenetre_jours', Number(e.target.value))} /></Champ>
            <Champ label="Alerte retard après (jours)"><Input type="number" min={1} max={120} disabled={!admin} value={v.seuil_retard} onChange={(e) => maj('seuil_retard', Number(e.target.value))} /></Champ>
          </div>
        </Ligne>
        <Ligne actif={v.seances_actif} onActif={(x) => maj('seances_actif', x)} admin={admin} titre="Séances de formation (responsable et équipe)"
          resume={`Chaque jour à ${heureCourte(v.seances_heure)} : les séances ${v.seances_veille ? 'du lendemain' : 'du jour'}, pour penser à faire l'appel.`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Champ label="Séances" className="col-span-2">
              <Liste value={v.seances_veille ? 'veille' : 'jour'} disabled={!admin} onChange={(e) => maj('seances_veille', e.target.value === 'veille')}>
                <option value="jour">du jour (le matin même)</option>
                <option value="veille">du lendemain (la veille)</option>
              </Liste>
            </Champ>
            <Champ label="Heure">{choixHeure('seances_heure')}</Champ>
          </div>
        </Ligne>
      </Bloc>

      <Bloc icone={Users} titre="Bénéficiaires : rappels par WhatsApp ou SMS"
        sousTitre="Uniquement pour les personnes qui ont donné leur accord (case « Accepte de recevoir des rappels » sur leur fiche).">
        <Ligne actif={v.cibles_actif} onActif={(x) => maj('cibles_actif', x)} admin={admin} titre="Rappels aux bénéficiaires"
          resume="Chaque jour, la liste des messages à envoyer apparaît dans « Rappels à envoyer » : un geste par personne sur WhatsApp, ou un message pour le groupe.">
          <div className="grid gap-2 sm:grid-cols-2">
            <Case v={v.cibles_seances} onChange={(x) => maj('cibles_seances', x)} admin={admin} texte="La veille d'une séance de formation" />
            <Case v={v.cibles_evenements} onChange={(x) => maj('cibles_evenements', x)} admin={admin} texte="La veille d'un événement où leur action est invitée" />
            <Case v={v.cibles_remises} onChange={(x) => maj('cibles_remises', x)} admin={admin} texte="La veille d'une remise de kits ou d'attestations" />
            <div className="flex items-center gap-2">
              <Case v={v.cibles_suivis} onChange={(x) => maj('cibles_suivis', x)} admin={admin} texte="Avant un appel de suivi :" />
              <Input type="number" min={1} max={14} className="h-8 w-16" disabled={!admin || !v.cibles_suivis} value={v.suivi_jours_avant} onChange={(e) => maj('suivi_jours_avant', Number(e.target.value))} />
              <span className="text-sm">jours avant</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Le rappel de suivi ne dit rien de l'action suivie (secret médical) : « Nous vous appellerons dans les prochains jours pour prendre de vos nouvelles. »</p>
        </Ligne>
        <Ligne actif={v.sms_actif} onActif={(x) => maj('sms_actif', x)} admin={admin} disabled={!v.cibles_actif} titre="SMS automatiques (personnes sans WhatsApp)"
          resume={`Chaque jour à ${heureCourte(v.sms_heure)}, un SMS part tout seul vers les personnes qui ont choisi « Par SMS ». Payant : crédits SMS à acheter dans Brevo.`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Champ label="Heure d'envoi">{choixHeure('sms_heure')}</Champ>
            <Champ label="Nom d'expéditeur" aide="3 à 11 lettres ou chiffres">
              <Input value={v.sms_expediteur} maxLength={11} disabled={!admin} onChange={(e) => maj('sms_expediteur', e.target.value.replace(/[^A-Za-z0-9]/g, ''))} />
            </Champ>
          </div>
          {admin ? (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
              <Champ label="Essayer : envoyer un SMS à" className="min-w-48 flex-1">
                <Input type="tel" inputMode="tel" placeholder="77 123 45 67" value={telTest} onChange={(e) => setTelTest(e.target.value)} />
              </Champ>
              <Button variant="secondary" disabled={envoi || telTest.replace(/\D/g, '').length < 9} onClick={smsTest}><Send /> SMS d'essai</Button>
            </div>
          ) : null}
        </Ligne>
        <Button asChild variant="secondary" size="sm"><Link to="/rappels"><MessageCircle /> Voir les rappels à envoyer</Link></Button>
      </Bloc>

      {sms.length ? (
        <Bloc icone={MessageSquareText} titre="Derniers SMS automatiques">
          <div className="divide-y divide-border text-sm">
            {sms.map((s) => (
              <div key={s.id} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{new Date(s.envoye_le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {' · '}{s.cible ? `${s.cible.prenom ?? ''} ${s.cible.nom}` : '—'} · {s.objet === 'seance' ? 'séance' : s.objet === 'suivi' ? 'suivi' : 'événement'}
                </span>
                <span className={cn('shrink-0 font-medium', s.statut === 'envoye' ? 'text-primary' : 'text-destructive')} title={s.erreur ?? undefined}>{s.statut === 'envoye' ? 'envoyé' : 'échec'}</span>
              </div>
            ))}
          </div>
        </Bloc>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarClock className="size-4" /> Dernière modification : {new Date(v.modifie_le).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}.
        Un envoi manqué (panne) est rattrapé dans les deux heures ; un rappel activé après son heure partira le jour suivant.
      </p>
    </div>
  )
}

function Bloc({ icone: Icone, titre, sousTitre, children }: { icone: typeof BellRing; titre: string; sousTitre?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-carte md:p-5">
      <div className="flex gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icone className="size-5" /></span>
        <div>
          <h2 className="font-semibold">{titre}</h2>
          {sousTitre ? <p className="text-sm text-muted-foreground">{sousTitre}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function Ligne({ titre, resume, actif, onActif, admin, disabled, children }: {
  titre: string; resume: string; actif: boolean; onActif: (v: boolean) => void; admin: boolean; disabled?: boolean; children: ReactNode
}) {
  return (
    <div className={cn('rounded-xl border border-border p-3', disabled && 'opacity-60')}>
      <label className="flex items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">{titre}</span>
          <span className="block text-sm text-muted-foreground">{actif && !disabled ? resume : 'Désactivé.'}</span>
        </span>
        <Switch checked={actif} disabled={!admin || disabled} onCheckedChange={onActif} />
      </label>
      {actif && !disabled ? <div className="mt-3">{children}</div> : null}
    </div>
  )
}

function Case({ v, onChange, admin, texte }: { v: boolean; onChange: (v: boolean) => void; admin: boolean; texte: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-primary" checked={v} disabled={!admin} onChange={(e) => onChange(e.target.checked)} /> {texte}
    </label>
  )
}
