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

/**
 * Modèle d'import à remplir : feuille « Liste » avec les en-têtes déjà posés,
 * et feuille « Aide ». Pas de ligne d'exemple, qui risquerait d'être importée.
 */
export async function telechargerModele(nomFichier: string, colonnes: [titre: string, aide: string, largeur: number][]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const entete = { fontWeight: 'bold' as const, backgroundColor: '#E3F3EC' }
  await writeExcelFile([
    {
      sheet: 'Liste',
      data: [colonnes.map(([titre]) => ({ value: titre, ...entete }))],
      columns: colonnes.map(([, , largeur]) => ({ width: largeur })),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Aide',
      data: [
        [{ value: 'Colonne', ...entete }, { value: 'Que mettre', ...entete }],
        ...colonnes.map(([titre, aide]) => [{ value: titre, fontWeight: 'bold' as const }, { value: aide }]),
        [null],
        [{ value: 'Une ligne par personne, à partir de la ligne 2 de la feuille « Liste ». Ne modifiez pas les en-têtes. Enregistrez en .xlsx.', columnSpan: 2 }],
      ],
      columns: [{ width: 20 }, { width: 80 }],
    },
  ]).toFile(`${nomFichier}.xlsx`)
}

/** Nom de fichier sûr : « Formation électricité » -> « formation-electricite ». */
export const nomDeFichier = (texte: string) =>
  texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
