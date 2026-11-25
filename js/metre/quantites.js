// Règles de métré et regroupement par type (fonctions pures, testées dans tests/unit/quantites.test.js).
// Entrée : éléments bruts de extraireModele(). Sortie : quantités en m, m², m³, et lignes « par type ».

import { cle } from '../ifc/noms.js';

const premier = (...v) => v.find((x) => x != null && Number.isFinite(x) && x !== 0) ?? null;
const somme = (a) => a.reduce((s, x) => s + (x ?? 0), 0);

const USAGES_DALLE = { FLOOR: 'Plancher', BASESLAB: 'Dallage', ROOF: 'Toiture', LANDING: 'Palier' };

/**
 * Quantités de métré d'un élément.
 * Ordre de priorité : quantités de base du fichier (BaseQuantities), puis propriétés (Revit « Cotes »…),
 * puis calcul (ex. surface nette = brute − baies réellement reliées au mur).
 * @returns {{ m: object, source: 'fichier'|'proprietes'|'calcul'|'absent' }}
 */
export function metreElement(el, index) {
  const q = el.q ?? {};
  const p = el.p ?? {};
  const a = el.a ?? {};
  const m = {};
  let source = 'fichier';
  const depuis = (valQ, valP) => {
    if (valQ != null && valQ !== 0) return valQ;
    if (valP != null && valP !== 0) { source = source === 'fichier' ? 'proprietes' : source; return valP; }
    return null;
  };

  switch (el.famille) {
    case 'murs': {
      m.longueur = depuis(q.Length, p.longueur);
      m.epaisseur = premier(q.Width, p.epaisseur);
      m.hauteur = premier(q.Height, p.hauteur);
      m.brute = depuis(q.GrossSideArea, p.surface) ?? (m.longueur && m.hauteur ? (source = 'calcul', m.longueur * m.hauteur) : null);
      // Baies : surface de chaque réservation, sinon celle de la menuiserie qui la remplit
      let fenetres = 0;
      let portes = 0;
      const trous = (el.ouvertures ?? []).map((o) => {
        const men = o.menuiserie != null ? index?.get(o.menuiserie) : null;
        if (men) /DOOR/i.test(men.classe) ? portes++ : fenetres++;
        if (o.aire) return o.aire;
        return men ? surfaceMenuiserie(men) : 0;
      });
      m.baies = somme(trous);
      m.fenetres = fenetres;
      m.portes = portes;
      m.reservations = trous.length - fenetres - portes; // trous sans menuiserie (ex. doublage devant une fenêtre)
      if (q.NetSideArea != null) m.nette = q.NetSideArea;
      else if (m.brute != null) { m.nette = Math.max(m.brute - m.baies, 0); if (m.baies) source = 'calcul'; }
      m.volume = premier(q.NetVolume, q.GrossVolume, p.volume) ?? (m.nette && m.epaisseur ? m.nette * m.epaisseur : null);
      if (m.brute == null) source = 'absent';
      break;
    }
    case 'menuiseries': {
      m.nombre = 1;
      m.genre = /DOOR/i.test(el.classe) ? 'Porte' : 'Fenêtre';
      m.largeur = premier(q.Width, a.largeur, p.epaisseur);
      m.hauteur = premier(q.Height, a.hauteur, p.hauteur);
      m.surface = surfaceMenuiserie(el);
      if (q.Area == null) source = m.surface ? (q.Width != null ? 'calcul' : 'proprietes') : 'absent';
      break;
    }
    case 'dalles': {
      m.usage = USAGES_DALLE[el.predefini] ?? '';
      m.surface = depuis(premier(q.NetArea, q.GrossArea), p.surface);
      m.perimetre = premier(q.Perimeter);
      m.epaisseur = premier(q.Width, q.Depth, p.epaisseur);
      m.volume = premier(q.NetVolume, q.GrossVolume, p.volume) ?? (m.surface && m.epaisseur ? m.surface * m.epaisseur : null);
      if (m.surface == null) source = 'absent';
      break;
    }
    case 'revetements_sol':
    case 'plafonds': {
      m.surface = depuis(premier(q.NetArea, q.GrossArea, q.Area), p.surface);
      m.perimetre = premier(q.Perimeter);
      if (m.surface == null) source = 'absent';
      break;
    }
    case 'poteaux': {
      m.nombre = 1;
      m.hauteur = depuis(premier(q.Length, q.Height), premier(p.longueur, p.hauteur));
      m.volume = premier(q.NetVolume, q.GrossVolume, p.volume);
      if (m.hauteur == null && m.volume == null) source = 'absent';
      break;
    }
    case 'poutres': {
      m.longueur = depuis(q.Length, p.longueur);
      m.volume = premier(q.NetVolume, q.GrossVolume, p.volume);
      if (m.longueur == null) source = 'absent';
      break;
    }
    case 'bords_dalle':
    case 'garde_corps': {
      m.longueur = depuis(q.Length, p.longueur);
      if (m.longueur == null) source = 'absent';
      break;
    }
    case 'reseaux_ep': {
      m.longueur = depuis(q.Length, p.longueur);
      m.diametre = premier(p.diametre, q.NominalDiameter);
      if (m.longueur == null) source = 'absent';
      break;
    }
    case 'escaliers': {
      m.nombre = 1;
      m.contremarches = a.contremarches ?? null;
      m.marches = a.marches ?? null;
      m.hauteur = m.contremarches && a.hauteurContremarche ? m.contremarches * a.hauteurContremarche : null;
      if (m.contremarches == null) source = 'absent';
      break;
    }
    default:
      source = 'absent';
  }
  return { m, source };
}

