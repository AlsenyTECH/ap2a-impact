import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, MessageCircle, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SuiviForm } from '@/components/SuiviForm'
import { Avatar } from '@/components/design'
import { Chargement, EnTete, Erreur, Liste, Pastilles } from '@/components/champs'
import { OutilsListe } from '@/components/OutilsListe'
import { Switch } from '@/components/ui/switch'
import { correspond, trier } from '@/lib/recherche'
import { useAuth } from '@/lib/auth'
import { aujourdhui, date, echeance, lienWhatsApp, nomCible, SITUATION, SITUATIONS } from '@/lib/format'
import { supabase, verifier } from '@/lib/supabase'
import type { Situation, SuiviDetail } from '@/lib/types'

type Etat = 'a_faire' | 'en_retard' | 'a_venir' | 'faits' | 'tous'
type Tri = 'echeance' | 'recents' | 'nom' | 'situation' | 'metier'

/** Dans combien de jours (négatif = en retard). */
const jours = (d: string) => Math.round((new Date(`${d}T00:00:00`).getTime() - new Date(`${aujourdhui()}T00:00:00`).getTime()) / 86_400_000)

const etatDe = (s: SuiviDetail): Exclude<Etat, 'tous' | 'a_faire'> | 'proche' =>
  s.fait_le ? 'faits' : jours(s.date_prevue) < 0 ? 'en_retard' : jours(s.date_prevue) <= 30 ? 'proche' : 'a_venir'

const distincts = (valeurs: (string | null | undefined)[]) =>
  [...new Set(valeurs.filter((v): v is string => !!v))].sort((x, y) => x.localeCompare(y, 'fr'))

