import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ListChecks, MessageCircle, Paperclip, Pencil, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CibleForm } from '@/components/CibleForm'
import { SuiviForm } from '@/components/SuiviForm'
import { MembreDe, MembresCollectif, SuiviMembres } from '@/components/MembresCollectif'
import { ouvrirJustificatif } from '@/components/ApportForm'
import { Chargement, Erreur } from '@/components/champs'
import { Avatar } from '@/components/design'
import { useAuth } from '@/lib/auth'
import { date, echeance, fcfa, LIBELLES_NATURE, LIBELLES_STATUT_BENEFICIAIRE, lienWhatsApp, nomCible, SITUATION, trancheAge } from '@/lib/format'
import { useCible, useParcours, useProfils } from '@/lib/requetes'
import type { Suivi } from '@/lib/types'

export function CibleDetail() {
  const { id = '' } = useParams()
  const { a } = useAuth()
  const { data: cible, isLoading, error } = useCible(id)
  const { data: parcours = [] } = useParcours(id)
  const { data: profils = [] } = useProfils()
  const profil = (pid: number | null) => profils.find((p) => p.id === pid)?.libelle
  const [edition, setEdition] = useState(false)
  const [suivi, setSuivi] = useState<{ suivi: Suivi | null; beneficiaireId: string } | null>(null)
  const suit = a('admin', 'bureau', 'coordinateur')

  if (error) return <Erreur erreur={error} />
  if (isLoading || !cible) return <Chargement />
  const total = parcours.flatMap((b) => b.apports ?? []).reduce((s, x) => s + (x.valeur_fcfa ?? 0), 0)
  const age = trancheAge(cible.date_naissance)
  // Situation la plus récente, tous suivis confondus.
  const dernier = parcours.flatMap((b) => b.suivis ?? []).filter((x) => x.fait_le && x.situation)
    .sort((x, y) => y.fait_le!.localeCompare(x.fait_le!))[0]

  return (
    <>
      <Link to="/cibles" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Cibles</Link>
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center md:p-6">
          <Avatar prenom={cible.prenom} nom={cible.nom} nature={cible.type} taille="lg" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-muted-foreground">{cible.type === 'personne' || cible.type === 'menage' ? cible.categorie?.famille?.nom : `${cible.categorie?.famille?.nom} · ${cible.categorie?.libelle}`}</div>
            <h1 className="mt-0.5 text-2xl font-semibold leading-tight md:text-[26px]">{nomCible(cible)}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {age ? <Badge variant="secondary">{age.tranche} · {age.age} ans</Badge> : null}
              {dernier?.situation ? (
                <Badge variant="outline"><span className="size-2 rounded-full" style={{ background: SITUATION[dernier.situation].couleur }} /> {SITUATION[dernier.situation].libelle}</Badge>
              ) : null}
              {cible.vulnerabilites?.map((v) => <Badge key={v} variant="warning">{profil(v)}</Badge>)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
            {cible.telephone ? (
              <div className="flex gap-2">
                <Button asChild size="sm" variant="secondary"><a href={`tel:${cible.telephone}`}><Phone /> Appeler</a></Button>
                <Button asChild size="sm" variant="secondary">
                  <a target="_blank" rel="noreferrer" href={lienWhatsApp(cible.telephone, `Bonjour ${cible.prenom ?? ''}, c'est l'association AP2A.`)}><MessageCircle /> WhatsApp</a>
                </Button>
              </div>
            ) : null}
            {suit ? <Button size="sm" variant="secondary" onClick={() => setEdition(true)}><Pencil /> Modifier la fiche</Button> : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-border/70 bg-border/70 md:grid-cols-4">
          <Info label="Téléphone" valeur={cible.telephone} />
          <Info label="Zone" valeur={cible.zone?.nom} />
          {cible.type === 'personne' ? (
            <>
              <Info label="Situation" valeur={profil(cible.situation_id)} />
              <Info label="Métier / domaine" valeur={cible.metier} />
              <Info label="Sexe" valeur={cible.sexe === 'F' ? 'Femme' : cible.sexe === 'M' ? 'Homme' : null} />
            </>
          ) : cible.type === 'menage' ? (
            <Info label="Taille du ménage" valeur={cible.effectif ? `${cible.effectif} personnes` : null} />
          ) : cible.type === 'lieu' ? (
            <Info label="Précision" valeur={cible.sous_type} />
          ) : (
            <>
              <Info label="Responsable" valeur={cible.responsable} />
              <Info label="Effectif déclaré" valeur={cible.effectif} />
              <Info label="Précision" valeur={cible.sous_type} />
            </>
          )}
          <Info label="Adresse / repère" valeur={cible.adresse} />
          <Info label="Référent du suivi" valeur={cible.referent ? `${cible.referent.prenom} ${cible.referent.nom}` : null} />
          <Info label="Reçu de l'association" valeur={total ? fcfa(total) : null} />
        </dl>
        {cible.notes ? <p className="border-t border-border/70 px-5 py-3 text-sm text-muted-foreground md:px-6">{cible.notes}</p> : null}
      </Card>

      {cible.type === 'personne' ? <MembreDe personneId={cible.id} /> : null}
      {cible.type === 'menage' || cible.type === 'collectif' || cible.type === 'structure' ? <MembresCollectif collectif={cible} gere={suit} /> : null}
      {cible.type === 'menage' || cible.type === 'collectif' || cible.type === 'structure' ? <SuiviMembres collectifId={cible.id} /> : null}

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Parcours avec l'association</h2>
        {total ? <span className="text-sm text-muted-foreground">Total reçu : <b className="text-foreground">{fcfa(total)}</b></span> : null}
      </div>
      {!parcours.length ? (
        <p className="text-sm text-muted-foreground">N'a encore bénéficié d'aucune action.</p>
      ) : (
        <ol className="space-y-3 border-l-2 border-primary/30 pl-4">
          {parcours.map((b) => (
            <li key={b.id}>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/actions/${b.action?.id}`} className="font-medium text-primary">{b.action?.titre}</Link>
                    <Badge variant={b.statut === 'abandon' ? 'destructive' : b.statut === 'termine' ? 'success' : 'secondary'}>
                      {LIBELLES_STATUT_BENEFICIAIRE[b.statut]}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {b.action?.type?.libelle} · {date(b.action?.date_debut)}
                    {b.via ? <> · inscrit(e) avec <Link className="text-primary" to={`/cibles/${b.via.id}`}>{b.via.nom}</Link></> : null}
                  </div>
                  {b.apports?.map((x) => (
                    <div key={x.id} className="flex items-center justify-between gap-2 rounded bg-muted/50 px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">{LIBELLES_NATURE[x.nature]}</span> · {x.description}
                        {x.partenaire ? <span className="text-muted-foreground"> — {x.partenaire.sigle || x.partenaire.nom}</span> : null}
                        {x.numero_document ? <span className="text-muted-foreground"> (n° {x.numero_document})</span> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {x.valeur_fcfa ? <span className="text-xs">{fcfa(x.valeur_fcfa)}</span> : null}
                        {x.fichier_chemin ? (
                          <button onClick={() => ouvrirJustificatif(x.fichier_chemin!)} aria-label="Voir le justificatif"><Paperclip className="size-4 text-primary" /></button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  <Suivis suivis={b.suivis ?? []} ouvrir={suit ? (x) => setSuivi({ suivi: x, beneficiaireId: b.id }) : undefined} />
                  {suit && b.action?.statut === 'terminee' ? (
                    <Button size="sm" variant="ghost" className="text-primary" onClick={() => setSuivi({ suivi: null, beneficiaireId: b.id })}>
                      <ListChecks className="size-4" /> Ajouter un suivi
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
      <CibleForm ouvert={edition} fermer={() => setEdition(false)} cible={cible} />
      <SuiviForm ouvert={!!suivi} fermer={() => setSuivi(null)} suivi={suivi?.suivi} beneficiaireId={suivi?.beneficiaireId} titre={nomCible(cible)} />
    </>
  )
}

function Info({ label, valeur }: { label: string; valeur: ReactNode }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3 md:px-5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{valeur ?? '—'}</dd>
    </div>
  )
}

/** Suivis d'un bénéficiaire : faits (avec la situation) puis prévus. */
function Suivis({ suivis, ouvrir }: { suivis: Suivi[]; ouvrir?: (s: Suivi) => void }) {
  if (!suivis.length) return null
  const tries = [...suivis].sort((x, y) => (x.fait_le ?? x.date_prevue).localeCompare(y.fait_le ?? y.date_prevue))
  return (
    <div className="space-y-1 border-t border-border pt-2">
      {tries.map((x) => (
        <button
          key={x.id}
          disabled={!ouvrir}
          onClick={() => ouvrir?.(x)}
          className="flex w-full items-start gap-2 rounded px-1 py-1 text-left text-sm enabled:hover:bg-muted/50"
        >
          <span
            className="mt-1.5 size-2.5 shrink-0 rounded-full border border-border"
            style={{ background: x.situation && x.fait_le ? SITUATION[x.situation].couleur : 'transparent' }}
          />
          <span className="min-w-0">
            <span className="font-medium">{echeance(x.echeance_mois)}</span>
            {x.fait_le && x.situation ? (
              <>
                {' '}· {SITUATION[x.situation].libelle} <span className="text-muted-foreground">({date(x.fait_le)})</span>
                {x.activite || x.commentaire ? (
                  <span className="block text-xs text-muted-foreground">
                    {[x.activite, x.revenu_mensuel_fcfa != null ? `${fcfa(x.revenu_mensuel_fcfa)}/mois` : null, x.emplois_crees ? `${x.emplois_crees} emploi(s) créé(s)` : null, x.commentaire].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground"> · prévu le {date(x.date_prevue)}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
