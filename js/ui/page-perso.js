// Page Personnalisation (identique à celle de Transcripteur IA) : fond d'écran, couleur d'accent, survol des blocs, effets.
import { echapper } from './format.js';
import { ic } from './icones.js';
import { ACCENTS, FAMILLES_FONDS, FONDS, estHex, lirePerso, opacitePanneaux, variablesAccent } from './perso.js';

const pastille = ({ action, valeur, libelle, actif, a, b, classe = '' }) => `
  <button type="button" class="acc-sw${classe}${actif ? ' active' : ''}" data-action="${action}" data-valeur="${valeur}" title="${echapper(libelle)}" aria-label="${echapper(libelle)}" aria-pressed="${actif}"${a ? ` style="--a:${a};--b:${b}"` : ''}><i></i></button>`;
const couleurDe = (hex) => `rgb(${variablesAccent(hex).dark['--sel-a']})`;

function fonds(p, famille, image) {
  const familles = [['tous', 'Tous'], ...FAMILLES_FONDS, ['mien', 'Ton image']];
  const nb = (k) => (k === 'tous' ? FONDS.length : k === 'mien' ? '' : FONDS.filter((f) => f.cat === k).length);
  const onglets = familles.map(([k, libelle]) => `<button type="button" class="bg-cat${famille === k ? ' on' : ''}" data-action="fond-famille" data-valeur="${k}" aria-pressed="${famille === k}">${libelle}${nb(k) !== '' ? `<small>${nb(k)}</small>` : ''}</button>`).join('');
  const apercu = (f) => (f.id === 'uni' ? '' : f.mini ? `background-image:url('${f.mini}')` : `background:${f.css};background-size:cover;background-position:center`);
  const tuile = (f) => `<button type="button" class="bg-tile${p.fond === f.id ? ' active' : ''}" data-action="fond" data-valeur="${f.id}" aria-pressed="${p.fond === f.id}"><span class="sw${f.id === 'uni' ? ' uni' : ''}" style="${apercu(f)}"></span>${f.libelle}</button>`;
  const visibles = famille === 'mien' ? [] : FONDS.filter((f) => famille === 'tous' || f.cat === famille);
  const avecImage = famille === 'tous' || famille === 'mien';
  const sienne = image ? `<button type="button" class="bg-tile${p.fond === 'perso' ? ' active' : ''}" data-action="fond" data-valeur="perso" aria-pressed="${p.fond === 'perso'}"><span class="sw perso"></span>Ton image</button>` : '';
  const importer = `<button type="button" class="bg-tile" data-action="fond-importer"><span class="sw add">${ic('plus')}</span>${image ? 'Changer d’image' : 'Importer une image'}</button>`;
  return `<section class="card dash-card" aria-labelledby="h-fond">
    <header class="dash-head"><h3 id="h-fond">Fond d’écran</h3><span class="dash-sub">${FONDS.length} fonds</span></header>
    <div class="bg-cats" id="bg-cats" role="group" aria-label="Familles de fonds">${onglets}</div>
    <div class="bg-grid">${visibles.map(tuile).join('')}${avecImage ? sienne + importer : ''}</div>
  </section>`;
}

function accent(p) {
  const actuel = (estHex(p.accent) ? p.accent : ACCENTS[0].hex).toLowerCase();
  const connu = ACCENTS.find((a) => a.hex === actuel);
  return `<section class="card dash-card" aria-labelledby="h-accent">
    <header class="dash-head"><h3 id="h-accent">Couleur d’accent</h3></header>
    <div class="accent-row">${ACCENTS.map((a) => pastille({ action: 'accent', valeur: a.hex, libelle: a.libelle, actif: a.hex === actuel, a: couleurDe(a.hex), b: a.hex })).join('')}
      <label class="acc-sw custom${connu ? '' : ' active'}" title="Couleur personnalisée"><i></i><input type="color" id="accent-perso" value="${actuel}" aria-label="Couleur d’accent personnalisée" /></label>
      <span class="accent-name">${echapper(connu ? connu.libelle : `Personnalisée (${actuel})`)}</span></div>
    <div class="accent-preview" aria-hidden="true"><span class="chip on">Onglet sélectionné <small>3</small></span><span class="btn primary sm">Bouton principal</span><span class="link-btn">Lien</span></div>
  </section>`;
}

