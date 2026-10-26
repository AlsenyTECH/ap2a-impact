import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Champ, Liste } from '@/components/champs'
import { useZones } from '@/lib/requetes'
import { supabase, verifier } from '@/lib/supabase'
import type { Zone } from '@/lib/types'

/** Niveaux d'études (même liste que la base). */
export const NIVEAUX: [string, string][] = [
  ['aucun', 'Non scolarisé(e)'],
  ['primaire', 'Primaire'],
  ['moyen', 'Moyen (collège)'],
  ['secondaire', 'Secondaire (lycée)'],
  ['bac', 'Baccalauréat'],
  ['bac2', 'Bac + 2 (BTS, DUT…)'],
  ['licence', 'Licence (Bac + 3)'],
  ['master', 'Master (Bac + 5)'],
  ['doctorat', 'Doctorat'],
  ['professionnel', 'Formation professionnelle (CAP, BEP…)'],
]
export const libelleNiveau = (n: string | null | undefined) => NIVEAUX.find(([c]) => c === n)?.[1] ?? null

const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Niveau tapé librement (import Excel) : « Licence », « bac+2 », « BTS »… */
export function lireNiveau(texte: string): string | null {
  const t = sansAccent(texte).replace(/\s+/g, '')
  if (!t) return null
  if (/doctor|phd|these/.test(t)) return 'doctorat'
  if (/master|bac\+?[45]|dea|dess|ingenieur/.test(t)) return 'master'
  if (/licence|bac\+?3/.test(t)) return 'licence'
  if (/bac\+?2|bts|dut/.test(t)) return 'bac2'
  if (/cap|bep|professionnel|formationpro/.test(t)) return 'professionnel'
  if (/^bac|baccalaureat/.test(t)) return 'bac'
  if (/lycee|secondaire|terminale/.test(t)) return 'secondaire'
  if (/college|moyen|bfem/.test(t)) return 'moyen'
  if (/primaire|cfee/.test(t)) return 'primaire'
  if (/aucun|nonscolaris/.test(t)) return 'aucun'
  return NIVEAUX.find(([c, l]) => c === t || sansAccent(l).replace(/\s+/g, '') === t)?.[0] ?? null
}

/** Compétences tapées « électricité, couture ; comptabilité » -> liste. */
export const lireCompetences = (texte: string) => texte.split(/[,;\n]+/).map((c) => c.trim()).filter(Boolean)

/** Les 26 unités des Parcelles Assainies, dans l'ordre. */
export function unitesParcelles(zones: Zone[]) {
  return zones
    .filter((z) => z.chemin.includes('Parcelles Assainies >') && /^Unité \d+$/.test(z.nom))
    .sort((a, b) => Number(a.nom.slice(6)) - Number(b.nom.slice(6)))
}

/** « U17 », « Unité 17 », « 17 » -> zone ; sinon null (adresse « autre »). */
export function trouverUnite(zones: Zone[], texte: string): number | null {
  const t = sansAccent(texte)
  const n = t.match(/^(?:u|unite)?\s*(\d{1,2})$/)?.[1]
  return n ? unitesParcelles(zones).find((z) => z.nom === `Unité ${Number(n)}`)?.id ?? null : null
}

export interface Adresse { zone_id: number | null; adresse: string; repere: string; autre: boolean }
export const ADRESSE_VIDE: Adresse = { zone_id: null, adresse: '', repere: '', autre: false }

/** Adresse d'un membre (visible de lui-même et de qui gère les membres). */
export const useAdresseMembre = (membreId: string | null | undefined) =>
  useQuery({
    queryKey: ['adresse-membre', membreId],
    enabled: !!membreId,
    queryFn: async () => {
      const a = verifier(await supabase.from('membres_adresses').select('zone_id, adresse, repere').eq('membre_id', membreId!).maybeSingle()) as { zone_id: number | null; adresse: string | null; repere: string | null } | null
      return a ? { zone_id: a.zone_id, adresse: a.adresse ?? '', repere: a.repere ?? '', autre: !a.zone_id && !!a.adresse } : ADRESSE_VIDE
    },
  })

/** Enregistre l'adresse ; vide, elle est effacée. */
export async function enregistrerAdresse(membreId: string, a: Adresse) {
  const ligne = {
    zone_id: a.autre ? null : a.zone_id,
    adresse: a.autre ? a.adresse.trim() || null : null,
    repere: a.repere.trim() || null,
  }
  const r = !ligne.zone_id && !ligne.adresse && !ligne.repere
    ? await supabase.from('membres_adresses').delete().eq('membre_id', membreId)
    : await supabase.from('membres_adresses').upsert({ membre_id: membreId, ...ligne })
  if (r.error) throw r.error
}

/** Unité des Parcelles, ou « Autre » avec l'adresse en clair ; plus un repère. */
export function ChampsAdresse({ valeur, changer }: { valeur: Adresse; changer: (a: Adresse) => void }) {
  const { data: zones = [] } = useZones()
  const unites = unitesParcelles(zones)
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <Champ label="Adresse">
        <Liste
          value={valeur.autre ? 'autre' : valeur.zone_id ?? ''}
          onChange={(e) => changer(e.target.value === 'autre'
            ? { ...valeur, autre: true, zone_id: null }
            : { ...valeur, autre: false, zone_id: e.target.value ? Number(e.target.value) : null, adresse: '' })}
        >
          <option value="">— Non renseignée —</option>
          <optgroup label="Parcelles Assainies">
            {unites.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
          </optgroup>
          <option value="autre">Autre (hors Parcelles Assainies)</option>
        </Liste>
      </Champ>
      {valeur.autre ? (
        <Champ label="Quartier et ville">
          <Input autoFocus required maxLength={200} value={valeur.adresse} placeholder="Ex. Cité Mixta, Dakar · Keur Massar · Thiès" onChange={(e) => changer({ ...valeur, adresse: e.target.value })} />
        </Champ>
      ) : null}
      {valeur.autre || valeur.zone_id ? (
        <Champ label="Repère (facultatif)">
          <Input maxLength={200} value={valeur.repere} placeholder="Ex. villa 123, près de la mosquée" onChange={(e) => changer({ ...valeur, repere: e.target.value })} />
        </Champ>
      ) : null}
    </div>
  )
}

/** Niveau d'études et compétences. */
export function ChampsEtudes({ niveau, competences, changer }: { niveau: string; competences: string; changer: (niveau: string, competences: string) => void }) {
  return (
    <>
      <Champ label="Niveau d'études">
        <Liste value={niveau} onChange={(e) => changer(e.target.value, competences)}>
          <option value="">— Non renseigné —</option>
          {NIVEAUX.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
        </Liste>
      </Champ>
      <Champ label="Compétences" aide="Séparées par des virgules. Visibles des autres membres, pour savoir qui peut aider.">
        <Input value={competences} placeholder="Électricité, couture, comptabilité, informatique…" onChange={(e) => changer(niveau, e.target.value)} />
      </Champ>
    </>
  )
}

