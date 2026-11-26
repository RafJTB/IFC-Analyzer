import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sans3d } from '../../js/ui/page-3d.js';

// Une maquette de 4 éléments, dont 2 sans géométrie : un mur (calcul des ouvertures impossible) et une dalle (pas de forme)
const actif = { cle: 'm', modele: { elements: [
  { id: 1, famille: 'murs' }, { id: 2, famille: 'murs' }, { id: 3, famille: 'dalles' }, { id: 4, famille: 'menuiseries' },
] } };
const geometrie = (ids, nbI) => ({ ids: Int32Array.from(ids), nbI: Uint32Array.from(nbI) });

test('éléments du métré sans 3D, comptés par famille', () => {
  const etat = { geometries: new Map([['m', geometrie([1, 2, 4], [36, 0, 12])]]) }; // le mur 2 est vide, la dalle 3 absente
  assert.deepEqual(sans3d(etat, actif).map((x) => [x.f.id, x.n]), [['murs', 1], ['dalles', 1]]);
});

test('toute la maquette en 3D, ou 3D pas encore chargée : rien à signaler', () => {
  assert.deepEqual(sans3d({ geometries: new Map([['m', geometrie([1, 2, 3, 4], [1, 1, 1, 1])]]) }, actif), []);
  assert.deepEqual(sans3d({ geometries: new Map() }, actif), []);
});
