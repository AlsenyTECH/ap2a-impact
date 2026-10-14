import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarHeart, Check, Copy, GraduationCap, MessageCircle, MessageSquareText, PhoneCall, Settings, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Chargement, EnTete, Erreur } from '@/components/champs'
import { Liste } from '@/components/design'
import { useAuth } from '@/lib/auth'
import { heureCourte, lienWhatsAppIntl, messageGroupe, useRappelsCibles, useReglagesRappels, type RappelCible } from '@/lib/rappels'
import { messageErreur, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const ICONES = { seance: GraduationCap, evenement: CalendarHeart, remise: CalendarHeart, suivi: PhoneCall }
const dateLongue = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/**
 * Rappels du jour aux bénéficiaires (veille des séances et des événements,
 * avant un appel de suivi) : un geste par personne sur WhatsApp ou par SMS
 * depuis son téléphone, ou un message pour le groupe WhatsApp.
 */
export function RappelsAEnvoyer() {
  const { a } = useAuth()
  const qc = useQueryClient()
  const { data: reglages } = useReglagesRappels()
  const { data: rappels = [], isLoading, error } = useRappelsCibles()

  if (isLoading) return <Chargement />
  if (error) return <Erreur erreur={error} />

  // Un rappel de suivi reste proposé plusieurs jours ; une fois envoyé (un autre jour), on ne le montre plus.
  const debutDuJour = new Date(new Date().toDateString()).getTime()
  const visibles = rappels.filter((r) => !(r.objet === 'suivi' && r.envoye_le && new Date(r.envoye_le).getTime() < debutDuJour))
  // Un groupe par séance ou événement ; les appels de suivi ensemble.
  const groupes = new Map<string, RappelCible[]>()
  for (const r of visibles) {
    const cle = r.objet === 'suivi' ? 'suivi' : `${r.objet}:${r.objet_id}`
    groupes.set(cle, [...(groupes.get(cle) ?? []), r])
  }
  // Le serveur dit si un SMS automatique partira encore aujourd'hui (sinon : boutons manuels).
  const automatique = (r: RappelCible) => r.sms_auto
  const restants = visibles.filter((r) => !r.envoye_le && !automatique(r)).length

  async function noter(r: RappelCible, canal: 'whatsapp' | 'sms') {
    const { error: e } = await supabase.rpc('noter_rappel', { p_cible: r.cible_id, p_objet: r.objet, p_objet_id: r.objet_id, p_canal: canal })
    if (e) return toast.error(messageErreur(e))
    qc.setQueryData<RappelCible[]>(['rappels-cibles'], (l) => l?.map((x) => (x === r ? { ...x, envoye_le: new Date().toISOString(), envoye_canal: canal } : x)))
  }
  async function annuler(r: RappelCible) {
    const { data, error: e } = await supabase.from('rappels_cibles').delete().eq('cible_id', r.cible_id).eq('objet', r.objet).eq('objet_id', r.objet_id).select('id')
    if (e) return toast.error(messageErreur(e))
    if (!data?.length) return toast.error('Seule la personne qui l\'a noté peut l\'annuler')
    qc.invalidateQueries({ queryKey: ['rappels-cibles'] })
  }

  return (
    <div className="space-y-6">
      <EnTete
        titre="Rappels à envoyer"
        sousTitre={visibles.length ? `${restants} message${restants > 1 ? 's' : ''} à envoyer sur ${visibles.length}. À faire de préférence en fin de journée.` : undefined}
        actions={a('admin', 'bureau') ? <Button variant="secondary" asChild><Link to="/reglages-rappels"><Settings /> Réglages</Link></Button> : undefined}
      />

      {reglages && !reglages.cibles_actif ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Les rappels aux bénéficiaires sont désactivés.{a('admin') ? <> Activez-les dans <Link className="font-medium text-primary underline" to="/reglages-rappels">Réglages → Rappels</Link>.</> : ' Un administrateur peut les activer.'}
        </p>
      ) : !visibles.length ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <Check className="mx-auto mb-2 size-8 text-primary" />
          Aucun rappel à envoyer aujourd'hui pour vos actions.
          <span className="mt-1 block text-xs">Seules les personnes qui ont donné leur accord (case sur leur fiche) et qui ont un téléphone apparaissent ici.</span>
        </div>
      ) : (
        [...groupes.entries()].map(([cle, liste]) => {
          const r0 = liste[0]
          const Icone = ICONES[r0.genre]
          const faits = liste.filter((r) => r.envoye_le || automatique(r)).length
          return (
            <section key={cle} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icone className="size-5" /></span>
                  <div>
                    <h2 className="font-semibold leading-tight">
                      {r0.objet === 'suivi' ? 'Appels de suivi des prochains jours' : r0.titre}
                      {r0.genre === 'remise' ? <Badge variant="secondary" className="ml-2 align-middle">Remise</Badge> : null}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {r0.objet === 'suivi'
                        ? "Prévenir que l'AP2A va appeler (le message ne dit rien de l'action)"
                        : `Demain ${dateLongue(r0.quand)}${r0.heure ? ` à ${heureCourte(r0.heure)}` : ''}${r0.lieu ? ` · ${r0.lieu}` : ''}`}
                      {' · '}<b className={faits === liste.length ? 'text-primary' : 'text-foreground'}>{faits}/{liste.length} prévenu{faits > 1 ? 's' : ''}</b>
                    </p>
                  </div>
                </div>
                {r0.objet !== 'suivi' ? (
                  <Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(messageGroupe(r0)); toast.success('Message copié : collez-le dans le groupe WhatsApp') }}>
                    <Copy /> Message pour le groupe
                  </Button>
                ) : null}
              </div>
              <Liste>
                {liste.map((r) => (
                  <div key={`${r.cible_id}-${r.objet_id}`} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', r.envoye_le && 'bg-muted/40')}>
                    <div className="min-w-0 flex-1">
                      <Link to={`/cibles/${r.cible_id}`} className="font-medium hover:underline">{r.nom}</Link>
                      <div className="text-xs text-muted-foreground">
                        {r.telephone} · {r.canal === 'sms' ? 'préfère les SMS' : 'WhatsApp'}
                        {r.objet === 'suivi' ? ` · ${r.titre} · suivi le ${dateLongue(r.quand)}` : ''}
                      </div>
                      {r.erreur && !r.envoye_le ? <div className="text-xs text-destructive">SMS automatique non parti : {r.erreur}</div> : null}
                    </div>
                    {r.envoye_le ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="inline-flex items-center gap-1 font-medium text-primary">
                          <Check className="size-4" /> {r.envoye_canal === 'sms' ? 'SMS' : 'WhatsApp'} · {new Date(r.envoye_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <Button size="icon" variant="ghost" onClick={() => annuler(r)} aria-label="Annuler : pas encore envoyé"><Undo2 /></Button>
                      </div>
                    ) : automatique(r) ? (
                      <Badge variant="secondary">SMS automatique à {reglages ? heureCourte(reglages.sms_heure) : ''}</Badge>
                    ) : (
                      <div className="flex gap-2">
                        {r.canal === 'sms' ? (
                          <Button asChild size="sm">
                            <a href={`sms:+${r.telephone_intl}?&body=${encodeURIComponent(r.message)}`} onClick={() => noter(r, 'sms')}><MessageSquareText /> SMS</a>
                          </Button>
                        ) : null}
                        <Button asChild size="sm" variant={r.canal === 'sms' ? 'secondary' : 'default'} className={r.canal === 'sms' ? '' : 'bg-[#1fa855] hover:bg-[#1a9049]'}>
                          <a target="_blank" rel="noreferrer" href={lienWhatsAppIntl(r.telephone_intl, r.message)} onClick={() => noter(r, 'whatsapp')}><MessageCircle /> WhatsApp</a>
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </Liste>
            </section>
          )
        })
      )}
    </div>
  )
}
