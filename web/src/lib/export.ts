/**
 * Export Excel (.xlsx). La bibliothèque n'est chargée qu'au premier export,
 * pour ne pas alourdir l'application au téléphone.
 */
export interface Colonne<T> {
  titre: string
  valeur: (ligne: T) => string | number | null | undefined
  largeur?: number
  /** Format Excel des nombres, ex. '#,##0' pour les FCFA. */
  format?: string
}

export async function exporterExcel<T>(nomFichier: string, lignes: T[], colonnes: Colonne<T>[], feuille = 'Données') {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const columns = colonnes.map((c) => ({
    header: { value: c.titre, fontWeight: 'bold' as const, backgroundColor: '#E3F3EC' },
    cell: (ligne: T) => {
      const v = c.valeur(ligne)
      return v == null || v === '' ? { value: null } : typeof v === 'number' ? { value: v, type: Number, format: c.format } : { value: String(v) }
    },
    width: c.largeur ?? Math.min(40, Math.max(12, c.titre.length + 4)),
  }))
  await writeExcelFile(lignes, { columns: columns as any, sheet: feuille, stickyRowsCount: 1 }).toFile(`${nomFichier}.xlsx`)
}

/** Nom de fichier sûr : « Formation électricité » -> « formation-electricite ». */
export const nomDeFichier = (texte: string) =>
  texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
