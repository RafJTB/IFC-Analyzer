// Point d'entrée : état de l'appli, navigation, ouverture et analyse des fichiers, actions de l'interface.
import { PAGES } from './metre/familles.js';
import { versCsv } from './metre/export.js';
import { vueAccueil } from './ui/accueil.js';
import { couleurDe, donneesPage, filtresDe, ligneTexte, vueFamille } from './ui/page-famille.js';
import { initPalette } from './ui/palette.js';
import { ic } from './ui/icones.js';
import { echapper, nombre, pluriel } from './ui/format.js';
import { toast } from './ui/toast.js';
import * as stockage from './ui/stockage.js';
import { initHoverGlow } from './ui/hover-glow.js';
import { initLiquidTabs } from './ui/liquid-tabs.js';

const EXEMPLE = 'assets/exemple/residence-les-tilleuls.ifc';
const etat = {
  modeles: new Map(), // fichiers ouverts : clé → { cle, nom, taille, date, duree, schema, nbElements, nbNiveaux, modele }
  actif: null,
  recents: [],
  analyse: null, //     analyse en cours : { nom, etape, part }
  page: 'accueil',
  filtres: {}, //       par page : onglet, statut, niveaux, texte, tri, sélection
};
const $ = (id) => document.getElementById(id);
const vue = $('vue');
const pageCourante = () => PAGES.find((p) => p.id === etat.page);

// ---------------------------------------------------------------- Rendu
function rendreNav() {
  const actif = etat.modeles.get(etat.actif);
  const compte = (p) => (actif ? actif.modele.elements.filter((e) => p.familles.includes(e.famille)).length : null);
  const bouton = (id, titre, icone, couleur, n = null) => `
    <button type="button" data-action="page" data-page="${id}" class="${etat.page === id ? 'active' : ''}" ${etat.page === id ? 'aria-current="page"' : ''} style="--c: var(--${couleur})">
      <span class="dot">${ic(icone)}</span>${titre}${n != null ? `<span class="cnt">${nombre(n, 0)}</span>` : ''}</button>`;
  $('nav').innerHTML = `${bouton('accueil', 'Accueil', 'home', 'violet')}<span class="nav-head" aria-hidden="true">Métré</span>${PAGES.map((p) => bouton(p.id, p.titre, p.icone, p.couleur, compte(p))).join('')}`;
}

function rendreFichiers() {
  const onglets = [...etat.modeles.values()].map((m) => `
    <div class="file-tab${m.cle === etat.actif ? ' on' : ''}" style="--c: var(--${couleurDe(m.nom)})">
      <button type="button" class="ft-open" data-action="fichier" data-cle="${echapper(m.cle)}" aria-pressed="${m.cle === etat.actif}" title="${echapper(m.nom)}"><i></i><span>${echapper(m.nom)}</span></button>
      <button type="button" class="ft-close" data-action="fermer-fichier" data-cle="${echapper(m.cle)}" aria-label="Fermer ${echapper(m.nom)}">${ic('fermer')}</button>
    </div>`).join('');
  $('fichiers').innerHTML = `${onglets || '<span class="muted" style="padding:6px 12px;font-size:12px;white-space:nowrap">Aucun fichier ouvert</span>'}
    <button type="button" class="file-add" data-action="ouvrir-fichier" aria-label="Ouvrir un fichier IFC" title="Ouvrir un fichier IFC (Ctrl O)">${ic('plus')}</button>`;
  const actif = etat.modeles.get(etat.actif);
  const carte = $('carte-modele');
  carte.classList.toggle('vide', !actif);
  carte.dataset.action = actif ? 'page' : 'ouvrir-fichier';
  carte.dataset.page = 'accueil';
  carte.innerHTML = actif
    ? `<span class="ic">${ic('cube')}</span><div><b>${echapper(actif.nom)}</b><span>${echapper(actif.schema)} · ${pluriel(actif.nbElements, 'élément')}</span></div>`
    : `<span class="ic">${ic('ouvrir')}</span><div><b>Aucune maquette</b><span>Ouvre un fichier IFC</span></div>`;
}

function rendreTheme() {
  const clair = document.documentElement.dataset.theme === 'light';
  const b = $('btn-theme');
  b.innerHTML = ic(clair ? 'lune' : 'soleil');
  b.setAttribute('aria-label', clair ? 'Passer en thème sombre' : 'Passer en thème clair');
  b.title = b.getAttribute('aria-label');
}

/** Redessine la page. *anim* : animation d'arrivée (changement de page). Les défilements sont conservés. */
function rendre({ anim = false, focus = null } = {}) {
  const defil = [...document.querySelectorAll('.view, .table-scroll, .side-panel')].map((e) => [e.className, e.scrollTop]);
  const page = pageCourante();
  vue.innerHTML = page ? vueFamille(page, etat) : vueAccueil(etat);
  document.title = `${page ? `${page.titre} · ` : ''}IFC Analyzer by RJB`;
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
  if (focus) {
    const champ = $(focus);
    if (champ) { champ.focus(); const n = champ.value.length; champ.setSelectionRange?.(n, n); }
  }
}

