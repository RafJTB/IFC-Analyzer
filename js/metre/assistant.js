// Assistant du métré : comprend une question en français et y répond avec le moteur du métré (aucune IA, aucun envoi).
// Les chiffres viennent de regrouper() : exactement ceux des pages de métré. Fonctions pures, testées seules.
import { FAMILLES, PAGES, pageDeFamille } from './familles.js';
import { RE_DOUBLAGE, pourcentageVitre, regrouper } from './quantites.js';
import { cle } from '../ifc/noms.js';
import { nombre } from '../ui/format.js';

// Familles reconnues dans la question (la première qui correspond gagne pour un même mot)
const MOTS_FAMILLES = [
  { familles: ['bords_dalle'], re: /\bbords? de dalles?\b|\brives? de dalles?\b|\bnez de dalles?\b/ },
  { familles: ['menuiseries'], genre: 'Fenêtre', re: /\bfenetres?\b|\bchassis\b/ },
  { familles: ['menuiseries'], genre: 'Porte', re: /\bportes?\b/ },
  { familles: ['menuiseries'], re: /\bmenuiseries?\b|\bbaies?\b|\bouvertures?\b/ },
  { familles: ['murs'], re: /\bmurs?\b|\bparois?\b/ },
  // Mots qui désignent aussi un type : la famille est trouvée, et le mot sert ensuite à choisir les types
  { familles: ['murs'], re: /\bcloisons?\b|\bvoiles?\b|\bdoublages?\b|\bmaconneries?\b|\bacroteres?\b/, garder: true },
  { familles: ['dalles'], re: /\bdalles?\b|\bplanchers?\b/ },
  { familles: ['revetements_sol'], re: /\brevetements?( de sols?)?\b|\bsols?\b/ },
  { familles: ['revetements_sol'], re: /\bcarrelages?\b|\bparquets?\b|\bmoquettes?\b/, garder: true },
  { familles: ['plafonds'], re: /\b(faux[- ])?plafonds?\b/ },
  { familles: ['poteaux'], re: /\bpoteaux?\b/ },
  { familles: ['poutres'], re: /\bpoutres?\b/ },
  { familles: ['garde_corps'], re: /\bgarde[- ]?corps\b|\brambardes?\b/ },
  { familles: ['reseaux_ep'], re: /\beaux? pluviales?\b|\bep\b|\bdescentes?\b|\breseaux?\b|\bcanalisations?\b|\bcollecteurs?\b/ },
  { familles: ['escaliers'], re: /\bescaliers?\b|\bvolees?\b/ },
  { familles: ['poteaux', 'poutres', 'bords_dalle'], re: /\bstructures?\b/ },
];

// Grandeurs demandées : [grandeur, expression]. Les plus précises d'abord.
const MOTS_GRANDEURS = [
  ['vitrage', /\b(taux|pourcentage|part)( de)? (vitrage|facade vitree)\b|\bfacades? vitrees?\b|\bvitrage\b|%/],
  ['sansq', /\bsans quantites?\b|\bquantites? (manquantes?|absentes?)\b|\ba verifier\b|\bproblemes?\b/],
  ['contremarches', /\bcontremarches?\b/],
  ['marches', /\bmarches?\b|\bgirons?\b/],
  ['volume', /\bvolumes?\b|\bm3\b|m³|\bbeton\b|\bcubes?\b/],
  ['perimetre', /\bperimetres?\b|\bplinthes?\b/],
  ['longueur', /\blongueurs?\b|\blineaires?\b|\bml\b|\bmetres? lineaires?\b/],
  ['hauteur', /\bhauteurs?\b/],
  ['brute', /\b(surfaces? )?brutes?\b/],
  ['surface', /\bsurfaces?\b|\bm2\b|m²|\baires?\b|\bsuperficies?\b/],
  ['types', /\btypes?\b|\bliste\b|\bsortes?\b|\bmodeles?\b/],
  ['nombre', /\bcombien\b|\bnombres?\b|\bnb\b|\bquantites?\b|\bcompter?\b/],
];

