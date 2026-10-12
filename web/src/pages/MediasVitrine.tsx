import { useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ExternalLink, Film, ImagePlus, Loader2, ShieldAlert, Trash2, Youtube } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Chargement, Champ, EnTete, Erreur } from '@/components/champs'
import { Liste } from '@/components/design'
import { useAuth } from '@/lib/auth'
import { messageErreur, supabase } from '@/lib/supabase'
import {
  apercuMedia, deposer, idYoutube, LIBELLES_EMPLACEMENT, reduirePhoto, TAILLE_MAX, useMediasVitrine, vignetteVideo,
  type EmplacementMedia, type MediaVitrine,
} from '@/lib/vitrine'

const ORDRE: EmplacementMedia[] = ['accueil', 'video', 'galerie', 'fondatrice']
const AIDE: Record<EmplacementMedia, string> = {
  accueil: 'Photo ou courte vidéo (sans son, 10 à 20 s) en fond du haut de la page. Seul le premier publié est utilisé.',
  video: 'Le film présenté dans la section « En vidéo » (fichier ou lien YouTube). Seul le premier publié est utilisé.',
  galerie: 'Les photos et courtes vidéos de la galerie « En images ».',
  fondatrice: 'Portrait officiel de Fatou Kiné Diakhaté, uniquement avec son autorisation. Remplace le monogramme.',
}
const EMPLACEMENTS_PAR_TYPE: Record<MediaVitrine['type'], EmplacementMedia[]> = {
  photo: ['galerie', 'accueil', 'fondatrice'],
  video: ['galerie', 'accueil', 'video'],
  youtube: ['video'],
}
const nomPropre = (f: File) => f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)

