// Point d'entrée : état de l'appli, navigation, ouverture et analyse des fichiers, actions de l'interface.
import { PAGES, pageDeFamille } from './metre/familles.js';
import { versCsv } from './metre/export.js';
import { repondre } from './metre/assistant.js';
import { artEntete, vueAccueil } from './ui/accueil.js';
import { couleurDe, donneesPage, filtresDe, ligneTexte, vueFamille } from './ui/page-famille.js';
import { vue3D } from './ui/page-3d.js';
import { textesEffets, vuePerso } from './ui/page-perso.js';
import { ONGLETS, vueReglages } from './ui/page-reglages.js';
import { ACCENTS, DEFAUTS as PERSO_DEFAUTS, appliquerPerso, enregistrerPerso, garderImage, imagePerso, lirePerso, reduireImage } from './ui/perso.js';
import { appliquerReglages, changerReglage, lireReglages, memoriserOnglet, ongletReglages } from './ui/reglages.js';
import { initPalette } from './ui/palette.js';
import { ic } from './ui/icones.js';
import { echapper, nombre, pluriel, taille } from './ui/format.js';
import { toast } from './ui/toast.js';
import * as stockage from './ui/stockage.js';
import { initHoverGlow, refreshHoverGlow } from './ui/hover-glow.js';
import { initLiquidTabs } from './ui/liquid-tabs.js';

const EXEMPLE = 'assets/exemple/residence-les-tilleuls.ifc';
const etat = {
  modeles: new Map(), //        fichiers ouverts : clé → { cle, nom, taille, date, duree, schema, nbElements, nbNiveaux, modele }
  actif: null,
  recents: [],
  analyse: null, //             analyse en cours : { nom, etape, part }
  page: 'accueil',
  filtres: {}, //               par page de métré : onglet, statut, niveaux, texte, tri, sélection
  geometries: new Map(), //     clé → géométrie 3D (chargée à la demande)
  preparation3d: new Map(), //  clé → avancement de la préparation de la 3D (0 à 1)
  sans3d: new Set(), //         clés dont la 3D n'existe pas (analyse ancienne) ou a échoué
  v3d: { selection: null, niveaux: [], masquees: [], coupe: 1, cadrerSelection: false },
  assistant: { cle: null, messages: [] }, // questions et réponses de l'assistant, pour la maquette affichée
  famillesFonds: 'tous', //    page Personnalisation : famille de fonds affichée
  ongletReglages: ((o) => (ONGLETS.some(([k]) => k === o) ? o : 'analyse'))(ongletReglages('analyse')), // page Paramètres
};
const $ = (id) => document.getElementById(id);
const vue = $('vue');
const PAGES_SPECIALES = ['accueil', '3d', 'personnalisation', 'parametres'];
const TITRES = { '3d': 'Maquette 3D', personnalisation: 'Personnalisation', parametres: 'Paramètres' };
const pageCourante = () => PAGES.find((p) => p.id === etat.page);
const pageValide = (p) => PAGES_SPECIALES.includes(p) || PAGES.some((x) => x.id === p);

// ---------------------------------------------------------------- Rendu
function rendreNav() {
  const actif = etat.modeles.get(etat.actif);
  const compte = (p) => (actif ? actif.modele.elements.filter((e) => p.familles.includes(e.famille)).length : null);
  const bouton = (id, titre, icone, n = null) => `
    <button type="button" data-action="page" data-page="${id}" class="${etat.page === id ? 'active' : ''}" ${etat.page === id ? 'aria-current="page"' : ''}>
      ${ic(icone)}<span>${titre}</span>${n != null ? `<span class="cnt">${nombre(n, 0)}</span>` : ''}</button>`;
  $('nav').innerHTML = `${bouton('accueil', 'Accueil', 'home')}
    <span class="nav-head" aria-hidden="true">Visualisation</span>${bouton('3d', 'Maquette 3D', 'cube')}
    <span class="nav-head" aria-hidden="true">Métré</span>${PAGES.map((p) => bouton(p.id, p.titre, p.icone, compte(p))).join('')}
    <span class="nav-head" aria-hidden="true">Personnalisation</span>${bouton('personnalisation', 'Personnalisation', 'palette')}${bouton('parametres', 'Paramètres', 'reglages')}`;
}