const RE_PAR_NIVEAU = /\b(par|chaque|pour chaque) (niveau|etage)x?\b|\bniveau par niveau\b|\bdetail par niveau\b/;
const RE_NIVEAUX = /\bniveaux?\b|\betages?\b/;
const RE_EXT = /\bexterieure?s?\b|\bext\b|\bfacades?\b/;
const RE_INT = /\binterieure?s?\b|\bint\b/;
const RE_ELEMENTS = /\belements?\b|\bobjets?\b|\btout\b|\bmaquette\b/;
const VIDES = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'au', 'aux', 'en', 'et', 'ou', 'a', 'pour', 'sur', 'dans', 'quel', 'quelle',
  'quels', 'quelles', 'est', 'sont', 'il', 'y', 'ce', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'total', 'totale', 'qu', 'que', 'qui', 'd',
  'l', 'avec', 'sans', 'ai', 'as', 'a-t-il', 'donne', 'moi', 'svp', 'stp', 'merci', 'tous', 'toutes', 'nette', 'net', 'niveau', 'etage', 'cm', 'mm', 'm']);

/** Grandeur réellement calculée pour une famille (null : cette famille n'a pas cette grandeur). */
function grandeurPour(famille, g) {
  const c = FAMILLES[famille];
  const a = (k) => (c.sommes.includes(k) ? k : null);
  switch (g) {
    case 'surface': return famille === 'murs' ? 'nette' : a('surface');
    case 'brute': return famille === 'murs' ? 'brute' : a('surface');
    case 'longueur': return a('longueur') ?? (famille === 'poteaux' ? 'hauteur' : a('perimetre'));
    case 'perimetre': return a('perimetre');
    case 'volume': return a('volume');
    case 'hauteur': return a('hauteur');
    case 'contremarches': return a('contremarches');
    case 'marches': return a('marches');
    case 'nombre': return 'nombre';
    default: return c.principal;
  }
}

const UNITES = { nette: 'm²', brute: 'm²', surface: 'm²', longueur: 'ml', perimetre: 'ml', hauteur: 'ml', volume: 'm³', nombre: 'U', contremarches: 'U', marches: 'U' };
const LIBELLES = { nette: 'de surface nette', brute: 'de surface brute', surface: 'de surface', longueur: 'de longueur', perimetre: 'de périmètre',
  hauteur: 'de hauteur cumulée', volume: 'de volume', contremarches: 'contremarches', marches: 'marches' };
const FEMININ = new Set(['menuiseries', 'dalles', 'poutres', 'Fenêtre', 'Porte']);
const valeurDe = (ligne, k) => (k === 'nombre' ? ligne.nombre : ligne.sommes?.[k] ?? 0);
const formater = (v, k) => `${nombre(v, UNITES[k] === 'U' ? 0 : 2)} ${UNITES[k] === 'U' ? '' : UNITES[k]}`.trim();
const pluriel = (n, s, p) => `${nombre(n, 0)} ${n > 1 ? p : s}`;