function aller(page, { historique = true } = {}) {
  etat.page = PAGES.some((p) => p.id === page) ? page : 'accueil';
  if (historique) {
    const h = etat.page === 'accueil' ? '#/' : `#/${etat.page}`;
    if (location.hash !== h) history.pushState(null, '', h);
  }
  rendre({ anim: true });
  vue.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- Fichiers et analyses
function activer(entree) {
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
  if (etat.modeles.has(cle)) { activer(etat.modeles.get(cle)); rendre(); toast(`${fichier.name} est déjà ouvert.`); return; }
  const deja = await stockage.lire(cle);
  if (deja?.modele) { activer(deja); rendre(); toast(`${fichier.name} : analyse retrouvée, sans recalcul.`); return; }

  etat.analyse = { nom: fichier.name, etape: 'Lecture du fichier', part: 0 };
  if (etat.page !== 'accueil') aller('accueil'); else rendre();
  const debut = Date.now();
  try {
    const octets = await fichier.arrayBuffer();
    const { modele, duree } = await analyserDansWorker(octets);
    const entree = { cle, nom: fichier.name, taille: fichier.size, date: Date.now(), duree: duree ?? Date.now() - debut,
      schema: modele.schema, nbElements: modele.elements.length, nbNiveaux: modele.niveaux.length, modele };
    etat.analyse = null;
    activer(entree);
    await stockage.enregistrer(entree);
    await rafraichirRecents();
    rendre();
    toast(`${fichier.name} analysé : ${pluriel(entree.nbElements, 'élément métré', 'éléments métrés')}.`);
  } catch (e) {
    etat.analyse = null;
    rendre();
    toast(`Analyse impossible : ${e.message || e}`, { erreur: true, duree: 9000 });
  }
}

function analyserDansWorker(octets) {
  return new Promise((ok, ko) => {
    const w = new Worker(new URL('./ifc/worker.js', import.meta.url), { type: 'module' });
    const fin = () => w.terminate();
    w.onmessage = ({ data }) => {
      if (data.type === 'progression') return progression(data);
      fin();
      if (data.type === 'resultat') ok(data);
      else ko(new Error(data.message));
    };
    w.onerror = (e) => { fin(); ko(new Error(e.message || 'le moteur IFC n’a pas pu démarrer')); };
    w.postMessage({ octets }, [octets]);
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
  await stockage.supprimer(cle);
  await rafraichirRecents();
  rendre();
  toast(`« ${a.nom} » retiré des analyses récentes.`, { action: 'Annuler', surAction: async () => { await stockage.enregistrer(a); await rafraichirRecents(); rendre(); } });
}

function fermer(cle) {
  const m = etat.modeles.get(cle);
  etat.modeles.delete(cle);
  if (etat.actif === cle) etat.actif = [...etat.modeles.keys()].pop() ?? null;
  stockage.memoriserSession([...etat.modeles.keys()], etat.actif);
  rendre();
  if (m) toast(`${m.nom} fermé (il reste dans les analyses récentes).`, { action: 'Rouvrir', surAction: () => { activer(m); rendre(); } });
}

// ---------------------------------------------------------------- Actions des pages de métré
function exporter() {
  const page = pageCourante();
  const { config, groupe, actif } = donneesPage(etat, page);
  const blob = new Blob([versCsv(config, groupe)], { type: 'text/csv;charset=utf-8' });
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
    await navigator.clipboard.writeText(ligneTexte(config, l));
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
}

function executer(faire, cible = null) {
  const page = pageCourante();
  const f = page && etat.modeles.get(etat.actif) ? filtresDe(etat, page) : null;
  switch (faire.action) {
    case 'page': return aller(faire.page);
    case 'ouvrir-fichier': return $('choix-fichier').click();
    case 'exemple': return ouvrirExemple();
    case 'theme': return basculerTheme();
    case 'recent': return ouvrirRecent(faire.cle);
    case 'oublier': return oublier(faire.cle);
    case 'fichier': if (etat.modeles.has(faire.cle)) { activer(etat.modeles.get(faire.cle)); rendre(); } return;
    case 'fermer-fichier': return fermer(faire.cle);
    case 'type': // depuis la recherche : on ouvre la bonne page, filtres effacés, type sélectionné
      etat.filtres[faire.page] = { ...(etat.filtres[faire.page] ?? {}), onglet: faire.famille, statut: 'tous', niveaux: [], texte: '', selection: faire.type };
      return aller(faire.page);
    default: break;
  }
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
  else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.dropzone')) { e.preventDefault(); $('choix-fichier').click(); }
});
vue.addEventListener('input', (e) => {
  if (e.target.id !== 'filtre-texte') return;
  const page = pageCourante();
  if (!page) return;
  filtresDe(etat, page).texte = e.target.value;
  rendre({ focus: 'filtre-texte' });
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
  rendreTheme();
  etat.page = location.hash.replace(/^#\/?/, '') || 'accueil';
  if (!PAGES.some((p) => p.id === etat.page)) etat.page = 'accueil';
  // Fichiers ouverts lors de la dernière visite : retrouvés depuis la mémoire du navigateur
  const session = stockage.sessionMemorisee();
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
