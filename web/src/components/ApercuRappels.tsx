import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, ClipboardCheck, MapPin, Phone, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Chargement, Erreur, Pastilles } from '@/components/champs'
import { aujourdhui, date } from '@/lib/format'
import { supabase, verifier } from '@/lib/supabase'

interface Seance { action_id: string; action: string; numero: number; theme: string | null; heure_debut: string | null; heure_fin: string | null; lieu: string | null; inscrits: number }
interface Suivi { cible_id: string; nom: string; telephone: string | null; action: string; echeance: number; date_prevue: string; retard: number; charge?: string }
interface Apercu { prenom?: string; seances?: Seance[]; suivis?: Suivi[]; retards?: Suivi[]; seuil?: number; fenetre?: number }

const heure = (h: string | null) => (h ? h.slice(0, 5).replace(':', 'h') : '')
const demain = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE') }

/** Ce que contiendraient les rappels (séances, suivis), affiché dans l'application, sans email. */
export function ApercuRappels({ ouvert, fermer, type: typeDepart = 'seances' }: { ouvert: boolean; fermer: () => void; type?: 'seances' | 'hebdo' }) {
  const [type, setType] = useState<'seances' | 'hebdo'>(typeDepart)
  const [jour, setJour] = useState<'auj' | 'dem'>('auj')
  const leJour = jour === 'auj' ? aujourdhui() : demain()

  const { data, isLoading, error } = useQuery({
    queryKey: ['apercu-rappels', type, type === 'seances' ? leJour : null],
    enabled: ouvert,
    staleTime: 0,
    queryFn: async () => verifier(await supabase.rpc('mon_apercu_rappels', { p_type: type, p_jour: leJour })) as Apercu,
  })

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aperçu de mes rappels</DialogTitle>
          <DialogDescription>Ce que vous recevriez, affiché ici, sans email.</DialogDescription>
        </DialogHeader>
        <Pastilles<'seances' | 'hebdo'> value={type} onChange={setType} options={[['seances', 'Mes séances'], ['hebdo', 'Mes suivis']]} />
        {type === 'seances' ? (
          <Pastilles<'auj' | 'dem'> value={jour} onChange={setJour} options={[['auj', "Aujourd'hui"], ['dem', 'Demain']]} />
        ) : null}

        {error ? <Erreur erreur={error} /> : isLoading || !data ? <Chargement /> : type === 'seances' ? (
          !data.seances?.length ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              <CalendarClock className="mx-auto mb-2 size-6" />
              Aucune séance {jour === 'auj' ? "aujourd'hui" : 'demain'} pour vos actions (comme responsable ou dans l'équipe).
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">Bonjour {data.prenom}, {data.seances.length > 1 ? `${data.seances.length} séances` : 'une séance'} {jour === 'auj' ? "aujourd'hui" : `demain (${date(leJour)})`} :</p>
              {data.seances.map((s) => (
                <div key={`${s.action_id}-${s.numero}`} className="rounded-xl border border-border p-4">
                  <div className="font-semibold">{s.action}</div>
                  <div className="mt-0.5 text-sm">Séance {s.numero}{s.theme ? ` — ${s.theme}` : ''}</div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {s.heure_debut ? <span className="inline-flex items-center gap-1"><CalendarClock className="size-4" /> {heure(s.heure_debut)}{s.heure_fin ? ` – ${heure(s.heure_fin)}` : ''}</span> : null}
                    {s.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="size-4" /> {s.lieu}</span> : null}
                    <span className="inline-flex items-center gap-1"><Users className="size-4" /> {s.inscrits} inscrit{s.inscrits > 1 ? 's' : ''}</span>
                  </div>
                  <Link to={`/actions/${s.action_id}`} onClick={fermer} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
                    <ClipboardCheck className="size-4" /> Faire l'appel
                  </Link>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-4">
            <ListeSuivis titre={`Mes suivis à faire (${data.fenetre ?? 7} prochains jours)`} vide="Aucun suivi à faire pour vous. Merci !" lignes={data.suivis ?? []} fermer={fermer} />
            {data.retards?.length ? (
              <ListeSuivis titre={`Retards de plus de ${data.seuil ?? 15} jours dans l'association`} lignes={data.retards} fermer={fermer} avecCharge />
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ListeSuivis({ titre, vide, lignes, fermer, avecCharge }: { titre: string; vide?: string; lignes: Suivi[]; fermer: () => void; avecCharge?: boolean }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{titre}</h3>
      {!lignes.length ? <p className="text-sm text-muted-foreground">{vide}</p> : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {lignes.map((l, i) => (
            <div key={`${l.cible_id}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <Link to={`/cibles/${l.cible_id}`} onClick={fermer} className="font-medium hover:underline">{l.nom}</Link>
                <div className="text-xs text-muted-foreground">{l.action} · suivi à {l.echeance} mois{avecCharge && l.charge ? ` · ${l.charge}` : ''}</div>
                {l.telephone ? <a href={`tel:${l.telephone.replace(/\s/g, '')}`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary"><Phone className="size-3" /> {l.telephone}</a> : null}
              </div>
              <span className={`shrink-0 text-xs font-semibold ${l.retard > 0 ? 'text-destructive' : l.retard === 0 ? 'text-[#8a6a10]' : 'text-muted-foreground'}`}>
                {l.retard > 0 ? `${l.retard} j de retard` : l.retard === 0 ? "aujourd'hui" : `le ${date(l.date_prevue)}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
