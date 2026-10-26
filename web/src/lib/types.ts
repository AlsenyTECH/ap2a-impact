// Types des tables (miroir de supabase/migrations).
export type Role = 'admin' | 'bureau' | 'coordinateur' | 'membre'
/** Nature d'une cible : décide des champs à remplir. Fixée par sa catégorie. */
export type TypeCible = 'personne' | 'menage' | 'collectif' | 'structure' | 'lieu'

export interface FamilleCible { id: number; nom: string; ordre: number; actif: boolean }
export interface CategorieCible { id: number; famille_id: number; nature: TypeCible; libelle: string; ordre: number; actif: boolean }
export interface ProfilPersonne { id: number; genre: 'situation' | 'vulnerabilite'; libelle: string; ordre: number; actif: boolean }
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
  role_id: string
  /** Le rôle (et ses droits), quand il est chargé avec la fiche. */
  role_info?: import('./droits').RoleResume | null
  theme?: import('./theme').Theme
  mode?: import('./theme').Mode
  fonction: string | null
  numero_adherent: string
  date_adhesion: string
  actif: boolean
  photo_chemin?: string | null
  niveau_etude?: string | null
  competences?: string[]
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
  /** Retirée de la liste (gardée dans l'historique des actions). */
  retiree_le?: string | null
  photo_chemin?: string | null
  numero_beneficiaire?: string | null
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
  categorie_id: number
  situation_id: number | null
  vulnerabilites: number[]
  metier: string | null
  /** Accepte les rappels (veille des séances, événements, suivis) par WhatsApp ou SMS. */
  rappels_accord?: boolean
  rappels_canal?: 'whatsapp' | 'sms'
  /** Groupes dont la personne est membre (ménage, GPF, ASC...), séparés par des virgules. */
  groupes?: string | null
  categorie?: { libelle: string; famille: { nom: string } | null } | null
  zone?: Pick<Zone, 'chemin' | 'nom'> | null
  referent?: Pick<Membre, 'prenom' | 'nom' | 'numero_adherent'> | null
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
  responsable?: Pick<Membre, 'prenom' | 'nom' | 'numero_adherent'> | null
  seances?: { count: number }[]
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
  suivis?: Suivi[]
  via_collectif_id?: string | null
  via?: { id: string; nom: string } | null
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
  modele_id: string | null
  signature_chemin: string | null
  signe_le: string | null
  mode_remise: 'manuel' | 'scan'
  partenaire?: Pick<Partenaire, 'nom' | 'sigle'> | null
}

export type Situation = 'reussi' | 'en_progres' | 'en_difficulte' | 'perdu_de_vue'

export interface Suivi {
  id: string
  beneficiaire_id: string
  echeance_mois: number | null
  date_prevue: string
  fait_le: string | null
  situation: Situation | null
  activite: string | null
  revenu_mensuel_fcfa: number | null
  emplois_crees: number | null
  utilise_apport: boolean | null
  commentaire: string | null
  fichier_chemin: string | null
  saisi_par: string | null
}

/** Ligne de la vue suivis_detail : le suivi, la cible et le membre chargé. */
export interface SuiviDetail extends Suivi {
  action_id: string
  cible_id: string
  action_titre: string
  type_id: number
  cible_type: TypeCible
  cible_prenom: string | null
  cible_nom: string
  cible_telephone: string | null
  charge_id: string | null
  cible_metier: string | null
  cible_groupes: string | null
  cible_sexe: 'F' | 'M' | null
  cible_naissance: string | null
  cible_zone: string | null
  cible_categorie: string | null
  cible_famille: string | null
  action_type: string | null
  charge_nom: string | null
  charge_numero: string | null
}

export interface Seance {
  id: string
  action_id: string
  date: string
  heure_debut: string | null
  heure_fin: string | null
  theme: string | null
  lieu: string | null
  notes: string | null
}

export interface Presence { seance_id: string; beneficiaire_id: string; present: boolean; note: string | null }

export interface LigneJournal {
  id: number
  quand: string
  table_nom: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  libelle: string | null
  details: Record<string, [unknown, unknown]> | null
  membre: Pick<Membre, 'prenom' | 'nom' | 'numero_adherent'> | null
}

/** Carte de membre ou de bénéficiaire (QR code). */
export interface Carte {
  id: string
  jeton: string
  membre_id: string | null
  cible_id: string | null
  emise_le: string
  revoquee_le: string | null
}

export interface Evenement {
  id: string
  titre: string
  type: string
  date: string
  heure_debut: string | null
  heure_fin: string | null
  lieu: string | null
  description: string | null
  invites: 'tous' | 'selection'
  cree_par: string | null
  cree_le: string
  cloture_le: string | null
  cloture_par: string | null
  compte_rendu: string | null
}

/** Réponse d'un pointage par scan (séance ou événement). */
export interface ResultatPointage {
  statut: 'ok' | 'deja' | 'inconnue' | 'revoquee' | 'pas_inscrit' | 'carte_membre' | 'carte_beneficiaire' | 'non_invite' | 'cloture'
  prenom?: string
  nom?: string
  numero?: string
  photo?: string | null
}

export type TypeAcces = 'formateur' | 'soignant' | 'bailleur'
export type StatutConsultation = 'vu' | 'rien_a_signaler' | 'traite' | 'oriente' | 'a_revoir'

/** Accès invité d'un partenaire (formateur, soignant, bailleur). */
export interface AccesPartenaire {
  id: string
  partenaire_id: string
  type: TypeAcces
  prenom: string | null
  nom: string
  email: string
  telephone: string | null
  user_id: string | null
  revoque_le: string | null
  cree_le: string
}

export interface Consultation {
  id: string
  beneficiaire_id: string
  date: string
  statut: StatutConsultation
  auteur_nom: string | null
  mien: boolean
  /** Détail médical : seulement pour l'auteur et les responsables de l'action. */
  detail: { diagnostic: string | null; traitement: string | null; orientation: string | null; notes: string | null } | null
}
