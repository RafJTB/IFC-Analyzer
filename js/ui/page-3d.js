// Page « Maquette 3D » (maquette B) : vue 3D au centre, sélection et familles à droite.
// La visionneuse elle-même (canvas) est gérée par app.js et posée dans #v3d-hote après chaque rendu.
import { FAMILLES, PAGES } from '../metre/familles.js';
import { regrouper } from '../metre/quantites.js';
import { echapper, nombre, pluriel } from './format.js';
import { ic, illustration } from './icones.js';

const STATUTS = { ext: ['ext', 'Extérieur'], int: ['int', 'Intérieur'], mixte: ['mixte', 'Mixte'] };

/** Familles présentes dans la vue (sous-familles comprises), dans l'ordre des pages. */
const FAMILLES_VUE = PAGES.flatMap((p) => p.familles.map((f) => ({ id: f, libelle: FAMILLES[f].libelle, couleur: p.couleur, icone: p.icone })));

function vide(titre, texte, actions = '') {
  return `<div class="empty"><div class="empty-in">${illustration()}<h3>${titre}</h3><p>${texte}</p>${actions ? `<div class="actions">${actions}</div>` : ''}</div></div>`;
}

/** Ligne de métré du type sélectionné (mêmes chiffres que dans la page de la famille). */
export function ligneSelection(etat) {
  const sel = etat.v3d.selection;
  const actif = etat.modeles.get(etat.actif);
  if (!sel || !actif) return null;
  const { lignes } = regrouper(actif.modele.elements, FAMILLES[sel.famille], { ordreNiveaux: actif.modele.niveaux.map((n) => n.nom) });
  return lignes.find((l) => l.type === sel.type) ?? null;
}

function panneauSelection(etat, l) {
  const sel = etat.v3d.selection;
  const config = FAMILLES[sel.famille];
  const element = sel.element ? etat.modeles.get(etat.actif).modele.elements.find((e) => e.id === sel.element) : null;
  const statut = STATUTS[l.statut];
  const tuiles = config.tuiles.filter((t) => t.cle === 'nombre' || l.sommes[t.cle] != null).slice(0, 4).map((t) => {
    const v = t.cle === 'nombre' ? l.nombre : l.sommes[t.cle];
    return `<div><b>${nombre(v, t.decimales ?? 2)} ${t.unite}</b><span>${t.libelle.toLowerCase()}</span></div>`;
  }).join('');
  const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
  return `
    <div><span class="label">Sélection · ${echapper(config.libelle)}</span><h3>${echapper(l.type)}</h3>
      <div style="margin-top:6px"><span class="badge ${statut ? statut[0] : 'neutre'}">${statut ? `${statut[1]} · ` : ''}${pluriel(l.nombre, config.singulier, config.pluriel)} en surbrillance</span></div></div>
    <div class="mini">${tuiles}</div>
    <div>${kv('Niveaux', echapper(l.niveaux.join(' · ') || '—'))}${kv('Classe IFC', echapper(l.classes.join(', ')))}
      ${element ? `${kv('Niveau de l’élément cliqué', echapper(element.niveau || 'sans niveau'))}${kv('GlobalId', `<span class="mono">${echapper(element.gid)}</span>`)}` : ''}</div>
    <div class="panel-actions">
      <button type="button" class="btn primary" data-action="metre-type">${ic('liste')}Voir le métré de ce type</button>
      <button type="button" class="btn" data-action="cadrer-selection">${ic('cible')}Centrer sur la sélection</button>
      <button type="button" class="btn" data-action="effacer-selection">${ic('fermer')}Effacer la sélection</button>
    </div>`;
}

function panneauFamilles(etat, actif) {
  const els = actif.modele.elements;
  const masquees = etat.v3d.masquees;
  const lignes = FAMILLES_VUE.map((f) => {
    const n = els.filter((e) => e.famille === f.id).length;
    if (!n) return '';
    const cache = masquees.includes(f.id);
    return `<button type="button" class="frow${cache ? ' cache' : ''}" data-action="famille-3d" data-famille="${f.id}" aria-pressed="${!cache}" style="--c: var(--${f.couleur})">
      <i></i><span>${f.libelle}</span><b class="num">${nombre(n, 0)}</b>${ic(cache ? 'oeil-barre' : 'oeil')}<span class="sr">${cache ? ' (masqué)' : ' (visible)'}</span></button>`;
  }).join('');
  const coupe = etat.v3d.coupe ?? 1;
  return `
    <div><span class="label">Dans la vue</span><h3>Familles</h3><p class="muted" style="margin-top:4px">Clique sur un élément de la maquette pour voir son métré.</p></div>
    <div class="frows">${lignes}</div>
    <div class="coupe"><label for="coupe-3d"><span class="label">Coupe horizontale</span><b class="num" id="coupe-valeur">${coupe >= 1 ? 'aucune' : `${Math.round(coupe * 100)} %`}</b></label>
      <input type="range" id="coupe-3d" min="0.02" max="1" step="0.01" value="${coupe}" aria-describedby="coupe-aide" />
      <span class="muted" id="coupe-aide">Fais glisser pour couper la maquette et voir l'intérieur. Avec un seul niveau affiché, la coupe se fait dans ce niveau.</span></div>`;
}

