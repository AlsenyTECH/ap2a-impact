import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Chargement, Champ, EnTete, Erreur } from '@/components/champs'
import { Avatar, Liste as Encadre } from '@/components/design'
import { useAuth } from '@/lib/auth'
import { usePartenaires } from '@/lib/requetes'
import { messageErreur, supabase } from '@/lib/supabase'
import type { Partenaire } from '@/lib/types'

const VIDE = { nom: '', sigle: '', domaine: '', contact_nom: '', telephone: '', email: '', actif: true }

export function Partenaires() {
  const { a } = useAuth()
  const { data: partenaires, isLoading, error } = usePartenaires()
  const [edition, setEdition] = useState<Partenaire | 'nouveau' | null>(null)
  const gestion = a('admin', 'bureau')
  return (
    <>
      <EnTete
        titre="Partenaires"
        sousTitre="Centres de formation, structures de santé, financeurs…"
        actions={gestion ? <Button onClick={() => setEdition('nouveau')}><Plus className="size-4" /> Nouveau</Button> : null}
      />
      {error ? <Erreur erreur={error} /> : isLoading ? <Chargement /> : (
        <Encadre>
          {partenaires?.map((p) => (
            <button key={p.id} disabled={!gestion} onClick={() => setEdition(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-muted/50">
              <Avatar nom={p.sigle || p.nom} nature="structure" />
              <div className="min-w-0 flex-1">
              <div className={p.actif ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>
                {p.sigle ? `${p.sigle} — ` : ''}{p.nom}
              </div>
              <div className="truncate text-xs text-muted-foreground">{[p.domaine, p.contact_nom, p.telephone].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            </button>
          ))}
        </Encadre>
      )}
      <PartenaireForm partenaire={edition} fermer={() => setEdition(null)} />
    </>
  )
}

function PartenaireForm({ partenaire, fermer }: { partenaire: Partenaire | 'nouveau' | null; fermer: () => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState(VIDE)
  const existant = partenaire && partenaire !== 'nouveau' ? partenaire : null
  useEffect(() => {
    if (partenaire) setV(existant ? Object.fromEntries(Object.entries({ ...VIDE, ...existant }).map(([k, x]) => [k, x ?? ''])) as typeof VIDE : VIDE)
  }, [partenaire, existant])

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    const donnees = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x.trim() || null : x]))
    const r = existant ? await supabase.from('partenaires').update(donnees).eq('id', existant.id) : await supabase.from('partenaires').insert(donnees)
    if (r.error) return toast.error(messageErreur(r.error))
    qc.invalidateQueries({ queryKey: ['partenaires'] })
    fermer()
  }
  const champ = (k: keyof typeof VIDE, label: string, type = 'text') => (
    <Champ label={label}><Input type={type} required={k === 'nom'} value={v[k] as string} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Champ>
  )
  return (
    <Dialog open={!!partenaire} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{existant ? 'Modifier le partenaire' : 'Nouveau partenaire'}</DialogTitle></DialogHeader>
        <form onSubmit={enregistrer} className="grid grid-cols-1 gap-4">
          {champ('nom', 'Nom')}
          <div className="grid grid-cols-2 gap-3">{champ('sigle', 'Sigle')}{champ('domaine', 'Domaine')}</div>
          {champ('contact_nom', 'Personne de contact')}
          <div className="grid grid-cols-2 gap-3">{champ('telephone', 'Téléphone', 'tel')}{champ('email', 'Email', 'email')}</div>
          {existant ? (
            <label className="flex items-center justify-between text-sm">Actif <Switch checked={v.actif} onCheckedChange={(actif) => setV({ ...v, actif })} /></label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
