// Types des tables (miroir de supabase/migrations).
export type Role = 'admin' | 'bureau' | 'coordinateur' | 'membre'
export type TypeCible = 'personne' | 'groupe' | 'asc' | 'etablissement' | 'organisation' | 'zone_sinistree'
export type StatutAction = 'preparation' | 'en_cours' | 'terminee' | 'annulee'
export type StatutBeneficiaire = 'inscrit' | 'termine' | 'abandon'
export type NatureApport = 'formation' | 'certificat' | 'kit' | 'don' | 'soin' | 'financement' | 'autre'
export type RolePartenaire = 'formateur' | 'prestataire' | 'financeur' | 'soutien' | 'autre'

export interface Membre {
  id: string
  user_id: string | null
  prenom: string
  nom: string
  telephone: string | null
  email: string | null
  role: Role
  fonction: string | null
  numero_adherent: string
  date_adhesion: string
  actif: boolean
}

export interface Zone { id: number; nom: string; niveau: string; parent_id: number | null; chemin: string }

export interface Partenaire {
  id: string
  nom: string
  sigle: string | null
  domaine: string | null
  contact_nom: string | null
  telephone: string | null
  email: string | null
  actif: boolean
}

export interface Cible {
  id: string
  type: TypeCible
  nom: string
  prenom: string | null
  sexe: 'F' | 'M' | null
  date_naissance: string | null
  telephone: string | null
  sous_type: string | null
  responsable: string | null
  effectif: number | null
  zone_id: number | null
  adresse: string | null
  referent_id: string | null
  notes: string | null
  actif: boolean
  cree_le: string
  zone?: Pick<Zone, 'chemin' | 'nom'> | null
  referent?: Pick<Membre, 'prenom' | 'nom'> | null
}

export interface TypeAction { id: number; code: string; libelle: string; suivis_mois: number[]; actif: boolean }

export interface Action {
  id: string
  type_id: number
  titre: string
  description: string | null
  statut: StatutAction
  date_debut: string
  date_fin: string | null
  lieu: string | null
  zone_id: number | null
  responsable_id: string | null
  budget_fcfa: number | null
  bilan: string | null
  cree_par: string | null
  type?: Pick<TypeAction, 'libelle' | 'code'> | null
  responsable?: Pick<Membre, 'prenom' | 'nom'> | null
  zone?: Pick<Zone, 'chemin' | 'nom'> | null
}

export interface Beneficiaire {
  id: string
  action_id: string
  cible_id: string
  statut: StatutBeneficiaire
  notes: string | null
  cible?: Cible
  action?: Action
  apports?: Apport[]
}

export interface Apport {
  id: string
  beneficiaire_id: string
  nature: NatureApport
  description: string
  valeur_fcfa: number | null
  quantite: number | null
  partenaire_id: string | null
  numero_document: string | null
  fichier_chemin: string | null
  date_remise: string
  partenaire?: Pick<Partenaire, 'nom' | 'sigle'> | null
}
