import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Chargement, Erreur, Liste } from '@/components/champs'
import { Chiffres, PageRapport, TitreSection } from '@/components/rapport'
import { useAuth } from '@/lib/auth'
import { date, fcfa, LIBELLES_STATUT_BENEFICIAIRE } from '@/lib/format'
import { useKits } from '@/lib/kits'
import { useAction } from '@/lib/requetes'
import { supabase, verifier } from '@/lib/supabase'
import type { Apport, StatutBeneficiaire } from '@/lib/types'

interface Ligne {
  id: string
  statut: StatutBeneficiaire
  cible: { prenom: string | null; nom: string; numero_beneficiaire: string | null }
  apports: Apport[]
}

/**
 * Bon de remise des kits d'une action, avec la signature de chaque
 * bénéficiaire ; ou, avec « vierge », la feuille d'émargement à faire
 * signer sur papier le jour de la remise.
 */
export function BonRemise() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const modeleId = params.get('modele') ?? ''
  const vierge = params.get('vierge') === '1'
  const { membre } = useAuth()
  const { data: action, error } = useAction(id)
  const { data: kits = [] } = useKits(true)

  const { data: lignes } = useQuery({
    queryKey: ['bon-remise', id],
    staleTime: 0,
    queryFn: async () => verifier(await supabase.from('beneficiaires')
      .select('id, statut, cible:cibles!beneficiaires_cible_id_fkey(prenom, nom, numero_beneficiaire), apports(*)')
      .eq('action_id', id).eq('apports.nature', 'kit')) as unknown as Ligne[],
  })

  // Signatures : liens signés valables 10 minutes, le temps d'imprimer.
  const chemins = (lignes ?? []).flatMap((l) => l.apports.map((a) => a.signature_chemin)).filter((c): c is string => !!c)
  const { data: images = {}, isLoading: chargeSignatures, isError: signaturesEnErreur, refetch: rechargerSignatures } = useQuery({
    queryKey: ['bon-remise-signatures', id, chemins.join('|')],
    enabled: chemins.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('justificatifs').createSignedUrls(chemins, 600)
      if (error) throw error
      return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl])) as Record<string, string>
    },
  })

  if (error) return <div className="p-6"><Erreur erreur={error} /></div>
  if (!action || !lignes) return <div className="p-6"><Chargement /></div>

  const changer = (cle: string, valeur: string) => {
    const p = new URLSearchParams(params)
    if (valeur) p.set(cle, valeur)
    else p.delete(cle)
    setParams(p, { replace: true })
  }
  const parNom = (a: Ligne, b: Ligne) => `${a.cible.nom} ${a.cible.prenom ?? ''}`.localeCompare(`${b.cible.nom} ${b.cible.prenom ?? ''}`, 'fr')
  const nom = (l: Ligne) => `${l.cible.nom.toUpperCase()} ${l.cible.prenom ?? ''}`.trim()

  // Kits remis dans cette action (pour le choix), et kit choisi.
  const utilises = new Set(lignes.flatMap((l) => l.apports.map((a) => a.modele_id)).filter(Boolean))
  const choix = kits.filter((k) => utilises.has(k.id) || (vierge && k.actif) || k.id === modeleId)
  const kit = kits.find((k) => k.id === modeleId)

  const outils = (
    <>
      <Liste className="h-8 w-auto text-xs" value={modeleId} onChange={(e) => changer('modele', e.target.value)} aria-label="Kit">
        <option value="">{vierge ? '— Choisir le kit —' : 'Tous les kits'}</option>
        {choix.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}
      </Liste>
      <Liste className="h-8 w-auto text-xs" value={vierge ? '1' : ''} onChange={(e) => changer('vierge', e.target.value)} aria-label="Document">
        <option value="">Bon de remise (signatures enregistrées)</option>
        <option value="1">Feuille d'émargement à signer</option>
      </Liste>
      {!vierge && chemins.length && chargeSignatures ? <span className="text-xs text-muted-foreground">Chargement des signatures…</span> : null}
      {!vierge && signaturesEnErreur ? (
        <button className="text-xs font-medium text-destructive underline" onClick={() => rechargerSignatures()}>Signatures non chargées : réessayer</button>
      ) : null}
    </>
  )
  const pied = <>Document établi avec l'application AP2A{membre ? ` par ${membre.prenom} ${membre.nom}` : ''}.<br />Les données personnelles des bénéficiaires restent confidentielles.</>

  if (vierge) {
    const personnes = lignes.filter((l) => l.statut !== 'abandon').sort(parNom)
    return (
      <PageRapport retour={`/actions/${id}`} titre="Feuille d'émargement — remise de kits" sousTitre={<>{action.titre}{action.lieu ? ` · ${action.lieu}` : ''}</>} outils={outils} pied={pied}>
        <section className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-[#f1f6f3] p-3 text-xs">
          <div><b>Kit remis :</b> {kit ? kit.nom : '……………………………………………'}</div>
          <div><b>Date de remise :</b> ……… / ……… / …………</div>
          <div className="col-span-2"><b>Contenu :</b> {kit?.composition.length ? kit.composition.map((c) => `${c.quantite > 1 ? `${c.quantite} × ` : ''}${c.libelle}`).join(', ') : '…………………………………………………………………………………………'}</div>
          {kit?.valeur_unitaire_fcfa ? <div><b>Valeur unitaire :</b> {fcfa(kit.valeur_unitaire_fcfa)}</div> : null}
          {kit?.partenaire ? <div><b>Fourni par :</b> {kit.partenaire.sigle || kit.partenaire.nom}</div> : null}
        </section>
        <p className="text-xs text-[#3d4b44]">En signant, je reconnais avoir reçu le kit décrit ci-dessus, complet et en bon état.</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[#f1f6f3] text-left">
              <th className="w-8 border border-[#cfd8d2] px-2 py-1.5">N°</th>
              <th className="border border-[#cfd8d2] px-2 py-1.5">Nom et prénom</th>
              <th className="w-24 border border-[#cfd8d2] px-2 py-1.5">N° de carte</th>
              <th className="w-12 border border-[#cfd8d2] px-2 py-1.5 text-center">Qté</th>
              <th className="w-44 border border-[#cfd8d2] px-2 py-1.5">Signature ou empreinte</th>
            </tr>
          </thead>
          <tbody>
            {personnes.map((l, i) => (
              <tr key={l.id} className="h-11">
                <td className="border border-[#cfd8d2] px-2 text-center chiffres">{i + 1}</td>
                <td className="border border-[#cfd8d2] px-2 font-medium">{nom(l)}</td>
                <td className="border border-[#cfd8d2] px-2 chiffres">{l.cible.numero_beneficiaire ?? ''}</td>
                <td className="border border-[#cfd8d2] px-2" />
                <td className="border border-[#cfd8d2] px-2" />
              </tr>
            ))}
            {Array.from({ length: 3 }, (_, i) => (
              <tr key={`vide-${i}`} className="h-11">
                <td className="border border-[#cfd8d2] px-2 text-center chiffres">{personnes.length + i + 1}</td>
                {Array.from({ length: 4 }, (_, j) => <td key={j} className="border border-[#cfd8d2]" />)}
              </tr>
            ))}
          </tbody>
        </table>
        <Visas />
      </PageRapport>
    )
  }

  // Bon de remise : ce qui a été remis, à qui, avec la signature.
  const remises = lignes.flatMap((l) => l.apports
    .filter((a) => (modeleId ? a.modele_id === modeleId : true))
    .map((a) => ({ l, a })))
    .sort((x, y) => x.a.date_remise.localeCompare(y.a.date_remise) || parNom(x.l, y.l))
  const signees = remises.filter((r) => r.a.signature_chemin).length
  const valeur = remises.reduce((s, r) => s + (r.a.valeur_fcfa ?? 0), 0)
  const quantite = remises.reduce((s, r) => s + Math.max(1, Math.ceil(r.a.quantite ?? 1)), 0)
  const sansKit = kit ? lignes.filter((l) => l.statut !== 'abandon' && !l.apports.some((a) => a.modele_id === kit.id)).sort(parNom) : []
  const jours = [...new Set(remises.map((r) => r.a.date_remise))]

  return (
    <PageRapport
      retour={`/actions/${id}`}
      titre={kit ? `Bon de remise — ${kit.nom}` : 'Bon de remise des kits'}
      sousTitre={<>{action.titre}{action.lieu ? ` · ${action.lieu}` : ''}{jours.length ? ` · remis ${jours.length === 1 ? `le ${date(jours[0])}` : `du ${date(jours[0])} au ${date(jours[jours.length - 1])}`}` : ''}</>}
      outils={outils}
      pied={pied}
    >
      <Chiffres elements={[
        { valeur: quantite, libelle: 'kits remis' },
        { valeur: new Set(remises.map((r) => r.l.id)).size, libelle: 'bénéficiaires servis' },
        { valeur: `${signees} / ${remises.length}`, libelle: 'remises signées' },
        { valeur: valeur ? fcfa(valeur) : '—', libelle: 'valeur totale' },
      ]} />
      {kit?.composition.length ? (
        <p className="text-xs"><b>Contenu du kit :</b> {kit.composition.map((c) => `${c.quantite > 1 ? `${c.quantite} × ` : ''}${c.libelle}`).join(', ')}.</p>
      ) : null}
      <section>
        <TitreSection>Remises</TitreSection>
        {!remises.length ? (
          <p className="text-xs text-[#5c6b64]">Aucun kit remis pour l'instant. Imprimez la feuille d'émargement pour une remise sur papier.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#f1f6f3] text-left">
                <th className="w-8 border-b border-[#cfd8d2] px-2 py-1.5">N°</th>
                <th className="border-b border-[#cfd8d2] px-2 py-1.5">Bénéficiaire</th>
                {!kit ? <th className="border-b border-[#cfd8d2] px-2 py-1.5">Kit</th> : null}
                <th className="w-10 border-b border-[#cfd8d2] px-2 py-1.5 text-center">Qté</th>
                <th className="w-20 border-b border-[#cfd8d2] px-2 py-1.5">Date</th>
                <th className="w-40 border-b border-[#cfd8d2] px-2 py-1.5">Signature</th>
              </tr>
            </thead>
            <tbody>
              {remises.map(({ l, a }, i) => (
                <tr key={a.id} className="border-b border-[#eef1ec]">
                  <td className="px-2 py-1 text-center chiffres">{i + 1}</td>
                  <td className="px-2 py-1">
                    <div className="font-medium">{nom(l)}</div>
                    {l.cible.numero_beneficiaire ? <div className="text-[10px] text-[#5c6b64] chiffres">{l.cible.numero_beneficiaire}</div> : null}
                  </td>
                  {!kit ? <td className="px-2 py-1">{a.description}</td> : null}
                  <td className="px-2 py-1 text-center chiffres">{Math.max(1, Math.ceil(a.quantite ?? 1))}</td>
                  <td className="whitespace-nowrap px-2 py-1 chiffres">{date(a.date_remise)}</td>
                  <td className="px-2 py-0.5">
                    {a.signature_chemin && images[a.signature_chemin] ? (
                      <img src={images[a.signature_chemin]} alt={`Signature de ${nom(l)}`} className="h-10 w-auto max-w-[9.5rem] object-contain" />
                    ) : a.signature_chemin ? (
                      <span className="text-[10px] text-[#5c6b64]">Signé le {date(a.signe_le!)}</span>
                    ) : (
                      <span className="text-[10px] text-[#a32b2b]">Non signé{a.mode_remise === 'scan' ? ' (carte scannée)' : ''}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {sansKit.length ? (
        <section>
          <TitreSection>N'ont pas encore reçu ce kit ({sansKit.length})</TitreSection>
          <p className="text-xs">{sansKit.map((l) => `${nom(l)}${l.statut !== 'inscrit' && l.statut !== 'termine' ? ` (${LIBELLES_STATUT_BENEFICIAIRE[l.statut].toLowerCase()})` : ''}`).join(' · ')}</p>
        </section>
      ) : null}
      <Visas />
    </PageRapport>
  )
}

function Visas() {
  return (
    <section className="grid grid-cols-2 gap-10 pt-2 text-xs">
      {['Remis par (nom et signature)', 'Visa du responsable de l\'action'].map((t) => (
        <div key={t}>
          <div className="h-14" />
          <div className="border-t border-[#13211b]/40 pt-1 text-[#5c6b64]">{t}</div>
        </div>
      ))}
    </section>
  )
}
