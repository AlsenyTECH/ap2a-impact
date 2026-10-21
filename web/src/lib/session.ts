/**
 * Durée des sessions. Sans activité pendant INACTIVITE, ou au plus tard
 * DUREE_MAX après la connexion, on se déconnecte : un téléphone oublié ou
 * prêté ne reste pas ouvert sur les fiches des bénéficiaires.
 */
export const INACTIVITE_MS = 30 * 60 * 1000
export const DUREE_MAX_MS = 12 * 60 * 60 * 1000

const CLE_ACTIVITE = 'ap2a-derniere-activite'
const CLE_MOTIF = 'ap2a-motif-deconnexion'

const lire = (cle: string, stockage: Storage = localStorage) => { try { return stockage.getItem(cle) } catch { return null } }
const ecrire = (cle: string, v: string | null, stockage: Storage = localStorage) => {
  try { if (v === null) stockage.removeItem(cle); else stockage.setItem(cle, v) } catch { /* stockage indisponible */ }
}

/** Partagé entre les onglets : une activité dans l'un prolonge les autres. */
export const noterActivite = () => ecrire(CLE_ACTIVITE, String(Date.now()))
export const oublierActivite = () => ecrire(CLE_ACTIVITE, null)

/** Pourquoi la session doit se fermer, ou null si elle est encore valable. */
export function sessionExpiree(connecteLe: string | undefined): 'inactivite' | 'duree' | null {
  const maintenant = Date.now()
  const debut = connecteLe ? Date.parse(connecteLe) : NaN
  if (!isNaN(debut) && maintenant - debut > DUREE_MAX_MS) return 'duree'
  // Dernière activité, ou la connexion elle-même si elle est plus récente (heure du
  // serveur). Aucune trace (session ouverte avant cette règle) : on la ferme aussi.
  const derniere = Math.max(Number(lire(CLE_ACTIVITE)) || 0, isNaN(debut) ? 0 : debut)
  if (!derniere || maintenant - derniere > INACTIVITE_MS) return 'inactivite'
  return null
}

/** Motif affiché sur la page de connexion, jusqu'à la prochaine connexion. */
export const noterMotif = (m: 'inactivite' | 'duree') => ecrire(CLE_MOTIF, m, sessionStorage)
export const oublierMotif = () => ecrire(CLE_MOTIF, null, sessionStorage)
export function lireMotif() {
  const m = lire(CLE_MOTIF, sessionStorage)
  return m === 'inactivite'
    ? 'Vous avez été déconnecté(e) après 30 minutes sans activité. Reconnectez-vous pour continuer.'
    : m === 'duree' ? 'Par sécurité, une session dure 12 heures au plus. Reconnectez-vous pour continuer.' : null
}
