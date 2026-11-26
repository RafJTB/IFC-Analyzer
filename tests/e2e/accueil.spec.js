import { test, expect } from '@playwright/test';
import { ouvrir, ouvrirExemple } from './aide.js';

test('premier lancement : accueil vide, deux actions, aucune erreur', async ({ page }) => {
  const erreurs = await ouvrir(page);
  await expect(page.getByRole('heading', { name: 'Bonjour !' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ouvrir un fichier IFC' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: "Essayer avec l'exemple" })).toBeVisible();
  await expect(page.locator('#fichiers')).toContainText('Aucun fichier ouvert');
  expect(erreurs).toEqual([]);
});

test("l'exemple s'analyse : synthèse, familles, compteurs de la navigation", async ({ page }) => {
  const erreurs = await ouvrir(page);
  await ouvrirExemple(page);
  await expect(page.locator('.hero')).toContainText('266 éléments métrés sur 4 niveaux');
  await expect(page.locator('.tiles .tile').first()).toContainText('266');
  await expect(page.locator('.fam-row')).toHaveCount(7);
  await page.locator('.fam-row').filter({ hasText: 'Menuiseries' }).click();
  await expect(page.getByRole('heading', { name: 'Menuiseries', level: 2 })).toBeVisible();
  await page.locator('#nav button[data-page="accueil"]').click();
  await expect(page.locator('#nav button[data-page="murs"] .cnt')).toHaveText('103');
  await expect(page.locator('#nav button[data-page="menuiseries"] .cnt')).toHaveText('76');
  await expect(page.locator('.file-tab')).toHaveCount(1);
  await expect(page.locator('.recent-row')).toHaveCount(1);
  expect(erreurs).toEqual([]);
});

test('après un rechargement, la maquette ouverte et la page sont retrouvées', async ({ page }) => {
  await ouvrir(page);
  await ouvrirExemple(page);
  await page.locator('#nav button[data-page="structure"]').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-pret', '1');
  await expect(page.locator('.file-tab')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Structure', level: 2 })).toBeVisible();
  await expect(page.locator('.tbl tbody tr')).toHaveCount(2);
});

test('retirer une analyse récente puis annuler', async ({ page }) => {
  await ouvrir(page);
  await ouvrirExemple(page);
  await page.locator('.file-tab .ft-close').click();
  await expect(page.locator('.file-tab')).toHaveCount(0);
  await page.getByRole('button', { name: /Retirer « residence-les-tilleuls.ifc »/ }).click();
  await expect(page.locator('.recent-row')).toHaveCount(0);
  await page.locator('.toast').filter({ hasText: 'retiré' }).getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('.recent-row')).toHaveCount(1);
  await page.locator('.recent-row .r-main').click();
  await expect(page.locator('.file-tab')).toHaveCount(1);
});

test('ouvrir un vrai fichier (IFC2x3) puis refuser un fichier qui n’est pas un IFC', async ({ page }) => {
  await ouvrir(page);
  await page.locator('#choix-fichier').setInputFiles('tests/fixtures/residence-ifc2x3.ifc');
  await expect(page.locator('.hero')).toContainText('266 éléments métrés');
  await expect(page.locator('.recent-row')).toContainText('IFC2X3');
  await page.locator('#choix-fichier').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') });
  await expect(page.locator('.toast.err')).toContainText('n’est pas un fichier IFC');
});

test('un fichier corrompu affiche un message clair, sans bloquer l’appli', async ({ page }) => {
  await ouvrir(page);
  await page.locator('#choix-fichier').setInputFiles({ name: 'casse.ifc', mimeType: 'application/octet-stream', buffer: Buffer.from('ceci n’est pas un IFC') });
  await expect(page.locator('.toast.err')).toBeVisible();
  await expect(page.locator('.analyse')).toHaveCount(0);
  await ouvrirExemple(page);
});

test('aperçu 3D : dans l’en-tête et en vignette des analyses récentes, retrouvé au rechargement', async ({ page }) => {
  await ouvrir(page);
  await ouvrirExemple(page);
  await expect(page.locator('.hero-3d img')).toBeVisible();
  await expect(page.locator('.recent-row .r-thumb')).toHaveAttribute('style', /data:image/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-pret', '1');
  await expect(page.locator('.hero-3d img')).toHaveAttribute('src', /^data:image\/(webp|png)/);
});

test('barre du haut : avec plusieurs fichiers ouverts, la recherche garde sa place', async ({ page }) => {
  await ouvrir(page);
  await page.locator('#choix-fichier').setInputFiles('tests/fixtures/residence-ifc2x3.ifc');
  await expect(page.locator('.file-tab')).toHaveCount(1);
  await page.locator('#choix-fichier').setInputFiles('tests/fixtures/residence-sans-quantites.ifc');
  await expect(page.locator('.file-tab')).toHaveCount(2);
  await page.keyboard.press('Control+k'); // une maquette est ouverte : l'exemple s'ouvre depuis la recherche
  await page.keyboard.type('exemple');
  await page.keyboard.press('Enter');
  await expect(page.locator('.file-tab')).toHaveCount(3);
  const largeur = await page.locator('#btn-recherche').evaluate((e) => e.getBoundingClientRect().width);
  expect(largeur).toBeGreaterThanOrEqual(259);
});