/** Ce que la question demande : familles, genre, grandeur, niveaux, statut, mots restants (pour un type précis). */
export function comprendre(question, niveauxModele = []) {
  let q = ` ${cle(question).replace(/['’]/g, ' ').replace(/[?!.,;:()]/g, ' ').replace(/\s+/g, ' ')} `;
  const retirer = (re) => { q = q.replace(new RegExp(re.source, 'g'), ' '); };
  const demande = { familles: [], genre: null, grandeur: null, parNiveau: false, niveaux: [], statut: 'tous', listeNiveaux: false, elements: false, mots: [] };

  if (RE_PAR_NIVEAU.test(q)) { demande.parNiveau = true; retirer(RE_PAR_NIVEAU); }
  // Niveaux nommés comme dans la maquette (RDC, R+1…), rez-de-chaussée, « 2e étage »
  for (const n of niveauxModele) {
    const k = cle(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9+])${k}(?=[^a-z0-9+]|$)`);
    if (k && re.test(q)) { demande.niveaux.push(n); q = q.replace(re, '$1 '); }
  }
  if (/\brez[- ]de[- ]chaussee\b/.test(q)) {
    const rdc = niveauxModele.find((n) => /^(rdc|rez|r\+?0|niveau 0|n0)\b/.test(cle(n)));
    if (rdc && !demande.niveaux.includes(rdc)) demande.niveaux.push(rdc);
    retirer(/\brez[- ]de[- ]chaussee\b/);
  }
  for (const m of q.matchAll(/\b(\d+)\s?(er|e|eme|ieme)? etages?\b|\betages? (\d+)\b/g)) {
    const d = m[1] ?? m[3];
    const n = niveauxModele.find((x) => new RegExp(`(\\+|\\b)${d}$`).test(cle(x)));
    if (n && !demande.niveaux.includes(n)) demande.niveaux.push(n);
  }
  retirer(/\b(\d+)\s?(er|e|eme|ieme)? etages?\b|\betages? (\d+)\b/);

  for (const f of MOTS_FAMILLES) {
    if (!f.re.test(q)) continue;
    for (const x of f.familles) if (!demande.familles.includes(x)) demande.familles.push(x);
    if (f.genre) demande.genre = demande.genre && demande.genre !== f.genre ? 'tous' : f.genre;
    if (!f.garder) retirer(f.re);
  }
  if (demande.genre === 'tous') demande.genre = null;
  for (const [g, re] of MOTS_GRANDEURS) { // la plus précise d'abord : « combien de m² » est une surface
    if (!re.test(q)) continue;
    demande.grandeur ??= g;
    retirer(re);
  }
  if (['marches', 'contremarches'].includes(demande.grandeur) && !demande.familles.length) demande.familles.push('escaliers');
  if (RE_EXT.test(q) && !RE_INT.test(q)) demande.statut = 'ext';
  else if (RE_INT.test(q) && !RE_EXT.test(q)) demande.statut = 'int';
  retirer(RE_EXT); retirer(RE_INT);
  if (RE_NIVEAUX.test(q)) { demande.listeNiveaux = true; retirer(RE_NIVEAUX); }
  if (RE_ELEMENTS.test(q)) { demande.elements = true; retirer(RE_ELEMENTS); }
  demande.mots = q.split(/[^a-z0-9+/]+/).filter((m) => m.length > 1 && !VIDES.has(m)).map((m) => (m.length > 4 ? m.replace(/[sx]$/, '') : m));
  return demande;
}

/** Types de la famille désignés par les mots restants (« voile BA 20 », « cloison »…), ou null. */
function typesDesignes(lignes, mots) {
  if (!mots.length || lignes.length < 2) return null;
  const trouves = (l) => mots.filter((m) => cle(l.type).includes(m));
  const scores = lignes.map((l) => trouves(l).length);
  const max = Math.max(...scores);
  if (!max) return null;
  const choisis = lignes.filter((l, i) => scores[i] === max);
  if (choisis.length === lignes.length) return null;
  return { types: choisis.map((l) => l.type), mots: trouves(choisis[0]) };
}

const titreFamille = (famille, genre) => (genre === 'Fenêtre' ? 'Fenêtres' : genre === 'Porte' ? 'Portes' : FAMILLES[famille].libelle);
function contexte(famille, genre, statut, niveaux) {
  const fem = FEMININ.has(genre ?? famille);
  const st = statut === 'ext' ? (fem ? ' extérieures' : ' extérieurs') : statut === 'int' ? (fem ? ' intérieures' : ' intérieurs') : '';
  const nv = !niveaux.length ? '' : niveaux.length === 1 ? ` au ${niveaux[0]}` : ` aux niveaux ${niveaux.slice(0, -1).join(', ')} et ${niveaux.at(-1)}`;
  return `${titreFamille(famille, genre)}${st}${nv}`;
}

/** Questions proposées, d'après ce que contient la maquette. */
export function suggestions(modele) {
  const els = modele?.elements ?? [];
  const a = (f) => els.some((e) => e.famille === f);
  const s = [];
  if (a('murs')) s.push('Surface des murs extérieurs');
  if (els.some((e) => e.m?.genre === 'Fenêtre')) s.push('Fenêtres par niveau');
  if (pourcentageVitre(els) != null) s.push('% de façade vitrée');
  if (a('dalles')) s.push('Volume de béton des dalles');
  if (els.some((e) => e.source === 'absent')) s.unshift('Éléments sans quantités');
  if (a('garde_corps')) s.push('Longueur de garde-corps');
  return s.slice(0, 4);
}

const pasCompris = (modele) => ({
  ok: false,
  texte: 'Je n’ai pas compris. Pose-moi une question sur une famille (murs, fenêtres, dalles…), avec si tu veux un niveau, « extérieurs » ou « par niveau ».',
  suggestions: suggestions(modele),
});

/**
 * Répond à une question sur la maquette.
 * @param {string} question
 * @param {object} modele  modèle préparé (elements, niveaux)
 * @returns {{ ok: boolean, texte?: string, titre?: string, valeurs?: {valeur: string, libelle: string}[],
 *   details?: {libelle: string, valeur: string}[], plus?: number, liens?: object[], suggestions?: string[] }}
 */
export function repondre(question, modele) {
  if (!cle(question)) return pasCompris(modele);
  const els = modele.elements;
  const ordre = modele.niveaux.map((n) => n.nom);
  const d = comprendre(question, ordre);

  // Questions sans famille : façade vitrée, éléments sans quantités, niveaux, nombre d'éléments
  if (d.grandeur === 'vitrage' && (!d.familles.length || d.familles.every((f) => ['menuiseries', 'murs'].includes(f)))) {
    const p = pourcentageVitre(els, d.niveaux);
    if (p == null) return { ok: true, texte: 'Je ne trouve pas de murs extérieurs : impossible de calculer la part de façade vitrée.' };
    return { ok: true, titre: `Façade vitrée${d.niveaux.length === 1 ? ` au ${d.niveaux[0]}` : ''}`, valeurs: [{ valeur: `${nombre(p, 1)} %`, libelle: 'de la façade' }],
      texte: 'Menuiseries extérieures rapportées à la surface brute des murs extérieurs, doublages exclus.',
      liens: [{ libelle: 'Voir les menuiseries', page: 'menuiseries', famille: 'menuiseries', statut: 'ext', niveaux: d.niveaux }] };
  }
  if (d.grandeur === 'sansq') {
    const sans = els.filter((e) => e.source === 'absent' && (!d.familles.length || d.familles.includes(e.famille)));
    if (!sans.length) return { ok: true, titre: 'Tout est en ordre', texte: 'Tous les éléments ont leurs quantités dans le fichier ou calculables.' };
    const parFam = PAGES.map((p) => ({ p, n: sans.filter((e) => p.familles.includes(e.famille)).length })).filter((x) => x.n);
    return { ok: true, titre: 'Éléments sans quantités', valeurs: [{ valeur: nombre(sans.length, 0), libelle: sans.length > 1 ? 'éléments comptés pour 0' : 'élément compté pour 0' }],
      details: parFam.map((x) => ({ libelle: x.p.titre, valeur: nombre(x.n, 0) })),
      texte: 'Dans Revit, coche « Exporter les quantités de base » dans les options d’export IFC.',
      liens: parFam.slice(0, 2).map((x) => ({ libelle: `Voir ${x.p.titre.toLowerCase()}`, page: x.p.id, famille: x.p.familles[0] })) };
  }
  if (!d.familles.length) {
    if (d.listeNiveaux || d.parNiveau) {
      return { ok: true, titre: 'Niveaux de la maquette', valeurs: [{ valeur: nombre(ordre.length, 0), libelle: ordre.length > 1 ? 'niveaux' : 'niveau' }],
        details: ordre.map((n) => ({ libelle: n, valeur: pluriel(els.filter((e) => e.niveau === n).length, 'élément', 'éléments') })) };
    }
    if (d.elements || d.grandeur === 'nombre') {
      const parFam = PAGES.map((p) => ({ p, n: els.filter((e) => p.familles.includes(e.famille) && (!d.niveaux.length || d.niveaux.includes(e.niveau))).length })).filter((x) => x.n);
      const n = parFam.reduce((s, x) => s + x.n, 0);
      return { ok: true, titre: `Éléments métrés${d.niveaux.length === 1 ? ` au ${d.niveaux[0]}` : ''}`, valeurs: [{ valeur: nombre(n, 0), libelle: n > 1 ? 'éléments' : 'élément' }],
        details: parFam.map((x) => ({ libelle: x.p.titre, valeur: nombre(x.n, 0) })) };
    }
    return pasCompris(modele);
  }

  // Une ou plusieurs familles
  const reponses = d.familles.map((famille) => {
    const config = FAMILLES[famille];
    const k = grandeurPour(famille, d.grandeur === 'types' ? null : d.grandeur);
    const filtres = { niveaux: d.niveaux, statut: d.statut, ordreNiveaux: ordre };
    let { lignes } = regrouper(els, config, filtres);
    if (d.genre) lignes = lignes.filter((l) => l.genre.split(', ').includes(d.genre));
    const choix = typesDesignes(lignes, d.mots);
    if (choix) lignes = lignes.filter((l) => choix.types.includes(l.type));
    return { famille, config, k, lignes, types: choix?.types, mots: choix?.mots };
  });

  const precision = (r) => (!r.types ? '' : r.types.length === 1 ? ` · ${r.types[0]}` : ` · ${r.types.length} types « ${r.mots.join(' ')} »`);
  const titreCtx = (r) => `${contexte(r.famille, d.genre, d.statut, d.niveaux)}${precision(r)}`;
  // La page Menuiseries montre fenêtres et portes ensemble : le lien le dit quand la réponse ne portait que sur l'une des deux
  const lien = (r) => ({ libelle: `Voir dans ${pageDeFamille(r.famille).titre}${d.genre ? ' (fenêtres et portes)' : ''}`, page: pageDeFamille(r.famille).id, famille: r.famille, statut: d.statut,
    niveaux: d.niveaux, type: r.types?.length === 1 ? r.types[0] : null });

  // Une seule famille : réponse détaillée
  if (reponses.length === 1) {
    const r = reponses[0];
    if (!r.lignes.length) return { ok: true, texte: `Je ne trouve rien pour « ${titreCtx(r)} » dans cette maquette.` };
    if (!r.k) {
      const dispo = [...new Set(['surface', 'longueur', 'volume', 'nombre'].filter((g) => grandeurPour(r.famille, g)).map((g) => ({ surface: 'la surface', longueur: 'la longueur', volume: 'le volume', nombre: 'le nombre' }[g])))];
      return { ok: true, texte: `Je n’ai pas cette grandeur pour les ${r.config.pluriel}. Je peux te donner ${dispo.join(', ').replace(/, ([^,]*)$/, ' ou $1')}.` };
    }
    const total = (k) => r.lignes.reduce((s, l) => s + valeurDe(l, k), 0);
    const nb = r.lignes.reduce((s, l) => s + l.nombre, 0);
    const motNb = d.genre === 'Fenêtre' ? ['fenêtre', 'fenêtres'] : d.genre === 'Porte' ? ['porte', 'portes'] : [r.config.singulier, r.config.pluriel];
    const valeurs = r.k === 'nombre'
      ? [{ valeur: nombre(nb, 0), libelle: nb > 1 ? motNb[1] : motNb[0] }]
      : [{ valeur: formater(total(r.k), r.k), libelle: LIBELLES[r.k] }, { valeur: nombre(nb, 0), libelle: nb > 1 ? motNb[1] : motNb[0] }];
    if (r.k === 'nombre' && r.config.principal !== 'nombre' && !d.genre) valeurs.push({ valeur: formater(total(r.config.principal), r.config.principal), libelle: LIBELLES[r.config.principal] });
    let details;
    let plus = 0;
    if (d.parNiveau) {
      const parNiv = new Map(ordre.map((n) => [n, 0]));
      const ids = new Set(r.lignes.flatMap((l) => l.ids));
      for (const e of els) {
        if (!ids.has(e.id) || !parNiv.has(e.niveau)) continue;
        parNiv.set(e.niveau, parNiv.get(e.niveau) + (r.k === 'nombre' ? 1 : e.m?.[r.k] ?? 0));
      }
      details = [...parNiv].filter(([, v]) => v).map(([n, v]) => ({ libelle: n, valeur: formater(v, r.k) }));
    } else {
      const tri = [...r.lignes].sort((a, b) => valeurDe(b, r.k) - valeurDe(a, r.k));
      const max = d.grandeur === 'types' ? 8 : 4;
      details = tri.slice(0, max).map((l) => ({ libelle: l.type, valeur: formater(valeurDe(l, r.k), r.k), type: l.type }));
      plus = Math.max(0, tri.length - max);
    }
    // Murs extérieurs : les doublages marqués « extérieurs » dans le fichier sont comptés, on le dit
    let texte;
    const doublages = r.famille === 'murs' && d.statut === 'ext' && r.k !== 'nombre' ? r.lignes.filter((l) => RE_DOUBLAGE.test(cle(l.type))) : [];
    if (doublages.length && doublages.length < r.lignes.length) {
      const v = doublages.reduce((s, l) => s + valeurDe(l, r.k), 0);
      texte = `Ce total compte aussi ${formater(v, r.k)} de doublages, marqués « extérieurs » dans le fichier.`;
    }
    return { ok: true, titre: titreCtx(r), valeurs, details, plus, texte, liens: [lien(r)] };
  }

  // Plusieurs familles (« structure »…) : une ligne par famille, sa grandeur principale
  const lignes = reponses.filter((r) => r.lignes.length);
  if (!lignes.length) return { ok: true, texte: 'Je ne trouve aucun élément correspondant dans cette maquette.' };
  return {
    ok: true,
    titre: `${d.familles.length === 3 && d.familles.includes('poteaux') ? 'Structure' : lignes.map((r) => r.config.libelle).join(', ')}${d.niveaux.length === 1 ? ` au ${d.niveaux[0]}` : ''}`,
    details: lignes.map((r) => {
      const k = r.k ?? r.config.principal;
      const v = r.lignes.reduce((s, l) => s + valeurDe(l, k), 0);
      return { libelle: r.config.libelle, valeur: `${formater(v, k)}${k === 'nombre' ? ` ${v > 1 ? r.config.pluriel : r.config.singulier}` : ''}` };
    }),
    liens: [lien(lignes[0])],
  };
}