function rendreFichiers() {
  const onglets = [...etat.modeles.values()].map((m) => `
    <div class="file-tab${m.cle === etat.actif ? ' on' : ''}" style="--c: var(--${couleurDe(m.nom)})">
      <button type="button" class="ft-open" data-action="fichier" data-cle="${echapper(m.cle)}" aria-pressed="${m.cle === etat.actif}" title="${echapper(m.nom)}"><i></i><span>${echapper(m.nom)}</span></button>
      <button type="button" class="ft-close" data-action="fermer-fichier" data-cle="${echapper(m.cle)}" aria-label="Fermer ${echapper(m.nom)}">${ic('fermer')}</button>
    </div>`).join('');
  $('fichiers').innerHTML = `${onglets || '<span class="files-vide">Aucun fichier ouvert</span>'}
    <button type="button" class="file-add" data-action="ouvrir-fichier" aria-label="Ouvrir un fichier IFC" title="Ouvrir un fichier IFC (Ctrl O)">${ic('plus')}</button>`;
  // Carte du bas de la barre latérale : la maquette active (comme la carte du compte du Transcripteur)
  const actif = etat.modeles.get(etat.actif);
  const carte = $('carte-modele');
  carte.dataset.action = actif ? 'page' : 'ouvrir-fichier';
  carte.dataset.page = 'accueil';
  carte.innerHTML = actif
    ? `<span class="avatar">${ic('cube')}</span><div><b>${echapper(actif.nom)}</b><small><i></i>${echapper(actif.schema)} · ${pluriel(actif.nbElements, 'élément')}</small></div>${ic('chevron', 'i chev')}`
    : `<span class="avatar">${ic('ouvrir')}</span><div><b>Ouvrir une maquette</b><small>IFC2x3 ou IFC4, analysée sur ce PC</small></div>${ic('chevron', 'i chev')}`;
}

function rendreTheme() {
  const clair = document.documentElement.dataset.theme === 'light';
  $('btn-theme').setAttribute('aria-label', clair ? 'Passer en thème sombre' : 'Passer en thème clair');
}

/** Redessine la page. *anim* : animation d'arrivée (changement de page). Les défilements sont conservés. */
function rendre({ anim = false, focus = null } = {}) {
  const defil = [...document.querySelectorAll('.view, .table-scroll, .side-panel, .dash-main')].map((e) => [e.className, e.scrollTop]);
  const saisie = $('chat-saisie'); // question en cours d'écriture : gardée si la page est redessinée
  const brouillon = saisie?.value ?? '';
  const saisieActive = saisie && document.activeElement === saisie;
  const page = pageCourante();
  if (etat.page === '3d') vue.innerHTML = vue3D(etat, statut3d());
  else if (etat.page === 'personnalisation') vue.innerHTML = vuePerso(etat.famillesFonds, imagePerso());
  else if (etat.page === 'parametres') vue.innerHTML = vueReglages(etat.ongletReglages, lireReglages(), infosReglages());
  else vue.innerHTML = page ? vueFamille(page, etat) : vueAccueil(etat);
  vue.classList.toggle('vue-tableau', etat.page === 'accueil'); // colonne principale et panneau défilent chacun de leur côté
  const titre = page?.titre ?? TITRES[etat.page];
  document.title = `${titre ? `${titre} · ` : ''}IFC Analyzer by RJB`;
  if (anim) {
    vue.classList.remove('anim');
    void vue.offsetWidth; // relance l'animation
    vue.classList.add('anim');
    vue.scrollTop = 0;
  } else {
    for (const [cls, top] of defil) { const e = document.getElementsByClassName(cls.split(' ')[0])[0]; if (e) e.scrollTop = top; }
  }
  rendreNav();
  rendreFichiers();
  initLiquidTabs();
  if (etat.page === '3d') monterVisionneuse();
  if (etat.page === 'parametres') majPlace();
  if (etat.page === 'accueil') {
    const chat = $('chat');
    if (chat) chat.scrollTop = chat.scrollHeight; // la dernière réponse visible
    if (brouillon && $('chat-saisie')) $('chat-saisie').value = brouillon;
    if (saisieActive && !focus) $('chat-saisie')?.focus({ preventScroll: true });
    if (etat.actif) assurerApercu(etat.actif);
  }
  if (focus) {
    const champ = $(focus);
    if (champ) { champ.focus(); if (champ.type === 'text') { const n = champ.value.length; champ.setSelectionRange(n, n); } }
  }
}

