import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CibleForm } from '@/components/CibleForm'
import { ImportExcel } from '@/components/ImportExcel'
import { nomCible, trancheAge } from '@/lib/format'
import { useCibles } from '@/lib/requetes'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import type { Cible } from '@/lib/types'

interface Appartenance {
  role: string | null
  personne: Pick<Cible, 'id' | 'prenom' | 'nom' | 'telephone' | 'sexe' | 'date_naissance'>
}

/** Membres d'un collectif (ASC, GIE, GPF...) ou d'une structure (élèves d'une école...). */
export function MembresCollectif({ collectif, gere }: { collectif: Cible; gere: boolean }) {
  const qc = useQueryClient()
  const [recherche, setRecherche] = useState('')
  const [role, setRole] = useState('')
  const [creation, setCreation] = useState(false)
  const [importer, setImporter] = useState(false)
  const { data: suggestions = [] } = useCibles(recherche, 'personne')

  const cle = ['membres_collectif', collectif.id]
  const { data: membres = [] } = useQuery({
    queryKey: cle,
    queryFn: async () =>
      verifier(await supabase.from('appartenances')
        .select('role, personne:cibles!appartenances_personne_id_fkey(id, prenom, nom, telephone, sexe, date_naissance)')
        .eq('collectif_id', collectif.id).order('ajoute_le')) as unknown as Appartenance[],
  })
  const dejaMembres = new Set(membres.map((m) => m.personne.id))

  async function ajouter(p: Cible) {
    setRecherche('')
    if (dejaMembres.has(p.id)) return toast.info('Déjà membre')
    const { error } = await supabase.from('appartenances').insert({ personne_id: p.id, collectif_id: collectif.id, role: role.trim() || null })
    if (error) return toast.error(messageErreur(error))
    setRole('')
    qc.invalidateQueries({ queryKey: cle })
  }

  async function changerRole(personneId: string, nouveau: string) {
    const { error } = await supabase.from('appartenances').update({ role: nouveau.trim() || null }).eq('collectif_id', collectif.id).eq('personne_id', personneId)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: cle })
  }

  async function retirer(personneId: string) {
    const { error } = await supabase.from('appartenances').delete().eq('collectif_id', collectif.id).eq('personne_id', personneId)
    if (error) return toast.error(messageErreur(error))
    qc.invalidateQueries({ queryKey: cle })
  }

  const femmes = membres.filter((m) => m.personne.sexe === 'F').length
  const jeunes = membres.filter((m) => trancheAge(m.personne.date_naissance)?.tranche === 'Jeune').length
  const libelle = collectif.type === 'structure' ? 'Personnes rattachées (élèves, patients…)' : 'Membres'

  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{libelle}</h2>
        <span className="text-sm text-muted-foreground">
          {membres.length} enregistré(s){collectif.effectif ? ` sur ${collectif.effectif} déclarés` : ''}
          {membres.length ? ` · ${femmes} femme(s) · ${jeunes} jeune(s)` : ''}
        </span>
      </div>
      {gere ? (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_auto]">
          <div className="relative">
            <Input placeholder="Ajouter : nom ou téléphone…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
            {recherche.trim().length >= 2 ? (
              <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                {suggestions.slice(0, 8).map((c) => (
                  <button key={c.id} onClick={() => ajouter(c)} className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                    <span>{nomCible(c)} <span className="text-muted-foreground">{c.telephone}</span></span>
                    {dejaMembres.has(c.id) ? <span className="text-xs text-muted-foreground">déjà membre</span> : null}
                  </button>
                ))}
                <button onClick={() => setCreation(true)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-muted">
                  <Plus className="size-4" /> Nouvelle personne « {recherche} »
                </button>
              </div>
            ) : null}
          </div>
          <Input placeholder="Rôle (président, trésorière…)" value={role} onChange={(e) => setRole(e.target.value)} />
          <Button variant="secondary" onClick={() => setImporter(true)}><FileSpreadsheet className="size-4" /> Importer la liste</Button>
        </div>
      ) : null}
      {!membres.length ? (
        <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 size-6" />
          Aucun membre enregistré. Ajoutez-les un par un, ou importez la liste Excel du groupe.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {membres.map((m) => (
            <div key={m.personne.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <Link to={`/cibles/${m.personne.id}`} className="min-w-0 flex-1 truncate font-medium">{nomCible(m.personne)}</Link>
              {gere ? (
                <Input
                  className="h-8 w-36 text-xs"
                  defaultValue={m.role ?? ''}
                  placeholder="Rôle"
                  onBlur={(e) => e.target.value !== (m.role ?? '') && changerRole(m.personne.id, e.target.value)}
                />
              ) : m.role ? <span className="text-xs text-muted-foreground">{m.role}</span> : null}
              {m.personne.telephone ? <a href={`tel:${m.personne.telephone}`} className="hidden text-xs text-primary sm:inline">{m.personne.telephone}</a> : null}
              {gere ? <button onClick={() => retirer(m.personne.id)} aria-label="Retirer du groupe"><Trash2 className="size-4 text-muted-foreground" /></button> : null}
            </div>
          ))}
        </div>
      )}
      <CibleForm ouvert={creation} fermer={() => setCreation(false)} typeInitial="personne" apresCreation={ajouter} />
      <ImportExcel ouvert={importer} fermer={() => setImporter(false)} collectifId={collectif.id} />
    </section>
  )
}

/** Groupes et structures dont une personne fait partie. */
export function MembreDe({ personneId }: { personneId: string }) {
  const { data: groupes = [] } = useQuery({
    queryKey: ['membre_de', personneId],
    queryFn: async () =>
      verifier(await supabase.from('appartenances')
        .select('role, collectif:cibles!appartenances_collectif_id_fkey(id, nom, categorie:categories_cible(libelle))')
        .eq('personne_id', personneId)) as unknown as { role: string | null; collectif: { id: string; nom: string; categorie: { libelle: string } | null } }[],
  })
  if (!groupes.length) return null
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Membre de :</span>
      {groupes.map((g) => (
        <Link key={g.collectif.id} to={`/cibles/${g.collectif.id}`} className="rounded-full border border-border bg-card px-3 py-1 hover:border-primary/50">
          {g.collectif.nom}{g.role ? <span className="text-muted-foreground"> · {g.role}</span> : null}
        </Link>
      ))}
    </div>
  )
}