function survol(p) {
  const mode = ['all', 'click', 'off'].includes(p.survol) ? p.survol : 'all';
  const auto = !p.couleurSurvol, commeAccent = p.couleurSurvol === 'accent';
  const fixe = estHex(p.couleurSurvol) ? p.couleurSurvol.toLowerCase() : '';
  const connu = ACCENTS.find((a) => a.hex === fixe);
  const acc = (estHex(p.accent) ? p.accent : ACCENTS[0].hex).toLowerCase();
  const modes = [['all', 'Tous les blocs'], ['click', 'Blocs cliquables'], ['off', 'Désactivé']]
    .map(([k, l]) => `<button type="button" data-action="survol" data-valeur="${k}" aria-pressed="${mode === k}">${l}</button>`).join('');
  const nom = auto ? 'Automatique : la couleur du bloc survolé' : commeAccent ? 'Comme la couleur d’accent' : connu ? connu.libelle : `Personnalisée (${fixe})`;
  return `<section class="card dash-card" aria-labelledby="h-survol">
    <header class="dash-head"><h3 id="h-survol">Survol des blocs</h3></header>
    <p class="an-note hover-note">Quand la souris passe sur un bloc, son bord s’allume là où est le curseur.</p>
    <div class="seg hover-seg" role="group" aria-label="Blocs concernés">${modes}</div>
    <div class="accent-row${mode === 'off' ? ' off' : ''}" id="hover-row">
      ${pastille({ action: 'couleur-survol', valeur: '', libelle: 'Automatique : la couleur du bloc survolé', actif: auto, classe: ' auto' })}
      ${pastille({ action: 'couleur-survol', valeur: 'accent', libelle: 'Comme la couleur d’accent', actif: commeAccent, a: couleurDe(acc), b: acc, classe: ' same' })}
      ${ACCENTS.map((a) => pastille({ action: 'couleur-survol', valeur: a.hex, libelle: a.libelle, actif: a.hex === fixe, a: couleurDe(a.hex), b: a.hex })).join('')}
      <label class="acc-sw custom${fixe && !connu ? ' active' : ''}" title="Couleur personnalisée"><i></i><input type="color" id="survol-perso" value="${fixe || acc}" aria-label="Couleur personnalisée du survol" /></label>
      <span class="accent-name">${echapper(nom)}</span></div>
  </section>`;
}

/** Les libellés et valeurs des curseurs, aussi mis à jour pendant qu'on les fait glisser. */
export function textesEffets(p, clair) {
  return {
    flou: `${p.flou} px`,
    voile: `${p.voile} %`,
    voileLibelle: clair ? 'Éclaircissement du fond' : 'Assombrissement du fond',
    panneaux: `${opacitePanneaux(p.panneaux, clair)} %`,
  };
}

function effets(p, clair) {
  const t = textesEffets(p, clair);
  const curseur = (id, libelle, min, max, pas, valeur, sortie) => `
    <label class="perso-row"><span id="${id}-l">${libelle}</span><input type="range" class="range" id="${id}" min="${min}" max="${max}" step="${pas}" value="${valeur}" /><output id="${id}-v" for="${id}">${sortie}</output></label>`;
  return `<section class="card dash-card" aria-labelledby="h-effets">
    <header class="dash-head"><h3 id="h-effets">Effets</h3><button type="button" class="link-btn" data-action="perso-reinit">Réinitialiser</button></header>
    <div class="perso-sliders">
      ${curseur('perso-flou', 'Flou du fond', 0, 40, 1, p.flou, t.flou)}
      ${curseur('perso-voile', t.voileLibelle, 0, 200, 5, p.voile, t.voile)}
      ${curseur('perso-panneaux', 'Opacité des panneaux', 0, 400, 5, p.panneaux, t.panneaux)}
    </div>
    <p class="an-note">Plus le fond est net et contrasté, plus les panneaux doivent être opaques pour que le texte reste lisible.</p>
  </section>`;
}

/**
 * @param {string} famille  famille de fonds affichée (tous, photo, archi…, mien)
 * @param {string} image    l'image importée (data URL), ou rien
 */
export function vuePerso(famille, image) {
  const p = lirePerso();
  const clair = document.documentElement.dataset.theme === 'light';
  return `<div class="home-head"><h2>Personnalisation</h2><p>Fond d’écran, couleur d’accent, flou et transparence. Les changements s’appliquent tout de suite et restent dans ce navigateur.</p></div>
    ${fonds(p, famille, image)}${accent(p)}${survol(p)}${effets(p, clair)}`;
}