function aller(page, { historique = true } = {}) {
  etat.page = pageValide(page) ? page : 'accueil';
  if (historique) {
    const h = etat.page === 'accueil' ? '#/' : `#/${etat.page}`;
    if (location.hash !== h) history.pushState(null, '', h);
  }
  rendre({ anim: true });
  vue.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- Maquette 3D
let visionneuse = null; //  créée à la première visite de la page 3D (three.js n'est chargé qu'à ce moment)
let module3d = null;

function statut3d() {
  const cle = etat.actif;
  if (!cle) return 'pret';
  if (module3d && !module3d.webglDisponible()) return 'sans-webgl';
  if (etat.geometries.has(cle)) return 'pret';
  if (etat.preparation3d.has(cle)) return 'preparation';
  if (etat.sans3d.has(cle)) return lireReglages().prepa3d ? 'absente' : 'desactivee';
  chargerGeometrie(cle);
  return 'chargement';
}

const chargements = new Set();
async function chargerGeometrie(cle) {
  if (chargements.has(cle)) return;
  chargements.add(cle);
  const g = await stockage.lireGeometrie(cle);
  chargements.delete(cle);
  if (g) etat.geometries.set(cle, g);
  else if (!etat.preparation3d.has(cle)) etat.sans3d.add(cle);
  if (etat.page === '3d' && etat.actif === cle) rendre();
}

/** Éléments sélectionnés en 3D : tous ceux du type choisi. */
function idsSelection() {
  const sel = etat.v3d.selection;
  const actif = etat.modeles.get(etat.actif);
  if (!sel || !actif) return null;
  return new Set(actif.modele.elements.filter((e) => e.famille === sel.famille && e.type === sel.type).map((e) => e.id));
}

function appliquer3d() {
  if (!visionneuse) return;
  const { niveaux, masquees, coupe } = etat.v3d;
  visionneuse.couleurSelection(lirePerso().accent);
  visionneuse.appliquer({ niveaux, masquees, selection: idsSelection(), coupe: coupe >= 1 ? null : coupe });
}

async function monterVisionneuse() {
  const cle = etat.actif;
  if (!cle || !etat.geometries.has(cle)) {
    if (!module3d && cle) { module3d = await import('./ui/vue3d.js'); if (!module3d.webglDisponible() && etat.page === '3d') rendre(); }
    return;
  }
  if (!visionneuse) {
    try {
      module3d ??= await import('./ui/vue3d.js');
      if (!module3d.webglDisponible()) { if (etat.page === '3d') rendre(); return; }
      visionneuse = new module3d.Visionneuse();
      visionneuse.surClic = clic3d;
    } catch (e) {
      toast(`La 3D n’a pas pu démarrer : ${e.message}`, { erreur: true });
      return;
    }
  }
  const hote = $('v3d-hote');
  if (!hote || etat.page !== '3d' || etat.actif !== cle) return;
  hote.appendChild(visionneuse.el);
  if (visionneuse.cle !== cle) {
    const infos = new Map(etat.modeles.get(cle).modele.elements.map((e) => [e.id, { famille: e.famille, niveau: e.niveau, type: e.type, genre: e.m?.genre }]));
    visionneuse.charger(etat.geometries.get(cle), infos);
    visionneuse.cle = cle;
  }
  visionneuse.redimensionner();
  appliquer3d();
  if (etat.v3d.cadrerSelection) { etat.v3d.cadrerSelection = false; visionneuse.cadrer(idsSelection()); }
}

// Aperçu 3D de l'accueil : une image de la maquette, calculée une fois puis gardée avec l'analyse
const apercus = new Set(); // clés déjà traitées (ou en cours) : jamais deux fois
async function assurerApercu(cle) {
  const m = etat.modeles.get(cle);
  if (!m || m.apercu || apercus.has(cle) || etat.preparation3d.has(cle)) return;
  apercus.add(cle);
  try {
    const g = etat.geometries.get(cle) ?? await stockage.lireGeometrie(cle);
    if (!g) return;
    module3d ??= await import('./ui/vue3d.js');
    if (!module3d.webglDisponible()) return;
    const infos = new Map(m.modele.elements.map((e) => [e.id, { famille: e.famille, niveau: e.niveau, type: e.type, genre: e.m?.genre }]));
    m.apercu = module3d.apercu(g, infos);
    await stockage.enregistrer(m);
    await rafraichirRecents();
    majApercu(cle);
  } catch { /* pas d'aperçu : la tuile du logo reste affichée */ }
}

/** L'aperçu arrive : l'en-tête et la vignette sont mis à jour sans redessiner la page (la saisie en cours est gardée). */
function majApercu(cle) {
  const m = etat.modeles.get(cle);
  if (etat.page !== 'accueil' || !m?.apercu) return;
  if (etat.actif === cle && $('hero-art')) {
    $('hero-art').outerHTML = artEntete(m.apercu);
    vue.querySelector('.hero')?.classList.add('avec-3d');
  }
  const vignette = vue.querySelector(`.r-thumb[data-cle="${CSS.escape(cle)}"]`);
  if (vignette) { vignette.outerHTML = `<span class="r-thumb" data-cle="${echapper(cle)}" style="background-image:url('${m.apercu}')"></span>`; }
}

function clic3d(id) {
  const el = id == null ? null : etat.modeles.get(etat.actif)?.modele.elements.find((e) => e.id === id);
  if (id != null && !el) toast('Cet objet n’entre dans aucune famille du métré.');
  etat.v3d.selection = el ? { famille: el.famille, type: el.type, element: el.id } : null;
  rendre();
}

function majProgression3d(cle) {
  if (etat.page !== '3d' || etat.actif !== cle) return;
  const pct = Math.round((etat.preparation3d.get(cle) ?? 0) * 100);
  const barre = vue.querySelector('.v3d-attente .progress');
  if (!barre) return rendre();
  barre.setAttribute('aria-valuenow', String(pct));
  barre.firstElementChild.style.width = `${pct}%`;
  const txt = vue.querySelector('.v3d-attente .muted');
  if (txt) txt.textContent = `${pct} %`;
}

// ---------------------------------------------------------------- Fichiers et analyses
function activer(entree) {
  if (etat.actif !== entree.cle) etat.v3d.selection = null;
  etat.modeles.set(entree.cle, entree);
  etat.actif = entree.cle;
  stockage.memoriserSession([...etat.modeles.keys()], etat.actif);
}

async function rafraichirRecents() {
  etat.recents = await stockage.lister();
}

let file = Promise.resolve(); // analyses les unes après les autres
const analyserFichiers = (fichiers) => { for (const f of fichiers) file = file.then(() => analyserFichier(f)); return file; };

async function analyserFichier(fichier) {
  if (!/\.ifc$/i.test(fichier.name)) {
    toast(`« ${fichier.name} » n’est pas un fichier IFC (.ifc).`, { erreur: true });
    return;
  }
  const cle = `${fichier.name}|${fichier.size}|${fichier.lastModified}`;
  if (etat.modeles.has(cle) && !etat.sans3d.has(cle)) { activer(etat.modeles.get(cle)); rendre(); toast(`${fichier.name} est déjà ouvert.`); return; }
  // Déjà analysé, 3D comprise (ou 3D désactivée dans les paramètres) : rien à recalculer
  const prepa3d = lireReglages().prepa3d;
  const deja = await stockage.lire(cle);
  const geo = deja?.modele ? await stockage.lireGeometrie(cle) : null;
  if (deja?.modele && (geo || !prepa3d)) {
    if (geo) { etat.geometries.set(cle, geo); etat.sans3d.delete(cle); } else etat.sans3d.add(cle);
    activer(deja);
    rendre();
    toast(`${fichier.name} : analyse retrouvée, sans recalcul.`);
    return;
  }

  etat.analyse = { nom: fichier.name, etape: 'Lecture du fichier', part: 0 };
  const retour3d = etat.page === '3d';
  if (etat.page !== 'accueil' && !retour3d) aller('accueil'); else rendre();
  const debut = Date.now();
  try {
    const octets = await fichier.arrayBuffer();
    const { modele, duree } = await analyserDansWorker(octets, cle, prepa3d);
    const entree = { cle, nom: fichier.name, taille: fichier.size, date: Date.now(), duree: duree ?? Date.now() - debut,
      schema: modele.schema, nbElements: modele.elements.length, nbNiveaux: modele.niveaux.length, modele };
    etat.analyse = null;
    if (prepa3d) etat.sans3d.delete(cle); else etat.sans3d.add(cle);
    activer(entree);
    await stockage.enregistrer(entree);
    await rafraichirRecents();
    rendre();
    toast(`${fichier.name} analysé : ${pluriel(entree.nbElements, 'élément métré', 'éléments métrés')}.${prepa3d ? ' La 3D se prépare.' : ''}`);
  } catch (e) {
    etat.analyse = null;
    rendre();
    toast(`Analyse impossible : ${e.message || e}`, { erreur: true, duree: 9000 });
  }
}

/** Le métré arrive d'abord (promesse résolue), la géométrie 3D ensuite (mise en mémoire et enregistrée), si elle est demandée. */
function analyserDansWorker(octets, cle, avec3d = true) {
  return new Promise((ok, ko) => {
    const w = new Worker(new URL('./ifc/worker.js', import.meta.url), { type: 'module' });
    let metre = false;
    const fin = () => { w.terminate(); etat.preparation3d.delete(cle); };
    w.onmessage = ({ data }) => {
      switch (data.type) {
        case 'progression': return progression(data);
        case 'resultat':
          metre = true;
          if (!avec3d) fin(); else etat.preparation3d.set(cle, 0);
          return ok(data);
        case 'progression-3d':
          etat.preparation3d.set(cle, data.part);
          return majProgression3d(cle);
        case 'geometrie':
          fin();
          etat.geometries.set(cle, data.geometrie);
          stockage.enregistrerGeometrie(cle, data.geometrie);
          if (etat.page === '3d' && etat.actif === cle) rendre();
          if (etat.page === 'accueil' && etat.actif === cle) assurerApercu(cle);
          return undefined;
        case 'erreur-3d':
          fin();
          etat.sans3d.add(cle);
          if (etat.page === '3d' && etat.actif === cle) rendre();
          return toast(`La 3D n’a pas pu être préparée : ${data.message}`, { erreur: true, duree: 9000 });
        default:
          fin();
          return ko(new Error(data.message));
      }
    };
    w.onerror = (e) => {
      fin();
      if (metre) { etat.sans3d.add(cle); toast('La 3D n’a pas pu être préparée.', { erreur: true }); }
      else ko(new Error(e.message || 'le moteur IFC n’a pas pu démarrer'));
    };
    w.postMessage({ octets, geometrie: avec3d }, [octets]);
  });
}

let dernier = 0;
function progression({ etape, part }) {
  if (!etat.analyse) return;
  etat.analyse.etape = etape;
  etat.analyse.part = part;
  const maintenant = performance.now();
  if (maintenant - dernier < 80 && part < 1) return; // pas plus de ~12 mises à jour par seconde
  dernier = maintenant;
  const pct = Math.round(part * 100);
  const barre = vue.querySelector('.analyse .progress');
  if (!barre) return;
  barre.setAttribute('aria-valuenow', String(pct));
  barre.firstElementChild.style.width = `${pct}%`;
  const txt = vue.querySelector('.analyse .muted');
  if (txt) txt.textContent = `${etape} — ${pct} %`;
}

async function ouvrirExemple() {
  try {
    const r = await fetch(EXEMPLE);
    if (!r.ok) throw new Error(`exemple introuvable (${r.status})`);
    const blob = await r.blob();
    await analyserFichiers([new File([blob], 'residence-les-tilleuls.ifc', { lastModified: 1767225600000 })]);
  } catch (e) {
    toast(`Impossible d’ouvrir l’exemple : ${e.message}`, { erreur: true });
  }
}

async function ouvrirRecent(cle) {
  if (etat.modeles.has(cle)) { activer(etat.modeles.get(cle)); rendre(); return; }
  const a = await stockage.lire(cle);
  if (!a?.modele) { toast('Cette analyse n’est plus disponible : ouvre à nouveau le fichier.', { erreur: true }); return; }
  activer(a);
  rendre();
}

async function oublier(cle) {
  const a = await stockage.lire(cle);
  if (!a) return;
  const g = await stockage.lireGeometrie(cle);
  await stockage.supprimer(cle);
  await rafraichirRecents();
  rendre();
  toast(`« ${a.nom} » retiré des analyses récentes.`, {
    action: 'Annuler',
    surAction: async () => {
      await stockage.enregistrer(a);
      if (g) await stockage.enregistrerGeometrie(cle, g);
      await rafraichirRecents();
      rendre();
    },
  });
}

function fermer(cle) {
  const m = etat.modeles.get(cle);
  etat.modeles.delete(cle);
  etat.geometries.delete(cle);
  if (etat.actif === cle) { etat.actif = [...etat.modeles.keys()].pop() ?? null; etat.v3d.selection = null; }
  stockage.memoriserSession([...etat.modeles.keys()], etat.actif);
  rendre();
  if (m) toast(`${m.nom} fermé (il reste dans les analyses récentes).`, { action: 'Rouvrir', surAction: () => { activer(m); rendre(); } });
}

// ---------------------------------------------------------------- Personnalisation et Paramètres
/** Change la présentation : gardée et appliquée tout de suite (la page est redessinée par l'appelant). */
function changerPerso(patch) {
  const p = enregistrerPerso({ ...lirePerso(), ...patch });
  appliquerPerso(p);
  refreshHoverGlow();
  appliquer3d(); // la sélection 3D suit la couleur d'accent
  return p;
}

async function importerFond(fichier) {
  try {
    const url = await reduireImage(fichier);
    if (!garderImage(url)) { toast('Stockage du navigateur plein : impossible de garder cette image.', { erreur: true, duree: 6000 }); return; }
    changerPerso({ fond: 'perso' });
    if (etat.page === 'personnalisation') { etat.famillesFonds = 'mien'; rendre(); }
    toast('Fond d’écran mis à jour.');
  } catch (e) {
    toast(e.message || 'Image illisible.', { erreur: true, duree: 6000 });
  }
}

let installation = null; // proposition d'installation du navigateur (Chrome, Edge), gardée pour le bouton « Installer »
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installation = e; if (etat.page === 'parametres') rendre(); });
window.addEventListener('appinstalled', () => { installation = null; if (etat.page === 'parametres') rendre(); });
async function installer() {
  if (!installation) return;
  installation.prompt();
  await installation.userChoice.catch(() => null);
  installation = null;
  if (etat.page === 'parametres') rendre();
}

