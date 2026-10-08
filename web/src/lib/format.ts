import type { NatureApport, Role, StatutAction, StatutBeneficiaire, TypeCible } from './types'

export const LIBELLES_ROLE: Record<Role, string> = {
  admin: 'Administrateur', bureau: 'Bureau', coordinateur: 'Coordinateur', membre: 'Membre',
}
export const LIBELLES_TYPE_CIBLE: Record<TypeCible, string> = {
  personne: 'Personne', groupe: 'Groupe / GIE', asc: 'ASC', etablissement: 'École / établissement',
  organisation: 'Organisation', zone_sinistree: 'Zone sinistrée',
}
export const LIBELLES_STATUT_ACTION: Record<StatutAction, string> = {
  preparation: 'En préparation', en_cours: 'En cours', terminee: 'Terminée', annulee: 'Annulée',
}
export const LIBELLES_STATUT_BENEFICIAIRE: Record<StatutBeneficiaire, string> = {
  inscrit: 'Inscrit', termine: 'A terminé', abandon: 'Abandon',
}
export const LIBELLES_NATURE: Record<NatureApport, string> = {
  formation: 'Formation', certificat: 'Certificat', kit: 'Kit / matériel', don: 'Don',
  soin: 'Soin', financement: 'Financement', autre: 'Autre',
}

export const nomCible = (c: { prenom?: string | null; nom: string }) => (c.prenom ? `${c.prenom} ${c.nom}` : c.nom)

export function fcfa(montant: number | null | undefined) {
  if (montant == null) return '—'
  return `${new Intl.NumberFormat('fr-FR').format(montant)} FCFA`
}

export function date(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const aujourdhui = () => new Date().toISOString().slice(0, 10)
