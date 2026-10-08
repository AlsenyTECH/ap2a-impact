import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Paperclip, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CibleForm } from '@/components/CibleForm'
import { ouvrirJustificatif } from '@/components/ApportForm'
import { Chargement, EnTete, Erreur } from '@/components/champs'
import { useAuth } from '@/lib/auth'
import { date, fcfa, LIBELLES_NATURE, LIBELLES_STATUT_BENEFICIAIRE, LIBELLES_TYPE_CIBLE, nomCible } from '@/lib/format'
import { useCible, useParcours } from '@/lib/requetes'

export function CibleDetail() {
  const { id = '' } = useParams()
  const { a } = useAuth()
  const { data: cible, isLoading, error } = useCible(id)
  const { data: parcours = [] } = useParcours(id)
  const [edition, setEdition] = useState(false)

  if (error) return <Erreur erreur={error} />
  if (isLoading || !cible) return <Chargement />
  const total = parcours.flatMap((b) => b.apports ?? []).reduce((s, x) => s + (x.valeur_fcfa ?? 0), 0)
  const age = cible.date_naissance ? Math.floor((Date.now() - new Date(cible.date_naissance).getTime()) / 31_557_600_000) : null

  return (
    <>
      <Link to="/cibles" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> Cibles</Link>
      <EnTete
        titre={nomCible(cible)}
        sousTitre={<Badge variant="outline">{LIBELLES_TYPE_CIBLE[cible.type]}</Badge>}
        actions={a('admin', 'bureau', 'coordinateur') ? <Button variant="secondary" onClick={() => setEdition(true)}><Pencil className="size-4" /> Modifier</Button> : null}
      />
      <Card className="mb-6">
        <CardContent className="grid grid-cols-1 gap-3 p-4 text-sm sm:grid-cols-2">
          <Info label="Téléphone" valeur={cible.telephone ? <a className="text-primary" href={`tel:${cible.telephone}`}>{cible.telephone}</a> : null} />
          <Info label="Zone" valeur={cible.zone?.chemin} />
          {cible.type === 'personne' ? (
            <>
              <Info label="Sexe" valeur={cible.sexe === 'F' ? 'Femme' : cible.sexe === 'M' ? 'Homme' : null} />
              <Info label="Âge" valeur={age != null ? `${age} ans` : null} />
            </>
          ) : (
            <>
              <Info label="Responsable" valeur={cible.responsable} />
              <Info label="Effectif" valeur={cible.effectif} />
              <Info label="Précision" valeur={cible.sous_type} />
            </>
          )}
          <Info label="Référent du suivi" valeur={cible.referent ? `${cible.referent.prenom} ${cible.referent.nom}` : null} />
          {cible.notes ? <Info label="Notes" valeur={cible.notes} /> : null}
        </CardContent>
      </Card>

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
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
      <CibleForm ouvert={edition} fermer={() => setEdition(false)} cible={cible} />
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