function infosReglages() {
  return { nbAnalyses: etat.recents.length, version: document.querySelector('meta[name="app-version"]')?.content ?? '', installable: !!installation };
}

/** Place utilisée par l'appli dans ce navigateur (mesurée par le navigateur, après l'affichage de la page). */
async function majPlace() {
  let usage = null;
  try { usage = (await navigator.storage?.estimate?.())?.usage ?? null; } catch { /* mesure non disponible */ }
  const el = $('reg-place');
  if (el && usage) el.textContent = `${pluriel(etat.recents.length, 'analyse gardée', 'analyses gardées')} · ${taille(usage)} utilisés par l’appli, fichiers hors connexion compris`;
}

async function toutEffacer() {
  const liste = await stockage.lister();
  if (!liste.length) return;
  const copies = [];
  for (const r of liste) copies.push([await stockage.lire(r.cle), await stockage.lireGeometrie(r.cle)]);
  for (const r of liste) await stockage.supprimer(r.cle);
  await rafraichirRecents();
  rendre();
  toast(`${pluriel(liste.length, 'analyse effacée', 'analyses effacées')} de ce navigateur.`, {
    action: 'Annuler',
    duree: 8000,
    surAction: async () => {
      for (const [a, g] of copies) {
        if (!a) continue;
        await stockage.enregistrer(a);
        if (g) await stockage.enregistrerGeometrie(a.cle, g);
      }
      await rafraichirRecents();
      rendre();
    },
  });
}

