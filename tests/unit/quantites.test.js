import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complements, metreElement, pourcentageVitre, preparerModele, regrouper } from '../../js/metre/quantites.js';
import { FAMILLES } from '../../js/metre/familles.js';

const mur = (id, type, niveau, ext, q, ouvertures) => ({ id, famille: 'murs', classe: 'IFCWALL', type, niveau, exterieur: ext, q, p: {}, ouvertures });
const fen = (id, niveau, ext, w, h) => ({ id, famille: 'menuiseries', classe: 'IFCWINDOW', type: 'F1', niveau, exterieur: ext, q: { Width: w, Height: h }, p: {} });

test('mur : la surface nette du fichier est prioritaire', () => {
  const { m, source } = metreElement(mur(1, 'V', 'RDC', true, { GrossSideArea: 27, NetSideArea: 25, Length: 10, Width: 0.2 }));
  assert.equal(m.nette, 25);
  assert.equal(source, 'fichier');
});

test('mur sans surface nette : brute − baies réellement reliées (et non un prorata)', () => {
  const f = fen(2, 'RDC', true, 1.2, 1.35);
  const index = new Map([[2, f]]);
  const { m, source } = metreElement(mur(1, 'V', 'RDC', true, { GrossSideArea: 27, Length: 10, Width: 0.2 }, [{ menuiserie: 2, aire: null }]), index);
  assert.ok(Math.abs(m.nette - (27 - 1.62)) < 1e-9);
  assert.equal(m.fenetres, 1);
  assert.equal(source, 'calcul');
});

test('mur sans aucune surface : longueur × hauteur, sinon signalé absent', () => {
  assert.equal(metreElement(mur(1, 'V', 'RDC', true, { Length: 10, Height: 2.5 })).m.brute, 25);
  assert.equal(metreElement(mur(1, 'V', 'RDC', true, {})).source, 'absent');
});

test('regroupement par type avec filtres niveau, statut et texte', () => {
  const els = [
    mur(1, 'Voile 20', 'RDC', true, { GrossSideArea: 10, NetSideArea: 9, Length: 4 }),
    mur(2, 'Voile 20', 'R+1', true, { GrossSideArea: 20, NetSideArea: 18, Length: 8 }),
    mur(3, 'Cloison 72', 'RDC', false, { GrossSideArea: 5, NetSideArea: 5, Length: 2 }),
  ];
  const modele = preparerModele({ elements: els });
  const tout = regrouper(modele.elements, FAMILLES.murs, { ordreNiveaux: ['RDC', 'R+1'] });
  assert.deepEqual(tout.lignes.map((l) => l.type), ['Voile 20', 'Cloison 72']);
  assert.equal(tout.total.sommes.nette, 32);
  assert.deepEqual(tout.lignes[0].niveaux, ['RDC', 'R+1']);
  assert.equal(tout.lignes[0].statut, 'ext');
  assert.deepEqual(tout.lignes[0].parNiveau, { RDC: 9, 'R+1': 18 });
  assert.equal(regrouper(modele.elements, FAMILLES.murs, { niveaux: ['RDC'] }).total.sommes.nette, 14);
  assert.equal(regrouper(modele.elements, FAMILLES.murs, { statut: 'int' }).total.nombre, 1);
  assert.equal(regrouper(modele.elements, FAMILLES.murs, { texte: 'cloison' }).lignes.length, 1);
  assert.equal(regrouper(modele.elements, FAMILLES.murs, { niveaux: ['R+3'] }).total, null);
});

test('% de façade vitrée et compléments des menuiseries', () => {
  const els = preparerModele({ elements: [
    mur(1, 'V', 'RDC', true, { GrossSideArea: 100, NetSideArea: 90 }),
    mur(2, 'C', 'RDC', false, { GrossSideArea: 50, NetSideArea: 50 }),
    fen(3, 'RDC', true, 2, 5),
    { ...fen(4, 'RDC', false, 1, 2), classe: 'IFCDOOR' },
  ] }).elements;
  assert.equal(pourcentageVitre(els), 10);
  // Un doublage marqué « extérieur » ne double pas la surface de façade
  const avecDoublage = preparerModele({ elements: [...els, mur(5, 'Doublage 10+80', 'RDC', true, { GrossSideArea: 100, NetSideArea: 90 })] }).elements;
  assert.equal(pourcentageVitre(avecDoublage), 10);
  const g = complements(FAMILLES.menuiseries, regrouper(els, FAMILLES.menuiseries), els);
  assert.equal(g.total.sommes.fenetres, 1);
  assert.equal(g.total.sommes.portes, 1);
  assert.equal(g.total.sommes.surfaceExt, 10);
  assert.equal(g.total.sommes.vitrage, 10);
});
