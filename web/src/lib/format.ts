import type { NatureApport, Role, Situation, StatutAction, StatutBeneficiaire, TypeCible } from './types'

export const LIBELLES_ROLE: Record<Role, string> = {
  admin: 'Administrateur', bureau: 'Bureau', coordinateur: 'Coordinateur', membre: 'Membre',
}
export const LIBELLES_TYPE_CIBLE: Record<TypeCible, string> = {
  personne: 'Personne', menage: 'Ménage', collectif: 'Groupe / association', structure: 'Établissement', lieu: 'Lieu / zone',
}
/** Ce que chaque nature permet d'enregistrer (page Catégories). */
export const AIDE_TYPE_CIBLE: Record<TypeCible, string> = {
  personne: 'Un individu : situation, métier, vulnérabilités',
  menage: 'Une famille : son chef, sa taille, ses membres si besoin',
  collectif: 'Un groupe dont on enregistre les membres',
  structure: 'Un établissement (on peut y rattacher des personnes)',
  lieu: 'Un endroit : marché, terrain, zone inondée…',
}
/** Rôles proposés dans un ménage. */
export const ROLES_MENAGE = ['Chef de ménage', 'Conjoint(e)', 'Enfant', 'Parent', 'Autre membre']

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