/** Écran du bureau : déposer, légender, ordonner et publier les médias de la page publique. */
export function MediasVitrine() {
  const { a } = useAuth()
  const qc = useQueryClient()
  const { data: medias = [], isLoading, error } = useMediasVitrine(true)
  const entree = useRef<HTMLInputElement>(null)
  const [envois, setEnvois] = useState<string[]>([])
  const [youtube, setYoutube] = useState(false)
  const [aSupprimer, setASupprimer] = useState<MediaVitrine | null>(null)

  if (!a('admin', 'bureau')) return <Navigate to="/" replace />
  const rafraichir = () => qc.invalidateQueries({ queryKey: ['vitrine-medias'] })
  const prochainOrdre = (e: EmplacementMedia) => Math.max(0, ...medias.filter((m) => m.emplacement === e).map((m) => m.ordre)) + 1

  async function envoyer(fichiers: FileList | null) {
    if (!fichiers?.length) return
    const liste = [...fichiers]
    setEnvois(liste.map((f) => f.name))
    let ordre = prochainOrdre('galerie')
    for (const f of liste) {
      try {
        if (f.type.startsWith('image/')) {
          const chemin = await deposer(await reduirePhoto(f), 'webp', 'image/webp')
          const { error: e } = await supabase.from('vitrine_medias').insert({ type: 'photo', chemin, titre: nomPropre(f), ordre: ordre++ })
          if (e) throw e
        } else if (f.type === 'video/mp4' || f.type === 'video/webm') {
          if (f.size > TAILLE_MAX) {
            toast.error(`${f.name} : ${Math.round(f.size / 1048576)} Mo, trop lourd (50 Mo maximum). Mettez-la sur YouTube et ajoutez le lien.`, { duration: 9000 })
            continue
          }
          const apercu = await deposer(await vignetteVideo(f), 'webp', 'image/webp')
          const chemin = await deposer(f, f.type === 'video/mp4' ? 'mp4' : 'webm', f.type)
          const { error: e } = await supabase.from('vitrine_medias').insert({ type: 'video', chemin, apercu, titre: nomPropre(f), ordre: ordre++ })
          if (e) throw e
        } else {
          toast.error(`${f.name} : format non accepté (photos, ou vidéos MP4/WebM)`)
          continue
        }
      } catch (e) {
        toast.error(`${f.name} : ${messageErreur(e)}`)
      } finally {
        setEnvois((x) => x.filter((n) => n !== f.name))
      }
    }
    if (entree.current) entree.current.value = ''
    rafraichir()
    toast.success('Envoi terminé. Ajoutez une légende, puis publiez.')
  }

  async function modifier(m: MediaVitrine, changes: Partial<MediaVitrine>) {
    const { error: e } = await supabase.from('vitrine_medias').update(changes).eq('id', m.id)
    if (e) return toast.error(messageErreur(e))
    rafraichir()
  }

  async function deplacer(m: MediaVitrine, sens: -1 | 1) {
    const voisins = medias.filter((x) => x.emplacement === m.emplacement)
    const i = voisins.findIndex((x) => x.id === m.id)
    const autre = voisins[i + sens]
    if (!autre) return
    const [o1, o2] = autre.ordre === m.ordre ? [m.ordre + sens, m.ordre] : [autre.ordre, m.ordre]
    await Promise.all([
      supabase.from('vitrine_medias').update({ ordre: o1 }).eq('id', m.id),
      supabase.from('vitrine_medias').update({ ordre: o2 }).eq('id', autre.id),
    ])
    rafraichir()
  }

  async function supprimer(m: MediaVitrine) {
    const { error: e } = await supabase.from('vitrine_medias').delete().eq('id', m.id)
    if (e) return toast.error(messageErreur(e))
    const fichiers = [m.chemin, m.apercu].filter((c): c is string => !!c)
    if (fichiers.length) await supabase.storage.from('vitrine').remove(fichiers)
    setASupprimer(null)
    rafraichir()
    toast.success('Média supprimé')
  }

  return (
    <div className="space-y-6">
      <EnTete
        titre="Médias du site"
        sousTitre="Photos et vidéos de la page publique de l'association. Rien n'apparaît tant que ce n'est pas publié."
        actions={
          <>
            <Button variant="secondary" asChild><Link to="/association" target="_blank"><ExternalLink /> Voir la page</Link></Button>
            <Button variant="secondary" onClick={() => setYoutube(true)}><Youtube /> Lien YouTube</Button>
            <Button onClick={() => entree.current?.click()} disabled={envois.length > 0}>
              {envois.length ? <Loader2 className="animate-spin" /> : <ImagePlus />} Ajouter des photos ou vidéos
            </Button>
          </>
        }
      />
      <input ref={entree} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" className="hidden" onChange={(e) => envoyer(e.target.files)} />

      <div className="flex gap-3 rounded-xl border border-or/40 bg-or-soft p-4 text-sm text-[#5c4100]">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" />
        <p>
          <b>Droit à l'image :</b> ne publiez que des images dont les personnes reconnaissables ont donné leur accord (celui des parents pour un mineur).
          Jamais de patient reconnaissable lors des actions de santé : secret médical. Les photos sont réduites automatiquement ; une vidéo
          ne doit pas dépasser 50 Mo (au-delà, mettez-la sur YouTube et ajoutez le lien).
        </p>
      </div>

      {envois.length ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <div className="mb-1 font-medium">Envoi en cours…</div>
          {envois.map((n) => <div key={n} className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> {n}</div>)}
        </div>
      ) : null}

      {isLoading ? <Chargement /> : error ? <Erreur erreur={error} /> : ORDRE.map((emp) => {
        const liste = medias.filter((m) => m.emplacement === emp)
        return (
          <section key={emp} className="space-y-2">
            <div>
              <h2 className="text-lg font-semibold">{LIBELLES_EMPLACEMENT[emp]} <span className="text-sm font-normal text-muted-foreground">· {liste.filter((m) => m.publie).length} publié(s) sur {liste.length}</span></h2>
              <p className="text-sm text-muted-foreground">{AIDE[emp]}</p>
            </div>
            {!liste.length ? (
              <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Aucun média ici pour l'instant.</p>
            ) : (
              <Liste>
                {liste.map((m, i) => (
                  <LigneMedia
                    key={m.id}
                    media={m}
                    premier={i === 0}
                    dernier={i === liste.length - 1}
                    modifier={(c) => modifier(m, c)}
                    deplacer={(s) => deplacer(m, s)}
                    supprimer={() => setASupprimer(m)}
                  />
                ))}
              </Liste>
            )}
          </section>
        )
      })}

      <DialogueYoutube ouvert={youtube} fermer={() => setYoutube(false)} ajouter={async (id, titre) => {
        const { error: e } = await supabase.from('vitrine_medias').insert({ type: 'youtube', youtube_id: id, emplacement: 'video', titre, ordre: prochainOrdre('video') })
        if (e) return toast.error(messageErreur(e))
        setYoutube(false)
        rafraichir()
        toast.success('Vidéo ajoutée. Publiez-la pour l\'afficher sur la page.')
      }} />
      <ConfirmDialog
        open={!!aSupprimer}
        onOpenChange={(o) => !o && setASupprimer(null)}
        title="Supprimer ce média ?"
        description="Il disparaît de la page publique et le fichier est effacé."
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={() => aSupprimer && supprimer(aSupprimer)}
      />
    </div>
  )
}

