// Configuration des pages et familles de métré : ce qui est sommé, affiché en colonnes et en tuiles.
// (Aucune logique d'interface ici : la mise en forme est faite par js/ui/page-famille.js.)

/** Pages de la barre latérale. Une page peut regrouper plusieurs familles (onglets). */
export const PAGES = [
  { id: 'murs', titre: 'Murs', icone: 'mur', couleur: 'violet', familles: ['murs'], statut: true },
  { id: 'menuiseries', titre: 'Menuiseries', icone: 'fenetre', couleur: 'bleu', familles: ['menuiseries'], statut: true },
  { id: 'sols-plafonds', titre: 'Sols et plafonds', icone: 'couches', couleur: 'vert', familles: ['dalles', 'revetements_sol', 'plafonds'] },
  { id: 'structure', titre: 'Structure', icone: 'structure', couleur: 'ambre', familles: ['poteaux', 'poutres', 'bords_dalle'] },
  { id: 'garde-corps', titre: 'Garde-corps', icone: 'gc', couleur: 'rose', familles: ['garde_corps'] },
  { id: 'reseaux-ep', titre: 'Réseaux EP', icone: 'goutte', couleur: 'cyan', familles: ['reseaux_ep'] },
  { id: 'escaliers', titre: 'Escaliers', icone: 'escalier', couleur: 'rouge', familles: ['escaliers'] },
];

// Colonnes : genre « statut », « niveaux », « texte » ou nombre (unite, decimales, total : somme en pied de tableau)
const C = {
  statut: { cle: 'statut', titre: 'Statut', genre: 'statut' },
  niveaux: { cle: 'niveaux', titre: 'Niveaux', genre: 'niveaux' },
  nombre: { cle: 'nombre', titre: 'Nb', unite: 'U', decimales: 0, total: true },
};
const num = (cle, titre, unite, decimales = 2, extra = {}) => ({ cle, titre, unite, decimales, total: true, ...extra });

