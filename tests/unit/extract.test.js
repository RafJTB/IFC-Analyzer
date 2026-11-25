// L'appli retrouve-t-elle exactement les quantités de l'IFC d'exemple ?
// La vérité (tests/fixtures/attendu.json) est calculée par le générateur, indépendamment de l'appli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyser, attendu, proche } from './aide.js';
import { FAMILLES } from '../../js/metre/familles.js';
import { pourcentageVitre, regrouper } from '../../js/metre/quantites.js';

// Correspondance entre les clés du générateur et les sommes de l'appli
const CHAMPS = {
  murs: { brute: 'brute', nette: 'nette', longueur: 'longueur', volume: 'volume', baies: 'baies' },
  menuiseries: { surface: 'surface' },
  dalles: { surface: 'surface', perimetre: 'perimetre', volume: 'volume' },
  revetements_sol: { surface: 'surface', perimetre: 'perimetre' },
  plafonds: { surface: 'surface', perimetre: 'perimetre' },
  poteaux: { longueur: 'hauteur', volume: 'volume' },
  poutres: { longueur: 'longueur', volume: 'volume' },
  bords_dalle: { longueur: 'longueur' },
  garde_corps: { longueur: 'longueur' },
  reseaux_ep: { longueur: 'longueur' },
  escaliers: { contremarches: 'contremarches', marches: 'marches' },
};

for (const [fichier, nomAttendu] of [['assets/exemple/residence-les-tilleuls.ifc', 'attendu.json'], ['tests/fixtures/residence-ifc2x3.ifc', 'attendu.json']]) {
  test(`${fichier} : toutes les familles, types, nombres et quantités`, async () => {
    const modele = await analyser(fichier);
    const verite = attendu(nomAttendu);
    for (const [famille, types] of Object.entries(verite.familles)) {
      const { lignes } = regrouper(modele.elements, FAMILLES[famille], { ordreNiveaux: verite.niveaux });
      assert.deepEqual(lignes.map((l) => l.type).sort(), Object.keys(types).sort(), `types de ${famille}`);
      for (const [type, v] of Object.entries(types)) {
        const ligne = lignes.find((l) => l.type === type);
        assert.equal(ligne.nombre, v.nombre, `nombre de « ${type} »`);
        for (const [champGen, champAppli] of Object.entries(CHAMPS[famille])) {
          if (v[champGen] != null) proche(assert, ligne.sommes[champAppli], v[champGen], `${champAppli} de « ${type} »`);
        }
        for (const n of verite.niveaux) {
          const parNiveau = modele.elements.filter((e) => e.famille === famille && e.type === type && e.niveau === n).length;
          assert.equal(parNiveau, v[`niveau:${n}`] ?? 0, `« ${type} » au niveau ${n}`);
        }
        if (v.exterieur != null) {
          assert.equal(modele.elements.filter((e) => e.famille === famille && e.type === type && e.exterieur === true).length, v.exterieur, `extérieurs de « ${type} »`);
        }
      }
    }
  });
}

test('IFC2X3 : chaque mur n’est compté qu’une fois (bug de l’ancienne version : IfcWall + IfcWallStandardCase)', async () => {
  const modele = await analyser('tests/fixtures/residence-ifc2x3.ifc');
  const murs = modele.elements.filter((e) => e.famille === 'murs');
  assert.equal(new Set(murs.map((m) => m.id)).size, murs.length);
  assert.equal(murs.length, 103);
  assert.ok(murs.every((m) => m.classe === 'IfcWallStandardCase'));
});

test('unités du fichier converties : millimètres → mètres', async () => {
  const modele = await analyser('assets/exemple/residence-les-tilleuls.ifc');
  proche(assert, modele.echelle.LENGTHUNIT, 0.001, 'facteur de longueur');
  const voile = modele.elements.find((e) => e.type === 'Voile BA 20 cm');
  proche(assert, voile.m.epaisseur, 0.2, 'épaisseur du voile en m');
  assert.deepEqual(modele.niveaux.map((n) => n.nom), ['RDC', 'R+1', 'R+2', 'R+3']);
  proche(assert, modele.niveaux[1].altitude, 2.9, 'altitude du R+1 en m');
});

test('volées d’escalier rattachées à un escalier : leur niveau est retrouvé', async () => {
  const modele = await analyser('assets/exemple/residence-les-tilleuls.ifc');
  const volees = modele.elements.filter((e) => e.famille === 'escaliers');
  assert.equal(volees.length, 6);
  assert.ok(volees.every((v) => v.niveau), 'chaque volée a un niveau');
});

test('menuiseries reliées à leur mur par la réservation', async () => {
  const modele = await analyser('assets/exemple/residence-les-tilleuls.ifc');
  const voiles = modele.elements.filter((e) => e.type === 'Voile BA 20 cm');
  assert.equal(voiles.reduce((s, v) => s + v.m.fenetres, 0), 27 + 4); // F1 : 27 aux étages + 4 au RDC
  assert.equal(voiles.reduce((s, v) => s + v.m.portes, 0), 12 + 1); // PF2 + porte d'entrée
});

test('% de façade vitrée de l’exemple : baies extérieures / (voiles BA 20 + maçonnerie), doublages exclus', async () => {
  const modele = await analyser('assets/exemple/residence-les-tilleuls.ifc');
  const verite = attendu('attendu.json').familles;
  const baies = Object.values(verite.menuiseries).filter((t) => t.exterieur).reduce((s, t) => s + t.surface, 0);
  const facade = verite.murs['Voile BA 20 cm'].brute + verite.murs['Maçonnerie bloc 20 cm'].brute;
  proche(assert, pourcentageVitre(modele.elements), (baies / facade) * 100, '% de façade vitrée');
});

test('objet générique sans type prédéfini : aucun plantage, ignoré du métré', async () => {
  const modele = await analyser('assets/exemple/residence-les-tilleuls.ifc');
  assert.ok(modele.ignores.IfcBuildingElementProxy >= 1);
});

test('fichier sans quantités de base : repli sur les propriétés Revit « Cotes »', async () => {
  const modele = await analyser('tests/fixtures/residence-sans-quantites.ifc');
  const verite = attendu('attendu-sans-quantites.json');
  const { lignes } = regrouper(modele.elements, FAMILLES.murs);
  for (const [type, v] of Object.entries(verite.familles.murs)) {
    const l = lignes.find((x) => x.type === type);
    proche(assert, l.sommes.brute, v.brute, `surface brute de « ${type} »`);
    proche(assert, l.sommes.longueur, v.longueur, `longueur de « ${type} »`);
  }
  // Voiles : toutes les baies sont des menuiseries, la surface nette est donc exacte
  const voile = lignes.find((x) => x.type === 'Voile BA 20 cm');
  proche(assert, voile.sommes.nette, verite.familles.murs['Voile BA 20 cm'].nette, 'surface nette des voiles');
  assert.ok(modele.elements.filter((e) => e.famille === 'murs').every((e) => e.source !== 'fichier'), 'source signalée');
  const fen = modele.elements.find((e) => e.famille === 'menuiseries');
  assert.ok(fen.m.surface > 0, 'surface des menuiseries retrouvée par largeur × hauteur');
});
