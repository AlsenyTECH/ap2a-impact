import { useQuery } from '@tanstack/react-query'
import { supabase, verifier } from './supabase'

/** Un modèle de kit du catalogue, avec son stock. */
export interface Composant { libelle: string; quantite: number }
export interface KitModele {
  id: string
  nom: string
  description: string | null
  composition: Composant[]
  valeur_unitaire_fcfa: number | null
  partenaire_id: string | null
  seuil_alerte: number
  actif: boolean
  cree_le: string
  partenaire?: { nom: string; sigle: string | null } | null
  stock: number
  entrees: number
  remis: number
  dernier_mouvement: string | null
}

export type MotifMouvement = 'achat' | 'don' | 'retour' | 'remise' | 'perte' | 'inventaire'
export const LIBELLES_MOTIF: Record<MotifMouvement, string> = {
  achat: 'Achat', don: 'Don reçu', retour: 'Retour', remise: 'Remise', perte: 'Perte / casse', inventaire: 'Inventaire',
}
export interface Mouvement {
  id: string
  modele_id: string
  quantite: number
  motif: MotifMouvement
  apport_id: string | null
  partenaire_id: string | null
  cout_fcfa: number | null
  date: string
  note: string | null
  cree_le: string
  partenaire?: { nom: string; sigle: string | null } | null
  auteur?: { prenom: string; nom: string } | null
  apport?: { beneficiaire: { action_id: string; action: { titre: string } | null; cible: { prenom: string | null; nom: string } | null } | null } | null
}

/** Catalogue des kits avec le stock de chacun. */
export const useKits = (avecInactifs = false) => useQuery({
  queryKey: ['kits', avecInactifs],
  queryFn: async () => {
    let q = supabase.from('kits_modeles').select('*, partenaire:partenaires(nom, sigle)').order('nom')
    if (!avecInactifs) q = q.eq('actif', true)
    const [modeles, stocks] = await Promise.all([q.then(verifier), supabase.from('kits_stock').select('*').then(verifier)])
    const parModele = new Map((stocks as { modele_id: string; stock: number; entrees: number; remis: number; dernier_mouvement: string | null }[]).map((s) => [s.modele_id, s]))
    return (modeles as Omit<KitModele, 'stock' | 'entrees' | 'remis' | 'dernier_mouvement'>[]).map((m) => ({
      ...m,
      composition: Array.isArray(m.composition) ? m.composition : [],
      stock: parModele.get(m.id)?.stock ?? 0,
      entrees: parModele.get(m.id)?.entrees ?? 0,
      remis: parModele.get(m.id)?.remis ?? 0,
      dernier_mouvement: parModele.get(m.id)?.dernier_mouvement ?? null,
    })) as KitModele[]
  },
})

export const useMouvements = (modeleId: string | null) => useQuery({
  queryKey: ['kits-mouvements', modeleId],
  enabled: !!modeleId,
  queryFn: async () => verifier(await supabase.from('kits_mouvements')
    .select('*, partenaire:partenaires(nom, sigle), auteur:membres!kits_mouvements_cree_par_fkey(prenom, nom), apport:apports(beneficiaire:beneficiaires(action_id, action:actions(titre), cible:cibles!beneficiaires_cible_id_fkey(prenom, nom)))')
    .eq('modele_id', modeleId!).order('date', { ascending: false }).order('cree_le', { ascending: false }).limit(200)) as unknown as Mouvement[],
})

/** Niveau de stock : épuisé, sous le seuil d'alerte, ou correct. */
export function niveauStock(k: Pick<KitModele, 'stock' | 'seuil_alerte'>): 'epuise' | 'bas' | 'ok' {
  if (k.stock <= 0) return 'epuise'
  if (k.stock <= k.seuil_alerte) return 'bas'
  return 'ok'
}

/** Signature dessinée sur l'écran → image PNG dans les justificatifs du bénéficiaire. */
export async function deposerSignature(beneficiaireId: string, image: Blob) {
  const chemin = `${beneficiaireId}/signature-${crypto.randomUUID()}.png`
  const { error } = await supabase.storage.from('justificatifs').upload(chemin, image, { contentType: 'image/png' })
  if (error) throw error
  return chemin
}