/**
 * @param {object} etat
 * @param {'pret'|'chargement'|'preparation'|'absente'|'desactivee'|'sans-webgl'} statut  état de la géométrie du fichier actif
 */
export function vue3D(etat, statut) {
  const actif = etat.modeles.get(etat.actif);
  const entete = (sous) => `<div class="page-head"><div><h2>Maquette 3D</h2><p>${sous}</p></div><div class="grow"></div>${actif && statut === 'pret' ? niveaux(etat, actif) : ''}</div>`;
  if (!actif) {
    return `${entete('aucune maquette ouverte')}<section class="card empty">${vide('Aucune maquette ouverte', 'Ouvre un fichier IFC pour le voir en 3D et cliquer sur ses éléments.',
      `<button type="button" class="btn primary" data-action="ouvrir-fichier">${ic('ouvrir')}Ouvrir un fichier IFC</button><button type="button" class="btn" data-action="exemple">${ic('exemple')}Essayer avec l'exemple</button>`)}</section>`;
  }
  const sous = `${echapper(actif.nom)} · ${pluriel(actif.nbElements, 'élément métré', 'éléments métrés')}`;
  if (statut === 'sans-webgl') {
    return `${entete(sous)}<section class="card empty">${vide('La 3D n’est pas disponible dans ce navigateur', 'L’accélération graphique (WebGL) est désactivée. Le métré reste utilisable normalement.')}</section>`;
  }
  if (statut === 'desactivee') {
    return `${entete(sous)}<section class="card empty">${vide('La préparation de la 3D est désactivée',
      'Elle a été coupée dans les paramètres. Réactive-la, puis ouvre à nouveau le fichier IFC : la 3D sera préparée, tes quantités ne changent pas.',
      `<button type="button" class="btn primary" data-action="page" data-page="parametres">${ic('reglages')}Ouvrir les paramètres</button>`)}</section>`;
  }
  if (statut === 'absente') {
    return `${entete(sous)}<section class="card empty">${vide('La 3D de ce fichier n’est pas encore prête',
      'Cette analyse date d’avant la vue 3D. Ouvre à nouveau le fichier IFC : la 3D sera préparée, tes quantités ne changent pas.',
      `<button type="button" class="btn primary" data-action="ouvrir-fichier">${ic('ouvrir')}Ouvrir le fichier IFC</button>`)}</section>`;
  }
  if (statut !== 'pret') {
    const part = etat.preparation3d.get(etat.actif) ?? 0;
    const pct = Math.round(part * 100);
    return `${entete(sous)}<div class="split split-3d"><section class="card viewport" aria-busy="true"><div class="v3d-attente">
      <div class="sk v3d-sk"></div><b>${statut === 'preparation' ? 'Préparation de la 3D' : 'Chargement de la 3D'}</b>
      ${statut === 'preparation' ? `<div class="progress" role="progressbar" aria-label="Préparation de la 3D" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><span class="muted">${pct} %</span>` : ''}
      </div></section><aside class="side-panel card"><div class="sk" style="height:160px"></div><div class="sk" style="height:220px"></div></aside></div>`;
  }
  const l = ligneSelection(etat);
  return `${entete(sous)}
    <div class="split split-3d">
      <section class="card viewport" aria-label="Maquette 3D">
        <div id="v3d-hote" class="v3d-hote"></div>
        <div class="vtools" role="toolbar" aria-label="Vue 3D">
          <button type="button" class="icon-btn" data-action="cadrer" aria-label="Recentrer la vue" title="Recentrer la vue">${ic('cible')}</button>
          <button type="button" class="icon-btn" data-action="vue-dessus" aria-label="Vue de dessus" title="Vue de dessus (avec la coupe : lecture en plan)">${ic('dessus')}</button>
        </div>
        <div class="vhint">Glisser : tourner · Clic droit : déplacer · Molette : zoomer · Clic : sélectionner</div>
      </section>
      <aside class="side-panel card" aria-label="${l ? 'Sélection' : 'Familles dans la vue'}">${l ? panneauSelection(etat, l) : panneauFamilles(etat, actif)}</aside>
    </div>`;
}

function niveaux(etat, actif) {
  const n = etat.v3d.niveaux;
  return `<div class="chips" role="group" aria-label="Niveaux affichés">
    <button type="button" class="chip" data-action="niveau-3d" data-valeur="" aria-pressed="${!n.length}">Tous niveaux</button>
    ${actif.modele.niveaux.map((x) => `<button type="button" class="chip" data-action="niveau-3d" data-valeur="${echapper(x.nom)}" aria-pressed="${n.includes(x.nom)}">${echapper(x.nom)}</button>`).join('')}
  </div>`;
}