function LigneMedia({ media: m, premier, dernier, modifier, deplacer, supprimer }: {
  media: MediaVitrine
  premier: boolean
  dernier: boolean
  modifier: (c: Partial<MediaVitrine>) => void
  deplacer: (sens: -1 | 1) => void
  supprimer: () => void
}) {
  const vignette = apercuMedia(m)
  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-48">
        {vignette ? <img src={vignette} alt="" className="size-full object-cover" loading="lazy" /> : null}
        {m.type !== 'photo' ? (
          <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {m.type === 'youtube' ? <Youtube className="size-3" /> : <Film className="size-3" />} {m.type === 'youtube' ? 'YouTube' : 'Vidéo'}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <Input defaultValue={m.titre} maxLength={120} placeholder="Titre (ex. Remise des attestations, juillet 2026)" onBlur={(e) => e.target.value !== m.titre && modifier({ titre: e.target.value })} />
        <Textarea defaultValue={m.legende} maxLength={400} rows={2} placeholder="Légende (facultatif)" onBlur={(e) => e.target.value !== m.legende && modifier({ legende: e.target.value })} />
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={m.emplacement}
            disabled={m.type === 'youtube'}
            onChange={(e) => modifier({ emplacement: e.target.value as EmplacementMedia })}
            aria-label="Emplacement"
          >
            {EMPLACEMENTS_PAR_TYPE[m.type].map((e) => <option key={e} value={e}>{LIBELLES_EMPLACEMENT[e]}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-sm">
            <Switch checked={m.publie} onCheckedChange={(v) => modifier({ publie: v })} /> {m.publie ? <Badge>Publié</Badge> : <span className="text-muted-foreground">Brouillon</span>}
          </label>
          <div className="ml-auto flex gap-1">
            <Button size="icon" variant="ghost" disabled={premier} onClick={() => deplacer(-1)} aria-label="Monter"><ArrowUp /></Button>
            <Button size="icon" variant="ghost" disabled={dernier} onClick={() => deplacer(1)} aria-label="Descendre"><ArrowDown /></Button>
            <Button size="icon" variant="ghost" className="text-destructive" onClick={supprimer} aria-label="Supprimer"><Trash2 /></Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DialogueYoutube({ ouvert, fermer, ajouter }: { ouvert: boolean; fermer: () => void; ajouter: (id: string, titre: string) => void }) {
  const [lien, setLien] = useState('')
  const [titre, setTitre] = useState('')
  const id = idYoutube(lien)
  return (
    <Dialog open={ouvert} onOpenChange={(o) => { if (!o) { fermer(); setLien(''); setTitre('') } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter une vidéo YouTube</DialogTitle>
          <DialogDescription>Pour les longues vidéos (plus de 50 Mo) : publiez-la sur YouTube (« publique » ou « non répertoriée »), puis collez le lien.</DialogDescription>
        </DialogHeader>
        <Champ label="Lien de la vidéo">
          <Input value={lien} onChange={(e) => setLien(e.target.value)} placeholder="https://youtu.be/…" autoFocus />
        </Champ>
        {lien && !id ? <p className="text-sm text-destructive">Ce lien n'est pas reconnu comme une vidéo YouTube.</p> : null}
        {id ? <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="aspect-video w-full rounded-lg object-cover" /> : null}
        <Champ label="Titre">
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={120} placeholder="Ex. Les actions de l'AP2A en 2026" />
        </Champ>
        <DialogFooter>
          <Button variant="secondary" onClick={fermer}>Annuler</Button>
          <Button disabled={!id} onClick={() => id && ajouter(id, titre.trim())}>Ajouter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
