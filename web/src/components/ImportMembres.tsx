import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { telechargerModele } from '@/lib/export'
import { messageErreur, supabase } from '@/lib/supabase'
import type { Membre } from '@/lib/types'

interface Ligne { prenom: string; nom: string; telephone: string; email: string; fonction: string; date_adhesion: string | null; doublon: boolean }

const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// En-têtes reconnus (insensibles aux accents et à la casse).
const COLONNES: Record<Exclude<keyof Ligne, 'doublon'>, string[]> = {
  prenom: ['prenom', 'prenoms'],
  nom: ['nom', 'nom de famille'],
  telephone: ['telephone', 'tel', 'tel.', 'numero', 'contact', 'portable'],
  email: ['email', 'e-mail', 'mail', 'courriel', 'adresse email'],
  fonction: ['fonction', 'poste', 'responsabilite', 'role'],
  date_adhesion: ["date d'adhesion", 'adhesion', 'date adhesion', "date d'entree"],
}

const MODELE: [string, string, number][] = [
  ['Prénom', 'Obligatoire.', 18],
  ['Nom', 'Obligatoire.', 18],
  ['Téléphone', 'Ex. 77 123 45 67.', 16],
  ['Email', "Nécessaire pour l'inviter ensuite à se connecter à l'application.", 28],
  ['Fonction', 'Fonction dans l\'association : présidente, trésorier, chargé de communication… (facultatif).', 22],
  ["Date d'adhésion", 'Format jj/mm/aaaa. Vide : la date du jour.', 16],
]

const chiffres = (t: string) => {
  const d = t.replace(/\D/g, '')
  return d.startsWith('00221') ? d.slice(5) : d.startsWith('221') && d.length === 12 ? d.slice(3) : d
}

function lireDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const m = String(v ?? '').match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

/**
 * Import des membres depuis Excel. Un membre déjà enregistré (même email ou
 * même téléphone) n'est pas recréé. Tous reçoivent le rôle « Membre » ; les
 * invitations se font ensuite, fiche par fiche.
 */
export function ImportMembres({ ouvert, fermer, existants }: { ouvert: boolean; fermer: () => void; existants: Membre[] }) {
  const qc = useQueryClient()
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [envoi, setEnvoi] = useState(false)

  async function lire(fichier: File) {
    try {
      const { default: readXlsxFile } = await import('read-excel-file')
      const rangees = await readXlsxFile(fichier)
      const iEntete = rangees.findIndex((r) => r.some((c) => COLONNES.nom.includes(sansAccent(String(c ?? '')))))
      if (iEntete < 0) return toast.error('Colonne « Nom » introuvable dans la feuille')
      const entetes = rangees[iEntete].map((c) => sansAccent(String(c ?? '')))
      const idx = Object.fromEntries(Object.entries(COLONNES).map(([k, noms]) => [k, entetes.findIndex((e) => noms.includes(e))])) as Record<keyof typeof COLONNES, number>
      const val = (r: unknown[], k: keyof typeof COLONNES) => (idx[k] >= 0 ? r[idx[k]] : null)
      const emails = new Set(existants.map((m) => m.email?.toLowerCase()).filter(Boolean))
      const tels = new Set(existants.map((m) => chiffres(m.telephone ?? '')).filter((t) => t.length >= 7))
      const resultat: Ligne[] = []
      for (const r of rangees.slice(iEntete + 1)) {
        const l: Ligne = {
          prenom: String(val(r, 'prenom') ?? '').trim(),
          nom: String(val(r, 'nom') ?? '').trim(),
          telephone: String(val(r, 'telephone') ?? '').trim(),
          email: String(val(r, 'email') ?? '').trim().toLowerCase(),
          fonction: String(val(r, 'fonction') ?? '').trim(),
          date_adhesion: lireDate(val(r, 'date_adhesion')),
          doublon: false,
        }
        if (!l.prenom || !l.nom) continue
        if (l.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.email)) l.email = ''
        const t = chiffres(l.telephone)
        // Déjà membre, ou deux fois dans le fichier : on ne le recrée pas.
        l.doublon = (!!l.email && emails.has(l.email)) || (t.length >= 7 && tels.has(t))
        if (l.email) emails.add(l.email)
        if (t.length >= 7) tels.add(t)
        resultat.push(l)
      }
      if (!resultat.length) toast.error('Aucune ligne avec un prénom et un nom')
      setLignes(resultat)
    } catch {
      toast.error('Fichier illisible : utilisez un fichier Excel .xlsx')
    }
  }

  const nouveaux = lignes.filter((l) => !l.doublon)

  async function importer() {
    setEnvoi(true)
    const { error } = await supabase.from('membres').insert(nouveaux.map((l) => ({
      prenom: l.prenom, nom: l.nom, telephone: l.telephone || null, email: l.email || null,
      fonction: l.fonction || null, ...(l.date_adhesion ? { date_adhesion: l.date_adhesion } : {}),
    })))
    setEnvoi(false)
    if (error) return toast.error(messageErreur(error))
    toast.success(`${nouveaux.length} membre(s) ajouté(s)${lignes.length > nouveaux.length ? `, ${lignes.length - nouveaux.length} déjà enregistré(s)` : ''}. Invitez-les ensuite depuis leur fiche.`)
    qc.invalidateQueries({ queryKey: ['membres'] })
    setLignes([])
    fermer()
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => { if (!o) { setLignes([]); fermer() } }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer des membres depuis Excel</DialogTitle>
          <DialogDescription>
            Une ligne par membre, avec des colonnes <b>Prénom</b>, <b>Nom</b> et si possible <b>Téléphone</b>, <b>Email</b>,
            <b> Fonction</b>, <b>Date d'adhésion</b>. Chacun reçoit le rôle « Membre » et son numéro de carte.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm">
          <span className="text-muted-foreground">Pas encore de fichier ? Partez du modèle, les colonnes sont déjà prêtes :</span>
          <Button size="sm" variant="outline" onClick={() => telechargerModele('modele-import-membres', MODELE).catch(() => toast.error('Téléchargement impossible'))}>
            <Download className="size-4" /> Télécharger le modèle
          </Button>
        </div>
        <input type="file" accept=".xlsx" onChange={(e) => e.target.files?.[0] && lire(e.target.files[0])} className="text-sm" />
        {lignes.length ? (
          <>
            <p className="text-sm font-medium">
              {nouveaux.length} nouveau(x) membre(s){lignes.length > nouveaux.length ? `, ${lignes.length - nouveaux.length} déjà enregistré(s) (ignoré(s))` : ''} :
            </p>
            <div className="max-h-64 overflow-y-auto rounded border border-border text-sm">
              {lignes.map((l, i) => (
                <div key={i} className={`flex justify-between gap-2 border-b border-border px-3 py-1.5 last:border-0 ${l.doublon ? 'text-muted-foreground line-through' : ''}`}>
                  <span>{l.prenom} {l.nom}{l.fonction ? <span className="text-muted-foreground"> · {l.fonction}</span> : null}</span>
                  <span className="truncate text-muted-foreground">{[l.telephone, l.email].filter(Boolean).join(' · ')}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setLignes([])}>Annuler</Button>
              <Button onClick={importer} disabled={envoi || !nouveaux.length}>Importer {nouveaux.length} membre(s)</Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
