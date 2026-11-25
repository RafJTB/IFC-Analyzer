// Page de métré d'une famille (option A) : tuiles de totaux, tableau par type, panneau de détail du type choisi.
import { FAMILLES } from '../metre/familles.js';
import { complements, regrouper } from '../metre/quantites.js';
import { echapper, nombre, pluriel } from './format.js';
import { ic, illustration } from './icones.js';

const COULEURS = ['violet', 'bleu', 'vert', 'ambre', 'cyan', 'rose', 'rouge'];
/** Couleur stable d'un type (la même à chaque affichage, quels que soient les filtres). */
export function couleurDe(texte) {
  let h = 0;
  for (const c of String(texte)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return COULEURS[h % COULEURS.length];
}
const STATUTS = { ext: ['ext', 'Extérieur'], int: ['int', 'Intérieur'], mixte: ['mixte', 'Mixte'] };
const badgeStatut = (s, suffixe = '') => (STATUTS[s] ? `<span class="badge ${STATUTS[s][0]}">${STATUTS[s][1]}${suffixe}</span>` : `<span class="badge neutre">Non renseigné${suffixe}</span>`);
const plage = (niv) => (!niv.length ? '—' : niv.length === 1 ? niv[0] : `${niv[0]} → ${niv[niv.length - 1]}`);

/** Valeur d'une colonne pour une ligne (nombre brut, avant mise en forme). */
const valeurCol = (l, c) => (c.cle === 'nombre' ? l.nombre : l.sommes?.[c.cle]);

function cellule(l, c, max) {
  if (c.genre === 'statut') return `<td>${badgeStatut(l.statut)}</td>`;
  if (c.genre === 'niveaux') return `<td class="muted">${echapper(plage(l.niveaux))}</td>`;
  if (c.genre === 'texte') return `<td class="muted">${echapper(l[c.cle] || '—')}</td>`;
  if (c.genre === 'diametres') return `<td class="muted">${l.diametres.length ? l.diametres.map((d) => `Ø${d}`).join(', ') : '—'}</td>`;
  const v = valeurCol(l, c);
  const txt = nombre(v == null ? null : v * (c.facteur ?? 1), c.decimales ?? 2);
  if (c.barre && max > 0) return `<td class="r barcell">${txt}<div class="bar"><i style="width:${Math.max(2, ((v ?? 0) / max) * 100).toFixed(1)}%"></i></div></td>`;
  return `<td class="r">${txt}</td>`;
}

/** Filtres de la page (avec valeurs par défaut). */
export function filtresDe(etat, page) {
  const f = (etat.filtres[page.id] ??= {});
  f.onglet ??= page.familles[0];
  f.statut ??= 'tous';
  f.niveaux ??= [];
  f.texte ??= '';
  f.tri ??= null;
  return f;
}

/** Données de la page : groupes par type, filtrés et triés. */
export function donneesPage(etat, page) {
  const actif = etat.modeles.get(etat.actif);
  const f = filtresDe(etat, page);
  const config = FAMILLES[f.onglet];
  const els = actif.modele.elements;
  const ordreNiveaux = actif.modele.niveaux.map((n) => n.nom);
  const groupe = complements(config, regrouper(els, config, { niveaux: f.niveaux, statut: page.statut ? f.statut : 'tous', texte: f.texte, ordreNiveaux }), els, f.niveaux);
  if (f.tri) {
    const col = config.colonnes.find((c) => c.cle === f.tri.cle);
    const cleTri = (l) => (f.tri.cle === 'type' ? l.type : col?.genre === 'niveaux' ? ordreNiveaux.indexOf(l.niveaux[0]) : col?.genre ? String(l[col.cle] ?? l.statut ?? '') : valeurCol(l, col) ?? -Infinity);
    groupe.lignes.sort((a, b) => {
      const x = cleTri(a);
      const y = cleTri(b);
      return (typeof x === 'string' ? x.localeCompare(y, 'fr') : x - y) * f.tri.sens;
    });
  }
  const famillePresente = els.some((e) => e.famille === f.onglet);
  return { actif, f, config, groupe, ordreNiveaux, famillePresente };
}

function entete(page, etat, d) {
  const { f, config, groupe, actif } = d;
  const total = groupe.total;
  const nbTypes = groupe.lignes.length;
  const sousTitre = total
    ? `${pluriel(total.nombre, config.singulier, config.pluriel)} · ${pluriel(nbTypes, 'type')} · ${pluriel(new Set(groupe.elements.map((e) => e.niveau).filter(Boolean)).size, 'niveau', 'niveaux')}`
    : 'aucun élément avec ces filtres';
  const onglets = page.familles.length > 1
    ? `<div class="seg" role="group" aria-label="Famille">${page.familles.map((id) => `<button type="button" data-action="onglet" data-famille="${id}" aria-pressed="${f.onglet === id}">${FAMILLES[id].onglet ?? FAMILLES[id].libelle}</button>`).join('')}</div>`
    : '';
  const statuts = page.statut
    ? `<div class="seg" role="group" aria-label="Statut">${[['tous', 'Tous'], ['ext', page.id === 'menuiseries' ? 'Extérieures' : 'Extérieurs'], ['int', page.id === 'menuiseries' ? 'Intérieures' : 'Intérieurs']]
      .map(([v, t]) => `<button type="button" data-action="statut" data-valeur="${v}" aria-pressed="${f.statut === v}">${t}</button>`).join('')}</div>`
    : '';
  const niveaux = `<div class="chips" role="group" aria-label="Niveaux">
      <button type="button" class="chip" data-action="niveau" data-valeur="" aria-pressed="${!f.niveaux.length}">Tous niveaux</button>
      ${actif.modele.niveaux.map((n) => `<button type="button" class="chip" data-action="niveau" data-valeur="${echapper(n.nom)}" aria-pressed="${f.niveaux.includes(n.nom)}">${echapper(n.nom)}</button>`).join('')}
    </div>`;
  return `<div class="page-head"><div><h2>${page.titre}</h2><p>${sousTitre}</p></div><div class="grow"></div>${onglets}${statuts}${niveaux}</div>`;
}

function tuiles(config, groupe) {
  const t = groupe.total?.sommes ?? {};
  const nbTypes = groupe.lignes.length;
  const f = (v) => nombre(v, 2);
  return `<section class="tiles">${config.tuiles.map((tu) => {
    const v = tu.cle === 'nombre' ? groupe.total?.nombre ?? 0 : t[tu.cle];
    return `<div class="tile card" style="--c: var(--${tu.couleur}); --c2: var(--${tu.couleur2})"><span class="sq">${ic(tu.icone)}</span>
      <div><b>${nombre(v ?? (groupe.total ? 0 : null), tu.decimales ?? 2)}<small>${tu.unite}</small></b><span class="lib">${tu.libelle}</span><em>${groupe.total ? tu.sous(t, f, nbTypes) : '—'}</em></div></div>`;
  }).join('')}</section>`;
}

function tableau(config, d) {
  const { groupe, f } = d;
  const cols = config.colonnes;
  const max = Object.fromEntries(cols.filter((c) => c.barre).map((c) => [c.cle, Math.max(...groupe.lignes.map((l) => valeurCol(l, c) ?? 0))]));
  const triIcone = (cle) => (f.tri?.cle === cle ? ic(f.tri.sens > 0 ? 'haut' : 'bas') : '');
  const triAria = (cle) => (f.tri?.cle === cle ? (f.tri.sens > 0 ? 'ascending' : 'descending') : 'none');
  const th = (c) => `<th class="${c.genre ? '' : 'r'}" aria-sort="${triAria(c.cle)}"><button type="button" data-action="tri" data-cle="${c.cle}">${c.titre}${c.unite && c.unite !== 'U' ? ` <small>${c.unite}</small>` : ''}${triIcone(c.cle)}</button></th>`;
  const lignes = groupe.lignes.map((l) => `
    <tr class="${l.type === f.selection ? 'sel' : ''}" data-action="selection" data-type="${echapper(l.type)}" style="--c: var(--${couleurDe(l.type)})">
      <td><button type="button" class="tname" data-action="selection" data-type="${echapper(l.type)}" aria-pressed="${l.type === f.selection}"><i></i><span>${echapper(l.type)}</span></button></td>
      ${cols.map((c) => cellule(l, c, max[c.cle])).join('')}
    </tr>`).join('');
  const t = groupe.total;
  const pied = t ? `<tfoot><tr><td>Total</td>${cols.map((c) => (c.genre || c.total === false ? '<td></td>' : `<td class="r">${nombre((valeurCol(t, c) ?? 0) * (c.facteur ?? 1), c.decimales ?? 2)}</td>`)).join('')}</tr></tfoot>` : '';
  return `
    <section class="card table-card">
      <div class="card-head"><h3>Par type</h3><span class="muted">clique sur un type pour voir son détail</span><div class="grow"></div>
        <label class="filter-input">${ic('loupe')}<span class="sr">Filtrer les types</span><input id="filtre-texte" type="search" placeholder="Filtrer les types" value="${echapper(f.texte)}" autocomplete="off" /></label>
        <button type="button" class="btn" data-action="exporter" ${groupe.lignes.length ? '' : 'disabled'}>${ic('export')}Exporter en CSV</button>
      </div>
      ${groupe.lignes.length ? `<div class="table-scroll"><table class="tbl" aria-label="${echapper(config.libelle)} par type">
        <thead><tr><th aria-sort="${triAria('type')}"><button type="button" data-action="tri" data-cle="type">Type${triIcone('type')}</button></th>${cols.map(th).join('')}</tr></thead>
        <tbody>${lignes}</tbody>${pied}</table></div>` : vide('filtre', 'Aucun résultat avec ces filtres', 'Change de niveau, de statut ou efface le texte du filtre.', `<button type="button" class="btn primary" data-action="reinit">Réinitialiser les filtres</button>`)}
    </section>`;
}

function noteSource(ligne, config) {
  const s = ligne.sources;
  const n = ligne.nombre;
  if (s.absent) return `<div class="note warn">${ic('alerte')}<span><b>${pluriel(s.absent, 'élément sans quantité', 'éléments sans quantité')}.</b> Dans Revit, coche « Exporter les quantités de base » à l'export IFC.</span></div>`;
  if (s.calcul) return `<div class="note info">${ic('info')}<span>Surface nette calculée : surface brute moins les baies réellement reliées ${config.id === 'murs' ? 'à ces murs' : 'à ces éléments'} dans la maquette.</span></div>`;
  if (s.proprietes) return `<div class="note info">${ic('info')}<span>Quantités lues dans les propriétés de l'export (pas de quantités de base dans le fichier). Unités converties en mètres.</span></div>`;
  return `<div class="note ok">${ic('check')}<span>Quantités lues dans le fichier (quantités de base${n > 1 ? ` des ${n} éléments` : ''}), unités converties en mètres.</span></div>`;
}

function details(config, l) {
  const s = l.sommes;
  const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
  const lignes = [];
  if (config.id === 'murs') {
    const baies = [[s.fenetres, 'fenêtre'], [s.portes, 'porte'], [s.reservations, 'réservation vide', 'réservations vides']]
      .filter(([n]) => n > 0).map(([n, sg, pl]) => pluriel(n, sg, pl));
    lignes.push(kv('Baies déduites', baies.join(' · ') || 'aucune'));
    lignes.push(kv('Surface des baies', `${nombre(s.baies)} m²`));
    lignes.push(kv('Épaisseur', s.epaisseur ? `${nombre(s.epaisseur * 100, 0)} cm` : '—'));
    lignes.push(kv('Hauteur moyenne', s.hauteur ? `${nombre(s.hauteur)} m` : '—'));
  } else if (config.id === 'menuiseries') {
    lignes.push(kv('Famille', echapper(l.genre || '—')));
    lignes.push(kv('Dimensions', s.largeur && s.hauteur ? `${nombre(s.largeur)} × ${nombre(s.hauteur)} m` : '—'));
    lignes.push(kv('Surface unitaire', l.nombre ? `${nombre(s.surface / l.nombre)} m²` : '—'));
  } else if (config.id === 'dalles') {
    lignes.push(kv('Usage', echapper(l.genre || '—')));
    lignes.push(kv('Épaisseur', s.epaisseur ? `${nombre(s.epaisseur * 100, 0)} cm` : '—'));
    lignes.push(kv('Périmètre', `${nombre(s.perimetre)} ml`));
  } else if (config.id === 'reseaux_ep') {
    lignes.push(kv('Diamètre', l.diametres.length ? l.diametres.map((d) => `Ø${d} mm`).join(', ') : '—'));
  } else if (config.id === 'escaliers') {
    lignes.push(kv('Contremarches', nombre(s.contremarches, 0)));
    lignes.push(kv('Hauteur franchie', `${nombre(s.hauteur)} m`));
  }
  lignes.push(kv('Classe IFC', echapper(l.classes.join(', '))));
  return lignes.join('');
}

function panneau(config, d) {
  const { groupe, f, ordreNiveaux } = d;
  const l = groupe.lignes.find((x) => x.type === f.selection);
  if (!l) return `<aside class="side-panel card" aria-label="Détail du type"><div class="empty"><div class="empty-in">${illustration('filtre')}<h3>Choisis un type</h3><p>Son détail par niveau s'affiche ici.</p></div></div></aside>`;
  const principal = config.principal;
  const unite = config.unitePrincipale;
  const dec = principal === 'nombre' ? 0 : 2;
  const valeurs = ordreNiveaux.filter((n) => l.parNiveau[n] != null);
  if (l.parNiveau[''] != null) valeurs.push('');
  const max = Math.max(...valeurs.map((n) => l.parNiveau[n]), 0);
  const titrePrincipal = config.libellePrincipal ?? 'quantité';
  const niveaux = valeurs.map((n) => `<div class="lv" style="--c: var(--${couleurDe(l.type)})"><span class="muted">${echapper(n || 'Sans niveau')}</span>
      <div class="bar"><i style="width:${max ? ((l.parNiveau[n] / max) * 100).toFixed(1) : 0}%"></i></div><b>${nombre(l.parNiveau[n], dec)} ${unite}</b></div>`).join('');
  return `
    <aside class="side-panel card" aria-label="Détail du type">
      <div><span class="label">Type sélectionné</span><h3>${echapper(l.type)}</h3>
        <div style="margin-top:6px">${['murs', 'menuiseries'].includes(config.id) ? badgeStatut(l.statut, ` · ${pluriel(l.nombre, config.singulier, config.pluriel)}`) : `<span class="badge neutre">${pluriel(l.nombre, config.singulier, config.pluriel)}</span>`}</div></div>
      <div class="levels"><span class="label">${titrePrincipal.charAt(0).toUpperCase() + titrePrincipal.slice(1)} par niveau</span>${niveaux}</div>
      <div>${details(config, l)}</div>
      ${noteSource(l, config)}
      <div class="panel-actions">
        <button type="button" class="btn primary" data-action="voir-3d">${ic('cube')}Voir en 3D</button>
        <button type="button" class="btn" data-action="copier">${ic('copie')}Copier la ligne pour Excel</button>
      </div>
    </aside>`;
}

function vide(variante, titre, texte, actions) {
  return `<div class="empty"><div class="empty-in">${illustration(variante)}<h3>${titre}</h3><p>${texte}</p><div class="actions">${actions}</div></div></div>`;
}

export function vueFamille(page, etat) {
  if (!etat.modeles.get(etat.actif)) {
    return `<div class="page-head"><div><h2>${page.titre}</h2><p>aucune maquette ouverte</p></div></div>
      <section class="card empty">${vide('maquette', 'Aucune maquette ouverte', 'Ouvre un fichier IFC pour voir le métré de cette famille.',
      `<button type="button" class="btn primary" data-action="ouvrir-fichier">${ic('ouvrir')}Ouvrir un fichier IFC</button><button type="button" class="btn" data-action="exemple">${ic('exemple')}Essayer avec l'exemple</button>`)}</section>`;
  }
  const d = donneesPage(etat, page);
  const { f, config, groupe, famillePresente } = d;
  // Sélection par défaut : le premier type (le plus gros), et on la garde si elle reste visible
  if (!groupe.lignes.some((l) => l.type === f.selection)) f.selection = groupe.lignes[0]?.type ?? null;
  if (!famillePresente) {
    return `${entete(page, etat, d)}<section class="card empty">${vide('maquette', `Aucun élément « ${config.libelle.toLowerCase()} » dans cette maquette`,
      'Cette famille n’a pas été trouvée dans le fichier. Vérifie que ces objets sont bien exportés en IFC.', `<button type="button" class="btn" data-action="page" data-page="accueil">${ic('home')}Retour à l'accueil</button>`)}</section>`;
  }
  const sansQ = groupe.elements.filter((e) => e.source === 'absent').length;
  const alerte = sansQ ? `<div class="note warn">${ic('alerte')}<span><b>${pluriel(sansQ, 'élément n’a', 'éléments n’ont')} pas de quantités dans le fichier</b> : ${sansQ > 1 ? 'ils comptent' : 'il compte'} pour 0. Dans Revit, coche « Exporter les quantités de base » à l'export IFC.</span></div>` : '';
  return `${entete(page, etat, d)}${tuiles(config, groupe)}${alerte}<div class="split">${tableau(config, d)}${panneau(config, d)}</div>`;
}

/** Texte d'une ligne pour le presse-papiers (colonnes séparées par des tabulations, collables dans Excel). */
export function ligneTexte(config, l) {
  const cols = config.colonnes.filter((c) => !c.genre);
  const entetes = ['Type', ...cols.map((c) => `${c.titre}${c.unite ? ` (${c.unite})` : ''}`)];
  const valeurs = [l.type, ...cols.map((c) => { const v = valeurCol(l, c); return v == null ? '' : nombre(v * (c.facteur ?? 1), c.decimales ?? 2).replace(/ | /g, ''); })];
  return `${entetes.join('\t')}\n${valeurs.join('\t')}`;
}
