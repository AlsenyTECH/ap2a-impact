import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CarteVisuelle, type TitulaireCarte } from '@/components/CarteQR'
import { Chargement } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { LIBELLES_ROLE } from '@/lib/format'
import { usePhotos } from '@/lib/photos'
import { messageErreur, supabase, verifier } from '@/lib/supabase'
import type { Carte, Cible, Membre } from '@/lib/types'

type Fiche = TitulaireCarte & { id: string; photo_chemin?: string | null }

/**
 * Impression des cartes sur planches A4 (10 par page), prêtes à découper :
 *   /cartes?membres=tous            tous les membres actifs
 *   /cartes?membre=<id>             un membre
 *   /cartes?action=<id>             les participants d'une action
 *   /cartes?cible=<id>              une personne
 * Les cartes manquantes sont émises à l'ouverture de la page.
 */
export function Cartes() {
  const [params] = useSearchParams()
  const { a, membre: moi } = useAuth()
  const action = params.get('action')
  const cible = params.get('cible')
  const unMembre = params.get('membre')
  const tousMembres = params.get('membres') === 'tous'

  const { data, isLoading, error } = useQuery({
    queryKey: ['cartes-impression', action, cible, unMembre, tousMembres],
    staleTime: Infinity,
    queryFn: async () => {
      let fiches: Fiche[] = []
      let retour = '/'
      if (action) {
        retour = `/actions/${action}`
        verifier(await supabase.rpc('emettre_cartes_action', { p_action: action }))
        const titre = (verifier(await supabase.from('actions').select('titre').eq('id', action).single()) as { titre: string }).titre
        const benefs = verifier(await supabase.from('beneficiaires')
          .select('cible:cibles!beneficiaires_cible_id_fkey(id, prenom, nom, type, photo_chemin, numero_beneficiaire)')
          .eq('action_id', action).neq('statut', 'abandon')) as unknown as { cible: Cible }[]
        fiches = benefs.filter((b) => b.cible.type === 'personne').map(({ cible: c }) => ({
          id: c.id, type: 'beneficiaire', prenom: c.prenom, nom: c.nom, numero: c.numero_beneficiaire ?? null, detail: titre, photo_chemin: c.photo_chemin, jeton: null,
        }))
      } else if (cible) {
        retour = `/cibles/${cible}`
        const actives = verifier(await supabase.from('cartes').select('id').eq('cible_id', cible).is('revoquee_le', null)) as Carte[]
        if (!actives.length) verifier(await supabase.rpc('emettre_carte', { p_cible: cible }))
        const c = verifier(await supabase.from('cibles').select('id, prenom, nom, metier, photo_chemin, numero_beneficiaire').eq('id', cible).single()) as Cible
        fiches = [{ id: c.id, type: 'beneficiaire', prenom: c.prenom, nom: c.nom, numero: c.numero_beneficiaire ?? null, detail: c.metier, photo_chemin: c.photo_chemin, jeton: null }]
      } else {
        retour = '/membres'
        let q = supabase.from('membres').select('*').eq('actif', true).order('nom')
        if (unMembre) q = q.eq('id', unMembre)
        else if (!tousMembres) q = q.eq('id', moi!.id)
        const membres = verifier(await q) as Membre[]
        const actives = verifier(await supabase.from('cartes').select('membre_id').not('membre_id', 'is', null).is('revoquee_le', null)) as Carte[]
        const avec = new Set(actives.map((x) => x.membre_id))
        for (const m of membres) {
          if (!avec.has(m.id) && (a('admin', 'bureau') || m.id === moi?.id)) verifier(await supabase.rpc('emettre_carte', { p_membre: m.id }))
        }
        fiches = membres.map((m) => ({
          id: m.id, type: 'membre', prenom: m.prenom, nom: m.nom, numero: m.numero_adherent,
          detail: [LIBELLES_ROLE[m.role], m.fonction].filter(Boolean).join(' · '), photo_chemin: m.photo_chemin, jeton: null,
        }))
      }
      // Jetons des cartes actives.
      const ids = fiches.map((f) => f.id)
      const colonne = action || cible ? 'cible_id' : 'membre_id'
      const cartes: Carte[] = []
      for (let i = 0; i < ids.length; i += 100) {
        cartes.push(...(verifier(await supabase.from('cartes').select('*').in(colonne, ids.slice(i, i + 100)).is('revoquee_le', null)) as Carte[]))
      }
      const jetons = new Map(cartes.map((c) => [c.membre_id ?? c.cible_id, c.jeton]))
      // Numéros de bénéficiaires attribués à l'émission : on les relit.
      if (action) {
        const numeros = new Map<string, string | null>()
        for (let i = 0; i < ids.length; i += 100) {
          const lot = verifier(await supabase.from('cibles').select('id, numero_beneficiaire').in('id', ids.slice(i, i + 100))) as Cible[]
          lot.forEach((c) => numeros.set(c.id, c.numero_beneficiaire ?? null))
        }
        fiches = fiches.map((f) => ({ ...f, numero: numeros.get(f.id) ?? f.numero }))
      }
      return { retour, fiches: fiches.map((f) => ({ ...f, jeton: jetons.get(f.id) ?? null })).filter((f) => f.jeton) }
    },
  })
  const { data: photos = {} } = usePhotos(data?.fiches.map((f) => f.photo_chemin) ?? [])

  if (isLoading) return <Chargement />
  if (error) return <p className="p-6 text-sm text-destructive">{messageErreur(error)}</p>
  const fiches = data!.fiches
  const planches = Array.from({ length: Math.ceil(fiches.length / 10) }, (_, i) => fiches.slice(i * 10, i * 10 + 10))

  return (
    <div className="cartes-racine min-h-dvh bg-[#e9ebe6] pb-10 print:min-h-0 print:bg-white print:pb-0">
      <div className="no-print sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2 px-4 py-3">
          <Button asChild variant="ghost" size="sm"><Link to={data!.retour}><ArrowLeft /> Retour</Link></Button>
          <span className="text-sm text-muted-foreground">{fiches.length} carte{fiches.length > 1 ? 's' : ''} · {planches.length} page{planches.length > 1 ? 's' : ''} A4</span>
          <div className="flex-1" />
          <Button size="sm" onClick={() => window.print()} disabled={!fiches.length}><Printer /> Imprimer / PDF</Button>
        </div>
        <p className="mx-auto max-w-[210mm] px-4 pb-3 text-xs text-muted-foreground">
          Imprimez à 100 % (sans « ajuster à la page ») sur papier épais ou bristol, puis découpez et plastifiez. Les cartes restent valides tant qu'elles ne sont pas annulées.
        </p>
      </div>
      {!fiches.length ? <p className="p-10 text-center text-sm text-muted-foreground">Aucune carte à imprimer.</p> : null}
      <div>
      {planches.map((p, i) => (
        <div key={i} className="feuille-cartes mx-auto mt-6 w-[210mm] bg-white py-[8mm] shadow-haute print:mt-0 print:w-auto print:py-0 print:shadow-none">
          <div className="planche">
            {p.map((f) => <CarteVisuelle key={f.id} t={{ ...f, photo: f.photo_chemin ? photos[f.photo_chemin] : null }} className="shadow-none" />)}
          </div>
        </div>
      ))}
      </div>
    </div>
  )
}
