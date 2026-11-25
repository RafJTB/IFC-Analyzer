import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { attendu, nombre, ouvrir, ouvrirExemple, somme, totalColonne } from './aide.js';

test.beforeEach(async ({ page }) => {
  await ouvrir(page);
  await ouvrirExemple(page);
});

const proche = (a, b) => expect(Math.abs(a - b)).toBeLessThan(0.006);

test('murs : totaux du tableau = valeurs du fichier', async ({ page }) => {
  await page.locator('#nav button[data-page="murs"]').click();
  await expect(page.locator('.tbl tbody tr')).toHaveCount(Object.keys(attendu.familles.murs).length);
  proche(await totalColonne(page, 'Brute'), somme('murs', 'brute'));
  proche(await totalColonne(page, 'Nette'), somme('murs', 'nette'));
  proche(await totalColonne(page, 'Longueur'), somme('murs', 'longueur'));
  proche(await totalColonne(page, 'Volume'), somme('murs', 'volume'));
  expect(await totalColonne(page, 'Nb')).toBe(103);
});

test('murs : filtres statut et niveau, panneau de détail', async ({ page }) => {
  await page.locator('#nav button[data-page="murs"]').click();
  await page.getByRole('button', { name: 'Intérieurs' }).click();
  await page.getByRole('button', { name: 'RDC', exact: true }).click();
  // Intérieurs au RDC : 2 refends + 6 cloisons 72/48
  expect(await totalColonne(page, 'Nb')).toBe(8);
  await page.getByRole('button', { name: 'Cloison 72/48' }).click();
  await expect(page.locator('.side-panel h3')).toHaveText('Cloison 72/48');
  await expect(page.locator('.side-panel')).toContainText('6 portes');
  await page.getByRole('button', { name: 'Tous niveaux' }).click();
  expect(await totalColonne(page, 'Nb')).toBe(41);
});

test('filtre texte sans résultat, puis réinitialisation', async ({ page }) => {
  await page.locator('#nav button[data-page="murs"]').click();
  await page.locator('#filtre-texte').fill('zzz');
  await expect(page.getByRole('heading', { name: 'Aucun résultat avec ces filtres' })).toBeVisible();
  await expect(page.locator('#filtre-texte')).toBeFocused();
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
  await expect(page.locator('.tbl tbody tr')).toHaveCount(6);
});

test('menuiseries : nombre, surface et % de façade vitrée', async ({ page }) => {
  await page.locator('#nav button[data-page="menuiseries"]').click();
  expect(await totalColonne(page, 'Nb')).toBe(76);
  proche(await totalColonne(page, 'Surface'), somme('menuiseries', 'surface'));
  const baies = Object.values(attendu.familles.menuiseries).filter((t) => t.exterieur).reduce((s, t) => s + t.surface, 0);
  const facade = attendu.familles.murs['Voile BA 20 cm'].brute + attendu.familles.murs['Maçonnerie bloc 20 cm'].brute;
  const tuile = page.locator('.tile').filter({ hasText: 'Façade vitrée' }).locator('b');
  expect(Math.abs(nombre((await tuile.innerText()).replace('%', '')) - (baies / facade) * 100)).toBeLessThan(0.051);
});

test('sols et plafonds, structure : un onglet par famille', async ({ page }) => {
  await page.locator('#nav button[data-page="sols-plafonds"]').click();
  for (const [onglet, famille] of [['Dalles', 'dalles'], ['Revêtements', 'revetements_sol'], ['Plafonds', 'plafonds']]) {
    await page.getByRole('button', { name: onglet, exact: true }).click();
    proche(await totalColonne(page, 'Surface'), somme(famille, 'surface'));
  }
  await page.locator('#nav button[data-page="structure"]').click();
  expect(await totalColonne(page, 'Nb')).toBe(8);
  await page.getByRole('button', { name: 'Poutres', exact: true }).click();
  proche(await totalColonne(page, 'Longueur'), somme('poutres', 'longueur'));
  await page.getByRole('button', { name: 'Bords de dalle', exact: true }).click();
  proche(await totalColonne(page, 'Longueur'), somme('bords_dalle', 'longueur'));
});

test('garde-corps, réseaux EP, escaliers', async ({ page }) => {
  await page.locator('#nav button[data-page="garde-corps"]').click();
  proche(await totalColonne(page, 'Longueur'), somme('garde_corps', 'longueur'));
  await page.locator('#nav button[data-page="reseaux-ep"]').click();
  proche(await totalColonne(page, 'Longueur'), somme('reseaux_ep', 'longueur'));
  await expect(page.locator('.tbl tbody')).toContainText('Ø100');
  await page.locator('#nav button[data-page="escaliers"]').click();
  expect(await totalColonne(page, 'Contremarches')).toBe(somme('escaliers', 'contremarches'));
});

test('export CSV lisible par Excel (point-virgule, virgule décimale)', async ({ page }) => {
  await page.locator('#nav button[data-page="murs"]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter en CSV' }).click()]);
  expect(dl.suggestedFilename()).toBe('residence-les-tilleuls - Murs.csv');
  const csv = readFileSync(await dl.path(), 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const lignes = csv.trim().split('\r\n');
  expect(lignes[0]).toContain('Type;Statut;Niveaux;Nb (U);Brute (m²)');
  expect(lignes).toHaveLength(1 + 6 + 1);
  expect(lignes.at(-1)).toMatch(/^Total;;;103;/);
});

test('copier une ligne pour Excel', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#nav button[data-page="murs"]').click();
  await page.getByRole('button', { name: 'Voile BA 20 cm' }).click();
  await page.getByRole('button', { name: 'Copier la ligne pour Excel' }).click();
  const texte = await page.evaluate(() => navigator.clipboard.readText());
  expect(texte.split('\n')[1]).toMatch(/^Voile BA 20 cm\t30\t/);
});

test('recherche Ctrl K : ouvre la bonne page avec le type sélectionné', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.type('garde-corps vitré');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Garde-corps', level: 2 })).toBeVisible();
  await expect(page.locator('.side-panel h3')).toHaveText('Garde-corps vitré');
});

test('tri des colonnes', async ({ page }) => {
  await page.locator('#nav button[data-page="murs"]').click();
  await page.getByRole('button', { name: /^Type/ }).click();
  await expect(page.locator('.tbl tbody tr').first()).toContainText('Cloison 72/48');
  await page.getByRole('button', { name: /^Nb/ }).click();
  await expect(page.locator('.tbl tbody tr').first()).toContainText(/Voile BA 20 cm|Doublage 10\+80/);
});
