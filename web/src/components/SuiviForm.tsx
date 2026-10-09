import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Champ, Pastilles } from '@/components/champs'
import { compresser } from '@/components/ApportForm'
import { useAuth } from '@/lib/auth'
import { aujourdhui, echeance, SITUATIONS } from '@/lib/format'
import { messageErreur, supabase } from '@/lib/supabase'
import type { Situation, Suivi } from '@/lib/types'
import { cn } from '@/lib/utils'

const ACTIVITES = [
  'À son compte', 'Salarié(e)', 'Apprenti(e) / stage', 'En recherche d\'emploi', 'Poursuit une formation', 'Sans activité',
]

/**
 * Renseigne ce qu'est devenu un bénéficiaire : un suivi planifié
 * (`suivi`) ou un suivi libre ajouté à tout moment (`beneficiaireId`).
 */
export function SuiviForm({ ouvert, fermer, suivi, beneficiaireId, titre }: {
  ouvert: boolean
  fermer: () => void
  suivi?: Suivi | null
  beneficiaireId?: string
  titre: string
}) {
  const qc = useQueryClient()
  const { membre } = useAuth()
  const [situation, setSituation] = useState<Situation | null>(null)
  const [activite, setActivite] = useState('')
  const [revenu, setRevenu] = useState('')
  const [emplois, setEmplois] = useState('')
  const [utilise, setUtilise] = useState<'oui' | 'non' | ''>('')
  const [commentaire, setCommentaire] = useState('')
  const [faitLe, setFaitLe] = useState(aujourdhui())
  const [photo, setPhoto] = useState<File | null>(null)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (!ouvert) return
    setSituation(suivi?.situation ?? null)
    setActivite(suivi?.activite ?? '')
    setRevenu(suivi?.revenu_mensuel_fcfa?.toString() ?? '')
    setEmplois(suivi?.emplois_crees?.toString() ?? '')
    setUtilise(suivi?.utilise_apport == null ? '' : suivi.utilise_apport ? 'oui' : 'non')
    setCommentaire(suivi?.commentaire ?? '')
    setFaitLe(suivi?.fait_le ?? aujourdhui())
    setPhoto(null)
  }, [ouvert, suivi])

  const joint = situation && situation !== 'perdu_de_vue'
  const idBeneficiaire = suivi?.beneficiaire_id ?? beneficiaireId!

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (!situation) return toast.error('Choisissez la situation')
    setEnvoi(true)
    try {
      let fichier_chemin = suivi?.fichier_chemin ?? null
      if (photo) {
        const contenu = await compresser(photo)
        fichier_chemin = `${idBeneficiaire}/suivi-${crypto.randomUUID()}.${contenu.type === 'application/pdf' ? 'pdf' : 'jpg'}`
        const { error } = await supabase.storage.from('justificatifs').upload(fichier_chemin, contenu, { contentType: contenu.type })
        if (error) throw error
      }
      const donnees = {
        situation,
        fait_le: faitLe,
        activite: joint ? activite.trim() || null : null,
        revenu_mensuel_fcfa: joint && revenu ? Number(revenu) : null,
        emplois_crees: joint && emplois ? Number(emplois) : null,
        utilise_apport: joint && utilise ? utilise === 'oui' : null,
        commentaire: commentaire.trim() || null,
        fichier_chemin,
        saisi_par: membre?.id ?? null,
      }
      const { error } = suivi
        ? await supabase.from('suivis').update(donnees).eq('id', suivi.id)
        : await supabase.from('suivis').insert({ ...donnees, beneficiaire_id: idBeneficiaire, date_prevue: faitLe })
      if (error) throw error
      toast.success('Suivi enregistré')
      for (const k of ['suivis', 'parcours', 'impact', 'accueil']) qc.invalidateQueries({ queryKey: [k] })
      fermer()
    } catch (err) {
      toast.error(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titre}</DialogTitle>
          <DialogDescription>{suivi ? echeance(suivi.echeance_mois) : 'Suivi libre'} — que devient-il / elle ?</DialogDescription>
        </DialogHeader>
        <form onSubmit={enregistrer} className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-2 gap-2">
            {SITUATIONS.map((s) => (
              <button
                key={s.valeur}
                type="button"
                onClick={() => setSituation(s.valeur)}
                className={cn(
                  'rounded-lg border-2 p-3 text-left transition-colors',
                  situation === s.valeur ? 'border-primary bg-accent' : 'border-border bg-card hover:bg-muted',
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: s.couleur }} /> {s.libelle}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{s.aide}</span>
              </button>
            ))}
          </div>
          {joint ? (
            <>
              <Champ label="Activité actuelle">
                <Input list="activites" value={activite} onChange={(e) => setActivite(e.target.value)} placeholder="Électricien à son compte, employé chez…" />
                <datalist id="activites">{ACTIVITES.map((a) => <option key={a} value={a} />)}</datalist>
              </Champ>
              <div className="grid grid-cols-2 gap-3">
                <Champ label="Revenu mensuel (FCFA)">
                  <Input type="number" min={0} inputMode="numeric" value={revenu} onChange={(e) => setRevenu(e.target.value)} />
                </Champ>
                <Champ label="Emplois créés" aide="Apprentis, employés">
                  <Input type="number" min={0} inputMode="numeric" value={emplois} onChange={(e) => setEmplois(e.target.value)} />
                </Champ>
              </div>
              <Champ label="Utilise-t-il encore ce qu'il a reçu (kit, matériel…) ?">
                <Pastilles<'oui' | 'non'> value={utilise} onChange={(v) => setUtilise(v === utilise ? '' : v)} options={[['oui', 'Oui'], ['non', 'Non']]} />
              </Champ>
            </>
          ) : null}
          <Champ label="Commentaire">
            <Textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Besoins, difficultés, bonne nouvelle…" />
          </Champ>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Date du suivi"><Input type="date" required max={aujourdhui()} value={faitLe} onChange={(e) => setFaitLe(e.target.value)} /></Champ>
            <Champ label="Photo">
              <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
                <Camera className="size-4 shrink-0" />
                <span className="truncate">{photo ? photo.name : 'Atelier, chantier…'}</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </label>
            </Champ>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi || !situation}>{envoi ? 'Envoi…' : 'Enregistrer'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
