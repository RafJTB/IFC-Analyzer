// Page d'accueil : « Bonjour ! », ouverture d'un fichier, synthèse de la maquette active et analyses récentes.
import { FAMILLES, PAGES } from '../metre/familles.js';
import { regrouper } from '../metre/quantites.js';
import { date, echapper, nombre, pluriel, taille } from './format.js';
import { ic, illustration } from './icones.js';

const tuile = ({ icone, couleur, couleur2, valeur, unite = '', libelle, sous = '' }) => `
  <div class="tile card" style="--c: var(--${couleur}); --c2: var(--${couleur2 ?? couleur})"><span class="sq">${ic(icone)}</span>
    <div><b>${valeur}${unite ? `<small>${unite}</small>` : ''}</b><span class="lib">${libelle}</span>${sous ? `<em>${sous}</em>` : ''}</div></div>`;

/** Chiffre clé d'une page : la quantité principale de sa première famille non vide. */
export function chiffreCle(page, elements) {
  for (const f of page.familles) {
    const config = FAMILLES[f];
    const { total } = regrouper(elements, config);
    if (!total) continue;
    const v = config.principal === 'nombre' ? total.nombre : total.sommes[config.principal];
    const libelle = page.familles.length > 1 ? `${config.libelle} · ${config.libellePrincipal}` : config.libellePrincipal;
    return { valeur: v, unite: config.unitePrincipale, libelle, decimales: config.principal === 'nombre' ? 0 : 2 };
  }
  return null;
}

function recents(liste, ouverts) {
  if (!liste.length) return '';
  return `
    <div class="section-title"><h3>Analyses récentes</h3><span class="muted">gardées dans ce navigateur, sans le fichier IFC</span></div>
    <section class="card recents">${liste.map((r) => `
      <div class="recent-row">
        <span class="r-ic">${ic('cube')}</span>
        <button type="button" class="r-main" data-action="recent" data-cle="${echapper(r.cle)}">
          <b>${echapper(r.nom)}</b>
          <span>${echapper(r.schema)} · ${pluriel(r.nbElements, 'élément métré', 'éléments métrés')} · ${pluriel(r.nbNiveaux, 'niveau', 'niveaux')} · analysé ${date(r.date)}${ouverts.has(r.cle) ? ' · <span class="badge int">ouvert</span>' : ''}</span>
        </button>
        <button type="button" class="icon-btn" data-action="oublier" data-cle="${echapper(r.cle)}" aria-label="Retirer « ${echapper(r.nom)} » des analyses récentes">${ic('poubelle')}</button>
      </div>`).join('')}
    </section>`;
}

function enCours(analyse) {
  const pct = Math.round((analyse.part ?? 0) * 100);
  return `
    <section class="card analyse" aria-busy="true">
      <div class="a-head"><span class="sq" style="--c: var(--violet)">${ic('cube')}</span>
        <div><b>Analyse de ${echapper(analyse.nom)}</b><div class="muted">${echapper(analyse.etape ?? 'Préparation')} — ${pct} %</div></div></div>
      <div class="progress" role="progressbar" aria-label="Avancement de l'analyse" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
    </section>
    <div class="sk-row" aria-hidden="true"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>`;
}

