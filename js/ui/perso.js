// Personnalisation (reprise de Transcripteur IA) : fond d'écran, couleur d'accent, survol des blocs, flou, voile, opacité.
// Réglages gardés dans ce navigateur (localStorage) ; l'image importée est réduite avant d'être gardée.
// js/boot.js applique les mêmes réglages dès le chargement, avant l'affichage (pas de flash).

const CLE = 'ifc-analyzer.perso';
const CLE_IMAGE = 'ifc-analyzer.perso.image';

const img = (id, libelle, cat) => ({ id, libelle, cat, css: `url('assets/fonds/${id}.webp')`, mini: `assets/fonds/${id}-mini.webp` });

/** Familles du catalogue, dans l'ordre d'affichage. */
export const FAMILLES_FONDS = [['photo', 'Photo'], ['archi', 'Architecture'], ['nature', 'Nature'], ['abstrait', 'Abstrait'], ['degrade', 'Dégradés']];

export const FONDS = [
  img('maquette-filaire', 'Maquette 3D', 'archi'),
  img('plan-architecte', 'Plan d’architecte', 'archi'),
  img('ville-nuit', 'Ville la nuit', 'archi'),
  img('beton-lumiere', 'Béton et lumière', 'archi'),
  img('salon-violet', 'Salon violet', 'photo'),
  img('aurore-boreale', 'Aurore boréale', 'nature'),
  img('dunes', 'Dunes', 'nature'),
  img('montagnes-brume', 'Montagnes', 'nature'),
  img('ocean-profond', 'Océan profond', 'nature'),
  img('topographie', 'Courbes de niveau', 'nature'),
  img('nebuleuse', 'Nébuleuse', 'abstrait'),
  img('soie', 'Soie', 'abstrait'),
  img('bokeh', 'Bokeh', 'abstrait'),
  { id: 'aurore', cat: 'degrade', libelle: 'Aurore', css: 'radial-gradient(at 18% 22%, #7c3aed 0, transparent 52%), radial-gradient(at 82% 28%, #db2777 0, transparent 46%), radial-gradient(at 50% 92%, #2563eb 0, transparent 56%), #1e1b4b' },
  { id: 'ocean', cat: 'degrade', libelle: 'Océan', css: 'radial-gradient(at 15% 25%, #0284c7 0, transparent 52%), radial-gradient(at 85% 72%, #4f46e5 0, transparent 52%), radial-gradient(at 60% 10%, #0d9488 0, transparent 40%), #0b1e3f' },
  { id: 'foret', cat: 'degrade', libelle: 'Forêt', css: 'radial-gradient(at 25% 30%, #059669 0, transparent 50%), radial-gradient(at 80% 80%, #0f766e 0, transparent 55%), radial-gradient(at 75% 15%, #4d7c0f 0, transparent 40%), #062a23' },
  { id: 'crepuscule', cat: 'degrade', libelle: 'Crépuscule', css: 'radial-gradient(at 20% 85%, #ea580c 0, transparent 50%), radial-gradient(at 80% 20%, #9333ea 0, transparent 55%), radial-gradient(at 50% 50%, #be185d 0, transparent 45%), #2a1235' },
  { id: 'graphite', cat: 'degrade', libelle: 'Graphite', css: 'radial-gradient(at 30% 20%, #475569 0, transparent 55%), radial-gradient(at 80% 85%, #312e81 0, transparent 55%), #0f1117' },
  { id: 'uni', cat: 'degrade', libelle: 'Uni', css: 'none' },
];

/** Réglages d'origine : le fond « Maquette 3D » de la version précédente, rien d'autre de changé. */
export const DEFAUTS = { fond: 'maquette-filaire', flou: 14, voile: 100, panneaux: 100, accent: null, survol: 'all', couleurSurvol: null };

/** Couleurs d'accent (onglets sélectionnés, boutons, liens, sélection 3D). La première est celle d'origine. */
export const ACCENTS = [
  { id: 'violet', libelle: 'Violet', hex: '#6a58f6' },
  { id: 'indigo', libelle: 'Indigo', hex: '#4f46e5' },
  { id: 'bleu', libelle: 'Bleu', hex: '#2563eb' },
  { id: 'cyan', libelle: 'Cyan', hex: '#0891b2' },
  { id: 'vert', libelle: 'Vert', hex: '#059669' },
  { id: 'ambre', libelle: 'Ambre', hex: '#d97706' },
  { id: 'corail', libelle: 'Corail', hex: '#ea580c' },
  { id: 'rose', libelle: 'Rose', hex: '#db2777' },
  { id: 'rouge', libelle: 'Rouge', hex: '#dc2626' },
  { id: 'graphite', libelle: 'Graphite', hex: '#475569' },
];

