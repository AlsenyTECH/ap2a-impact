import type { StatutConsultation, TypeAcces } from './types'

export const TYPES_ACCES: Record<TypeAcces, { libelle: string; aide: string }> = {
  formateur: { libelle: 'Formateur', aide: 'Voit les participants de ses formations, fait l\'appel (ou scanne les cartes) et délivre les certificats.' },
  soignant: { libelle: 'Médecin / soignant', aide: 'Voit les patients de ses actions de santé et saisit les consultations. Ses notes médicales restent confidentielles.' },
  bailleur: { libelle: 'Bailleur / donateur', aide: 'Voit uniquement les rapports chiffrés et anonymes des actions qu\'il soutient.' },
}

export const STATUTS_CONSULTATION: Record<StatutConsultation, { libelle: string; couleur: string; fond: string }> = {
  vu: { libelle: 'Vu en consultation', couleur: '#0b5cad', fond: '#e3eefb' },
  rien_a_signaler: { libelle: 'Rien à signaler', couleur: '#0b6b0b', fond: '#e2f4e2' },
  traite: { libelle: 'Traité sur place', couleur: '#0b6b0b', fond: '#e2f4e2' },
  oriente: { libelle: 'Orienté vers un spécialiste', couleur: '#8a5a00', fond: '#fdf0d5' },
  a_revoir: { libelle: 'À revoir', couleur: '#a32b2b', fond: '#fbe6e6' },
}

/** Message d'invitation à envoyer au partenaire (WhatsApp ou email). */
export const messageInvitation = (prenom: string | null, email: string, organisation: string) =>
  `Bonjour${prenom ? ` ${prenom}` : ''}, l'association AP2A vous donne accès à son application pour ${organisation}.

` +
  `Vous allez recevoir à l'adresse ${email} un email « AP2A — Votre accès partenaire » (regardez aussi dans les indésirables).
` +
  `Ouvrez le lien qu'il contient pour choisir votre mot de passe : il est personnel, ne sert qu'une fois et expire au bout de 24 heures.

Merci pour votre engagement à nos côtés.`

/** Message d'invitation d'un membre à créer son accès. */
export const messageInvitationMembre = (prenom: string | null, email: string) =>
  `Bonjour${prenom ? ` ${prenom}` : ''}, vous pouvez maintenant utiliser l'application de l'AP2A (actions, suivis, événements, votre carte de membre).

` +
  `Vous allez recevoir à l'adresse ${email} un email « AP2A — Votre accès à l'application » (regardez aussi dans les indésirables).
` +
  `Ouvrez le lien qu'il contient pour choisir votre mot de passe : il est personnel, ne sert qu'une fois et expire au bout de 24 heures.`
