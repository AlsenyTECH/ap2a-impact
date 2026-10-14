import { useQuery } from '@tanstack/react-query'
import { supabase, verifier } from './supabase'

/** Réglages des rappels automatiques (une seule fiche, modifiable par l'administrateur). */
export interface ReglagesRappels {
  hebdo_actif: boolean
  hebdo_jour: number
  hebdo_heure: string
  fenetre_jours: number
  seuil_retard: number
  seances_actif: boolean
  seances_veille: boolean
  seances_heure: string
  cibles_actif: boolean
  cibles_seances: boolean
  cibles_evenements: boolean
  cibles_remises: boolean
  cibles_suivis: boolean
  suivi_jours_avant: number
  sms_actif: boolean
  sms_heure: string
  sms_expediteur: string
  modifie_le: string
  modifie_par: string | null
}

export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
/** « 07:45:00 » → « 7h45 ». */
export const heureCourte = (h: string) => `${Number(h.slice(0, 2))}h${h.slice(3, 5)}`
/** Heures proposées : de 5h à 21h45, au quart d'heure (la tâche passe tous les quarts d'heure). */
export const HEURES = Array.from({ length: (22 - 5) * 4 }, (_, i) => {
  const m = 5 * 60 + i * 15
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
})

export const useReglagesRappels = () => useQuery({
  queryKey: ['reglages-rappels'],
  staleTime: 60 * 1000,
  queryFn: async () => verifier(await supabase.from('reglages_rappels').select('*').single()) as ReglagesRappels,
})

/** Un rappel à envoyer à un bénéficiaire (veille d'une séance, d'un événement, avant un suivi). */
export interface RappelCible {
  cible_id: string
  nom: string
  telephone: string
  telephone_intl: string
  canal: 'whatsapp' | 'sms'
  objet: 'seance' | 'evenement' | 'suivi'
  genre: 'seance' | 'evenement' | 'remise' | 'suivi'
  objet_id: string
  action_id: string | null
  evenement_id: string | null
  titre: string
  quand: string
  heure: string | null
  lieu: string | null
  message: string
  sms: string
  envoye_le: string | null
  envoye_canal: 'whatsapp' | 'sms' | null
  /** Un SMS automatique partira encore aujourd'hui : pas besoin de l'envoyer à la main. */
  sms_auto: boolean
  /** Dernier échec d'envoi automatique (crédits épuisés, numéro invalide…). */
  erreur: string | null
}

export const useRappelsCibles = (actif = true) => useQuery({
  queryKey: ['rappels-cibles'],
  enabled: actif,
  queryFn: async () => verifier(await supabase.rpc('rappels_cibles_a_envoyer')) as RappelCible[],
})

/** Lien WhatsApp vers un numéro international (sans « + »). */
export const lienWhatsAppIntl = (numero: string, message: string) => `https://wa.me/${numero}?text=${encodeURIComponent(message)}`

/** Message pour le groupe WhatsApp d'une formation ou d'un événement : sans nom ni numéro. */
export function messageGroupe(r: RappelCible) {
  const heure = r.heure ? ` à ${heureCourte(r.heure)}` : ''
  const lieu = r.lieu ? `, ${r.lieu}` : ''
  const jour = new Date(`${r.quand}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  if (r.genre === 'seance') return `Bonjour à toutes et à tous, c'est l'AP2A. Rappel : demain ${jour}${heure}, séance de formation « ${r.titre} »${lieu}. Merci d'être à l'heure !`
  if (r.genre === 'remise') return `Bonjour à toutes et à tous, c'est l'AP2A. La remise des kits et attestations a lieu demain ${jour}${heure}${lieu} (« ${r.titre} »). Merci d'être présents !`
  return `Bonjour à toutes et à tous, c'est l'AP2A. Vous êtes invités demain ${jour}${heure} : « ${r.titre} »${lieu}. Nous comptons sur votre présence !`
}
