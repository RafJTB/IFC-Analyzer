// Noms et classement des éléments (fonctions pures, testées dans tests/unit/noms.test.js).

const VIDE = /^(inconnu|non spécifié|non specifie|n\/a|none|null|-)$/i;
const ID_FINAL = /[\s:_#-]*\[?\d{5,}\]?$/; // identifiant Revit ou numéro d'occurrence en fin de nom

/** Nettoie un libellé : espaces, valeurs vides, identifiant final. */
export function nettoyer(texte) {
  let t = String(texte ?? '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*-\s*(Inconnu|Non spécifié)$/i, '').trim();
  while (ID_FINAL.test(t) && t.replace(ID_FINAL, '').trim()) t = t.replace(ID_FINAL, '').trim();
  t = t.replace(/[\s:]+$/, '').trim();
  return VIDE.test(t) ? '' : t;
}

/**
 * Nom du type d'un élément, tel qu'un économiste l'attend (« Voile BA 20 cm »).
 * - Nom du type IFC (IfcWallType…) s'il existe ; Revit l'écrit parfois « Famille:Type » → on garde « Type ».
 * - Sinon le nom de l'occurrence : Revit l'écrit « Famille:Type:123456 » → « Type ».
 */
export function nomDeType(nomTypeIfc, nomOccurrence, repli = '') {
  const t = nettoyer(nomTypeIfc);
  if (t) return derniereSection(t);
  const o = String(nomOccurrence ?? '').trim();
  const parts = o.split(':').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return nettoyer(parts[parts.length - 2]) || nettoyer(parts[0]) || repli;
  if (parts.length === 2) return /^\d+$/.test(parts[1]) ? nettoyer(parts[0]) || repli : nettoyer(parts[1]) || repli;
  return nettoyer(o) || repli;
}

const derniereSection = (t) => {
  const parts = t.split(':').map((p) => p.trim()).filter(Boolean);
  return nettoyer(parts[parts.length - 1]) || t;
};

/** Minuscule, sans accents : pour comparer des noms de propriétés (« Épaisseur » = « epaisseur »). */
export function cle(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const RE_PLAFOND = /plaf|ceil|faux[- ]?plaf/;
const RE_SOL = /sol|carrel|parquet|moquette|resine|chape|lino|floor|dallage/;
const RE_BORD_DALLE = /bord(ure)? de dalle|rive de dalle|slab ?edge|nez de dalle/;
const RE_EP = /\bep\b|pluvi|descente|goutti|cheneau|naissance|rainwater/;

/**
 * Famille de métré d'un élément, ou null s'il n'entre dans aucune famille.
 * @param {string} classe  classe IFC (« IfcWall », « IfcCovering »…)
 * @param {string} predefini  PredefinedType (« FLOORING », « CEILING »…) ou ''
 * @param {string} texte  nom de l'occurrence + nom du type (pour les cas sans type prédéfini)
 */
export function familleDe(classe, predefini, texte) {
  const c = String(classe || '').toUpperCase();
  const p = String(predefini || '').toUpperCase();
  const t = cle(texte);
  if (RE_BORD_DALLE.test(t) && (c === 'IFCBUILDINGELEMENTPROXY' || c.startsWith('IFCSLAB') || c === 'IFCMEMBER')) return 'bords_dalle';
  if (c.startsWith('IFCWALL')) return 'murs';
  if (c.startsWith('IFCWINDOW') || c.startsWith('IFCDOOR')) return 'menuiseries';
  if (c.startsWith('IFCSLAB')) return 'dalles';
  if (c === 'IFCCOVERING') {
    if (p === 'CEILING') return 'plafonds';
    if (p === 'FLOORING') return 'revetements_sol';
    if (RE_PLAFOND.test(t)) return 'plafonds';
    if (RE_SOL.test(t)) return 'revetements_sol';
    return null; // bardage, couverture… : hors de ce métré
  }
  if (c.startsWith('IFCCOLUMN')) return 'poteaux';
  if (c.startsWith('IFCBEAM')) return 'poutres';
  if (c === 'IFCRAILING') return 'garde_corps';
  if ((c === 'IFCPIPESEGMENT' || c === 'IFCFLOWSEGMENT') && RE_EP.test(t)) return 'reseaux_ep';
  if (c === 'IFCSTAIRFLIGHT') return 'escaliers';
  return null;
}
