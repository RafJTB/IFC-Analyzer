// Export du tableau « par type » en CSV lisible par Excel en français (point-virgule, virgule décimale).

const cellule = (v) => {
  const t = String(v ?? '');
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const decimal = (v, d) => (v == null || !Number.isFinite(v) ? '' : v.toFixed(d).replace('.', ','));
const STATUTS = { ext: 'Extérieur', int: 'Intérieur', mixte: 'Mixte' };

/**
 * @param {object} config  famille (familles.js)
 * @param {{ lignes: object[], total: object }} groupe  résultat de regrouper()
 * @returns {string} CSV avec BOM (Excel reconnaît l'UTF-8)
 */
export function versCsv(config, groupe) {
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
  const lignes = [['Type', ...cols.map(titre)].map(cellule).join(';')];
  for (const l of groupe.lignes) lignes.push([l.type, ...cols.map((c) => val(l, c))].map(cellule).join(';'));
  if (groupe.total) {
    lignes.push(['Total', ...cols.map((c) => (c.total || c.cle === 'nombre' ? val(groupe.total, c) : ''))].map(cellule).join(';'));
  }
  return `﻿${lignes.join('\r\n')}\r\n`;
}
