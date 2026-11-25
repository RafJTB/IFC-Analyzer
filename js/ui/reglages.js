// Paramètres de l'appli, gardés dans ce navigateur (localStorage). Tout est protégé : sans stockage, les réglages d'origine.

const CLE = 'ifc-analyzer.reglages';

export const DEFAUTS = {
  prepa3d: true, //      après le métré, la géométrie 3D est calculée et gardée
  session: true, //      les fichiers ouverts reviennent à la visite suivante
  csv: 'fr', //          fr : point-virgule et virgule décimale (Excel en français) ; en : virgule et point décimal
  animations: true, //   fondus des pages, verre liquide des onglets
};

export function lireReglages() {
  let r = {};
  try { r = JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch { r = {}; }
  return { ...DEFAUTS, ...r };
}

export function changerReglage(cle, valeur) {
  const r = { ...lireReglages(), [cle]: valeur };
  try { localStorage.setItem(CLE, JSON.stringify(r)); } catch { /* stockage refusé : le réglage vaut pour cette visite */ }
  appliquerReglages(r);
  return r;
}

/** Ce qui se voit tout de suite : les animations (js/boot.js fait de même avant l'affichage). */
export function appliquerReglages(r = lireReglages()) {
  document.documentElement.dataset.anim = r.animations ? 'on' : 'off';
}

// Catégorie affichée dans la page Paramètres (retrouvée à la visite suivante)
const CLE_ONGLET = 'ifc-analyzer.reglages.onglet';
export function ongletReglages(defaut) {
  try { return localStorage.getItem(CLE_ONGLET) || defaut; } catch { return defaut; }
}
export function memoriserOnglet(onglet) {
  try { localStorage.setItem(CLE_ONGLET, onglet); } catch { /* ignore */ }
}