/** Surface d'une menuiserie : quantité Area, sinon largeur × hauteur. */
export function surfaceMenuiserie(el) {
  const q = el.q ?? {};
  const a = el.a ?? {};
  if (q.Area) return q.Area;
  const l = premier(q.Width, a.largeur);
  const h = premier(q.Height, a.hauteur);
  return l && h ? l * h : 0;
}

/** Ajoute à chaque élément son métré (m, source) et renvoie le modèle enrichi. */
export function preparerModele(modele) {
  const index = new Map(modele.elements.map((e) => [e.id, e]));
  for (const e of modele.elements) Object.assign(e, metreElement(e, index));
  return modele;
}

/** Statut d'un ensemble d'éléments : 'ext', 'int', 'mixte' ou null si inconnu. */
function statutDe(els) {
  const ext = els.filter((e) => e.exterieur === true).length;
  const int = els.filter((e) => e.exterieur === false).length;
  if (!ext && !int) return null;
  if (ext && int) return 'mixte';
  return ext ? 'ext' : 'int';
}

/**
 * Filtre puis regroupe les éléments d'une famille par type.
 * @param {object[]} elements  éléments préparés (preparerModele)
 * @param {object} config      configuration de la famille (familles.js) : champs sommés et moyennés
 * @param {{ niveaux?: string[], statut?: 'tous'|'ext'|'int', texte?: string, ordreNiveaux?: string[] }} filtres
 */
export function regrouper(elements, config, filtres = {}) {
  const { niveaux = [], statut = 'tous', texte = '', ordreNiveaux = [] } = filtres;
  const t = cle(texte);
  const els = elements.filter((e) => e.famille === config.id
    && (!niveaux.length || niveaux.includes(e.niveau))
    && (statut === 'tous' || (statut === 'ext' ? e.exterieur === true : e.exterieur === false))
    && (!t || cle(e.type).includes(t)));

  const groupes = new Map();
  for (const e of els) {
    if (!groupes.has(e.type)) groupes.set(e.type, []);
    groupes.get(e.type).push(e);
  }
  const rang = (n) => { const i = ordreNiveaux.indexOf(n); return i < 0 ? 999 : i; };
  const ligne = (type, liste) => {
    const sommes = {};
    for (const c of config.sommes) sommes[c] = somme(liste.map((e) => e.m?.[c]));
    for (const c of config.moyennes ?? []) {
      const v = liste.map((e) => e.m?.[c]).filter((x) => x != null);
      sommes[c] = v.length ? somme(v) / v.length : null;
    }
    const parNiveau = {};
    for (const e of liste) parNiveau[e.niveau] = (parNiveau[e.niveau] ?? 0) + (config.principal === 'nombre' ? 1 : e.m?.[config.principal] ?? 0);
    const sources = {};
    for (const e of liste) sources[e.source] = (sources[e.source] ?? 0) + 1;
    const genres = [...new Set(liste.map((e) => e.m?.genre ?? e.m?.usage).filter(Boolean))];
    const diametres = [...new Set(liste.map((e) => e.m?.diametre).filter(Boolean).map((d) => Math.round(d * 1000)))];
    return {
      type,
      nombre: liste.length,
      statut: statutDe(liste),
      niveaux: [...new Set(liste.map((e) => e.niveau).filter(Boolean))].sort((x, y) => rang(x) - rang(y)),
      sommes,
      parNiveau,
      sources,
      genre: genres.join(', '),
      diametres,
      classes: [...new Set(liste.map((e) => e.classe))],
      ids: liste.map((e) => e.id),
    };
  };
  const lignes = [...groupes].map(([type, liste]) => ligne(type, liste))
    .sort((x, y) => (y.sommes[config.principal] ?? y.nombre) - (x.sommes[config.principal] ?? x.nombre) || x.type.localeCompare(y.type, 'fr'));
  const total = els.length ? ligne('Total', els) : null;
  return { lignes, total, elements: els };
}

/**
 * Valeurs de synthèse propres à une famille, ajoutées au total (tuiles).
 * Menuiseries : nombre de fenêtres et de portes, surface extérieure et % de façade vitrée.
 */
export function complements(config, groupe, tous, niveaux = []) {
  if (!groupe.total) return groupe;
  const s = groupe.total.sommes;
  if (config.id === 'menuiseries') {
    s.fenetres = groupe.elements.filter((e) => e.m?.genre === 'Fenêtre').length;
    s.portes = groupe.elements.filter((e) => e.m?.genre === 'Porte').length;
    s.surfaceExt = somme(groupe.elements.filter((e) => e.exterieur === true).map((e) => e.m?.surface));
    s.vitrage = pourcentageVitre(tous, niveaux);
  }
  return groupe;
}

// Parois intérieures collées à la façade (doublages…) : souvent marquées « extérieures » dans les exports,
// elles ne doivent pas compter une deuxième fois la surface de façade.
const RE_DOUBLAGE = /doublage|contre[- ]?cloison|habillage|parement int|lining/;

/** Pourcentage de façade vitrée : menuiseries extérieures / surface brute des murs extérieurs (hors doublages). */
export function pourcentageVitre(elements, niveaux = []) {
  const dans = (e) => !niveaux.length || niveaux.includes(e.niveau);
  const facade = (e) => e.famille === 'murs' && e.exterieur === true && dans(e) && !RE_DOUBLAGE.test(cle(e.type));
  const murs = somme(elements.filter(facade).map((e) => e.m?.brute));
  const baies = somme(elements.filter((e) => e.famille === 'menuiseries' && e.exterieur === true && dans(e)).map((e) => e.m?.surface));
  return murs > 0 ? (baies / murs) * 100 : null;
}
