import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cle, familleDe, nettoyer, nomDeType } from '../../js/ifc/noms.js';

test('nom de type : priorité au type IFC, sinon nom Revit « Famille:Type:Id »', () => {
  assert.equal(nomDeType('Voile BA 20 cm', 'Mur de base:Autre:123456'), 'Voile BA 20 cm');
  assert.equal(nomDeType('Mur de base:Voile BA 20 cm', ''), 'Voile BA 20 cm');
  assert.equal(nomDeType('', 'Mur de base:Voile BA 20 cm:345678'), 'Voile BA 20 cm');
  assert.equal(nomDeType('', 'Fenêtre:F1 120x135:345068'), 'F1 120x135');
  assert.equal(nomDeType('', 'Poteau:123456'), 'Poteau');
  assert.equal(nomDeType('', 'Garde-corps - 548204'), 'Garde-corps');
  assert.equal(nomDeType('', '', 'Mur'), 'Mur');
  assert.equal(nomDeType('Inconnu', 'Non spécifié', 'Mur'), 'Mur');
});

test('nettoyer garde les dimensions et retire les identifiants', () => {
  assert.equal(nettoyer('F1 120x135'), 'F1 120x135');
  assert.equal(nettoyer('Cloison 72/48'), 'Cloison 72/48');
  assert.equal(nettoyer('Plafond BA13 : 1234567'), 'Plafond BA13');
  assert.equal(nettoyer('  Dalle   BA 20 '), 'Dalle BA 20');
  assert.equal(nettoyer('Mur - Inconnu'), 'Mur');
});

test('cle compare sans accents ni majuscules', () => {
  assert.equal(cle('Épaisseur'), 'epaisseur');
  assert.equal(cle(' Surface '), 'surface');
});

test('famille de métré selon la classe IFC, le type prédéfini et le nom', () => {
  assert.equal(familleDe('IfcWallStandardCase', '', 'Voile'), 'murs');
  assert.equal(familleDe('IFCWINDOW', '', ''), 'menuiseries');
  assert.equal(familleDe('IFCDOOR', '', ''), 'menuiseries');
  assert.equal(familleDe('IFCSLAB', 'FLOOR', 'Plancher'), 'dalles');
  assert.equal(familleDe('IFCCOVERING', 'CEILING', ''), 'plafonds');
  assert.equal(familleDe('IFCCOVERING', 'FLOORING', ''), 'revetements_sol');
  assert.equal(familleDe('IFCCOVERING', 'NOTDEFINED', 'Faux-plafond BA13'), 'plafonds');
  assert.equal(familleDe('IFCCOVERING', 'NOTDEFINED', 'Carrelage 45x45'), 'revetements_sol');
  assert.equal(familleDe('IFCCOVERING', 'CLADDING', 'Bardage bois'), null);
  assert.equal(familleDe('IFCBUILDINGELEMENTPROXY', '', 'Bord de dalle:Rive 20'), 'bords_dalle');
  assert.equal(familleDe('IFCSLAB', '', 'Rive de dalle'), 'bords_dalle');
  assert.equal(familleDe('IFCBUILDINGELEMENTPROXY', '', 'Objet générique'), null);
  assert.equal(familleDe('IFCPIPESEGMENT', '', 'Descente EP Ø100'), 'reseaux_ep');
  assert.equal(familleDe('IFCFLOWSEGMENT', '', 'Collecteur eaux pluviales'), 'reseaux_ep');
  assert.equal(familleDe('IFCPIPESEGMENT', '', 'Canalisation EU Ø100'), null);
  assert.equal(familleDe('IFCSTAIRFLIGHT', '', ''), 'escaliers');
  assert.equal(familleDe('IFCCOLUMN', '', ''), 'poteaux');
  assert.equal(familleDe('IFCBEAM', '', ''), 'poutres');
  assert.equal(familleDe('IFCRAILING', '', ''), 'garde_corps');
});