export function Suivis() {
  const { membre, a } = useAuth()
  const gestionnaire = a('admin', 'bureau')
  const [ouvert, setOuvert] = useState<SuiviDetail | null>(null)
  const [etat, setEtat] = useState<Etat>('a_faire')
  const [miens, setMiens] = useState(!gestionnaire)
  const [situation, setSituation] = useState<Situation | ''>('')
  const [metier, setMetier] = useState('')
  const [famille, setFamille] = useState('')
  const [action, setAction] = useState('')
  const [groupe, setGroupe] = useState('')
  const [recherche, setRecherche] = useState('')
  const [tri, setTri] = useState<Tri>('echeance')

  const { data: tous, isLoading, error } = useQuery({
    queryKey: ['suivis', 'tous'],
    queryFn: async () => verifier(await supabase.from('suivis_detail').select('*').order('date_prevue').limit(3000)) as SuiviDetail[],
  })

  if (!a('admin', 'bureau', 'coordinateur')) {
    return <EmptyState icon={CheckCircle2} title="Réservé aux coordinateurs" description="Les suivis des bénéficiaires sont faits par les coordinateurs désignés." />
  }

  const base = (tous ?? []).filter((s) => !miens || s.charge_id === membre!.id)
  const compte = (e: Etat) => base.filter((s) => {
    const x = etatDe(s)
    return e === 'tous' || (e === 'a_faire' ? x === 'proche' || x === 'en_retard' : x === e)
  }).length
  const retenus = base.filter((s) => {
    const x = etatDe(s)
    if (etat === 'a_faire' && x !== 'proche' && x !== 'en_retard') return false
    if (etat !== 'a_faire' && etat !== 'tous' && x !== etat) return false
    if (situation && s.situation !== situation) return false
    if (metier && s.cible_metier !== metier) return false
    if (famille && s.cible_famille !== famille) return false
    if (action && s.action_id !== action) return false
    if (groupe && !(s.cible_groupes ?? '').split(', ').includes(groupe)) return false
    return correspond(recherche, s.cible_prenom, s.cible_nom, s.cible_groupes, s.cible_metier, s.cible_zone, s.action_titre, s.activite, s.commentaire, s.charge_nom, s.charge_numero)
  })
  const suivis = tri === 'echeance' ? retenus
    : tri === 'recents' ? trier(retenus, (s) => s.fait_le, 'desc')
    : tri === 'nom' ? trier(retenus, (s) => s.cible_nom)
    : tri === 'metier' ? trier(retenus, (s) => s.cible_metier)
    : trier(retenus, (s) => (s.situation ? SITUATIONS.findIndex((x) => x.valeur === s.situation) : null))

  const actions = [...new Map((tous ?? []).map((s) => [s.action_id, s.action_titre])).entries()].sort((x, y) => x[1].localeCompare(y[1], 'fr'))
  const filtresActifs = [situation, metier, famille, action, groupe].filter(Boolean).length

  return (
    <>
      <EnTete
        titre="Suivis"
        sousTitre="Que sont devenus les bénéficiaires ? Appelez, puis renseignez en une minute."
        actions={
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium shadow-carte">
            <Switch checked={miens} onCheckedChange={setMiens} /> Seulement mes suivis
          </label>
        }
      />
      <div className="sans-barre -mx-4 mb-3 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Pastilles<Etat>
          defilant
          value={etat}
          onChange={(e) => { setEtat(e); if (e !== 'faits' && e !== 'tous') setSituation('') }}
          options={[
            ['a_faire', `À faire (${compte('a_faire')})`], ['en_retard', `En retard (${compte('en_retard')})`],
            ['a_venir', `Plus tard (${compte('a_venir')})`], ['faits', `Faits (${compte('faits')})`], ['tous', `Tous (${compte('tous')})`],
          ]}
        />
      </div>
      <OutilsListe<Tri>
        recherche={recherche}
        setRecherche={setRecherche}
        placeholder="Nom, groupe, métier, activité, action…"
        tris={[['echeance', 'Échéance la plus proche'], ['recents', 'Derniers suivis faits'], ['nom', 'Nom A → Z'], ['situation', 'Par situation'], ['metier', 'Par métier']]}
        tri={tri}
        setTri={setTri}
        total={tous ? suivis.length : undefined}
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Liste value={situation} onChange={(e) => setSituation(e.target.value as Situation | '')} aria-label="Situation">
            <option value="">Toutes les situations</option>
            {SITUATIONS.map((x) => <option key={x.valeur} value={x.valeur}>{x.libelle}</option>)}
          </Liste>
          <Liste value={metier} onChange={(e) => setMetier(e.target.value)} aria-label="Métier ou domaine">
            <option value="">Tous les domaines</option>
            {distincts(base.map((s) => s.cible_metier)).map((m) => <option key={m} value={m}>{m}</option>)}
          </Liste>
          <Liste value={famille} onChange={(e) => setFamille(e.target.value)} aria-label="Famille de cible">
            <option value="">Toutes les familles</option>
            {distincts(base.map((s) => s.cible_famille)).map((f) => <option key={f} value={f}>{f}</option>)}
          </Liste>
          <Liste value={groupe} onChange={(e) => setGroupe(e.target.value)} aria-label="Groupe">
            <option value="">Tous les groupes</option>
            {distincts(base.flatMap((s) => (s.cible_groupes ?? '').split(', '))).map((g) => <option key={g} value={g}>{g}</option>)}
          </Liste>
          <Liste value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action" className="col-span-2 md:col-span-1">
            <option value="">Toutes les actions</option>
            {actions.map(([id, titre]) => <option key={id} value={id}>{titre}</option>)}
          </Liste>
        </div>
        {filtresActifs ? (
          <button className="text-xs font-medium text-primary" onClick={() => { setSituation(''); setMetier(''); setFamille(''); setAction(''); setGroupe('') }}>
            Effacer les filtres ({filtresActifs})
          </button>
        ) : null}
      </OutilsListe>
      {error ? <Erreur erreur={error} /> : isLoading ? <Chargement /> : !suivis.length ? (
        <EmptyState icon={CheckCircle2} title={recherche || filtresActifs ? 'Aucun suivi ne correspond' : etat === 'a_faire' ? 'Rien à faire pour le moment' : 'Aucun suivi'} description={etat === 'a_faire' && !recherche && !filtresActifs ? 'Les suivis apparaissent ici 30 jours avant leur échéance.' : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {suivis.map((s) => {
            const nom = nomCible({ prenom: s.cible_prenom, nom: s.cible_nom })
            const j = jours(s.date_prevue)
            return (
              <div key={s.id} className="rounded-xl border border-border/80 bg-card p-4 shadow-carte">
                <div className="flex items-start gap-3">
                  <Avatar prenom={s.cible_prenom} nom={s.cible_nom} nature={s.cible_type} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/cibles/${s.cible_id}`} className="font-medium">{nom}</Link>
                    <div className="truncate text-xs text-muted-foreground">
                      {echeance(s.echeance_mois)} · <Link to={`/actions/${s.action_id}`}>{s.action_titre}</Link>
                    </div>
                    {s.cible_metier || s.cible_groupes ? (
                      <div className="truncate text-xs">
                        {s.cible_metier ? <span className="text-muted-foreground">{s.cible_metier}</span> : null}
                        {s.cible_metier && s.cible_groupes ? ' · ' : null}
                        {s.cible_groupes ? <span className="font-medium text-primary">{s.cible_groupes}</span> : null}
                      </div>
                    ) : null}
                    {!miens && s.charge_nom ? <div className="truncate text-xs text-muted-foreground">Suivi par {s.charge_nom} ({s.charge_numero})</div> : null}
                  </div>
                  {s.fait_le && s.situation ? (
                    <Badge variant="outline" className="shrink-0 gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: SITUATION[s.situation].couleur }} />
                      {SITUATION[s.situation].libelle}
                    </Badge>
                  ) : (
                    <Badge variant={j < 0 ? 'destructive' : 'secondary'} className="shrink-0">
                      {j < 0 ? `En retard de ${-j} j` : j === 0 ? "Aujourd'hui" : `Dans ${j} j`}
                    </Badge>
                  )}
                </div>
                {s.fait_le ? (
                  <p className="mt-2 text-sm text-muted-foreground sm:pl-[52px]">
                    {date(s.fait_le)}{s.activite ? ` · ${s.activite}` : ''}{s.commentaire ? ` · ${s.commentaire}` : ''}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 sm:pl-[52px]">
                  {s.cible_telephone && !s.fait_le ? (
                    <>
                      <Button asChild size="sm" variant="secondary"><a href={`tel:${s.cible_telephone}`}><Phone className="size-4" /> Appeler</a></Button>
                      <Button asChild size="sm" variant="secondary">
                        <a target="_blank" rel="noreferrer" href={lienWhatsApp(s.cible_telephone, `Bonjour ${s.cible_prenom ?? ''}, c'est l'association AP2A. Nous prenons de vos nouvelles depuis « ${s.action_titre} ». Comment ça se passe pour vous ?`)}>
                          <MessageCircle className="size-4" /> WhatsApp
                        </a>
                      </Button>
                    </>
                  ) : null}
                  <Button size="sm" variant={s.fait_le ? 'ghost' : 'default'} onClick={() => setOuvert(s)}>{s.fait_le ? 'Modifier' : 'Renseigner'}</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <SuiviForm
        ouvert={!!ouvert}
        fermer={() => setOuvert(null)}
        suivi={ouvert}
        titre={ouvert ? nomCible({ prenom: ouvert.cible_prenom, nom: ouvert.cible_nom }) : ''}
      />
    </>
  )
}