const versRgb = (hex) => {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const melange = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const triplet = (c) => c.join(' ');
const hexDe = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
export const estHex = (t) => /^#[0-9a-f]{6}$/i.test(t || '');

/** Variables CSS d'une couleur d'accent, pour le thème sombre et pour le thème clair. */
export function variablesAccent(hex) {
  const base = versRgb(hex);
  const B = [255, 255, 255], N = [0, 0, 0];
  const out = {};
  for (const theme of ['dark', 'light']) {
    const acc = theme === 'dark' ? melange(base, B, 0.3) : melange(base, N, 0.12);
    const acc2 = theme === 'dark' ? base : melange(base, B, 0.15);
    const texte = theme === 'dark' ? melange(base, B, 0.65) : melange(base, N, 0.3);
    out[theme] = {
      '--sel-a': triplet(melange(base, B, 0.25)), '--sel-b': triplet(base),
      '--accent': hexDe(acc), '--accent-rgb': triplet(acc),
      '--accent-2': hexDe(acc2), '--accent-2-rgb': triplet(acc2),
      '--accent-text': hexDe(texte),
    };
  }
  return out;
}
const VARIABLES_ACCENT = ['--sel-a', '--sel-b', '--accent', '--accent-rgb', '--accent-2', '--accent-2-rgb', '--accent-text'];

export function lirePerso() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch { p = {}; }
  return { ...DEFAUTS, ...p };
}

export const fondDe = (id) => FONDS.find((f) => f.id === id) ?? FONDS[0];

/** Enregistre les réglages, avec ce que js/boot.js applique avant l'affichage (fond et couleurs déjà calculés). */
export function enregistrerPerso(p) {
  const complet = { ...p, css: fondDe(p.fond).css, varsAccent: p.accent ? variablesAccent(p.accent) : null };
  try { localStorage.setItem(CLE, JSON.stringify(complet)); } catch { /* stockage plein */ }
  return complet;
}

export function imagePerso() {
  try { return localStorage.getItem(CLE_IMAGE) || ''; } catch { return ''; }
}

/** Garde l'image importée. Renvoie false si le stockage du navigateur est plein. */
export function garderImage(url) {
  try { localStorage.setItem(CLE_IMAGE, url); return true; } catch { return false; }
}

const borne = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));

// Fond déjà posé : une image importée pèse jusqu'à 3 Mo, on ne la repose pas à chaque mouvement d'un curseur
let fondPose = null, imagePosee = null;

/** Applique les réglages à la page (variables CSS sur <html>). */
export function appliquerPerso(p = lirePerso()) {
  const racine = document.documentElement;
  const s = racine.style;
  const image = imagePerso();
  if (image !== imagePosee) { imagePosee = image; s.setProperty('--fond-perso', image ? `url("${image}")` : 'none'); } // aperçu de « Ton image »
  const fond = p.fond === 'perso' && image ? `url("${image}")` : fondDe(p.fond).css;
  if (fond !== fondPose) { fondPose = fond; s.setProperty('--bg-image', fond); }
  s.setProperty('--bg-blur', `${borne(p.flou, 0, 40)}px`);
  s.setProperty('--veil-k', String(borne(p.voile, 0, 200) / 100));
  s.setProperty('--panel-k', String(borne(p.panneaux, 0, 400) / 100));
  // Couleur d'accent, selon le thème affiché (rien = couleurs d'origine de la feuille de style)
  const vars = estHex(p.accent) ? variablesAccent(p.accent)[racine.dataset.theme === 'light' ? 'light' : 'dark'] : null;
  for (const k of VARIABLES_ACCENT) if (vars) s.setProperty(k, vars[k]); else s.removeProperty(k);
  // Lueur au survol : quels blocs, et quelle couleur (automatique = celle du bloc survolé)
  racine.dataset.hover = ['all', 'click', 'off'].includes(p.survol) ? p.survol : 'all';
  racine.dataset.hoverAuto = p.couleurSurvol ? '0' : '1';
  if (estHex(p.couleurSurvol)) s.setProperty('--hover-rgb', triplet(versRgb(p.couleurSurvol)));
  else s.removeProperty('--hover-rgb');
}

/** Opacité réelle des panneaux dans le thème affiché (celle que l'on voit), en %. */
export const opacitePanneaux = (panneaux, clair) => Math.min(100, Math.round((clair ? 28 : 16) * (panneaux / 100)));

/**
 * Réduit une image importée (2048 px au plus, WebP ou JPEG) pour qu'elle tienne dans le stockage du navigateur.
 * @returns {Promise<string>} data URL
 */
export async function reduireImage(fichier, max = 2048) {
  const bmp = await createImageBitmap(fichier);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  for (const q of [0.82, 0.7, 0.55]) {
    let url = c.toDataURL('image/webp', q);
    if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', q);
    if (url.length < 3.2e6) return url;
  }
  throw new Error('Image trop lourde, même réduite. Essaie une image plus petite.');
}