/** Pose une question à l'assistant : la réponse est calculée sur la maquette affichée. */
function demander(question) {
  const actif = etat.modeles.get(etat.actif);
  const q = String(question ?? '').trim();
  if (!actif || !q) return;
  if (etat.assistant.cle !== actif.cle) etat.assistant = { cle: actif.cle, messages: [] };
  const fil = etat.assistant.messages;
  fil.push({ de: 'moi', texte: q }, { de: 'bot', reponse: repondre(q, actif.modele) });
  if (fil.length > 40) fil.splice(0, fil.length - 40);
  if (etat.page !== 'accueil') etat.page = 'accueil';
  if ($('chat-saisie')) $('chat-saisie').value = ''; // la question part : la zone de saisie se vide
  rendre({ focus: 'chat-saisie' });
}

/** Ouvre une page de métré avec les filtres d'une réponse de l'assistant (statut, niveaux, type sélectionné). */
function ouvrirVue({ page, famille, statut, niveaux, type }) {
  const p = PAGES.find((x) => x.id === page);
  if (!p) return;
  etat.filtres[p.id] = { ...(etat.filtres[p.id] ?? {}), onglet: famille, statut: statut || 'tous', niveaux: niveaux ? niveaux.split('|') : [], texte: '', selection: type || null };
  aller(p.id);
}

