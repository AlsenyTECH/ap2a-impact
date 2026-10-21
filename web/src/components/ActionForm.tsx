import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Champ, Liste, ListeMembres, ListeZones } from '@/components/champs'
import { ChoixJours, datesEntre } from '@/components/Seances'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/lib/auth'
import { aujourdhui, nomCible } from '@/lib/format'
import { useCibles, useTypesAction } from '@/lib/requetes'
import { messageErreur, supabase } from '@/lib/supabase'
import type { Action, Cible } from '@/lib/types'

type Valeurs = Pick<Action, 'type_id' | 'titre' | 'description' | 'date_debut' | 'date_fin' | 'lieu' | 'zone_id' | 'responsable_id' | 'budget_fcfa'>

export function ActionForm({ ouvert, fermer, action }: { ouvert: boolean; fermer: () => void; action?: Action }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { membre } = useAuth()
  const { data: types = [] } = useTypesAction()
  const [v, setV] = useState<Valeurs>({} as Valeurs)
  const [envoi, setEnvoi] = useState(false)
  // Formation sur plusieurs jours : séances créées en même temps que l'action.
  const [seances, setSeances] = useState(false)
  const [jours, setJours] = useState<number[]>([1, 2, 3, 4, 5])
  const [heures, setHeures] = useState({ debut: '09:00', fin: '12:00' })
  // Bénéficiaires choisis parmi les cibles déjà enregistrées.
  const [cibles, setCibles] = useState<Cible[]>([])

  useEffect(() => {
    if (ouvert) {
      setV(action ?? {
        type_id: 0, titre: '', description: '', date_debut: aujourdhui(), date_fin: null, lieu: '',
        zone_id: null, responsable_id: membre?.id ?? null, budget_fcfa: null,
      })
      setSeances(false)
      setCibles([])
    }
  }, [ouvert, action, membre])

  const maj = <K extends keyof Valeurs>(k: K, val: Valeurs[K]) => setV((x) => ({ ...x, [k]: val }))

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    const dates = seances ? datesEntre(v.date_debut, v.date_fin ?? '', jours) : []
    if (seances && !dates.length) return toast.error('Indiquez une date de fin et au moins un jour de séance')
    setEnvoi(true)
    const donnees = {
      type_id: v.type_id, titre: v.titre.trim(), description: v.description?.trim() || null,
      date_debut: v.date_debut, date_fin: v.date_fin || null, lieu: v.lieu?.trim() || null,
      zone_id: v.zone_id, responsable_id: v.responsable_id, budget_fcfa: v.budget_fcfa,
    }
    const r = action
      ? await supabase.from('actions').update(donnees).eq('id', action.id).select('id').single()
      : await supabase.from('actions').insert(donnees).select('id').single()
    if (r.error) { setEnvoi(false); return toast.error(messageErreur(r.error)) }
    if (dates.length) {
      const { error } = await supabase.from('seances').insert(dates.map((d) => ({
        action_id: r.data.id, date: d, heure_debut: heures.debut || null, heure_fin: heures.fin || null, lieu: donnees.lieu,
      })))
      if (error) toast.error(`Action créée, mais les séances n'ont pas pu être ajoutées : ${messageErreur(error)}`)
    }
    if (cibles.length) {
      const { error } = await supabase.from('beneficiaires').insert(cibles.map((c) => ({ action_id: r.data.id, cible_id: c.id })))
      if (error) toast.error(`Action créée, mais les bénéficiaires n'ont pas pu être inscrits : ${messageErreur(error)}`)
    }
    setEnvoi(false)
    qc.invalidateQueries({ queryKey: ['actions'] })
    qc.invalidateQueries({ queryKey: ['action'] })
    toast.success(action ? 'Action modifiée' : `Action créée${[dates.length ? `${dates.length} séances` : '', cibles.length ? `${cibles.length} bénéficiaire(s)` : ''].filter(Boolean).map((x, i) => (i ? ` et ${x}` : ` avec ${x}`)).join('')}`)
    fermer()
    if (!action) navigate(`/actions/${r.data.id}`)
  }

  if (!v.date_debut) return null
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{action ? "Modifier l'action" : 'Nouvelle action'}</DialogTitle></DialogHeader>
        <form onSubmit={enregistrer} className="grid grid-cols-1 gap-4">
          <Champ label="Type d'action">
            <Liste required value={v.type_id || ''} onChange={(e) => maj('type_id', Number(e.target.value))}>
              <option value="">— Choisir —</option>
              {types.filter((t) => t.actif || t.id === v.type_id).map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
            </Liste>
          </Champ>
          <Champ label="Titre">
            <Input required value={v.titre} onChange={(e) => maj('titre', e.target.value)} placeholder="Formation électricité bâtiment — promotion 2026" />
          </Champ>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Début"><Input type="date" required value={v.date_debut} onChange={(e) => maj('date_debut', e.target.value)} /></Champ>
            <Champ label="Fin"><Input type="date" min={v.date_debut} value={v.date_fin ?? ''} onChange={(e) => maj('date_fin', e.target.value)} /></Champ>
          </div>
          {!action ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <label className="flex items-center justify-between gap-3 text-sm font-medium">
                <span>Se déroule en plusieurs séances<span className="block text-xs font-normal text-muted-foreground">Formation, atelier sur plusieurs jours… L'appel se fera à chaque séance.</span></span>
                <Switch checked={seances} onCheckedChange={setSeances} />
              </label>
              {seances ? (
                <div className="mt-3 grid gap-3">
                  <Champ label="Jours de séance"><ChoixJours jours={jours} setJours={setJours} /></Champ>
                  <div className="grid grid-cols-2 gap-3">
                    <Champ label="De"><Input type="time" value={heures.debut} onChange={(e) => setHeures({ ...heures, debut: e.target.value })} /></Champ>
                    <Champ label="À"><Input type="time" value={heures.fin} onChange={(e) => setHeures({ ...heures, fin: e.target.value })} /></Champ>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {v.date_fin ? <><b className="text-foreground">{datesEntre(v.date_debut, v.date_fin, jours).length}</b> séance(s) entre le début et la fin. Vous pourrez en ajouter ou en retirer ensuite.</> : 'Indiquez la date de fin ci-dessus.'}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          <Champ label="Lieu"><Input value={v.lieu ?? ''} onChange={(e) => maj('lieu', e.target.value)} placeholder="Centre 3FPT, École Unité 15…" /></Champ>
          <Champ label="Zone"><ListeZones value={v.zone_id} onChange={(z) => maj('zone_id', z)} /></Champ>
          <Champ label="Responsable">
            <ListeMembres value={v.responsable_id} onChange={(m) => maj('responsable_id', m)} droit="actions.creer" />
          </Champ>
          <Champ label="Budget (FCFA)">
            <Input type="number" min={0} inputMode="numeric" value={v.budget_fcfa ?? ''} onChange={(e) => maj('budget_fcfa', e.target.value ? Number(e.target.value) : null)} />
          </Champ>
          <Champ label="Description"><Textarea rows={3} value={v.description ?? ''} onChange={(e) => maj('description', e.target.value)} /></Champ>
          {!action ? <ChoixCibles cibles={cibles} setCibles={setCibles} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi}>Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Recherche parmi les cibles enregistrées, pour les inscrire dès la création. */
function ChoixCibles({ cibles, setCibles }: { cibles: Cible[]; setCibles: (c: Cible[]) => void }) {
  const [recherche, setRecherche] = useState('')
  const { data: suggestions = [] } = useCibles(recherche, '')
  const choisis = new Set(cibles.map((c) => c.id))
  return (
    <Champ label="Bénéficiaires (cibles déjà enregistrées)" aide="Facultatif : vous pourrez aussi en ajouter, en créer ou importer une liste Excel depuis la page de l'action.">
      <div className="space-y-2">
        <div className="relative">
          <Input placeholder="Chercher : nom, téléphone, groupe…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          {recherche.trim().length >= 2 ? (
            <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
              {suggestions.length ? suggestions.slice(0, 8).map((c) => (
                <button
                  type="button"
                  key={c.id}
                  disabled={choisis.has(c.id)}
                  onClick={() => { setCibles([...cibles, c]); setRecherche('') }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm enabled:hover:bg-muted disabled:opacity-50"
                >
                  <span>{nomCible(c)} <span className="text-muted-foreground">{c.telephone}</span></span>
                  <span className="shrink-0 text-xs text-muted-foreground">{choisis.has(c.id) ? 'choisi' : c.categorie?.libelle}</span>
                </button>
              )) : <p className="px-3 py-2 text-sm text-muted-foreground">Aucune cible trouvée. Créez-la depuis la page Cibles ou depuis l'action.</p>}
            </div>
          ) : null}
        </div>
        {cibles.length ? (
          <div className="flex flex-wrap gap-1.5">
            {cibles.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-accent py-0.5 pl-2.5 pr-1 text-xs font-medium">
                {nomCible(c)}
                <button type="button" aria-label={`Retirer ${nomCible(c)}`} onClick={() => setCibles(cibles.filter((x) => x.id !== c.id))} className="rounded-full p-0.5 hover:bg-background">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><Plus className="size-3" /> Aucun pour l'instant.</p>
        )}
      </div>
    </Champ>
  )
}
