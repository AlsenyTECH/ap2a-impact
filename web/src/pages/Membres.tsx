import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Chargement, Champ, EnTete, Erreur, Pastilles } from '@/components/champs'
import { Avatar, Liste as Encadre } from '@/components/design'
import { useAuth } from '@/lib/auth'
import { LIBELLES_ROLE } from '@/lib/format'
import { useMembres } from '@/lib/requetes'
import { messageErreur, supabase } from '@/lib/supabase'
import type { Membre, Role } from '@/lib/types'

export function Membres() {
  const { a } = useAuth()
  const { data: membres, isLoading, error } = useMembres()
  const [edition, setEdition] = useState<Membre | 'nouveau' | null>(null)
  const [recherche, setRecherche] = useState('')
  const gestion = a('admin', 'bureau')
  const filtre = recherche.trim().toLowerCase()
  const liste = (membres ?? []).filter((m) => !filtre || `${m.prenom} ${m.nom} ${m.telephone ?? ''} ${m.numero_adherent}`.toLowerCase().includes(filtre))

  return (
    <>
      <EnTete
        titre="Membres"
        sousTitre={`${membres?.filter((m) => m.actif).length ?? 0} membres actifs`}
        actions={gestion ? <Button onClick={() => setEdition('nouveau')}><Plus className="size-4" /> Nouveau</Button> : null}
      />
      <Input className="mb-4" placeholder="Rechercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      {error ? <Erreur erreur={error} /> : isLoading ? <Chargement /> : (
        <Encadre>
          {liste.map((m) => (
            <button
              key={m.id}
              disabled={!gestion}
              onClick={() => setEdition(m)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-muted/50"
            >
              <Avatar prenom={m.prenom} nom={m.nom} />
              <div className="min-w-0 flex-1">
                <div className={m.actif ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>{m.prenom} {m.nom}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[m.numero_adherent, m.fonction, m.telephone].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={m.role === 'membre' ? 'outline' : 'secondary'}>{LIBELLES_ROLE[m.role]}</Badge>
                {gestion && !m.user_id ? <span className="text-[11px] text-muted-foreground">accès non activé</span> : null}
              </div>
            </button>
          ))}
        </Encadre>
      )}
      <MembreForm membre={edition} fermer={() => setEdition(null)} />
    </>
  )
}

function MembreForm({ membre, fermer }: { membre: Membre | 'nouveau' | null; fermer: () => void }) {
  const qc = useQueryClient()
  const { a, membre: moi } = useAuth()
  const [v, setV] = useState({ prenom: '', nom: '', telephone: '', email: '', fonction: '', role: 'membre' as Role, actif: true })
  const [envoi, setEnvoi] = useState(false)
  const existant = membre && membre !== 'nouveau' ? membre : null

  useEffect(() => {
    if (membre) setV(existant
      ? { prenom: existant.prenom, nom: existant.nom, telephone: existant.telephone ?? '', email: existant.email ?? '', fonction: existant.fonction ?? '', role: existant.role, actif: existant.actif }
      : { prenom: '', nom: '', telephone: '', email: '', fonction: '', role: 'membre', actif: true })
  }, [membre, existant])

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    const donnees = {
      prenom: v.prenom.trim(), nom: v.nom.trim(), telephone: v.telephone.trim() || null,
      email: v.email.trim().toLowerCase() || null, fonction: v.fonction.trim() || null, actif: v.actif,
      ...(a('admin') ? { role: v.role } : {}),
    }
    const r = existant
      ? await supabase.from('membres').update(donnees).eq('id', existant.id)
      : await supabase.from('membres').insert(donnees)
    setEnvoi(false)
    if (r.error) return toast.error(messageErreur(r.error))
    toast.success(existant ? 'Membre modifié' : 'Membre ajouté : il peut activer son accès avec cet email (« Première connexion »).')
    qc.invalidateQueries({ queryKey: ['membres'] })
    fermer()
  }

  const moiMeme = existant?.id === moi?.id
  return (
    <Dialog open={!!membre} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{existant ? `${existant.prenom} ${existant.nom}` : 'Nouveau membre'}</DialogTitle></DialogHeader>
        <form onSubmit={enregistrer} className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Prénom"><Input required value={v.prenom} onChange={(e) => setV({ ...v, prenom: e.target.value })} /></Champ>
            <Champ label="Nom"><Input required value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} /></Champ>
          </div>
          <Champ label="Téléphone"><Input type="tel" value={v.telephone} onChange={(e) => setV({ ...v, telephone: e.target.value })} /></Champ>
          <Champ label="Email" aide="Nécessaire pour qu'il ou elle se connecte à l'application.">
            <Input type="email" value={v.email} disabled={!!existant?.user_id} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </Champ>
          <Champ label="Fonction dans l'association"><Input value={v.fonction} placeholder="Présidente, trésorier, chargé de communication…" onChange={(e) => setV({ ...v, fonction: e.target.value })} /></Champ>
          {a('admin') && !moiMeme ? (
            <Champ label="Rôle dans l'application" aide="Coordinateur : crée des actions et suit les bénéficiaires. Bureau : gère tout le contenu. Administrateur : gère aussi les rôles.">
              <Pastilles<Role> value={v.role} onChange={(role) => setV({ ...v, role })} options={Object.entries(LIBELLES_ROLE) as [Role, string][]} />
            </Champ>
          ) : null}
          {existant && !moiMeme ? (
            <label className="flex items-center justify-between text-sm">
              Membre actif (un membre inactif n'a plus accès)
              <Switch checked={v.actif} onCheckedChange={(actif) => setV({ ...v, actif })} />
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi}>Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
