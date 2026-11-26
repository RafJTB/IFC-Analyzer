// Page d'accueil (inspirée de celle de Transcripteur IA) : « Bonjour ! » avec l'aperçu 3D, tuiles chiffrées,
// familles et assistant côte à côte, analyses récentes.
import { FAMILLES, PAGES } from '../metre/familles.js';
import { regrouper } from '../metre/quantites.js';
import { suggestions } from '../metre/assistant.js';
import { date, echapper, nombre, pluriel } from './format.js';
import { ic, illustration } from './icones.js';

const LOGO = '<svg viewBox="0 0 40 40" aria-hidden="true"><path fill="#fff" d="M20 3 35.5 11.5 20 20 4.5 11.5z"/><path fill="#fff" fill-opacity=".74" d="M4.5 13.6 19 21.6V37L4.5 29z"/><path fill="#fff" fill-opacity=".5" d="M35.5 13.6 21 21.6V37l14.5-8z"/></svg>';
const VAGUES = '<svg class="hero-waves" viewBox="0 0 520 220" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="hw" x1="0" x2="1"><stop offset="0" stop-color="#8b7cff" stop-opacity="0"/><stop offset=".5" stop-color="#8b7cff" stop-opacity=".55"/><stop offset="1" stop-color="#c4b5fd" stop-opacity=".1"/></linearGradient></defs><g fill="none" stroke="url(#hw)" stroke-width="1.2"><path d="M0 120C80 60 140 180 230 110S380 40 520 120"/><path d="M0 130C90 70 150 170 240 120S390 60 520 130"/><path d="M0 140C100 90 160 160 250 130S400 80 520 140"/><path d="M0 110C70 50 130 190 220 100S370 30 520 110"/><path d="M0 150C110 110 170 150 260 140S410 100 520 150"/><path d="M0 100C60 40 120 200 210 90S360 20 520 100"/></g></svg>';
const FLECHE = '<svg class="i fl" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

/** Partie droite de l'en-tête : l'aperçu 3D de la maquette, sinon la tuile du logo (comme le Transcripteur). */
export const artEntete = (apercu) => (apercu
  ? `<div class="hero-art hero-3d" id="hero-art" aria-hidden="true"><img src="${apercu}" alt="" /><span class="hero-3d-chip">Aperçu 3D</span></div>`
  : `<div class="hero-art hero-tuile" id="hero-art" aria-hidden="true">${VAGUES}<span class="hero-tile">${LOGO}</span></div>`);

const tuile = (icone, couleur, couleur2, valeur, libelle) => `
  <div class="tile card" style="--c: var(--${couleur}); --c2: var(--${couleur2})"><span class="sq">${ic(icone)}</span><div><b>${valeur}</b><span class="lib">${libelle}</span></div></div>`;

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

function recents(liste, ouverts, actif) {
  const lignes = liste.map((r) => `
    <div class="recent-row">
      ${r.apercu ? `<span class="r-thumb" data-cle="${echapper(r.cle)}" style="background-image:url('${r.apercu}')"></span>` : `<span class="r-ic r-thumb vide" data-cle="${echapper(r.cle)}">${ic('cube')}</span>`}
      <button type="button" class="r-main" data-action="recent" data-cle="${echapper(r.cle)}">
        <b>${echapper(r.nom)}</b>
        <span>${echapper(r.schema)} · ${pluriel(r.nbElements, 'élément métré', 'éléments métrés')} · ${pluriel(r.nbNiveaux, 'niveau', 'niveaux')} · analysé ${date(r.date)}</span>
      </button>
      ${r.cle === actif ? `<span class="r-status ok">${ic('check')}Affichée</span>` : ouverts.has(r.cle) ? '<span class="r-status">Ouverte</span>' : ''}
      <button type="button" class="icon-btn" data-action="oublier" data-cle="${echapper(r.cle)}" aria-label="Retirer « ${echapper(r.nom)} » des analyses récentes" title="Retirer des analyses récentes">${ic('poubelle')}</button>
    </div>`).join('');
  return `
    <section class="card dash-card recents" aria-labelledby="h-recents">
      <header class="dash-head"><h3 id="h-recents">${ic('session')}Mes dernières analyses</h3>${liste.length ? '<span class="dash-sub">gardées dans ce navigateur, sans le fichier IFC</span>' : ''}</header>
      ${liste.length ? `<div class="recent-list">${lignes}</div>` : `
        <div class="dash-empty-art">${illustration()}<div><b>Ta première maquette t’attend</b>
          <p>Ouvre un fichier IFC (export Revit, ArchiCAD…) avec le bouton du haut, ou glisse-le n’importe où dans la fenêtre : ses quantités et sa 3D apparaîtront ici.</p></div></div>`}
    </section>`;
}

