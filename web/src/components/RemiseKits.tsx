import { useEffect, useMemo, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'
import { useQueryClient } from '@tanstack/react-query'
import { CameraOff, CheckCircle2, CircleAlert, CircleX, Package, ScanLine, SwitchCamera } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Champ, Liste, Pastilles } from '@/components/champs'
import { Avatar } from '@/components/design'
import { jetonDuQR } from '@/components/CarteQR'
import { Signature, type SignatureRef } from '@/components/Signature'
import { aujourdhui, date, nomCible } from '@/lib/format'
import { deposerSignature, useKits, type KitModele } from '@/lib/kits'
import { usePhoto } from '@/lib/photos'
import { correspond } from '@/lib/recherche'
import { messageErreur, supabase } from '@/lib/supabase'
import type { Beneficiaire } from '@/lib/types'
import { cn } from '@/lib/utils'

type Statut = 'ok' | 'deja' | 'abandon' | 'inconnue' | 'revoquee' | 'pas_inscrit' | 'carte_membre'
interface Personne { statut: Statut; beneficiaire_id?: string; prenom?: string | null; nom?: string; numero?: string | null; photo?: string | null; deja_le?: string | null }

const MESSAGES: Record<Statut, string> = {
  ok: 'Peut recevoir le kit', deja: 'A déjà reçu ce kit', abandon: 'A abandonné la formation',
  inconnue: 'Carte inconnue', revoquee: 'Carte annulée', pas_inscrit: "N'est pas inscrit(e) à cette action", carte_membre: 'Carte de membre, pas de bénéficiaire',
}

function signal(bon: boolean) {
  try {
    navigator.vibrate?.(bon ? 80 : [60, 60, 60])
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = bon ? 880 : 220
    g.gain.value = 0.08
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + (bon ? 0.12 : 0.3))
    o.onended = () => ctx.close()
  } catch { /* pas de son */ }
}

/**
 * Remise de kits, le jour de la cérémonie : on choisit le kit, puis on
 * scanne la carte de chaque bénéficiaire (ou on le choisit dans la liste),
 * il signe sur le téléphone, et la remise est enregistrée (stock compris).
 */
