// Accessibilité (axe-core), dans les deux thèmes, sur les écrans principaux ; clavier ; téléphone.
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { ouvrir, ouvrirExemple } from './aide.js';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function verifier(page, contexte) {
  await page.addScriptTag({ path: AXE });
  // Contraste mesuré une fois les blocs arrivés (pendant le fondu, ils sont encore transparents)
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
  const res = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .map((v) => `${v.id} (${v.impact}) : ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
  expect(res, `${contexte}\n${res.join('\n')}`).toEqual([]);
}

for (const theme of ['dark', 'light']) {
  test.describe(`thème ${theme === 'dark' ? 'sombre' : 'clair'}`, () => {
    test.use({ colorScheme: theme, bypassCSP: true }); // bypassCSP : seulement pour injecter axe

    test('accueil vide, accueil avec maquette, pages de métré : 0 violation', async ({ page }) => {
      await ouvrir(page);
      await verifier(page, 'accueil vide');
      await ouvrirExemple(page);
      await verifier(page, 'accueil avec maquette');
      for (const p of ['murs', 'menuiseries', 'sols-plafonds', 'escaliers']) {
        await page.locator(`#nav button[data-page="${p}"]`).click();
        await verifier(page, `page ${p}`);
      }
      await page.locator('#nav button[data-page="3d"]').click();
      await expect(page.locator('.v3d-canvas canvas')).toBeVisible();
      await verifier(page, 'maquette 3D');
      await page.locator('#nav button[data-page="murs"]').click();
      await page.getByRole('button', { name: 'Voir en 3D' }).click();
      await expect(page.locator('.side-panel .mini')).toBeVisible();
      await verifier(page, 'maquette 3D avec sélection');
      await page.keyboard.press('Control+k');
      await page.keyboard.type('voile');
      await verifier(page, 'recherche Ctrl K');
    });
  });
}

test('navigation au clavier : lien d’évitement, focus visible, Ctrl O ouvre le choix de fichier', async ({ page }) => {
  await ouvrir(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
  await page.keyboard.press('Tab');
  const contour = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  expect(contour).not.toBe('none');
  // L'interception du sélecteur de fichier est activée de façon asynchrone par Playwright :
  // un aller-retour avec la page garantit qu'elle est en place avant d'appuyer sur la touche.
  const attente = page.waitForEvent('filechooser');
  await page.evaluate(() => 0);
  await page.keyboard.press('Control+o');
  const choix = await attente;
  expect(choix.isMultiple()).toBe(true);
});

test('thème mémorisé d’une visite à l’autre', async ({ page }) => {
  await ouvrir(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Passer en thème clair' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test.describe('téléphone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('aucun défilement horizontal, métré lisible', async ({ page }) => {
    await ouvrir(page);
    await ouvrirExemple(page);
    await page.locator('#nav button[data-page="murs"]').click();
    await expect(page.locator('.tbl')).toBeVisible();
    const [page_, ecran] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(page_).toBeLessThanOrEqual(ecran);
  });
});
