import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ListChecks, Paperclip, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CibleForm } from '@/components/CibleForm'
import { SuiviForm } from '@/components/SuiviForm'
import { MembreDe, MembresCollectif } from '@/components/MembresCollectif'
import { ouvrirJustificatif } from '@/components/ApportForm'
import { Chargement, EnTete, Erreur } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { date, echeance, fcfa, LIBELLES_NATURE, LIBELLES_SITUATION_PERSONNE, LIBELLES_STATUT_BENEFICIAIRE, LIBELLES_TYPE_CIBLE, LIBELLES_VULNERABILITE, nomCible, SITUATION, trancheAge } from '@/lib/format'
import { useCible, useParcours } from '@/lib/requetes'
import type { Suivi } from '@/lib/types'

export function CibleDetail() {
  const { id = '' } = useParams()
  const { a } = useAuth()
  const { data: cible, isLoading, error } = useCible(id)
  const { data: parcours = [] } = useParcours(id)
  const [edition, setEdition] = useState(false)
  const [suivi, setSuivi] = useState<{ suivi: Suivi | null; beneficiaireId: string } | null>(null)
  const suit = a('admin', 'bureau', 'coordinateur')

  if (error) return <Erreur erreur={error} />
  if (isLoading || !cible) return <Chargement />
  const total = parcours.flatMap((b) => b.apports ?? []).reduce((s, x) => s + (x.valeur_fcfa ?? 0), 0)
  const age = trancheAge(cible.date_naissance)

  return (
    <>
      <Link to="/cibles" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> Cibles</Link>
      <EnTete
        titre={nomCible(cible)}
        sousTitre={
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant="outline">{cible.categorie?.libelle ?? LIBELLES_TYPE_CIBLE[cible.type]}</Badge>
            {age ? <Badge variant="secondary">{age.tranche}</Badge> : null}
            {cible.vulnerabilites?.map((v) => <Badge key={v} variant="secondary">{LIBELLES_VULNERABILITE[v]}</Badge>)}
          </div>
        }
        actions={a('admin', 'bureau', 'coordinateur') ? <Button variant="secondary" onClick={() => setEdition(true)}><Pencil className="size-4" /> Modifier</Button> : null}
      />
      <Card className="mb-6">
        <CardContent className="grid grid-cols-1 gap-3 p-4 text-sm sm:grid-cols-2">
          <Info label="Téléphone" valeur={cible.telephone ? <a className="text-primary" href={`tel:${cible.telephone}`}>{cible.telephone}</a> : null} />
          <Info label="Zone" valeur={cible.zone?.chemin} />
          {cible.type === 'personne' ? (
            <>
              <Info label="Sexe" valeur={cible.sexe === 'F' ? 'Femme' : cible.sexe === 'M' ? 'Homme' : null} />
              <Info label="Âge" valeur={age ? `${age.age} ans` : null} />
              <Info label="Situation" valeur={cible.situation ? LIBELLES_SITUATION_PERSONNE[cible.situation] : null} />
            </>
          ) : (
            <>
              <Info label="Responsable" valeur={cible.responsable} />
              <Info label="Effectif déclaré" valeur={cible.effectif} />
              <Info label="Précision" valeur={cible.sous_type} />
            </>
          )}
          <Info label="Référent du suivi" valeur={cible.referent ? `${cible.referent.prenom} ${cible.referent.nom}` : null} />
          {cible.notes ? <Info label="Notes" valeur={cible.notes} /> : null}
        </CardContent>
      </Card>

      {cible.type === 'personne' ? <MembreDe personneId={cible.id} /> : null}
      {cible.type === 'collectif' || cible.type === 'structure' ? <MembresCollectif collectif={cible} gere={suit} /> : null}

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
                  <div className="text-xs text-muted-foreground">{b.action?.type?.libelle} · {date(b.action?.date_debut)}</div>
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
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{valeur ?? '—'}</div>
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
