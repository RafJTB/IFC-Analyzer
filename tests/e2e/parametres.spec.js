// Page Paramètres : sommaire, et chaque réglage réellement appliqué.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ouvrir, ouvrirExemple, totalColonne } from './aide.js';

const allerParametres = (page) => page.locator('#nav button[data-page="parametres"]').click();
const onglet = (page, nom) => page.getByRole('tab', { name: nom });

test('sommaire : une catégorie à la fois, flèches du clavier, catégorie retrouvée', async ({ page }) => {
  const erreurs = await ouvrir(page);
  await allerParametres(page);
  await expect(onglet(page, 'Analyse IFC')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.getByRole('tabpanel')).toContainText('Préparer la maquette 3D');

  await onglet(page, 'Export').click();
  await expect(page.getByRole('tabpanel')).toContainText('Format du tableur');
  await page.keyboard.press('ArrowDown');
  await expect(onglet(page, 'Affichage')).toBeFocused();
  await expect(onglet(page, 'Affichage')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('Animations');
  await page.keyboard.press('End');
  await expect(onglet(page, 'À propos')).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('Version 0.4.0');

  await page.reload();
  await expect(onglet(page, 'À propos')).toHaveAttribute('aria-selected', 'true');
  expect(erreurs).toEqual([]);
});

test('export au format anglais : virgule et point décimal, copie de ligne comprise', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ouvrir(page);
  await allerParametres(page);
  await onglet(page, 'Export').click();
  await page.getByRole('combobox', { name: 'Format du tableur' }).selectOption('en');

  await page.locator('#nav button[data-page="accueil"]').click();
  await ouvrirExemple(page);
  await page.locator('#nav button[data-page="murs"]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter en CSV' }).click()]);
  const lignes = readFileSync(await dl.path(), 'utf8').trim().split('\r\n');
  expect(lignes[0]).toContain('Type,');
  expect(lignes[0]).not.toContain(';');
  const total = lignes.at(-1).split(',');
  expect(total[0]).toBe('Total');
  expect(total.some((v) => /^\d+\.\d{2}$/.test(v))).toBe(true);

  await page.locator('.tbl tbody tr').first().click();
  await page.getByRole('button', { name: 'Copier la ligne pour Excel' }).click();
  const copie = await page.evaluate(() => navigator.clipboard.readText());
  expect(copie.split('\n')[1]).toMatch(/\t\d+\.\d{2}/);
});

test('sans préparation de la 3D : métré complet, et la page 3D l’explique', async ({ page }) => {
  await ouvrir(page);
  await allerParametres(page);
  const prepa = page.getByRole('checkbox', { name: /Préparer la maquette 3D/ });
  await expect(prepa).toBeChecked();
  await prepa.uncheck();
  await page.locator('#nav button[data-page="accueil"]').click();
  await ouvrirExemple(page);
  await expect(page.locator('.toast').filter({ hasText: 'analysé' })).not.toContainText('La 3D se prépare');
  await page.locator('#nav button[data-page="murs"]').click();
  expect(await totalColonne(page, 'Nb')).toBe(103);

  await page.locator('#nav button[data-page="3d"]').click();
  await expect(page.getByRole('heading', { name: 'La préparation de la 3D est désactivée' })).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir les paramètres' }).click();
  await expect(page.getByRole('heading', { name: 'Paramètres', level: 2 })).toBeVisible();
});

test('effacer toutes les analyses, puis annuler', async ({ page }) => {
  await ouvrir(page);
  await ouvrirExemple(page);
  await allerParametres(page);
  await onglet(page, 'Stockage et confidentialité').click();
  await expect(page.locator('#reg-place')).toContainText('1 analyse gardée');
  await page.getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.locator('.toast').filter({ hasText: '1 analyse effacée de ce navigateur.' })).toBeVisible();
  await expect(page.locator('#reg-place')).toContainText('0 analyse gardée');
  await expect(page.getByRole('button', { name: 'Tout effacer' })).toBeDisabled();

  await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('#reg-place')).toContainText('1 analyse gardée');
  await page.locator('#nav button[data-page="accueil"]').click();
  await expect(page.locator('.recent-row')).toHaveCount(1);
});

test('rouvrir les fichiers et animations : réglages respectés à la visite suivante', async ({ page }) => {
  await ouvrir(page);
  await ouvrirExemple(page);
  await allerParametres(page);
  await page.getByRole('checkbox', { name: /Rouvrir les fichiers/ }).uncheck();
  await onglet(page, 'Affichage').click();
  await page.getByRole('checkbox', { name: /Animations/ }).uncheck();
  await expect(page.locator('html')).toHaveAttribute('data-anim', 'off');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-pret', '1');
  await expect(page.locator('html')).toHaveAttribute('data-anim', 'off');
  await expect(page.locator('.files-vide')).toHaveText('Aucun fichier ouvert');
  // Changement de page sans fondu : aucune animation en cours
  await page.locator('#nav button[data-page="accueil"]').click();
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('.view')).length)).toBe(0);
});
