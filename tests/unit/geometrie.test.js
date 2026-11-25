// La géométrie 3D est-elle complète, en mètres, et reliée aux éléments du métré ?
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyser, avecModele } from './aide.js';
import { extraireGeometrie } from '../../js/ifc/geometrie.js';

for (const fichier of ['assets/exemple/residence-les-tilleuls.ifc', 'tests/fixtures/residence-ifc2x3.ifc']) {
  test(`${fichier} : un bloc 3D par élément, en mètres, Y vers le haut`, async () => {
    const g = await avecModele(fichier, (api, W, id) => extraireGeometrie(api, id));
    const modele = await analyser(fichier);
    // 266 éléments métrés + l'objet générique ; aucune réservation
    assert.equal(g.ids.length, 267);
    const ids = new Set(g.ids);
    assert.ok(modele.elements.every((e) => ids.has(e.id)), 'chaque élément du métré a sa géométrie');
    // Bâtiment de 30 m × 12 m, toiture à 11,62 m (Y vers le haut, l'axe Y de l'IFC devient -Z)
    const prés = (a, b, tol = 0.25) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);
    prés(g.max[0] - g.min[0], 30.34);
    prés(g.max[1], 11.62, 0.01);
    prés(g.max[2] - g.min[2], 12.34);
    // Tampons cohérents
    assert.equal(g.positions.length, g.normales.length);
    assert.equal(g.indices.length, [...g.nbI].reduce((s, n) => s + n, 0));
    const nbSommets = g.positions.length / 3;
    assert.ok(g.indices.every((i) => i < nbSommets), 'indices dans les bornes');
    for (let k = 1; k < g.ids.length; k++) assert.equal(g.debutsV[k], g.debutsV[k - 1] + g.nbV[k - 1]);
  });
}

test('murs percés par leurs réservations (plus de triangles qu’un mur plein)', async () => {
  const g = await avecModele('assets/exemple/residence-les-tilleuls.ifc', (api, W, id) => extraireGeometrie(api, id));
  const modele = await analyser('assets/exemple/residence-les-tilleuls.ifc');
  const index = new Map([...g.ids].map((id, k) => [id, k]));
  const voile = modele.elements.find((e) => e.type === 'Voile BA 20 cm' && e.ouvertures?.length === 2);
  const plein = modele.elements.find((e) => e.type === 'Maçonnerie bloc 20 cm');
  assert.equal(g.nbI[index.get(plein.id)] / 3, 12);
  assert.ok(g.nbI[index.get(voile.id)] / 3 > 12);
});
