// Page Paramètres (même présentation que Transcripteur IA) : sommaire des catégories à gauche, une catégorie à droite.
import { pluriel } from './format.js';
import { ic } from './icones.js';

/** Catégories, dans l'ordre du sommaire : [clé, titre, icône, couleur]. */
export const ONGLETS = [
  ['analyse', 'Analyse IFC', 'cube', 'violet'],
  ['export', 'Export', 'tableur', 'vert'],
  ['affichage', 'Affichage', 'palette', 'ambre'],
  ['stockage', 'Stockage et confidentialité', 'stockage', 'cyan'],
  ['apropos', 'À propos', 'info', 'gris'],
];

const interrupteur = (cle, actif, icone, titre, aide) => `
  <label class="set-row"><span class="set-ic">${ic(icone)}</span><span class="set-txt"><b>${titre}</b><small>${aide}</small></span>
    <span class="switch"><input type="checkbox" data-reglage="${cle}"${actif ? ' checked' : ''} /><span class="track"></span></span></label>`;
const ligne = (icone, titre, aide, droite = '') => `
  <div class="set-row"><span class="set-ic">${ic(icone)}</span><span class="set-txt"><b>${titre}</b><small>${aide}</small></span>${droite}</div>`;

function contenu(cle, r, infos) {
  switch (cle) {
    case 'analyse':
      return `<p class="set-lead">Ce qui est calculé à l’ouverture d’un fichier IFC, et ce qui est retrouvé à la visite suivante.</p>
        <div class="set-group">
          ${interrupteur('prepa3d', r.prepa3d, 'cube', 'Préparer la maquette 3D', 'Après le métré, la 3D est calculée et gardée avec l’analyse. À couper pour une très grosse maquette : l’analyse est plus rapide et prend moins de place.')}
          ${interrupteur('session', r.session, 'session', 'Rouvrir les fichiers à la prochaine visite', 'Les maquettes ouvertes reviennent en onglets quand tu reviens sur l’appli.')}
        </div>
        <p class="set-note">Le métré ne change pas : il est toujours calculé en entier. Une maquette analysée sans 3D peut être rouverte plus tard pour la préparer.</p>`;
    case 'export':
      return `<p class="set-lead">Format des tableaux exportés et des lignes copiées pour un tableur.</p>
        <div class="set-group">
          ${ligne('tableur', 'Format du tableur', 'Excel en français : point-virgule et virgule décimale. Excel en anglais ou Google Sheets : virgule et point décimal. Vaut pour « Exporter en CSV » et « Copier la ligne pour Excel ».',
            `<select class="select" data-reglage="csv" aria-label="Format du tableur">
              <option value="fr"${r.csv === 'fr' ? ' selected' : ''}>Excel en français (recommandé)</option>
              <option value="en"${r.csv === 'en' ? ' selected' : ''}>Excel en anglais, Google Sheets</option></select>`)}
        </div>`;
    case 'affichage':
      return `<div class="set-group">
          ${interrupteur('animations', r.animations, 'animation', 'Animations', 'Fondu à l’ouverture des pages, verre liquide des onglets. Elles sont aussi coupées si l’ordinateur demande moins d’animations.')}
          <button type="button" class="set-row set-link" data-action="page" data-page="personnalisation"><span class="set-ic">${ic('palette')}</span>
            <span class="set-txt"><b>Fond d’écran, couleur, flou</b><small>Dans la page Personnalisation</small></span><span class="set-go">Ouvrir${ic('chevron')}</span></button>
        </div>
        <p class="set-note">Le thème clair ou sombre se change avec le bouton soleil / lune, en haut à droite.</p>`;
    case 'stockage':
      return `<div class="set-group">
          ${ligne('stockage', 'Place utilisée dans ce navigateur', `<span id="reg-place">${pluriel(infos.nbAnalyses, 'analyse gardée', 'analyses gardées')}</span>`)}
          ${ligne('poubelle', 'Effacer toutes les analyses', 'Quantités et 3D de tous les fichiers analysés. Les fichiers ouverts restent affichés jusqu’à leur fermeture.',
            `<button type="button" class="btn sm danger" data-action="tout-effacer"${infos.nbAnalyses ? '' : ' disabled'}>Tout effacer</button>`)}
        </div>
        <p class="set-note">Le fichier IFC n’est jamais envoyé ni gardé : il est lu sur ce PC, puis seules ses quantités et sa 3D calculée sont gardées, dans ce navigateur.</p>`;
    default:
      return `<div class="set-group">
          ${ligne('info', 'IFC Analyzer by RJB', `Version ${infos.version} · web-ifc 0.0.78 (MPL-2.0) · three.js 0.187.0 (MIT) · Analyse 100 % locale`)}
          ${infos.installable ? ligne('installer', 'Installer l’application', 'Sur cet appareil, comme une appli : elle s’ouvre aussi sans connexion.', '<button type="button" class="btn sm" data-action="installer">Installer</button>') : ''}
          ${ligne('clavier', 'Raccourcis clavier', '<kbd>Ctrl</kbd> + <kbd>K</kbd> rechercher · <kbd>Ctrl</kbd> + <kbd>O</kbd> ouvrir un fichier · <kbd>Échap</kbd> fermer, désélectionner en 3D')}
          <a class="set-row set-link" href="https://github.com/RafJTB/IFC-Analyzer" target="_blank" rel="noopener"><span class="set-ic">${ic('code')}</span>
            <span class="set-txt"><b>Code source</b><small>GitHub</small></span><span class="set-go">Ouvrir${ic('externe')}</span></a>
        </div>`;
  }
}

/**
 * @param {string} onglet  catégorie affichée
 * @param {object} r       paramètres (reglages.js)
 * @param {{ nbAnalyses: number, version: string, installable: boolean }} infos
 */
export function vueReglages(onglet, r, infos) {
  const sommaire = ONGLETS.map(([cle, titre, icone, couleur]) => `
    <button type="button" role="tab" id="onglet-${cle}" aria-controls="rubrique-${cle}" aria-selected="${cle === onglet}" tabindex="${cle === onglet ? 0 : -1}"
      class="${cle === onglet ? 'on' : ''}" data-action="reglages-onglet" data-valeur="${cle}" style="--c: var(--${couleur})"><span class="sq">${ic(icone)}</span><span class="nm">${titre}</span></button>`).join('');
  const rubriques = ONGLETS.map(([cle, titre, icone, couleur]) => `
    <section class="set-sec" id="rubrique-${cle}" role="tabpanel" aria-labelledby="onglet-${cle}" style="--c: var(--${couleur})"${cle === onglet ? '' : ' hidden'}>
      <h3><span class="sq">${ic(icone)}</span>${titre}</h3>${cle === onglet ? contenu(cle, r, infos) : ''}</section>`).join('');
  return `<div class="home-head"><h2>Paramètres</h2><p>Analyse, export, affichage et stockage. Les réglages restent dans ce navigateur.</p></div>
    <div class="set-layout">
      <nav class="set-nav" id="set-nav" role="tablist" aria-orientation="vertical" aria-label="Catégories de paramètres">${sommaire}</nav>
      <div class="set-main">${rubriques}</div>
    </div>`;
}