function enCours(analyse) {
  const pct = Math.round((analyse.part ?? 0) * 100);
  return `
    <section class="card analyse" aria-busy="true">
      <div class="a-head"><span class="sq" style="--c: var(--violet)">${ic('cube')}</span>
        <div><b>Analyse de ${echapper(analyse.nom)}</b><div class="muted">${echapper(analyse.etape ?? 'Préparation')} — ${pct} %</div></div></div>
      <div class="progress" role="progressbar" aria-label="Avancement de l'analyse" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
    </section>`;
}

function familles(els) {
  const parPage = PAGES.map((p) => ({ p, n: els.filter((e) => p.familles.includes(e.famille)).length }));
  const max = Math.max(1, ...parPage.map((x) => x.n));
  const lignes = parPage.map(({ p, n }) => {
    const cc = chiffreCle(p, els);
    return `
      <button type="button" class="fam-row${n ? '' : ' off'}" data-action="page" data-page="${p.id}" style="--c: var(--${p.couleur})">
        <span class="sq">${ic(p.icone)}</span>
        <span class="nm">${p.titre}<small>${n ? pluriel(n, 'élément') : 'absent de la maquette'}</small></span>
        <span class="bar" aria-hidden="true"><i style="width:${(n / max) * 100}%"></i></span>
        <b>${cc ? `${nombre(cc.valeur, cc.decimales)}<small>${cc.unite}</small>` : '—'}</b>
      </button>`;
  }).join('');
  return `<section class="card dash-card familles" aria-labelledby="h-familles">
    <header class="dash-head"><h3 id="h-familles">${ic('liste')}Familles</h3><span class="dash-sub">clique pour le détail par type</span></header>
    <div class="fam-rows">${lignes}</div></section>`;
}

// ---------------------------------------------------------------- Assistant
function bulle(m) {
  if (m.de === 'moi') return `<div class="msg me"><div class="bubble">${echapper(m.texte)}</div></div>`;
  const r = m.reponse;
  const valeurs = r.valeurs?.length ? `<p class="rv">${r.valeurs.map((v) => `<span><b>${echapper(v.valeur)}</b> ${echapper(v.libelle)}</span>`).join('')}</p>` : '';
  const details = r.details?.length ? `<ul class="rd">${r.details.map((d) => `<li><span>${echapper(d.libelle)}</span><b>${echapper(d.valeur)}</b></li>`).join('')}${r.plus ? `<li class="plus">+ ${pluriel(r.plus, 'autre type', 'autres types')}</li>` : ''}</ul>` : '';
  const liens = (r.liens ?? []).map((l) => `<button type="button" class="chip-lien" data-action="metre-vue" data-page="${l.page}" data-famille="${l.famille}" data-statut="${l.statut ?? 'tous'}" data-niveaux="${echapper((l.niveaux ?? []).join('|'))}" data-type="${echapper(l.type ?? '')}">${echapper(l.libelle)}${FLECHE}</button>`).join('');
  const sugg = r.suggestions?.length ? `<div class="chat-sugg">${r.suggestions.map((s) => `<button type="button" data-action="question" data-valeur="${echapper(s)}">${echapper(s)}</button>`).join('')}</div>` : '';
  return `<div class="msg bot"><span class="bot-ico" aria-hidden="true">${ic('etincelle')}</span><div class="bubble">
    ${r.titre ? `<p class="rt">${echapper(r.titre)}</p>` : ''}${valeurs}${details}${r.texte ? `<p class="${r.titre || r.valeurs ? 'rx' : 'rm'}">${echapper(r.texte)}</p>` : ''}
    ${liens ? `<div class="r-liens">${liens}</div>` : ''}${sugg}</div></div>`;
}

function assistant(modele, messages) {
  if (!modele) {
    return `<section class="card pcard assistant" aria-labelledby="h-assistant">
    <header class="dash-head"><h3 id="h-assistant"><span class="h-ico spark">${ic('etincelle')}</span>Assistant</h3></header>
    <div class="chat"><div class="chat-hello"><span class="bot-ico" aria-hidden="true">${ic('etincelle')}</span><div>
      <p>Ouvre une maquette : je réponds à tes questions sur ses quantités (surfaces, longueurs, nombres, par niveau…) en les calculant avec le métré.</p></div></div></div>
    <form class="chat-form" autocomplete="off"><input placeholder="Ouvre d’abord une maquette" aria-label="Question sur la maquette" disabled />
      <button class="chat-send" type="button" aria-label="Envoyer la question" disabled>${ic('envoyer')}</button></form>
  </section>`;
  }
  const sugg = suggestions(modele);
  return `<section class="card pcard assistant" aria-labelledby="h-assistant">
    <header class="dash-head"><h3 id="h-assistant"><span class="h-ico spark">${ic('etincelle')}</span>Assistant</h3><span class="dash-sub">calculs faits sur ce PC</span></header>
    <div class="chat" id="chat" role="log" aria-live="polite" aria-label="Réponses de l’assistant">
      <div class="chat-hello"><span class="bot-ico" aria-hidden="true">${ic('etincelle')}</span><div>
        <p>Pose une question sur ta maquette : je calcule la réponse avec le métré et je te montre d’où viennent les chiffres.</p>
        <div class="chat-sugg">${sugg.map((s) => `<button type="button" data-action="question" data-valeur="${echapper(s)}">${echapper(s)}</button>`).join('')}</div></div></div>
      ${messages.map(bulle).join('')}
    </div>
    <form class="chat-form" id="chat-form" autocomplete="off">
      <input id="chat-saisie" placeholder="Pose ta question… (ex. surface des murs au R+1)" aria-label="Question sur la maquette" maxlength="200" />
      <button class="chat-send" type="submit" aria-label="Envoyer la question">${ic('envoyer')}</button>
    </form>
  </section>`;
}