export const FAMILLES = {
  murs: {
    id: 'murs', libellePrincipal: 'surface nette', libelle: 'Murs', singulier: 'mur', pluriel: 'murs', principal: 'nette', unitePrincipale: 'm²',
    sommes: ['longueur', 'brute', 'baies', 'nette', 'volume', 'fenetres', 'portes', 'reservations'], moyennes: ['epaisseur', 'hauteur'],
    colonnes: [C.statut, C.niveaux, C.nombre, num('brute', 'Brute', 'm²', 2, { barre: false }), num('nette', 'Nette', 'm²', 2, { barre: true }),
      num('longueur', 'Longueur', 'ml'), num('volume', 'Volume', 'm³')],
    tuiles: [
      { cle: 'brute', unite: 'm²', libelle: 'Surface brute', sous: () => 'une face, baies comprises', icone: 'surface', couleur: 'violet', couleur2: 'bleu' },
      { cle: 'nette', unite: 'm²', libelle: 'Surface nette', sous: (t, f) => `− ${f(t.baies)} m² de baies`, icone: 'fenetre', couleur: 'bleu', couleur2: 'cyan' },
      { cle: 'longueur', unite: 'ml', libelle: 'Longueur', sous: () => 'axe des murs', icone: 'regle', couleur: 'vert', couleur2: 'cyan' },
      { cle: 'volume', unite: 'm³', libelle: 'Volume', sous: () => 'net, baies déduites', icone: 'cube', couleur: 'ambre', couleur2: 'rouge' },
    ],
  },
  menuiseries: {
    id: 'menuiseries', libellePrincipal: 'nombre', libelle: 'Menuiseries', singulier: 'menuiserie', pluriel: 'menuiseries', principal: 'nombre', unitePrincipale: 'U',
    sommes: ['nombre', 'surface'], moyennes: ['largeur', 'hauteur'],
    colonnes: [{ cle: 'genre', titre: 'Famille', genre: 'texte' }, C.statut, C.niveaux, { ...C.nombre, barre: true },
      num('largeur', 'Largeur', 'm', 2, { total: false }), num('hauteur', 'Hauteur', 'm', 2, { total: false }), num('surface', 'Surface', 'm²')],
    tuiles: [
      { cle: 'nombre', unite: 'U', decimales: 0, libelle: 'Menuiseries', sous: (t) => `${t.fenetres ?? 0} fenêtres · ${t.portes ?? 0} portes`, icone: 'fenetre', couleur: 'bleu', couleur2: 'violet' },
      { cle: 'surface', unite: 'm²', libelle: 'Surface totale', sous: () => 'tableau, toutes menuiseries', icone: 'surface', couleur: 'violet', couleur2: 'rose' },
      { cle: 'surfaceExt', unite: 'm²', libelle: 'Surface extérieure', sous: () => 'menuiseries de façade', icone: 'soleil', couleur: 'cyan', couleur2: 'bleu' },
      { cle: 'vitrage', unite: '%', decimales: 1, libelle: 'Façade vitrée', sous: () => 'baies ext. / façades, hors doublages', icone: 'facade', couleur: 'vert', couleur2: 'cyan' },
    ],
  },
  dalles: {
    id: 'dalles', libellePrincipal: 'surface', libelle: 'Dalles', onglet: 'Dalles', singulier: 'dalle', pluriel: 'dalles', principal: 'surface', unitePrincipale: 'm²',
    sommes: ['surface', 'perimetre', 'volume'], moyennes: ['epaisseur'],
    colonnes: [{ cle: 'genre', titre: 'Usage', genre: 'texte' }, C.niveaux, C.nombre, num('surface', 'Surface', 'm²', 2, { barre: true }),
      num('perimetre', 'Périmètre', 'ml'), num('epaisseur', 'Épaisseur', 'cm', 0, { total: false, facteur: 100 }), num('volume', 'Volume', 'm³')],
    tuiles: [
      { cle: 'surface', unite: 'm²', libelle: 'Surface', sous: () => 'nette, trémies déduites', icone: 'couches', couleur: 'vert', couleur2: 'cyan' },
      { cle: 'perimetre', unite: 'ml', libelle: 'Périmètre', sous: () => 'rives de dalle', icone: 'regle', couleur: 'bleu', couleur2: 'violet' },
      { cle: 'volume', unite: 'm³', libelle: 'Volume', sous: () => 'béton', icone: 'cube', couleur: 'ambre', couleur2: 'rouge' },
      { cle: 'nombre', unite: 'U', decimales: 0, libelle: 'Dalles', sous: (t, f, n) => `${n} type${n > 1 ? 's' : ''}`, icone: 'liste', couleur: 'violet', couleur2: 'rose' },
    ],
  },
  revetements_sol: {
    id: 'revetements_sol', libellePrincipal: 'surface', libelle: 'Revêtements de sol', onglet: 'Revêtements', singulier: 'revêtement', pluriel: 'revêtements', principal: 'surface', unitePrincipale: 'm²',
    sommes: ['surface', 'perimetre'],
    colonnes: [C.niveaux, C.nombre, num('surface', 'Surface', 'm²', 2, { barre: true }), num('perimetre', 'Périmètre', 'ml')],
    tuiles: [
      { cle: 'surface', unite: 'm²', libelle: 'Surface', sous: () => 'revêtements posés', icone: 'couches', couleur: 'vert', couleur2: 'cyan' },
      { cle: 'perimetre', unite: 'ml', libelle: 'Périmètre', sous: () => 'plinthes, à vérifier', icone: 'regle', couleur: 'bleu', couleur2: 'violet' },
      { cle: 'nombre', unite: 'U', decimales: 0, libelle: 'Zones', sous: (t, f, n) => `${n} type${n > 1 ? 's' : ''}`, icone: 'liste', couleur: 'violet', couleur2: 'rose' },
    ],
  },
  plafonds: {
    id: 'plafonds', libellePrincipal: 'surface', libelle: 'Plafonds', onglet: 'Plafonds', singulier: 'plafond', pluriel: 'plafonds', principal: 'surface', unitePrincipale: 'm²',
    sommes: ['surface', 'perimetre'],
    colonnes: [C.niveaux, C.nombre, num('surface', 'Surface', 'm²', 2, { barre: true }), num('perimetre', 'Périmètre', 'ml')],
    tuiles: [
      { cle: 'surface', unite: 'm²', libelle: 'Surface', sous: () => 'plafonds et faux plafonds', icone: 'couches', couleur: 'vert', couleur2: 'cyan' },
      { cle: 'perimetre', unite: 'ml', libelle: 'Périmètre', sous: () => 'joints et cornières', icone: 'regle', couleur: 'bleu', couleur2: 'violet' },
      { cle: 'nombre', unite: 'U', decimales: 0, libelle: 'Zones', sous: (t, f, n) => `${n} type${n > 1 ? 's' : ''}`, icone: 'liste', couleur: 'violet', couleur2: 'rose' },
    ],
  },
  poteaux: {
    id: 'poteaux', libellePrincipal: 'nombre', libelle: 'Poteaux', onglet: 'Poteaux', singulier: 'poteau', pluriel: 'poteaux', principal: 'nombre', unitePrincipale: 'U',
    sommes: ['nombre', 'hauteur', 'volume'],
    colonnes: [C.niveaux, { ...C.nombre, barre: true }, num('hauteur', 'Hauteur cumulée', 'ml'), num('volume', 'Volume', 'm³')],
    tuiles: [
      { cle: 'nombre', unite: 'U', decimales: 0, libelle: 'Poteaux', sous: (t, f, n) => `${n} type${n > 1 ? 's' : ''}`, icone: 'structure', couleur: 'ambre', couleur2: 'rouge' },
      { cle: 'hauteur', unite: 'ml', libelle: 'Hauteur cumulée', sous: () => 'somme des hauteurs', icone: 'regle', couleur: 'bleu', couleur2: 'violet' },
      { cle: 'volume', unite: 'm³', libelle: 'Volume', sous: () => 'béton', icone: 'cube', couleur: 'violet', couleur2: 'rose' },
    ],
  },
  poutres: {
    id: 'poutres', libellePrincipal: 'longueur', libelle: 'Poutres', onglet: 'Poutres', singulier: 'poutre', pluriel: 'poutres', principal: 'longueur', unitePrincipale: 'ml',
    sommes: ['longueur', 'volume'],
    colonnes: [C.niveaux, C.nombre, num('longueur', 'Longueur', 'ml', 2, { barre: true }), num('volume', 'Volume', 'm³')],
    tuiles: [
      { cle: 'longueur', unite: 'ml', libelle: 'Longueur', sous: () => 'toutes poutres', icone: 'regle', couleur: 'ambre', couleur2: 'rouge' },
      { cle: 'volume', unite: 'm³', libelle: 'Volume', sous: () => 'béton', icone: 'cube', couleur: 'violet', couleur2: 'rose' },
      { cle: 'nombre', unite: 'U', decimales: 0, libelle: 'Poutres', sous: (t, f, n) => `${n} type${n > 1 ? 's' : ''}`, icone: 'structure', couleur: 'bleu', couleur2: 'cyan' },
    ],
  },
  bords_dalle: {
    id: 'bords_dalle', libellePrincipal: 'longueur', libelle: 'Bords de dalle', onglet: 'Bords de dalle', singulier: 'bord de dalle', pluriel: 'bords de dalle', principal: 'longueur', unitePrincipale: 'ml',
    sommes: ['longueur'],
    colonnes: [C.niveaux, C.nombre, num('longueur', 'Longueur', 'ml', 2, { barre: true })],
    tuiles: [
      { cle: 'longueur', unite: 'ml', libelle: 'Longueur', sous: () => 'rives et nez de dalle', icone: 'regle', couleur: 'ambre', couleur2: 'rouge' },
      { cle: 'nombre', unite: 'U', decimales: 0, libelle: 'Éléments', sous: (t, f, n) => `${n} type${n > 1 ? 's' : ''}`, icone: 'liste', couleur: 'bleu', couleur2: 'cyan' },
    ],
  },
  garde_corps: {
    id: 'garde_corps', libellePrincipal: 'longueur', libelle: 'Garde-corps', singulier: 'garde-corps', pluriel: 'garde-corps', principal: 'longueur', unitePrincipale: 'ml',
    sommes: ['longueur'],
    colonnes: [C.niveaux, C.nombre, num('longueur', 'Longueur', 'ml', 2, { barre: true })],
    tuiles: [
      { cle: 'longueur', unite: 'ml', libelle: 'Longueur', sous: () => 'tous garde-corps', icone: 'regle', couleur: 'rose', couleur2: 'violet' },
      { cle: 'nombre', unite: 'U', decimales: 0, libelle: 'Garde-corps', sous: (t, f, n) => `${n} type${n > 1 ? 's' : ''}`, icone: 'gc', couleur: 'bleu', couleur2: 'cyan' },
    ],
  },
  reseaux_ep: {
    id: 'reseaux_ep', libellePrincipal: 'longueur', libelle: 'Réseaux EP', singulier: 'canalisation', pluriel: 'canalisations', principal: 'longueur', unitePrincipale: 'ml',
    sommes: ['longueur'],
    colonnes: [{ cle: 'diametres', titre: 'Diamètre', genre: 'diametres' }, C.niveaux, C.nombre, num('longueur', 'Longueur', 'ml', 2, { barre: true })],
    tuiles: [
      { cle: 'longueur', unite: 'ml', libelle: 'Longueur', sous: () => 'descentes et collecteurs', icone: 'goutte', couleur: 'cyan', couleur2: 'bleu' },
      { cle: 'nombre', unite: 'U', decimales: 0, libelle: 'Tronçons', sous: (t, f, n) => `${n} type${n > 1 ? 's' : ''}`, icone: 'liste', couleur: 'violet', couleur2: 'rose' },
    ],
  },
  escaliers: {
    id: 'escaliers', libellePrincipal: 'volées', libelle: 'Escaliers', singulier: 'volée', pluriel: 'volées', principal: 'nombre', unitePrincipale: 'U',
    sommes: ['nombre', 'contremarches', 'marches', 'hauteur'],
    colonnes: [C.niveaux, { ...C.nombre, titre: 'Volées', barre: true }, num('contremarches', 'Contremarches', 'U', 0), num('marches', 'Marches', 'U', 0), num('hauteur', 'Hauteur', 'm')],
    tuiles: [
      { cle: 'nombre', unite: 'U', decimales: 0, libelle: 'Volées', sous: (t, f, n) => `${n} type${n > 1 ? 's' : ''}`, icone: 'escalier', couleur: 'rouge', couleur2: 'ambre' },
      { cle: 'contremarches', unite: 'U', decimales: 0, libelle: 'Contremarches', sous: () => 'toutes volées', icone: 'liste', couleur: 'violet', couleur2: 'rose' },
      { cle: 'marches', unite: 'U', decimales: 0, libelle: 'Marches', sous: () => 'girons', icone: 'liste', couleur: 'bleu', couleur2: 'cyan' },
    ],
  },
};

/** Page qui contient une famille. */
export const pageDeFamille = (famille) => PAGES.find((p) => p.familles.includes(famille));
