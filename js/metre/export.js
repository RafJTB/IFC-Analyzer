// Export du tableau « par type » en CSV lisible par Excel.
// Format « fr » (par défaut) : point-virgule et virgule décimale ; « en » (Excel en anglais, Google Sheets) : virgule et point décimal.

const FORMATS = { fr: { sep: ';', virgule: ',' }, en: { sep: ',', virgule: '.' } };
const STATUTS = { ext: 'Extérieur', int: 'Intérieur', mixte: 'Mixte' };

/**
 * @param {object} config  famille (familles.js)
 * @param {{ lignes: object[], total: object }} groupe  résultat de regrouper()
 * @param {'fr'|'en'} format
 * @returns {string} CSV avec BOM (Excel reconnaît l'UTF-8)
 */
export function versCsv(config, groupe, format = 'fr') {
  const { sep, virgule } = FORMATS[format] ?? FORMATS.fr;
  // Guillemets seulement si la cellule contient le séparateur, un guillemet ou un retour à la ligne
  const cellule = (v) => {
    const t = String(v ?? '');
    return t.includes(sep) || /["\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const decimal = (v, d) => (v == null || !Number.isFinite(v) ? '' : v.toFixed(d).replace('.', virgule));
  const cols = config.colonnes;
  const titre = (c) => (c.unite ? `${c.titre} (${c.unite})` : c.titre);
  const val = (l, c) => {
    if (c.genre === 'statut') return STATUTS[l.statut] ?? '';
    if (c.genre === 'niveaux') return (l.niveaux ?? []).join(', ');
    if (c.genre === 'texte') return l[c.cle] ?? '';
    if (c.genre === 'diametres') return (l.diametres ?? []).map((d) => `Ø${d}`).join(', ');
    const v = c.cle === 'nombre' ? l.nombre : l.sommes?.[c.cle];
    return decimal(v == null ? null : v * (c.facteur ?? 1), c.decimales ?? 2);
  };
  const lignes = [['Type', ...cols.map(titre)].map(cellule).join(sep)];
  for (const l of groupe.lignes) lignes.push([l.type, ...cols.map((c) => val(l, c))].map(cellule).join(sep));
  if (groupe.total) {
    lignes.push(['Total', ...cols.map((c) => (c.total || c.cle === 'nombre' ? val(groupe.total, c) : ''))].map(cellule).join(sep));
  }
  return `﻿${lignes.join('\r\n')}\r\n`;
}