export function RemiseKits({ ouvert, fermer, actionId, beneficiaires }: {
  ouvert: boolean
  fermer: () => void
  actionId: string
  beneficiaires: Beneficiaire[]
}) {
  const qc = useQueryClient()
  const { data: kits = [] } = useKits()
  const [kitId, setKitId] = useState('')
  const [quantite, setQuantite] = useState('1')
  const [jour, setJour] = useState(aujourdhui())
  const [signatureExigee, setSignatureExigee] = useState(true)
  const [demarre, setDemarre] = useState(false)
  const [mode, setMode] = useState<'scan' | 'liste'>('scan')
  const [courant, setCourant] = useState<Personne | null>(null)
  const [faits, setFaits] = useState<{ id: string; nom: string; heure: number; signe: boolean }[]>([])
  const kit = kits.find((k) => k.id === kitId)

  useEffect(() => {
    if (!ouvert) return
    setDemarre(false); setCourant(null); setFaits([]); setMode('scan'); setQuantite('1'); setJour(aujourdhui())
  }, [ouvert])
  useEffect(() => { if (!kitId && kits.length === 1) setKitId(kits[0].id) }, [kits, kitId])

  // Qui a déjà reçu ce kit (avant ou pendant cette remise).
  const servis = useMemo(() => new Set([
    ...beneficiaires.filter((b) => b.apports?.some((a) => a.modele_id === kitId)).map((b) => b.id),
    ...faits.map((f) => f.id),
  ]), [beneficiaires, faits, kitId])
  const restants = beneficiaires.filter((b) => b.statut !== 'abandon' && !servis.has(b.id))

  function terminer() {
    if (faits.length) {
      qc.invalidateQueries({ queryKey: ['beneficiaires', actionId] })
      qc.invalidateQueries({ queryKey: ['kits'] })
      toast.success(`${faits.length} kit${faits.length > 1 ? 's' : ''} remis`)
    }
    fermer()
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && terminer()}>
      <DialogContent className="max-h-[96dvh] overflow-y-auto p-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remise de kits</DialogTitle>
          <DialogDescription>{demarre && kit ? `${kit.nom} · ${restants.length} personne${restants.length > 1 ? 's' : ''} à servir · stock ${kit.stock - faits.length * (Number(quantite) || 1)}` : 'Choisissez le kit, puis scannez les cartes.'}</DialogDescription>
        </DialogHeader>

        {!demarre ? (
          <div className="grid gap-4">
            {!kits.length ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Aucun kit au catalogue. Le bureau les crée dans « Kits et stock ».</p>
            ) : (
              <Champ label="Kit remis">
                <Liste value={kitId} onChange={(e) => setKitId(e.target.value)} required>
                  <option value="">— Choisir —</option>
                  {kits.map((k) => <option key={k.id} value={k.id}>{k.nom} (stock : {k.stock})</option>)}
                </Liste>
              </Champ>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Quantité par personne"><Input type="number" min={1} inputMode="numeric" value={quantite} onChange={(e) => setQuantite(e.target.value)} /></Champ>
              <Champ label="Date de remise"><Input type="date" value={jour} onChange={(e) => setJour(e.target.value)} /></Champ>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span><span className="font-medium">Faire signer chaque bénéficiaire</span><span className="block text-xs text-muted-foreground">La signature sert de preuve de réception sur le bon de remise.</span></span>
              <Switch checked={signatureExigee} onCheckedChange={setSignatureExigee} />
            </label>
            {kit && kit.stock < restants.length * (Number(quantite) || 1) ? (
              <p className="rounded-lg bg-or-soft p-3 text-sm text-[#5c4100]">
                Stock enregistré : {kit.stock} pour {restants.length} personne{restants.length > 1 ? 's' : ''}. Vous pouvez continuer (le stock passera en négatif), mais pensez à enregistrer l'entrée des kits.
              </p>
            ) : null}
            <Button disabled={!kit || !(Number(quantite) >= 1)} onClick={() => setDemarre(true)}><ScanLine /> Commencer la remise</Button>
          </div>
        ) : (
          <>
            {!courant ? (
              <Pastilles<'scan' | 'liste'> value={mode} onChange={setMode} options={[['scan', 'Scanner les cartes'], ['liste', 'Choisir dans la liste']]} />
            ) : null}
            {courant ? (
              <Fiche
                personne={courant}
                kit={kit!}
                quantite={Math.max(1, Math.round(Number(quantite)) || 1)}
                jour={jour}
                signatureExigee={signatureExigee}
                mode={mode}
                suivant={(fait) => {
                  if (fait) setFaits((l) => [fait, ...l])
                  setCourant(null)
                }}
              />
            ) : mode === 'scan' ? (
              <Camera actionId={actionId} kitId={kitId} onPersonne={(p) => { signal(p.statut === 'ok'); setCourant(p) }} />
            ) : (
              <ListeRestants restants={restants} onChoix={(b) => setCourant({
                statut: 'ok', beneficiaire_id: b.id, prenom: null, nom: b.cible ? nomCible(b.cible) : '—',
                numero: b.cible?.numero_beneficiaire, photo: b.cible?.photo_chemin,
              })} />
            )}

            <div className="flex items-center justify-between text-sm">
              <span><b>{faits.length}</b> remis pendant cette séance</span>
              <Button size="sm" onClick={terminer}>Terminer</Button>
            </div>
            {faits.length ? (
              <div className="max-h-40 divide-y divide-border/70 overflow-y-auto rounded-xl border border-border">
                {faits.map((f) => (
                  <div key={`${f.id}-${f.heure}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{f.nom}</span>
                    <span className="text-xs text-muted-foreground">{f.signe ? 'signé' : 'sans signature'} · {new Date(f.heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Caméra ouverte en continu ; chaque carte lue identifie la personne (une seule fois toutes les 4 s). */
function Camera({ actionId, kitId, onPersonne }: { actionId: string; kitId: string; onPersonne: (p: Personne) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const scanner = useRef<QrScanner | null>(null)
  const recents = useRef(new Map<string, number>())
  const rappel = useRef(onPersonne)
  rappel.current = onPersonne
  const [erreur, setErreur] = useState<string | null>(null)
  const [cameras, setCameras] = useState<QrScanner.Camera[]>([])
  const [camera, setCamera] = useState(0)

  useEffect(() => {
    let arrete = false
    const demarrer = window.setTimeout(async () => {
      if (!video.current || arrete) return
      const s = new QrScanner(video.current, async ({ data }) => {
        const maintenant = Date.now()
        if ((recents.current.get(data) ?? 0) > maintenant - 4000) return
        recents.current.set(data, maintenant)
        const jeton = jetonDuQR(data)
        if (!jeton) return rappel.current({ statut: 'inconnue' })
        const { data: r, error } = await supabase.rpc('carte_pour_remise', { p_action: actionId, p_jeton: jeton, p_modele: kitId })
        if (error) return setErreur(messageErreur(error))
        rappel.current(r as Personne)
      }, { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8, returnDetailedScanResult: true })
      scanner.current = s
      try {
        await s.start()
        setCameras(await QrScanner.listCameras(false))
      } catch {
        setErreur("Impossible d'ouvrir la caméra. Autorisez l'accès à la caméra, ou passez par « Choisir dans la liste ».")
      }
    }, 150)
    return () => { arrete = true; window.clearTimeout(demarrer); scanner.current?.destroy(); scanner.current = null }
  }, [actionId, kitId])

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video ref={video} className="aspect-square w-full object-cover" muted playsInline />
      {erreur ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-6 text-center text-sm text-white"><CameraOff className="size-8" />{erreur}</div> : null}
      {cameras.length > 1 ? (
        <button onClick={() => { const s = (camera + 1) % cameras.length; setCamera(s); scanner.current?.setCamera(cameras[s].id) }}
          className="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white" aria-label="Changer de caméra"><SwitchCamera className="size-5" /></button>
      ) : null}
      <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 p-3 text-center text-xs text-white">Présentez la carte du bénéficiaire</p>
    </div>
  )
}

function ListeRestants({ restants, onChoix }: { restants: Beneficiaire[]; onChoix: (b: Beneficiaire) => void }) {
  const [filtre, setFiltre] = useState('')
  const liste = restants.filter((b) => correspond(filtre, b.cible?.prenom, b.cible?.nom, b.cible?.telephone, b.cible?.numero_beneficiaire))
  return (
    <div className="space-y-2">
      <Input placeholder="Chercher : nom, téléphone, n° de carte…" value={filtre} onChange={(e) => setFiltre(e.target.value)} autoFocus />
      <div className="max-h-72 divide-y divide-border/70 overflow-y-auto rounded-xl border border-border">
        {!liste.length ? <p className="p-4 text-center text-sm text-muted-foreground">{restants.length ? 'Personne ne correspond.' : 'Tout le monde a reçu ce kit.'}</p> : liste.map((b) => (
          <button key={b.id} onClick={() => onChoix(b)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
            {b.cible ? <Avatar prenom={b.cible.prenom} nom={b.cible.nom} nature={b.cible.type} taille="sm" /> : null}
            <span className="min-w-0 flex-1 truncate font-medium">{b.cible ? nomCible(b.cible) : '—'}</span>
            <span className="text-xs text-muted-foreground">{b.cible?.numero_beneficiaire}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** La personne identifiée : vérification, signature, remise. */
function Fiche({ personne: p, kit, quantite, jour, signatureExigee, mode, suivant }: {
  personne: Personne
  kit: KitModele
  quantite: number
  jour: string
  signatureExigee: boolean
  mode: 'scan' | 'liste'
  suivant: (fait?: { id: string; nom: string; heure: number; signe: boolean }) => void
}) {
  const photo = usePhoto(p.photo)
  const signature = useRef<SignatureRef>(null)
  const [vide, setVide] = useState(true)
  const [confirmeDeja, setConfirmeDeja] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const nom = `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() || 'Carte'
  const peut = p.statut === 'ok' || (p.statut === 'deja' && confirmeDeja)
  const bon = p.statut === 'ok'
  const Icone = bon ? CheckCircle2 : p.statut === 'deja' || p.statut === 'abandon' ? CircleAlert : CircleX

  async function remettre() {
    if (!p.beneficiaire_id) return
    setEnvoi(true)
    try {
      const image = await signature.current?.image()
      const chemin = image ? await deposerSignature(p.beneficiaire_id, image) : null
      const { error } = await supabase.from('apports').insert({
        beneficiaire_id: p.beneficiaire_id,
        nature: 'kit',
        modele_id: kit.id,
        description: kit.nom,
        quantite,
        valeur_fcfa: kit.valeur_unitaire_fcfa != null ? kit.valeur_unitaire_fcfa * quantite : null,
        partenaire_id: kit.partenaire_id,
        date_remise: jour,
        signature_chemin: chemin,
        signe_le: chemin ? new Date().toISOString() : null,
        mode_remise: mode === 'scan' ? 'scan' : 'manuel',
      })
      if (error) throw error
      signal(true)
      suivant({ id: p.beneficiaire_id, nom, heure: Date.now(), signe: !!chemin })
    } catch (e) {
      signal(false)
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className={cn('flex items-center gap-3 rounded-xl p-3', bon ? 'bg-[#e2f4e2]' : p.statut === 'deja' || p.statut === 'abandon' ? 'bg-[#fdf3d8]' : 'bg-[#fbe6e6]')}>
        {photo ? <img src={photo} alt="" className="size-16 shrink-0 rounded-xl object-cover" /> : (
          <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-xl bg-white/70"><Package className="size-7 text-muted-foreground" /></span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{nom}</div>
          {p.numero ? <div className="text-xs text-muted-foreground">{p.numero}</div> : null}
          <div className={cn('mt-0.5 inline-flex items-center gap-1 text-sm font-medium', bon ? 'text-[#0b6b0b]' : p.statut === 'deja' || p.statut === 'abandon' ? 'text-[#8a6a10]' : 'text-[#a32b2b]')}>
            <Icone className="size-4" /> {MESSAGES[p.statut]}{p.statut === 'deja' && p.deja_le ? ` le ${date(p.deja_le)}` : ''}
          </div>
        </div>
      </div>

      {p.statut === 'deja' && !confirmeDeja ? (
        <Button variant="secondary" className="w-full" onClick={() => setConfirmeDeja(true)}>Remettre un autre kit quand même</Button>
      ) : null}

      {peut ? (
        <>
          <p className="text-sm">Remettre <b>{quantite > 1 ? `${quantite} × ` : ''}{kit.nom}</b>{kit.composition.length ? ` (${kit.composition.map((c) => c.libelle).join(', ')})` : ''}.</p>
          <Signature ref={signature} onChange={setVide} />
          <Button className="w-full" size="lg" disabled={envoi || (signatureExigee && vide)} onClick={remettre}>
            <CheckCircle2 /> {signatureExigee && vide ? 'En attente de la signature' : 'Kit remis'}
          </Button>
        </>
      ) : null}
      <Button variant="ghost" className="w-full" onClick={() => suivant()}>{peut ? 'Annuler' : 'Personne suivante'}</Button>
    </div>
  )
}
