// Page Personnalisation : fond d'écran, couleur d'accent, survol des blocs, effets.
import { test, expect } from '@playwright/test';
import { ouvrir } from './aide.js';

const variable = (page, nom) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), nom);
const allerPerso = (page) => page.locator('#nav button[data-page="personnalisation"]').click();

test('fond, couleur d’accent et survol : appliqués tout de suite et retrouvés au rechargement', async ({ page }) => {
  const erreurs = await ouvrir(page);
  await allerPerso(page);
  await expect(page.getByRole('heading', { name: 'Personnalisation', level: 2 })).toBeVisible();
  // Fond par défaut : celui de la version précédente
  await expect(page.locator('#vue').getByRole('button', { name: 'Maquette 3D', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Nature' }).click();
  await expect(page.locator('.bg-grid .bg-tile')).toHaveCount(5);
  await page.getByRole('button', { name: 'Dunes' }).click();
  await expect(page.getByRole('button', { name: 'Dunes' })).toHaveAttribute('aria-pressed', 'true');
  expect(await variable(page, '--bg-image')).toContain('assets/fonds/dunes.webp');

  await page.getByRole('button', { name: 'Vert', exact: true }).first().click();
  expect(await variable(page, '--accent-2')).toBe('#059669');
  await expect(page.locator('.accent-name').first()).toHaveText('Vert');

  await page.getByRole('button', { name: 'Blocs cliquables' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-hover', 'click');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-pret', '1');
  expect(await variable(page, '--bg-image')).toContain('assets/fonds/dunes.webp');
  expect(await variable(page, '--accent-2')).toBe('#059669');
  await expect(page.locator('html')).toHaveAttribute('data-hover', 'click');
  await expect(page.getByRole('button', { name: 'Dunes' })).toHaveAttribute('aria-pressed', 'true');
  expect(erreurs).toEqual([]);
});

test('effets : le fond suit le curseur ; réinitialiser, puis annuler', async ({ page }) => {
  await ouvrir(page);
  await allerPerso(page);
  await page.locator('#perso-flou').fill('30');
  expect(await variable(page, '--bg-blur')).toBe('30px');
  await expect(page.locator('#perso-flou-v')).toHaveText('30 px');
  await page.locator('#perso-panneaux').fill('200');
  await expect(page.locator('#perso-panneaux-v')).toHaveText('32 %'); // 16 % × 2 en thème sombre
  expect(await variable(page, '--panel-k')).toBe('2');

  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  expect(await variable(page, '--bg-blur')).toBe('14px');
  await expect(page.locator('#perso-flou')).toHaveValue('14');
  await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click();
  expect(await variable(page, '--bg-blur')).toBe('30px');
  await expect(page.locator('#perso-panneaux-v')).toHaveText('32 %');
});

test('ton image : importée, réduite, gardée et utilisée comme fond', async ({ page }) => {
  await ouvrir(page);
  await allerPerso(page);
  await page.locator('#choix-fond').setInputFiles('assets/fonds/montagnes-brume.webp');
  await expect(page.getByRole('button', { name: 'Ton image' }).last()).toHaveAttribute('aria-pressed', 'true');
  expect(await variable(page, '--bg-image')).toMatch(/^url\("data:image\/(webp|jpeg)/);
  await expect(page.getByRole('button', { name: 'Changer d’image' })).toBeVisible();
  await page.reload();
  expect(await variable(page, '--bg-image')).toMatch(/^url\("data:image\/(webp|jpeg)/);
});

test('thème clair : couleur d’accent recalculée, « Éclaircissement du fond »', async ({ page }) => {
  await ouvrir(page);
  await allerPerso(page);
  await page.getByRole('button', { name: 'Vert', exact: true }).first().click();
  await expect(page.getByText('Assombrissement du fond')).toBeVisible();
  await page.getByRole('button', { name: 'Passer en thème clair' }).click();
  expect(await variable(page, '--accent-2')).toBe('#2ba680'); // la même couleur, éclaircie pour le thème clair
  await expect(page.getByText('Éclaircissement du fond')).toBeVisible();
  await expect(page.locator('#perso-panneaux-v')).toHaveText('28 %');
});
