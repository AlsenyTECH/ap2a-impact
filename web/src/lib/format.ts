import type { NatureApport, Role, Situation, SituationPersonne, StatutAction, StatutBeneficiaire, TypeCible, Vulnerabilite } from './types'

export const LIBELLES_ROLE: Record<Role, string> = {
  admin: 'Administrateur', bureau: 'Bureau', coordinateur: 'Coordinateur', membre: 'Membre',
}
export const LIBELLES_TYPE_CIBLE: Record<TypeCible, string> = {
  personne: 'Personne', collectif: 'Groupe / association', structure: 'Établissement', lieu: 'Lieu / zone',
}
/** Explication de chaque nature, affichée dans le formulaire. */
export const AIDE_TYPE_CIBLE: Record<TypeCible, string> = {
  personne: 'Un jeune, une femme, un malade…',
  collectif: 'ASC, GIE, GPF, dahira, association… dont on enregistre les membres',
  structure: 'École, daara, poste de santé, mairie…',
  lieu: 'Marché, terrain, zone inondée…',
}
export const LIBELLES_SITUATION_PERSONNE: Record<SituationPersonne, string> = {
  eleve_etudiant: 'Élève / étudiant', apprenti: 'Apprenti', recherche_emploi: "En recherche d'emploi",
  independant: 'À son compte (artisan, commerçant)', salarie: 'Salarié', au_foyer: 'Au foyer',
  retraite: 'Retraité', sans_activite: 'Sans activité',
}
export const LIBELLES_VULNERABILITE: Record<Vulnerabilite, string> = {
  handicap: 'Handicap', maladie_chronique: 'Maladie chronique', veuvage: 'Veuf / veuve', orphelin: 'Orphelin',
  femme_chef_menage: 'Femme chef de ménage', personne_agee_isolee: 'Personne âgée isolée', sinistre: 'Sinistré',
}

/** Tranche d'âge déduite de la date de naissance (rien à saisir en plus). */
export function trancheAge(dateNaissance: string | null) {
  if (!dateNaissance) return null
  const age = Math.floor((Date.now() - new Date(`${dateNaissance}T00:00:00`).getTime()) / 31_557_600_000)
  const tranche = age < 15 ? 'Enfant' : age <= 35 ? 'Jeune' : age < 60 ? 'Adulte' : 'Senior'
  return { age, tranche }
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

export const SITUATIONS: { valeur: Situation; libelle: string; couleur: string; aide: string }[] = [
  { valeur: 'reussi', libelle: 'Réussi', couleur: '#0ca30c', aide: 'A une activité stable grâce à l\'action' },
  { valeur: 'en_progres', libelle: 'En progrès', couleur: '#fab219', aide: 'Démarre, apprend, cherche encore' },
  { valeur: 'en_difficulte', libelle: 'En difficulté', couleur: '#d03b3b', aide: 'N\'utilise pas ce qu\'il a reçu, a besoin d\'aide' },
  { valeur: 'perdu_de_vue', libelle: 'Perdu de vue', couleur: '#9ca3af', aide: 'Injoignable, a déménagé…' },
]
export const SITUATION = Object.fromEntries(SITUATIONS.map((s) => [s.valeur, s])) as Record<Situation, (typeof SITUATIONS)[number]>

export const echeance = (mois: number | null) => (mois == null ? 'Suivi libre' : mois === 12 ? 'Suivi à 1 an' : mois % 12 === 0 ? `Suivi à ${mois / 12} ans` : `Suivi à ${mois} mois`)

/** Lien WhatsApp vers un numéro sénégalais. */
export function lienWhatsApp(telephone: string, message: string) {
  let d = telephone.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 9) d = `221${d}`
  return `https://wa.me/${d}?text=${encodeURIComponent(message)}`
}
