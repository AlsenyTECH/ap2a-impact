import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCategories, useZones } from '@/lib/requetes'
import { messageErreur, supabase } from '@/lib/supabase'

interface Ligne { prenom: string; nom: string; telephone: string; sexe: 'F' | 'M' | null; date_naissance: string | null; zone: string; role: string }

const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// En-têtes reconnus (insensibles aux accents et à la casse).
const COLONNES: Record<keyof Ligne, string[]> = {
  prenom: ['prenom', 'prenoms'],
  nom: ['nom', 'nom de famille'],
  telephone: ['telephone', 'tel', 'tel.', 'numero', 'contact', 'portable'],
  sexe: ['sexe', 'genre'],
  date_naissance: ['date de naissance', 'naissance', 'ne le', 'date naissance'],
  zone: ['unite', 'quartier', 'zone', 'adresse'],
  role: ['role', 'fonction', 'poste', 'qualite', 'responsabilite'],
}

const normaliserTel = (t: string) => {
  const d = t.replace(/\D/g, '')
  return d.startsWith('00221') ? d.slice(5) : d.startsWith('221') && d.length === 12 ? d.slice(3) : d
}

function lireDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const m = String(v ?? '').match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

/**
 * Modèle à remplir : en-têtes déjà posés (ceux que l'import reconnaît) et
 * une feuille « Aide ». Pas de ligne d'exemple, qui risquerait d'être importée.
 */
async function telechargerModele(avecRole: boolean) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const colonnes: [string, string, number][] = [
    ['Prénom', 'Obligatoire.', 18],
    ['Nom', 'Obligatoire.', 18],
    ['Téléphone', 'Conseillé : une personne déjà connue (même numéro) n\'est pas recréée. Ex. 77 123 45 67.', 16],
    ['Sexe', 'F ou M.', 8],
    ['Date de naissance', 'Format jj/mm/aaaa, ex. 15/03/1998.', 18],
    ['Unité', 'Ex. « U17 » ou « Unité 17 », ou le nom du quartier.', 14],
    ...(avecRole ? [['Rôle', 'Rôle dans le groupe : présidente, trésorier, membre…', 18] as [string, string, number]] : []),
  ]
  const entete = { fontWeight: 'bold' as const, backgroundColor: '#E3F3EC' }
  await writeExcelFile([
    {
      sheet: 'Liste',
      data: [colonnes.map(([titre]) => ({ value: titre, ...entete }))],
      columns: colonnes.map(([, , largeur]) => ({ width: largeur })),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Aide',
      data: [
        [{ value: 'Colonne', ...entete }, { value: 'Que mettre', ...entete }],
        ...colonnes.map(([titre, aide]) => [{ value: titre, fontWeight: 'bold' as const }, { value: aide }]),
        [null],
        [{ value: 'Une ligne par personne, à partir de la ligne 2 de la feuille « Liste ». Ne modifiez pas les en-têtes. Enregistrez en .xlsx.', columnSpan: 2 }],
      ],
      columns: [{ width: 20 }, { width: 80 }],
    },
  ]).toFile(avecRole ? 'modele-import-groupe.xlsx' : 'modele-import-personnes.xlsx')
}

/**
 * Import d'une liste de personnes depuis Excel (liste de participants
 * d'une formation, par exemple). Les personnes déjà connues (même
 * téléphone) ne sont pas recréées. Si `actionId` est donné, toutes sont
 * inscrites comme bénéficiaires de l'action.
 */
