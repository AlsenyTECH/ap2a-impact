/** Minuscules, sans accents : « Ménage Ndèye » -> « menage ndeye ». */
export const normaliser = (texte: string | null | undefined) =>
  (texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Vrai si chaque mot recherché apparaît dans l'un des textes. */
export function correspond(terme: string, ...textes: (string | null | undefined)[]) {
  const mots = normaliser(terme).split(/\s+/).filter(Boolean)
  if (!mots.length) return true
  const cible = normaliser(textes.filter(Boolean).join(' '))
  const chiffres = cible.replace(/\D/g, '')
  return mots.every((m) => cible.includes(m) || (/^\d{3,}$/.test(m) && chiffres.includes(m)))
}

type Cle<T> = (x: T) => string | number | null | undefined

/** Tri stable ; les valeurs vides vont toujours à la fin. */
export function trier<T>(liste: T[], cle: Cle<T>, sens: 'asc' | 'desc' = 'asc') {
  const facteur = sens === 'asc' ? 1 : -1
  return [...liste].sort((a, b) => {
    const x = cle(a), y = cle(b)
    if (x == null || x === '') return y == null || y === '' ? 0 : 1
    if (y == null || y === '') return -1
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fr', { numeric: true, sensitivity: 'base' })) * facteur
  })
}

/** Libellé d'un membre avec son numéro, pour lever les homonymies. */
export const membreAvecNumero = (m: { prenom: string; nom: string; numero_adherent?: string | null } | null | undefined) =>
  m ? `${m.prenom} ${m.nom}${m.numero_adherent ? ` · ${m.numero_adherent}` : ''}` : '—'
