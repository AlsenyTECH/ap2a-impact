import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { IdCard, Plus, Printer, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Chargement, Champ, EnTete, Erreur, Liste, Pastilles } from '@/components/champs'
import { OutilsListe } from '@/components/OutilsListe'
import { correspond, trier } from '@/lib/recherche'
import { Avatar, Liste as Encadre } from '@/components/design'
import { CarteDialog } from '@/components/CarteDialog'
import { BoutonsInvitation } from '@/components/Invitation'
import { DialogDescription } from '@/components/ui/dialog'
import { PhotoFiche } from '@/components/PhotoFiche'
import { usePhotos } from '@/lib/photos'
import { useAuth } from '@/lib/auth'
import { droitsDe, nomRole, roleDuMembre, useRoles, usePermissions } from '@/lib/droits'
import { useMembres } from '@/lib/requetes'
import { messageErreur, supabase } from '@/lib/supabase'
import type { Membre } from '@/lib/types'

export function Membres() {
  const { peut, membre: moi } = useAuth()
  const { data: membres, isLoading, error } = useMembres()
  const { data: roles = [] } = useRoles()
  const [carteDe, setCarteDe] = useState<Membre | null>(null)
  const [inviter, setInviter] = useState<Membre | null>(null)
  const [acces, setAcces] = useState<'' | 'actives' | 'attente'>('')
  const { data: photos = {} } = usePhotos((membres ?? []).map((m) => m.photo_chemin))
  const [edition, setEdition] = useState<Membre | 'nouveau' | null>(null)
  const [recherche, setRecherche] = useState('')
  const gestion = peut('membres.gerer')
  const [tri, setTri] = useState<'nom' | 'numero' | 'role' | 'recents'>('nom')
  const [role, setRole] = useState('')
  const [inactifs, setInactifs] = useState(false)
  const retenus = (membres ?? []).filter((m) => (inactifs || m.actif) && (!role || m.role_id === role)
    && (!acces || (acces === 'actives') === !!m.user_id)
    && correspond(recherche, m.prenom, m.nom, m.telephone, m.email, m.numero_adherent, m.fonction, nomRole(m)))
  const ordreRole = new Map(roles.map((r, i) => [r.id, i]))
  const liste = tri === 'nom' ? trier(retenus, (m) => `${m.nom} ${m.prenom}`)
    : tri === 'numero' ? trier(retenus, (m) => m.numero_adherent)
    : tri === 'role' ? trier(retenus, (m) => ordreRole.get(m.role_id) ?? 99)
    : trier(retenus, (m) => m.date_adhesion, 'desc')

  return (
    <>
      <EnTete
        titre="Membres"
        sousTitre={`${membres?.filter((m) => m.actif).length ?? 0} membres actifs`}
        actions={gestion ? (
          <>
            <Button asChild variant="secondary"><Link to="/cartes?membres=tous"><Printer className="size-4" /> Cartes de tous</Link></Button>
            <Button onClick={() => setEdition('nouveau')}><Plus className="size-4" /> Nouveau</Button>
          </>
        ) : null}
      />
      <OutilsListe
        recherche={recherche}
        setRecherche={setRecherche}
        placeholder="Nom, n° d'adhérent, téléphone, fonction…"
        tris={[['nom', 'Nom A → Z'], ['numero', "N° d'adhérent"], ['role', 'Par rôle'], ['recents', 'Adhésions récentes']]}
        tri={tri}
        setTri={setTri}
        total={membres ? liste.length : undefined}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Pastilles<string> value={role} onChange={(r) => setRole(r === role ? '' : r)} options={[['', 'Tous'], ...roles.filter((r) => (membres ?? []).some((m) => m.role_id === r.id)).map((r) => [r.id, r.nom] as [string, string])]} />
          {gestion ? (
            <Pastilles<'' | 'actives' | 'attente'> value={acces} onChange={(v) => setAcces(v === acces ? '' : v)}
              options={[['actives', 'Accès activé'], ['attente', `Accès non activé (${(membres ?? []).filter((m) => m.actif && !m.user_id).length})`]]} />
          ) : null}
          <label className="flex items-center gap-2 text-sm text-muted-foreground"><Switch checked={inactifs} onCheckedChange={setInactifs} /> Inclure les inactifs</label>
        </div>
      </OutilsListe>
      {error ? <Erreur erreur={error} /> : isLoading ? <Chargement /> : (
        <Encadre>
          {liste.map((m) => (
            <div key={m.id} className="flex items-center gap-1 pr-2">
            <button
              disabled={!gestion}
              onClick={() => setEdition(m)}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-muted/50"
            >
              <Avatar prenom={m.prenom} nom={m.nom} photo={m.photo_chemin ? photos[m.photo_chemin] : null} />
              <div className="min-w-0 flex-1">
                <div className={m.actif ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>{m.prenom} {m.nom}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[m.numero_adherent, m.fonction, m.telephone].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={m.role_info?.code === 'membre' ? 'outline' : 'secondary'}>{nomRole(m)}</Badge>
                {gestion ? (m.user_id ? <span className="text-[11px] font-medium text-primary">accès activé</span> : <span className="text-[11px] text-muted-foreground">accès non activé</span>) : null}
              </div>
            </button>
            {gestion && !m.user_id && m.actif ? (
              <Button size="icon" variant="ghost" title="Inviter à activer son accès" aria-label="Inviter" onClick={() => setInviter(m)}><Send className="text-primary" /></Button>
            ) : null}
            {gestion || m.id === moi?.id ? (
              <Button size="icon" variant="ghost" title="Carte de membre" aria-label="Carte de membre" onClick={() => setCarteDe(m)}><IdCard className="text-muted-foreground" /></Button>
            ) : null}
            </div>
          ))}
        </Encadre>
      )}
      <MembreForm membre={edition} fermer={() => setEdition(null)} onCree={setInviter} />
      {inviter ? <InviterMembre membre={inviter} fermer={() => setInviter(null)} /> : null}
      {carteDe ? (
        <CarteDialog
          ouvert
          fermer={() => setCarteDe(null)}
          membreId={carteDe.id}
          photoChemin={carteDe.photo_chemin}
          gere={gestion}
          titulaire={{ type: 'membre', prenom: carteDe.prenom, nom: carteDe.nom, numero: carteDe.numero_adherent, detail: [nomRole(carteDe), carteDe.fonction].filter(Boolean).join(' · ') }}
        />
      ) : null}
    </>
  )
}

function MembreForm({ membre, fermer, onCree }: { membre: Membre | 'nouveau' | null; fermer: () => void; onCree?: (m: Membre) => void }) {
  const qc = useQueryClient()
  const { peut, membre: moi } = useAuth()
  const { data: roles = [] } = useRoles()
  const { data: tousDroits = [] } = usePermissions()
  const roleMembre = roles.find((r) => r.code === 'membre')?.id ?? ''
  const [v, setV] = useState({ prenom: '', nom: '', telephone: '', email: '', fonction: '', role_id: '', actif: true })
  const [envoi, setEnvoi] = useState(false)
  const existant = membre && membre !== 'nouveau' ? membre : null

  useEffect(() => {
    if (membre) setV(existant
      ? { prenom: existant.prenom, nom: existant.nom, telephone: existant.telephone ?? '', email: existant.email ?? '', fonction: existant.fonction ?? '', role_id: existant.role_id, actif: existant.actif }
      : { prenom: '', nom: '', telephone: '', email: '', fonction: '', role_id: '', actif: true })
  }, [membre, existant])

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    const donnees = {
      prenom: v.prenom.trim(), nom: v.nom.trim(), telephone: v.telephone.trim() || null,
      email: v.email.trim().toLowerCase() || null, fonction: v.fonction.trim() || null, actif: v.actif,
      ...(peut('roles.gerer') && v.role_id && v.role_id !== existant?.role_id ? { role_id: v.role_id } : {}),
    }
    const r = existant
      ? await supabase.from('membres').update(donnees).eq('id', existant.id)
      : await supabase.from('membres').insert(donnees).select().single()
    setEnvoi(false)
    if (r.error) return toast.error(messageErreur(r.error))
    toast.success(existant ? 'Membre modifié' : 'Membre ajouté')
    qc.invalidateQueries({ queryKey: ['membres'] })
    fermer()
    // Nouveau membre avec email : on propose tout de suite de l'inviter.
    if (!existant && r.data && (r.data as Membre).email) onCree?.(r.data as Membre)
  }

  const moiMeme = existant?.id === moi?.id
  return (
    <Dialog open={!!membre} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{existant ? `${existant.prenom} ${existant.nom}` : 'Nouveau membre'}</DialogTitle></DialogHeader>
        <form onSubmit={enregistrer} className="grid grid-cols-1 gap-4">
          {existant ? (
            <div className="flex items-center gap-3">
              <PhotoFiche dossier="membres" id={existant.id} chemin={existant.photo_chemin} prenom={existant.prenom} nom={existant.nom} modifiable />
              <p className="text-xs text-muted-foreground">Photo d'identité, imprimée sur la carte de membre. Touchez l'appareil photo pour la prendre ou la changer.</p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Prénom"><Input required value={v.prenom} onChange={(e) => setV({ ...v, prenom: e.target.value })} /></Champ>
            <Champ label="Nom"><Input required value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} /></Champ>
          </div>
          <Champ label="Téléphone"><Input type="tel" value={v.telephone} onChange={(e) => setV({ ...v, telephone: e.target.value })} /></Champ>
          <Champ label="Email" aide={existant?.user_id ? "Accès activé : c'est son adresse de connexion." : "Nécessaire pour qu'il ou elle se connecte à l'application."}>
            <Input type="email" value={v.email} disabled={!!existant?.user_id} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </Champ>
          {existant?.user_id && peut('membres.comptes') ? <ChangerEmail membre={existant} apres={(email) => setV({ ...v, email })} /> : null}
          <Champ label="Fonction dans l'association"><Input value={v.fonction} placeholder="Présidente, trésorier, chargé de communication…" onChange={(e) => setV({ ...v, fonction: e.target.value })} /></Champ>
          {peut('roles.gerer') && !moiMeme ? (() => {
            // On n'attribue que des rôles qui n'ont pas plus de droits que soi.
            const mesDroits = new Set(moi ? droitsDe(roleDuMembre(moi), tousDroits) : [])
            const permis = (id: string) => droitsDe(roles.find((r) => r.id === id), tousDroits).every((d) => mesDroits.has(d))
            const choisi = roles.find((r) => r.id === (v.role_id || roleMembre))
            const bloque = !!existant && !permis(existant.role_id)
            return (
              <Champ label="Rôle dans l'application" aide={bloque ? "Ce membre a des droits que vous n'avez pas : vous ne pouvez pas changer son rôle." : <>{choisi?.description ?? ''} <Link to="/roles" className="font-medium text-primary">Voir les droits de chaque rôle</Link></>}>
                <Liste value={v.role_id || roleMembre} disabled={bloque} onChange={(e) => setV({ ...v, role_id: e.target.value })}>
                  {roles.map((r) => <option key={r.id} value={r.id} disabled={!permis(r.id)}>{r.nom}{permis(r.id) ? '' : ' (plus de droits que vous)'}</option>)}
                </Liste>
              </Champ>
            )
          })() : null}
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

/** Invitation d'un membre à activer son accès à l'application. */
function InviterMembre({ membre, fermer }: { membre: Membre; fermer: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inviter {membre.prenom} {membre.nom}</DialogTitle>
          <DialogDescription>
            L'accès est sur invitation : un email lui apporte un lien personnel (usage unique, 24 h) pour choisir son mot de passe.
            Son accès dépendra de son rôle : <b>{nomRole(membre)}</b>.
          </DialogDescription>
        </DialogHeader>
        {membre.email ? (
          <>
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">Adresse : <b>{membre.email}</b>{membre.telephone ? <> · {membre.telephone}</> : null}</div>
            <BoutonsInvitation personne={{ prenom: membre.prenom, email: membre.email, telephone: membre.telephone }} membreId={membre.id} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Ajoutez d'abord son adresse email sur sa fiche : c'est elle qui lui servira d'identifiant.</p>
        )}
        <div className="flex justify-end"><Button variant="ghost" onClick={fermer}>Fermer</Button></div>
      </DialogContent>
    </Dialog>
  )
}

/** Changer l'adresse de connexion d'un membre dont l'accès est activé (administrateur). */
function ChangerEmail({ membre, apres }: { membre: Membre; apres: (email: string) => void }) {
  const qc = useQueryClient()
  const [ouvert, setOuvert] = useState(false)
  const [email, setEmail] = useState('')
  const [envoi, setEnvoi] = useState(false)
  async function valider() {
    const nouveau = email.trim().toLowerCase()
    if (!confirm(`Remplacer l'adresse de connexion de ${membre.prenom} ${membre.nom} par ${nouveau} ? Il ou elle devra désormais se connecter avec cette adresse (même mot de passe).`)) return
    setEnvoi(true)
    try {
      const { data, error } = await supabase.functions.invoke('rappels', { body: { type: 'changer_email', membre_id: membre.id, email: nouveau } })
      if (error) {
        const corps = await (error as { context?: Response }).context?.json?.().catch(() => null)
        throw new Error(corps?.erreur ?? error.message)
      }
      if (!data?.ok) throw new Error(data?.erreur ?? 'Échec')
      toast.success('Adresse de connexion changée')
      apres(nouveau)
      setOuvert(false)
      qc.invalidateQueries({ queryKey: ['membres'] })
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }
  if (!ouvert) {
    return <button type="button" className="-mt-2 justify-self-start text-sm font-medium text-primary" onClick={() => { setEmail(''); setOuvert(true) }}>Changer l'adresse de connexion</button>
  }
  return (
    <div className="-mt-1 grid gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <Input type="email" placeholder="Nouvelle adresse email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <p className="text-xs text-muted-foreground">Le mot de passe ne change pas. L'ancienne adresse ne permettra plus de se connecter.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>Annuler</Button>
        <Button type="button" size="sm" onClick={valider} disabled={envoi || !email.includes('@')}>Changer</Button>
      </div>
    </div>
  )
}
