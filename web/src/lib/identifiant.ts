/**
 * Connexion par téléphone. Supabase identifie chaque compte par une adresse
 * email : un membre sans email reçoit une adresse interne tirée de son numéro
 * (221771234567@tel.ap2a.invalid). Le domaine « .invalid » est réservé
 * (RFC 2606) : aucun message ne peut jamais y être envoyé. Même règle dans la
 * fonction serveur (supabase/functions/rappels).
 */
export const DOMAINE_TELEPHONE = 'tel.ap2a.invalid'

/** Numéro international sans « + » (Sénégal par défaut). */
export function numeroIntl(t: string) {
  let d = t.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 9) d = `221${d}`
  return d
}

/** Ce que la personne tape (email ou numéro) -> identifiant du compte. */
export function identifiantVersEmail(saisie: string): string {
  const s = saisie.trim().toLowerCase()
  if (s.includes('@')) return s
  return `${numeroIntl(s)}@${DOMAINE_TELEPHONE}`
}

export const estUnTelephone = (saisie: string) => !saisie.includes('@') && saisie.replace(/\D/g, '').length >= 9

/** Compte ouvert par téléphone : le numéro, lisible (77 123 45 67) ; sinon l'email. */
export function identifiantLisible(email: string | null | undefined): string | null {
  if (!email) return null
  if (!email.endsWith(`@${DOMAINE_TELEPHONE}`)) return email
  const d = email.split('@')[0]
  const local = d.startsWith('221') && d.length === 12 ? d.slice(3) : `+${d}`
  return local.length === 9 ? local.replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4') : local
}
