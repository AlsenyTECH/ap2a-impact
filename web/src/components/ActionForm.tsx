import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Champ, Liste, ListeMembres, ListeZones } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { aujourdhui } from '@/lib/format'
import { useTypesAction } from '@/lib/requetes'
import { messageErreur, supabase } from '@/lib/supabase'
import type { Action } from '@/lib/types'

type Valeurs = Pick<Action, 'type_id' | 'titre' | 'description' | 'date_debut' | 'date_fin' | 'lieu' | 'zone_id' | 'responsable_id' | 'budget_fcfa'>

export function ActionForm({ ouvert, fermer, action }: { ouvert: boolean; fermer: () => void; action?: Action }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { membre } = useAuth()
  const { data: types = [] } = useTypesAction()
  const [v, setV] = useState<Valeurs>({} as Valeurs)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (ouvert) {
      setV(action ?? {
        type_id: 0, titre: '', description: '', date_debut: aujourdhui(), date_fin: null, lieu: '',
        zone_id: null, responsable_id: membre?.id ?? null, budget_fcfa: null,
      })
    }
  }, [ouvert, action, membre])

  const maj = <K extends keyof Valeurs>(k: K, val: Valeurs[K]) => setV((x) => ({ ...x, [k]: val }))

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    const donnees = {
      type_id: v.type_id, titre: v.titre.trim(), description: v.description?.trim() || null,
      date_debut: v.date_debut, date_fin: v.date_fin || null, lieu: v.lieu?.trim() || null,
      zone_id: v.zone_id, responsable_id: v.responsable_id, budget_fcfa: v.budget_fcfa,
    }
    const r = action
      ? await supabase.from('actions').update(donnees).eq('id', action.id).select('id').single()
      : await supabase.from('actions').insert(donnees).select('id').single()
    setEnvoi(false)
    if (r.error) return toast.error(messageErreur(r.error))
    qc.invalidateQueries({ queryKey: ['actions'] })
    qc.invalidateQueries({ queryKey: ['action'] })
    toast.success(action ? 'Action modifiée' : 'Action créée')
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
              {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
            </Liste>
          </Champ>
          <Champ label="Titre">
            <Input required value={v.titre} onChange={(e) => maj('titre', e.target.value)} placeholder="Formation électricité bâtiment — promotion 2026" />
          </Champ>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Début"><Input type="date" required value={v.date_debut} onChange={(e) => maj('date_debut', e.target.value)} /></Champ>
            <Champ label="Fin"><Input type="date" min={v.date_debut} value={v.date_fin ?? ''} onChange={(e) => maj('date_fin', e.target.value)} /></Champ>
          </div>
          <Champ label="Lieu"><Input value={v.lieu ?? ''} onChange={(e) => maj('lieu', e.target.value)} placeholder="Centre 3FPT, École Unité 15…" /></Champ>
          <Champ label="Zone"><ListeZones value={v.zone_id} onChange={(z) => maj('zone_id', z)} /></Champ>
          <Champ label="Responsable">
            <ListeMembres value={v.responsable_id} onChange={(m) => maj('responsable_id', m)} roles={['admin', 'bureau', 'coordinateur']} />
          </Champ>
          <Champ label="Budget (FCFA)">
            <Input type="number" min={0} inputMode="numeric" value={v.budget_fcfa ?? ''} onChange={(e) => maj('budget_fcfa', e.target.value ? Number(e.target.value) : null)} />
          </Champ>
          <Champ label="Description"><Textarea rows={3} value={v.description ?? ''} onChange={(e) => maj('description', e.target.value)} /></Champ>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi}>Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
