import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Lock, Stethoscope } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Champ, Pastilles } from '@/components/champs'
import { aujourdhui, date } from '@/lib/format'
import { STATUTS_CONSULTATION } from '@/lib/partenaires'
import { messageErreur, supabase } from '@/lib/supabase'
import type { Consultation, StatutConsultation } from '@/lib/types'

export function PastilleConsultation({ statut }: { statut: StatutConsultation }) {
  const s = STATUTS_CONSULTATION[statut]
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: s.couleur, background: s.fond }}><Stethoscope className="size-3" />{s.libelle}</span>
}

/**
 * Dossier d'un patient pour une action de santé : consultations passées et
 * saisie d'une nouvelle. Le détail médical n'apparaît que pour son auteur et
 * les responsables de l'action (la base ne le renvoie pas aux autres).
 */
export function ConsultationDialog({ patient, consultations, peutSaisir, fermer, apres }: {
  patient: { beneficiaire_id: string; prenom: string | null; nom: string; age?: number | null; sexe?: string | null }
  consultations: Consultation[]
  peutSaisir: boolean
  fermer: () => void
  apres: () => void
}) {
  const qc = useQueryClient()
  const vide = { statut: 'vu' as StatutConsultation, date: aujourdhui(), diagnostic: '', traitement: '', orientation: '', notes: '' }
  const [v, setV] = useState(vide)
  const [enCours, setEnCours] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const siennes = consultations.filter((c) => c.beneficiaire_id === patient.beneficiaire_id)

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    const { error } = await supabase.rpc('enregistrer_consultation', {
      p_beneficiaire: patient.beneficiaire_id, p_statut: v.statut, p_diagnostic: v.diagnostic, p_traitement: v.traitement,
      p_orientation: v.orientation, p_notes: v.notes, p_date: v.date, p_consultation: enCours,
    })
    setEnvoi(false)
    if (error) return toast.error(messageErreur(error))
    toast.success('Consultation enregistrée')
    setV(vide)
    setEnCours(null)
    qc.invalidateQueries({ queryKey: ['consultations'] })
    apres()
  }

  function modifier(c: Consultation) {
    setEnCours(c.id)
    setV({ statut: c.statut, date: c.date, diagnostic: c.detail?.diagnostic ?? '', traitement: c.detail?.traitement ?? '', orientation: c.detail?.orientation ?? '', notes: c.detail?.notes ?? '' })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{patient.prenom} {patient.nom}</DialogTitle>
          <DialogDescription>
            {[patient.age != null ? `${patient.age} ans` : null, patient.sexe === 'F' ? 'Femme' : patient.sexe === 'M' ? 'Homme' : null].filter(Boolean).join(' · ') || 'Dossier de consultation'}
          </DialogDescription>
        </DialogHeader>

        {siennes.length ? (
          <div className="space-y-2">
            {siennes.map((c) => (
              <div key={c.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <PastilleConsultation statut={c.statut} />
                  <span className="text-xs text-muted-foreground">{date(c.date)}{c.auteur_nom ? ` · ${c.auteur_nom}` : ''}</span>
                </div>
                {c.detail ? (
                  <dl className="mt-2 space-y-1 text-[13px]">
                    {c.detail.diagnostic ? <div><dt className="inline font-medium">Diagnostic : </dt><dd className="inline">{c.detail.diagnostic}</dd></div> : null}
                    {c.detail.traitement ? <div><dt className="inline font-medium">Traitement : </dt><dd className="inline">{c.detail.traitement}</dd></div> : null}
                    {c.detail.orientation ? <div><dt className="inline font-medium">Orientation : </dt><dd className="inline">{c.detail.orientation}</dd></div> : null}
                    {c.detail.notes ? <div className="whitespace-pre-line text-muted-foreground">{c.detail.notes}</div> : null}
                  </dl>
                ) : (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" /> Détail médical confidentiel (réservé au soignant et aux responsables de l'action).</p>
                )}
                {peutSaisir && c.detail ? <Button size="sm" variant="ghost" className="mt-1 h-7 px-2" onClick={() => modifier(c)}>Corriger</Button> : null}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Aucune consultation enregistrée.</p>}

        {peutSaisir ? (
          <form onSubmit={enregistrer} className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="text-sm font-semibold">{enCours ? 'Corriger la consultation' : 'Nouvelle consultation'}</div>
            <Champ label="Résultat">
              <Pastilles<StatutConsultation> value={v.statut} onChange={(statut) => setV({ ...v, statut })}
                options={Object.entries(STATUTS_CONSULTATION).map(([k, s]) => [k as StatutConsultation, s.libelle])} />
            </Champ>
            <Champ label="Date"><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Champ>
            <Champ label="Diagnostic"><Input value={v.diagnostic} onChange={(e) => setV({ ...v, diagnostic: e.target.value })} placeholder="Cataracte œil gauche, hypertension…" /></Champ>
            <Champ label="Traitement donné"><Input value={v.traitement} onChange={(e) => setV({ ...v, traitement: e.target.value })} placeholder="Collyre, lunettes, médicaments…" /></Champ>
            <Champ label="Orientation"><Input value={v.orientation} onChange={(e) => setV({ ...v, orientation: e.target.value })} placeholder="Hôpital, spécialiste, date de rendez-vous…" /></Champ>
            <Champ label="Notes"><Textarea rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Champ>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0" /> Seul le résultat est visible de l'équipe de l'association. Le détail reste confidentiel.</p>
            <div className="flex justify-end gap-2">
              {enCours ? <Button type="button" variant="ghost" onClick={() => { setEnCours(null); setV(vide) }}>Annuler</Button> : null}
              <Button type="submit" disabled={envoi}>Enregistrer</Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
