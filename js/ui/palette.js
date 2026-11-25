// Recherche rapide (Ctrl K) : pages, types de la maquette active et actions.
import { FAMILLES, PAGES, pageDeFamille } from '../metre/familles.js';
import { cle } from '../ifc/noms.js';
import { echapper, nombre } from './format.js';
import { ic } from './icones.js';

/**
 * Résultats pour une saisie. Chaque résultat : { titre, meta, icone, couleur, faire: { action, ... } }.
 * @param {string} saisie
 * @param {object} etat  état de l'appli (modeles, actif)
 */
export function resultats(saisie, etat) {
  const q = cle(saisie);
  const res = [];
  const ok = (t) => !q || cle(t).includes(q);
  const actif = etat.modeles.get(etat.actif);
  // Types de la maquette active (regroupés par famille)
  if (actif && q) {
    const vus = new Set();
    for (const e of actif.modele.elements) {
      const k = `${e.famille}|${e.type}`;
      if (vus.has(k) || !ok(e.type)) continue;
      vus.add(k);
      const p = pageDeFamille(e.famille);
      const n = actif.modele.elements.filter((x) => x.famille === e.famille && x.type === e.type).length;
      res.push({ titre: e.type, meta: `${FAMILLES[e.famille].libelle} · ${nombre(n, 0)} U`, icone: p.icone, couleur: p.couleur, faire: { action: 'type', page: p.id, famille: e.famille, type: e.type } });
      if (res.length >= 30) break;
    }
  }
  for (const p of [{ id: 'accueil', titre: 'Accueil', icone: 'home', couleur: 'violet' }, ...PAGES]) {
    if (ok(p.titre)) res.push({ titre: p.titre, meta: 'Page', icone: p.icone, couleur: p.couleur, faire: { action: 'page', page: p.id } });
  }
  const actions = [
    { titre: 'Ouvrir un fichier IFC', meta: 'Ctrl O', icone: 'ouvrir', couleur: 'bleu', faire: { action: 'ouvrir-fichier' } },
    { titre: "Ouvrir l'exemple (Résidence Les Tilleuls)", meta: 'Action', icone: 'exemple', couleur: 'ambre', faire: { action: 'exemple' } },
    { titre: 'Changer de thème (clair / sombre)', meta: 'Action', icone: 'lune', couleur: 'violet', faire: { action: 'theme' } },
  ];
  for (const a of actions) if (ok(a.titre)) res.push(a);
  return res;
}

export function initPalette(etat, executer) {
  const dlg = document.getElementById('palette');
  const saisie = document.getElementById('pal-saisie');
  const liste = document.getElementById('pal-liste');
  let items = [];
  let index = 0;

  const dessiner = () => {
    items = resultats(saisie.value, etat);
    index = Math.min(index, Math.max(items.length - 1, 0));
    liste.innerHTML = items.length
      ? items.map((r, i) => `<li role="option" id="pal-${i}" aria-selected="${i === index}" data-i="${i}" style="--c: var(--${r.couleur})">
          <span class="p-ic">${ic(r.icone)}</span><span>${echapper(r.titre)}</span><span class="p-meta">${echapper(r.meta)}</span></li>`).join('')
      : '<li class="p-vide" role="option" aria-disabled="true" aria-selected="false">Aucun résultat</li>';
    saisie.setAttribute('aria-activedescendant', items.length ? `pal-${index}` : '');
    liste.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const choisir = (i) => {
    const r = items[i];
    if (!r) return;
    dlg.close();
    executer(r.faire);
  };
  saisie.addEventListener('input', () => { index = 0; dessiner(); });
  saisie.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % Math.max(items.length, 1); dessiner(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = (index - 1 + items.length) % Math.max(items.length, 1); dessiner(); }
    else if (e.key === 'Enter') { e.preventDefault(); choisir(index); }
  });
  liste.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) choisir(Number(li.dataset.i)); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // clic hors de la fenêtre

  return {
    ouvrir() {
      if (dlg.open) return;
      saisie.value = '';
      index = 0;
      dessiner();
      dlg.showModal();
      saisie.focus();
    },
  };
}