export function vueAccueil(etat) {
  const actif = etat.modeles.get(etat.actif);
  const ouverts = new Set(etat.modeles.keys());
  const listeRecents = recents(etat.recents, ouverts);
  const analyse = etat.analyse ? enCours(etat.analyse) : '';

  if (!actif) {
    return `
      <section class="card hero">
        <div class="hero-txt">
          <h2>Bonjour !</h2>
          <p>Dépose une maquette IFC : tu obtiens le métré par famille en quelques secondes. Le fichier reste sur ton PC, rien n'est envoyé.</p>
          <div class="actions">
            <button type="button" class="btn primary lg" data-action="ouvrir-fichier">${ic('ouvrir')}Ouvrir un fichier IFC</button>
            <button type="button" class="btn lg glass" data-action="exemple">${ic('exemple')}Essayer avec l'exemple</button>
          </div>
        </div>
        <div class="hero-art">${illustration()}</div>
      </section>
      ${analyse}
      <div class="dropzone" data-action="ouvrir-fichier" role="button" tabindex="0">
        <span class="dz-ic">${ic('ouvrir')}</span>
        <div><b>Glisse ton fichier IFC ici</b><span>IFC2x3 ou IFC4, export Revit, ArchiCAD… Les unités du fichier sont converties en mètres.</span></div>
      </div>
      ${listeRecents}`;
  }

  const { modele } = actif;
  const els = modele.elements;
  const murs = regrouper(els, FAMILLES.murs).total;
  const men = regrouper(els, FAMILLES.menuiseries);
  const nbFen = men.elements.filter((e) => e.m?.genre === 'Fenêtre').length;
  const sansQ = els.filter((e) => e.source === 'absent').length;
  const cartes = PAGES.map((p) => {
    const n = els.filter((e) => p.familles.includes(e.famille)).length;
    const cc = chiffreCle(p, els);
    return `
      <button type="button" class="fam-card card${n ? '' : ' off'}" data-action="page" data-page="${p.id}" style="--c: var(--${p.couleur})">
        <span class="top"><span class="sq">${ic(p.icone)}</span><h3>${p.titre}</h3></span>
        <b>${cc ? `${nombre(cc.valeur, cc.decimales)}<small>${cc.unite}</small>` : '—'}</b>
        <span class="sub">${cc ? `${echapper(cc.libelle)} · ${pluriel(n, 'élément')}` : 'absent de cette maquette'}</span>
      </button>`;
  }).join('');

  return `
    <section class="card hero">
      <div class="hero-txt">
        <h2>Bonjour !</h2>
        <p><b>${echapper(actif.nom)}</b> est analysée : ${pluriel(els.length, 'élément métré', 'éléments métrés')} sur ${pluriel(modele.niveaux.length, 'niveau', 'niveaux')}, en ${nombre(actif.duree / 1000, 1)} s.</p>
        <div class="actions">
          <button type="button" class="btn primary lg" data-action="page" data-page="3d">${ic('cube')}Voir la maquette en 3D</button>
          <button type="button" class="btn lg glass" data-action="page" data-page="murs">${ic('mur')}Voir le métré des murs</button>
        </div>
      </div>
      <div class="hero-art">${illustration()}</div>
    </section>
    ${analyse}
    <section class="tiles">
      ${tuile({ icone: 'cube', couleur: 'violet', couleur2: 'bleu', valeur: nombre(els.length, 0), unite: 'U', libelle: 'Éléments métrés', sous: `${echapper(modele.schema)} · ${taille(actif.taille)}` })}
      ${tuile({ icone: 'couches', couleur: 'cyan', couleur2: 'bleu', valeur: nombre(modele.niveaux.length, 0), libelle: 'Niveaux', sous: echapper(modele.niveaux.map((n) => n.nom).join(' · ')) })}
      ${tuile({ icone: 'mur', couleur: 'bleu', couleur2: 'violet', valeur: nombre(murs?.sommes.nette, 2), unite: 'm²', libelle: 'Murs, surface nette', sous: `${pluriel(murs?.nombre ?? 0, 'mur')}` })}
      ${tuile({ icone: 'fenetre', couleur: 'vert', couleur2: 'cyan', valeur: nombre(men.total?.nombre ?? 0, 0), unite: 'U', libelle: 'Menuiseries', sous: `${pluriel(nbFen, 'fenêtre')} · ${pluriel((men.total?.nombre ?? 0) - nbFen, 'porte')}` })}
    </section>
    ${sansQ ? `<div class="note warn">${ic('alerte')}<span><b>${pluriel(sansQ, 'élément n’a', 'éléments n’ont')} pas de quantités dans le fichier.</b> Dans Revit, coche « Exporter les quantités de base » dans les options d'export IFC, puis exporte à nouveau.</span></div>` : ''}
    <div class="section-title"><h3>Familles</h3><span class="muted">clique pour voir le détail par type</span></div>
    <section class="grid-fam">${cartes}</section>
    ${listeRecents}`;
}