/** Catégorie de la page Paramètres (sommaire de gauche). */
function choisirOnglet(cle) {
  etat.ongletReglages = cle;
  memoriserOnglet(cle);
}

// ---------------------------------------------------------------- Actions des pages de métré
function exporter() {
  const page = pageCourante();
  const { config, groupe, actif } = donneesPage(etat, page);
  const blob = new Blob([versCsv(config, groupe, lireReglages().csv)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${actif.nom.replace(/\.ifc$/i, '')} - ${config.libelle}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Tableau « ${config.libelle} » exporté.`);
}

async function copier() {
  const page = pageCourante();
  const { config, groupe, f } = donneesPage(etat, page);
  const l = groupe.lignes.find((x) => x.type === f.selection);
  if (!l) return;
  try {
    await navigator.clipboard.writeText(ligneTexte(config, l, lireReglages().csv));
    toast(`« ${l.type} » copié : colle-le dans Excel.`);
  } catch {
    toast('Copie refusée par le navigateur.', { erreur: true });
  }
}

function basculerTheme() {
  const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('ifc-analyzer.theme', t); } catch { /* ignore */ }
  rendreTheme();
  appliquerPerso(); // la couleur d'accent a une variante par thème
  if (etat.page === 'personnalisation') rendre(); // « Assombrissement » devient « Éclaircissement »
}

/** Ouvre la page de métré d'un type, filtres effacés, type sélectionné. */
function ouvrirMetre(famille, type) {
  const page = pageDeFamille(famille);
  etat.filtres[page.id] = { ...(etat.filtres[page.id] ?? {}), onglet: famille, statut: 'tous', niveaux: [], texte: '', selection: type };
  aller(page.id);
}

function executer(faire, cible = null) {
  const page = pageCourante();
  const f = page && etat.modeles.get(etat.actif) ? filtresDe(etat, page) : null;
  const v = etat.v3d;
  switch (faire.action) {
    case 'page': return aller(faire.page);
    case 'ouvrir-fichier': return $('choix-fichier').click();
    case 'exemple': return ouvrirExemple();
    case 'theme': return basculerTheme();
    case 'recent': return ouvrirRecent(faire.cle);
    case 'oublier': return oublier(faire.cle);
    case 'fichier': if (etat.modeles.has(faire.cle)) { activer(etat.modeles.get(faire.cle)); rendre(); } return;
    case 'fermer-fichier': return fermer(faire.cle);
    case 'type': return ouvrirMetre(faire.famille, faire.type); // depuis la recherche
    // --- Assistant de l'accueil
    case 'question': return demander(faire.valeur);
    case 'metre-vue': return ouvrirVue(faire);
    case 'assistant': // depuis la recherche Ctrl K
      if (etat.page !== 'accueil') aller('accueil');
      return $('chat-saisie')?.focus();
    // --- Maquette 3D
    case 'voir-3d':
      if (!f?.selection) return;
      v.selection = { famille: f.onglet, type: f.selection, element: null };
      v.cadrerSelection = true;
      return aller('3d');
    case 'metre-type': return v.selection && ouvrirMetre(v.selection.famille, v.selection.type);
    case 'effacer-selection': v.selection = null; break;
    case 'cadrer-selection': return visionneuse?.cadrer(idsSelection());
    case 'cadrer': return visionneuse?.cadrer();
    case 'vue-dessus': return visionneuse?.vueDessus();
    case 'niveau-3d':
      v.niveaux = !faire.valeur ? [] : v.niveaux.includes(faire.valeur) ? v.niveaux.filter((n) => n !== faire.valeur) : [...v.niveaux, faire.valeur];
      break;
    case 'famille-3d':
      v.masquees = v.masquees.includes(faire.famille) ? v.masquees.filter((x) => x !== faire.famille) : [...v.masquees, faire.famille];
      break;
    // --- Personnalisation
    case 'fond-famille': etat.famillesFonds = faire.valeur; break;
    case 'fond': changerPerso({ fond: faire.valeur }); break;
    case 'fond-importer': return $('choix-fond').click();
    case 'accent': changerPerso({ accent: faire.valeur === ACCENTS[0].hex ? null : faire.valeur }); break;
    case 'survol': changerPerso({ survol: faire.valeur }); break;
    case 'couleur-survol': changerPerso({ couleurSurvol: faire.valeur || null }); break;
    case 'perso-reinit': {
      const avant = lirePerso();
      changerPerso({ flou: PERSO_DEFAUTS.flou, voile: PERSO_DEFAUTS.voile, panneaux: PERSO_DEFAUTS.panneaux });
      toast('Effets d’origine rétablis.', { action: 'Annuler', surAction: () => { changerPerso(avant); rendre(); } });
      break;
    }
    // --- Paramètres
    case 'reglages-onglet': choisirOnglet(faire.valeur); break;
    case 'tout-effacer': return toutEffacer();
    case 'installer': return installer();
    default:
      if (!f) return;
      switch (faire.action) {
        case 'onglet': f.onglet = faire.famille; f.selection = null; f.tri = null; break;
        case 'statut': f.statut = faire.valeur; break;
        case 'niveau':
          if (!faire.valeur) f.niveaux = [];
          else f.niveaux = f.niveaux.includes(faire.valeur) ? f.niveaux.filter((n) => n !== faire.valeur) : [...f.niveaux, faire.valeur];
          break;
        case 'selection': f.selection = faire.type; break;
        case 'tri': f.tri = f.tri?.cle === faire.cle ? (f.tri.sens === -1 ? { cle: faire.cle, sens: 1 } : null) : { cle: faire.cle, sens: faire.cle === 'type' ? 1 : -1 }; break;
        case 'reinit': Object.assign(f, { statut: 'tous', niveaux: [], texte: '' }); break;
        case 'exporter': return exporter();
        case 'copier': return copier();
        default: return;
      }
  }
  rendre();
  refocaliser(cible);
}

/** Après un nouveau rendu, le focus clavier revient sur le bouton équivalent à celui qui vient d'être utilisé. */
function refocaliser(cible) {
  if (!cible || cible.tagName !== 'BUTTON' || (document.activeElement && document.activeElement !== document.body)) return;
  const sel = `button${['action', 'valeur', 'famille', 'cle', 'type', 'page']
    .filter((k) => cible.dataset[k] != null).map((k) => `[data-${k}="${CSS.escape(cible.dataset[k])}"]`).join('')}`;
  document.querySelector(sel)?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- Événements
document.addEventListener('click', (e) => {
  const cible = e.target.closest('[data-action]');
  if (!cible || cible.disabled) return;
  if (cible.tagName === 'TR' && e.target.closest('button')) return; // le bouton de la ligne s'en charge
  e.preventDefault();
  executer({ ...cible.dataset }, cible);
});
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.ouvrir(); }
  else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('choix-fichier').click(); }
  else if (e.key === 'Escape' && etat.page === '3d' && etat.v3d.selection && !$('palette').open) { etat.v3d.selection = null; rendre(); }
  else if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && e.target.closest?.('#set-nav')) {
    // Sommaire des paramètres : flèches, Début et Fin (comme des onglets)
    e.preventDefault();
    const cles = ONGLETS.map(([k]) => k);
    const i = { Home: 0, End: cles.length - 1 }[e.key] ?? cles.indexOf(etat.ongletReglages) + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1);
    choisirOnglet(cles[(i + cles.length) % cles.length]);
    rendre();
    $(`onglet-${etat.ongletReglages}`)?.focus();
  }
});
const EFFETS = { 'perso-flou': 'flou', 'perso-voile': 'voile', 'perso-panneaux': 'panneaux' };
vue.addEventListener('input', (e) => {
  // Effets de la page Personnalisation : appliqués pendant qu'on fait glisser, sans redessiner la page
  const effet = EFFETS[e.target.id];
  if (effet) {
    const p = enregistrerPerso({ ...lirePerso(), [effet]: Number(e.target.value) });
    appliquerPerso(p);
    $(`${e.target.id}-v`).textContent = textesEffets(p, document.documentElement.dataset.theme === 'light')[effet];
    return undefined;
  }
  // Couleurs libres : aperçu en direct, gardées à la fermeture du sélecteur (événement « change »)
  if (e.target.id === 'accent-perso') return appliquerPerso({ ...lirePerso(), accent: e.target.value });
  if (e.target.id === 'survol-perso') return appliquerPerso({ ...lirePerso(), couleurSurvol: e.target.value });
  if (e.target.id === 'coupe-3d') { // coupe : la vue suit le curseur sans redessiner la page
    etat.v3d.coupe = Number(e.target.value);
    $('coupe-valeur').textContent = etat.v3d.coupe >= 1 ? 'aucune' : `${Math.round(etat.v3d.coupe * 100)} %`;
    return appliquer3d();
  }
  if (e.target.id !== 'filtre-texte') return;
  const page = pageCourante();
  if (!page) return;
  filtresDe(etat, page).texte = e.target.value;
  rendre({ focus: 'filtre-texte' });
});
vue.addEventListener('submit', (e) => {
  if (e.target.id !== 'chat-form') return;
  e.preventDefault();
  demander($('chat-saisie').value);
});
vue.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'accent-perso') { changerPerso({ accent: t.value.toLowerCase() }); return rendre({ focus: t.id }); }
  if (t.id === 'survol-perso') { changerPerso({ couleurSurvol: t.value.toLowerCase() }); return rendre({ focus: t.id }); }
  if (t.dataset.reglage) changerReglage(t.dataset.reglage, t.type === 'checkbox' ? t.checked : t.value);
  return undefined;
});
$('choix-fond').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (f) importerFond(f);
});
$('choix-fichier').addEventListener('change', (e) => {
  const fichiers = [...e.target.files];
  e.target.value = '';
  analyserFichiers(fichiers);
});
$('btn-recherche').addEventListener('click', () => palette.ouvrir());
$('btn-theme').addEventListener('click', basculerTheme);
window.addEventListener('popstate', () => aller(location.hash.replace(/^#\/?/, '') || 'accueil', { historique: false }));

// Glisser-déposer d'un fichier n'importe où dans la fenêtre
let profondeur = 0;
const avecFichiers = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (!avecFichiers(e)) return; e.preventDefault(); profondeur++; $('depot').hidden = false; document.body.classList.add('drag'); });
window.addEventListener('dragover', (e) => { if (avecFichiers(e)) e.preventDefault(); });
window.addEventListener('dragleave', (e) => { if (!avecFichiers(e)) return; if (--profondeur <= 0) { profondeur = 0; $('depot').hidden = true; document.body.classList.remove('drag'); } });
window.addEventListener('drop', (e) => {
  if (!avecFichiers(e)) return;
  e.preventDefault();
  profondeur = 0;
  $('depot').hidden = true;
  document.body.classList.remove('drag');
  analyserFichiers([...e.dataTransfer.files]);
});

// ---------------------------------------------------------------- Démarrage
const palette = initPalette(etat, (faire) => executer(faire));

async function demarrer() {
  appliquerPerso();
  appliquerReglages();
  rendreTheme();
  etat.page = location.hash.replace(/^#\/?/, '') || 'accueil';
  if (!pageValide(etat.page)) etat.page = 'accueil';
  // Fichiers ouverts lors de la dernière visite : retrouvés depuis la mémoire du navigateur
  const session = lireReglages().session ? stockage.sessionMemorisee() : { cles: [], actif: null };
  for (const cle of session.cles ?? []) {
    const a = await stockage.lire(cle);
    if (a?.modele) etat.modeles.set(cle, a);
  }
  etat.actif = etat.modeles.has(session.actif) ? session.actif : [...etat.modeles.keys()].pop() ?? null;
  await rafraichirRecents();
  rendre({ anim: true });
  initHoverGlow();
  document.documentElement.dataset.pret = '1';
}
demarrer();