export function ImportExcel({ ouvert, fermer, actionId, collectifId, onTermine }: {
  ouvert: boolean
  fermer: () => void
  actionId?: string
  collectifId?: string
  /** Reçoit les identifiants des cibles importées, pour les afficher à part. */
  onTermine?: (ids: string[]) => void
}) {
  const qc = useQueryClient()
  const { data: zones = [] } = useZones()
  const { data: categories = [] } = useCategories()
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [envoi, setEnvoi] = useState(false)

  async function lire(fichier: File) {
    try {
      // Chargé seulement à l'import : allège le premier chargement au téléphone.
      const { default: readXlsxFile } = await import('read-excel-file')
      const rangees = await readXlsxFile(fichier)
      const iEntete = rangees.findIndex((r) => r.some((c) => COLONNES.nom.includes(sansAccent(String(c ?? '')))))
      if (iEntete < 0) return toast.error('Colonne « Nom » introuvable dans la feuille')
      const entetes = rangees[iEntete].map((c) => sansAccent(String(c ?? '')))
      const index = (k: keyof Ligne) => entetes.findIndex((e) => COLONNES[k].includes(e))
      const idx = Object.fromEntries((Object.keys(COLONNES) as (keyof Ligne)[]).map((k) => [k, index(k)])) as Record<keyof Ligne, number>
      const val = (r: unknown[], k: keyof Ligne) => (idx[k] >= 0 ? r[idx[k]] : null)
      const resultat = rangees.slice(iEntete + 1).map((r) => {
        let prenom = String(val(r, 'prenom') ?? '').trim()
        let nom = String(val(r, 'nom') ?? '').trim()
        // Colonne unique « Prénom Nom » : le dernier mot est le nom.
        if (!prenom && idx.prenom < 0 && nom.includes(' ')) {
          const mots = nom.split(/\s+/)
          nom = mots.pop()!
          prenom = mots.join(' ')
        }
        const s = sansAccent(String(val(r, 'sexe') ?? ''))
        return {
          prenom, nom,
          telephone: String(val(r, 'telephone') ?? '').trim(),
          sexe: s.startsWith('f') ? 'F' : s.startsWith('m') || s.startsWith('h') ? 'M' : null,
          date_naissance: lireDate(val(r, 'date_naissance')),
          zone: String(val(r, 'zone') ?? '').trim(),
          role: String(val(r, 'role') ?? '').trim(),
        } as Ligne
      }).filter((l) => l.nom && l.prenom)
      if (!resultat.length) toast.error('Aucune ligne avec un prénom et un nom')
      setLignes(resultat)
    } catch {
      toast.error('Fichier illisible : utilisez un fichier Excel .xlsx')
    }
  }

  function trouverZone(texte: string): number | null {
    const t = sansAccent(texte)
    if (!t) return null
    const n = t.match(/\d+/)?.[0]
    if (n && /^(u|unite)/.test(t)) {
      return zones.find((z) => z.chemin.includes('Parcelles Assainies >') && z.nom === `Unité ${Number(n)}`)?.id ?? null
    }
    return zones.find((z) => sansAccent(z.nom) === t)?.id ?? null
  }

  async function importer() {
    setEnvoi(true)
    try {
      const categoriePersonne = categories.find((k) => k.actif && k.nature === 'personne')?.id
      if (!categoriePersonne) throw new Error('Aucune catégorie « Personne » active')
      const tels = [...new Set(lignes.map((l) => normaliserTel(l.telephone)).filter((t) => t.length >= 7))]
      const existantes = new Map<string, string>()
      if (tels.length) {
        const { data, error } = await supabase.from('cibles').select('id, telephone_normalise').eq('type', 'personne').in('telephone_normalise', tels)
        if (error) throw error
        for (const c of data) existantes.set(c.telephone_normalise, c.id)
      }
      const ids: string[] = []
      const roles: (string | null)[] = []
      const nouvelles = []
      const rolesNouvelles: (string | null)[] = []
      for (const l of lignes) {
        const id = existantes.get(normaliserTel(l.telephone))
        if (id) { ids.push(id); roles.push(l.role || null) }
        else {
          rolesNouvelles.push(l.role || null)
          nouvelles.push({
            categorie_id: categoriePersonne, prenom: l.prenom, nom: l.nom, telephone: l.telephone || null, sexe: l.sexe,
            date_naissance: l.date_naissance, zone_id: trouverZone(l.zone), adresse: l.zone || null,
          })
        }
      }
      if (nouvelles.length) {
        const { data, error } = await supabase.from('cibles').insert(nouvelles).select('id')
        if (error) throw error
        ids.push(...data.map((c) => c.id))
        roles.push(...rolesNouvelles)
      }
      if (collectifId && ids.length) {
        const liens = new Map(ids.map((id, i) => [id, { personne_id: id, collectif_id: collectifId, role: roles[i] }]))
        const { error } = await supabase.from('appartenances').upsert([...liens.values()], { onConflict: 'personne_id,collectif_id', ignoreDuplicates: true })
        if (error) throw error
      }
      if (actionId && ids.length) {
        const { error } = await supabase.from('beneficiaires')
          .upsert([...new Set(ids)].map((cible_id) => ({ action_id: actionId, cible_id })), { onConflict: 'action_id,cible_id', ignoreDuplicates: true })
        if (error) throw error
      }
      onTermine?.([...new Set(ids)])
      toast.success(`${nouvelles.length} nouvelle(s) cible(s), ${lignes.length - nouvelles.length} déjà connue(s)${actionId ? ', toutes inscrites à l\'action' : ''}${collectifId ? ', toutes ajoutées au groupe' : ''}`)
      qc.invalidateQueries()
      setLignes([])
      fermer()
    } catch (e) {
      toast.error(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => { if (!o) { setLignes([]); fermer() } }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer une liste Excel</DialogTitle>
          <DialogDescription>
            Une ligne par personne, avec des colonnes <b>Prénom</b>, <b>Nom</b> et si possible <b>Téléphone</b>, <b>Sexe</b>,
            <b> Date de naissance</b>, <b>Unité</b> (ex. « U17 » ou « Unité 17 »){collectifId ? <>, <b>Rôle</b> (président, trésorière…)</> : null}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm">
          <span className="text-muted-foreground">Pas encore de fichier ? Partez du modèle, les colonnes sont déjà prêtes :</span>
          <Button size="sm" variant="outline" onClick={() => telechargerModele(!!collectifId).catch(() => toast.error('Téléchargement impossible'))}>
            <Download className="size-4" /> Télécharger le modèle
          </Button>
        </div>
        <input type="file" accept=".xlsx" onChange={(e) => e.target.files?.[0] && lire(e.target.files[0])} className="text-sm" />
        {lignes.length ? (
          <>
            <p className="text-sm font-medium">{lignes.length} personne(s) trouvée(s) :</p>
            <div className="max-h-64 overflow-y-auto rounded border border-border text-sm">
              {lignes.map((l, i) => (
                <div key={i} className="flex justify-between gap-2 border-b border-border px-3 py-1.5 last:border-0">
                  <span>{l.prenom} {l.nom}</span>
                  <span className="text-muted-foreground">{l.telephone} {l.zone}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setLignes([])}>Annuler</Button>
              <Button onClick={importer} disabled={envoi}>Importer {lignes.length} personne(s)</Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