// ---------------------------------------------------------------- Page
export function vueAccueil(etat) {
  const actif = etat.modeles.get(etat.actif);
  const ouverts = new Set(etat.modeles.keys());
  const analyse = etat.analyse ? enCours(etat.analyse) : '';
  const listeRecents = recents(etat.recents, ouverts, etat.actif);

  if (!actif) {
    return page(`
      <section class="card hero">
        <div class="hero-txt">
          <h2>Bonjour ! <span aria-hidden="true">👋</span></h2>
          <p>Le métré et la 3D de tes maquettes IFC, 100 % sur ton ordinateur.</p>
          <div class="actions">
            <button type="button" class="btn primary lg" data-action="ouvrir-fichier">${ic('ouvrir')}Ouvrir un fichier IFC${FLECHE}</button>
            <button type="button" class="btn lg glass" data-action="exemple">${ic('exemple')}Essayer avec l'exemple</button>
          </div>
        </div>
        ${artEntete(null)}
      </section>
      ${analyse}
      <section class="tiles stat-row" aria-label="Chiffres clés">
        ${tuile('cube', 'violet', 'bleu', '—', 'Éléments')}${tuile('couches', 'cyan', 'bleu', '—', 'Niveaux')}${tuile('mur', 'bleu', 'violet', '—', 'm² de murs')}${tuile('fenetre', 'vert', 'cyan', '—', 'Menuiseries')}
      </section>
      ${listeRecents}`, assistant(null, []));
  }

  const { modele } = actif;
  const els = modele.elements;
  const murs = regrouper(els, FAMILLES.murs).total;
  const men = regrouper(els, FAMILLES.menuiseries).total;
  const sansQ = els.filter((e) => e.source === 'absent').length;
  const messages = etat.assistant?.cle === actif.cle ? etat.assistant.messages : [];

  return page(`
    <section class="card hero${actif.apercu ? ' avec-3d' : ''}">
      <div class="hero-txt">
        <h2>Bonjour ! <span aria-hidden="true">👋</span></h2>
        <p><b>${echapper(actif.nom)}</b> · ${pluriel(els.length, 'élément métré', 'éléments métrés')} sur ${pluriel(modele.niveaux.length, 'niveau', 'niveaux')}.</p>
        <div class="actions">
          <button type="button" class="btn primary lg" data-action="page" data-page="3d">${ic('cube')}Voir la maquette en 3D${FLECHE}</button>
          <button type="button" class="btn lg glass" data-action="ouvrir-fichier">${ic('ouvrir')}Ouvrir un autre fichier</button>
        </div>
      </div>
      ${artEntete(actif.apercu)}
    </section>
    ${analyse}
    <section class="tiles stat-row" aria-label="Chiffres clés">
      ${tuile('cube', 'violet', 'bleu', nombre(els.length, 0), 'Éléments')}
      ${tuile('couches', 'cyan', 'bleu', nombre(modele.niveaux.length, 0), 'Niveaux')}
      ${tuile('mur', 'bleu', 'violet', nombre(murs?.sommes.nette ?? 0, 0), 'm² de murs')}
      ${tuile('fenetre', 'vert', 'cyan', nombre(men?.nombre ?? 0, 0), 'Menuiseries')}
    </section>
    ${sansQ ? `<div class="note warn">${ic('alerte')}<span><b>${pluriel(sansQ, 'élément n’a', 'éléments n’ont')} pas de quantités dans le fichier.</b> Dans Revit, coche « Exporter les quantités de base » dans les options d'export IFC, puis exporte à nouveau.</span></div>` : ''}
    ${familles(els)}
    ${listeRecents}`, assistant(modele, messages));
}

/** Comme le tableau de bord du Transcripteur : la colonne principale défile, le panneau de droite va jusqu'en bas. */
const page = (principal, panneau) => `<div class="dash-grid"><div class="dash-main">${principal}</div><aside class="dash-panel" aria-label="Assistant">${panneau}</aside></div>`;
