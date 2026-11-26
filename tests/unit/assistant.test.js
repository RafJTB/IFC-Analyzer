import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comprendre, repondre, suggestions } from '../../js/metre/assistant.js';
import { analyser, attendu } from './aide.js';

// Les réponses sont comparées aux valeurs calculées par le générateur de l'exemple, indépendamment de l'appli
const A = attendu('attendu.json').familles;
const modele = await analyser('assets/exemple/residence-les-tilleuls.ifc');
const NIVEAUX = ['RDC', 'R+1', 'R+2', 'R+3'];
const nombre = (texte) => Number(String(texte).replace(/[^\d,.-]/g, '').replace(',', '.'));
const somme = (famille, champ, filtre = () => true) => Object.entries(A[famille]).filter(([t, v]) => filtre(t, v)).reduce((s, [, v]) => s + (v[champ] ?? 0), 0);
const proche = (reel, voulu, message) => assert.ok(Math.abs(reel - voulu) < 0.006, `${message} : obtenu ${reel}, attendu ${voulu}`);

test('comprendre : famille, grandeur, niveau, extérieur, par niveau', () => {
  const d = comprendre('Surface des murs extérieurs au R+1 ?', NIVEAUX);
  assert.deepEqual([d.familles, d.grandeur, d.niveaux, d.statut], [['murs'], 'surface', ['R+1'], 'ext']);
  assert.deepEqual(comprendre('fenêtres par niveau', NIVEAUX).parNiveau, true);
  assert.equal(comprendre('fenêtres par niveau', NIVEAUX).genre, 'Fenêtre');
  assert.deepEqual(comprendre('portes du rez-de-chaussée', NIVEAUX).niveaux, ['RDC']);
  assert.deepEqual(comprendre('éléments au 2e étage', NIVEAUX).niveaux, ['R+2']);
  assert.equal(comprendre('combien de m² de plafonds', NIVEAUX).grandeur, 'surface'); // « m² » l'emporte sur « combien »
  assert.equal(comprendre('surface brute des voiles', NIVEAUX).grandeur, 'brute');
  assert.deepEqual(comprendre('la structure', NIVEAUX).familles, ['poteaux', 'poutres', 'bords_dalle']);
  assert.deepEqual(comprendre('combien de marches', NIVEAUX).familles, ['escaliers']);
});

test('surface des murs, nombre de murs : les chiffres du métré', () => {
  const r = repondre('surface des murs', modele);
  proche(nombre(r.valeurs[0].valeur), somme('murs', 'nette'), 'surface nette');
  assert.equal(nombre(r.valeurs[1].valeur), somme('murs', 'nombre'));
  const n = repondre('combien de murs ?', modele);
  assert.equal(nombre(n.valeurs[0].valeur), somme('murs', 'nombre'));
  assert.equal(n.liens[0].page, 'murs');
});

test('un type précis par ses mots : surface brute des voiles BA 20', () => {
  const r = repondre('surface brute des voiles BA 20', modele);
  assert.match(r.titre, /Voile BA 20 cm/);
  proche(nombre(r.valeurs[0].valeur), A.murs['Voile BA 20 cm'].brute, 'surface brute');
  assert.equal(r.liens[0].type, 'Voile BA 20 cm');
  const c = repondre('surface des cloisons', modele);
  proche(nombre(c.valeurs[0].valeur), somme('murs', 'nette', (t) => t.startsWith('Cloison')), 'cloisons');
  assert.match(c.titre, /2 types « cloison »/);
});

test('murs extérieurs : les doublages marqués « extérieurs » sont signalés', () => {
  const r = repondre('surface des murs extérieurs', modele);
  proche(nombre(r.valeurs[0].valeur), somme('murs', 'nette', (t, v) => v.exterieur > 0), 'murs extérieurs');
  assert.match(r.texte, /doublages/);
});

test('portes au RDC, fenêtres par niveau (genre et niveau)', () => {
  const p = repondre('combien de portes au RDC ?', modele);
  const portesRdc = ['Porte 83x204', 'PF2 90x215', 'Porte d\'entrée 140x220'].reduce((s, t) => s + (A.menuiseries[t]['niveau:RDC'] ?? 0), 0);
  assert.equal(nombre(p.valeurs[0].valeur), portesRdc);
  assert.equal(p.titre, 'Portes au RDC');
  assert.deepEqual(p.liens[0].niveaux, ['RDC']);
  const f = repondre('Fenêtres par niveau', modele);
  assert.deepEqual(f.details.map((x) => [x.libelle, nombre(x.valeur)]), NIVEAUX.map((n) => [n, A.menuiseries['F1 120x135'][`niveau:${n}`]]));
});

test('autres familles : dalles, garde-corps, escaliers, structure', () => {
  proche(nombre(repondre('Volume de béton des dalles', modele).valeurs[0].valeur), somme('dalles', 'volume'), 'volume des dalles');
  proche(nombre(repondre('longueur de garde-corps', modele).valeurs[0].valeur), somme('garde_corps', 'longueur'), 'garde-corps');
  assert.equal(nombre(repondre('combien de marches ?', modele).valeurs[0].valeur), somme('escaliers', 'marches'));
  const s = repondre('structure', modele);
  assert.deepEqual(s.details.map((x) => x.libelle), ['Poteaux', 'Poutres', 'Bords de dalle']);
  assert.equal(s.titre, 'Structure');
});

test('façade vitrée : menuiseries extérieures / murs de façade', () => {
  const baies = somme('menuiseries', 'surface', (t, v) => v.exterieur > 0);
  const facade = A.murs['Voile BA 20 cm'].brute + A.murs['Maçonnerie bloc 20 cm'].brute;
  const r = repondre('% de façade vitrée', modele);
  assert.ok(Math.abs(nombre(r.valeurs[0].valeur) - (baies / facade) * 100) < 0.051);
});

test('grandeur absente, question incomprise, suggestions', () => {
  assert.match(repondre('volume des garde-corps', modele).texte, /Je n’ai pas cette grandeur/);
  const r = repondre('bonjour', modele);
  assert.equal(r.ok, false);
  assert.ok(r.suggestions.length >= 3);
  assert.deepEqual(suggestions(modele), ['Surface des murs extérieurs', 'Fenêtres par niveau', '% de façade vitrée', 'Volume de béton des dalles']);
  assert.match(repondre('portes au R+9', modele).titre ?? '', /Portes/); // niveau inconnu : ignoré, pas d'erreur
});

test('maquette sans quantités : l’assistant le signale', async () => {
  const sans = await analyser('tests/fixtures/residence-sans-quantites.ifc');
  const r = repondre('éléments sans quantités', sans);
  const n = sans.elements.filter((e) => e.source === 'absent').length;
  if (n) assert.equal(nombre(r.valeurs[0].valeur), n);
  else assert.equal(r.titre, 'Tout est en ordre');
  assert.equal(repondre('éléments sans quantités', modele).titre, 'Tout est en ordre');
});
