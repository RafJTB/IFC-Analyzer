import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versCsv } from '../../js/metre/export.js';

// Une famille réduite : un texte, des niveaux (avec virgule), un nombre et une surface
const config = {
  colonnes: [
    { cle: 'nombre', titre: 'Nb', unite: 'U', decimales: 0, total: true },
    { genre: 'niveaux', titre: 'Niveaux' },
    { cle: 'surface', titre: 'Surface', unite: 'm²', decimales: 2, total: true },
  ],
};
const groupe = {
  lignes: [{ type: 'Voile "BA" 20', nombre: 3, niveaux: ['RDC', 'R+1'], sommes: { surface: 1234.5 } }],
  total: { nombre: 3, sommes: { surface: 1234.5 } },
};

test('CSV au format français : point-virgule, virgule décimale, BOM', () => {
  const csv = versCsv(config, groupe);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const lignes = csv.slice(1).trim().split('\r\n');
  assert.equal(lignes[0], 'Type;Nb (U);Niveaux;Surface (m²)');
  // Les niveaux « RDC, R+1 » n'ont pas besoin de guillemets : la virgule n'est pas le séparateur
  assert.equal(lignes[1], '"Voile ""BA"" 20";3;RDC, R+1;1234,50');
  assert.equal(lignes[2], 'Total;3;;1234,50');
});

test('CSV au format anglais (Excel en anglais, Google Sheets) : virgule, point décimal', () => {
  const lignes = versCsv(config, groupe, 'en').slice(1).trim().split('\r\n');
  assert.equal(lignes[0], 'Type,Nb (U),Niveaux,Surface (m²)');
  assert.equal(lignes[1], '"Voile ""BA"" 20",3,"RDC, R+1",1234.50');
  assert.equal(lignes[2], 'Total,3,,1234.50');
});

test('format inconnu : format français', () => {
  assert.equal(versCsv(config, groupe, 'xx'), versCsv(config, groupe, 'fr'));
});
