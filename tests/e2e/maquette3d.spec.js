// Maquette 3D : affichage, sélection reliée au métré, filtres, coupe, mémoire entre deux visites.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ouvrir, ouvrirExemple } from './aide.js';

/** Part des pixels dessinés dans la vue 3D (0 = vue vide). */
const pixelsDessines = (page) => page.evaluate(() => {
  const src = document.querySelector('.v3d-canvas canvas');
  const c = document.createElement('canvas');
  c.width = 160; c.height = 100;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, 160, 100);
  const d = ctx.getImageData(0, 0, 160, 100).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
  return n / (160 * 100);
});

async function ouvrir3d(page) {
  await page.locator('#nav button[data-page="3d"]').click();
  await expect(page.locator('.v3d-canvas canvas')).toBeVisible();
  await expect.poll(() => pixelsDessines(page)).toBeGreaterThan(0.1);
}

test.beforeEach(async ({ page }) => {
  await ouvrir(page);
  await ouvrirExemple(page);
});

test('la maquette s’affiche en 3D, avec ses familles et sans erreur', async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await ouvrir3d(page);
  await expect(page.locator('.frow')).toHaveCount(11);
  await expect(page.locator('.frow').filter({ hasText: 'Murs' })).toContainText('103');
  expect(erreurs).toEqual([]);
});

test('un clic dans la maquette sélectionne un type et donne son métré', async ({ page }) => {
  await ouvrir3d(page);
  const vue = await page.locator('.viewport').boundingBox();
  await page.mouse.click(vue.x + vue.width / 2, vue.y + vue.height / 2);
  await expect(page.locator('.side-panel .label')).toContainText('Sélection');
  await expect(page.locator('.side-panel')).toContainText('en surbrillance');
  await page.keyboard.press('Escape');
  await expect(page.locator('.side-panel h3')).toHaveText('Familles');
});

test('du métré à la 3D et retour : même type, mêmes chiffres', async ({ page }) => {
  await page.locator('#nav button[data-page="menuiseries"]').click();
  await page.getByRole('button', { name: 'F1 120x135' }).click();
  await page.getByRole('button', { name: 'Voir en 3D' }).click();
  await expect(page.getByRole('heading', { name: 'Maquette 3D', level: 2 })).toBeVisible();
  await expect(page.locator('.side-panel h3')).toHaveText('F1 120x135');
  await expect(page.locator('.side-panel')).toContainText('31 menuiseries en surbrillance');
  await expect(page.locator('.side-panel .mini')).toContainText('50,22 m²');
  await page.getByRole('button', { name: 'Voir le métré de ce type' }).click();
  await expect(page.getByRole('heading', { name: 'Menuiseries', level: 2 })).toBeVisible();
  await expect(page.locator('.side-panel h3')).toHaveText('F1 120x135');
});

test('niveaux, familles masquées et coupe', async ({ page }) => {
  await ouvrir3d(page);
  const avant = await pixelsDessines(page);
  await page.locator('.frow').filter({ hasText: 'Murs' }).click();
  await expect(page.locator('.frow').filter({ hasText: 'Murs' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'R+2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'R+2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => pixelsDessines(page)).toBeLessThan(avant);
  await page.locator('#coupe-3d').fill('0.4');
  await expect(page.locator('#coupe-valeur')).toHaveText('40 %');
});

test('après un rechargement, la 3D est reprise de la mémoire du navigateur', async ({ page }) => {
  await ouvrir3d(page);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-pret', '1');
  await ouvrir3d(page);
});

test('analyse ancienne sans 3D : message clair, puis 3D préparée en rouvrant le fichier', async ({ page }) => {
  await ouvrir3d(page);
  // Simule une analyse faite avant la vue 3D : la géométrie mémorisée est effacée
  await page.evaluate(() => new Promise((ok) => {
    const r = indexedDB.open('ifc-analyzer');
    r.onsuccess = () => { const tx = r.result.transaction('geometries', 'readwrite'); tx.objectStore('geometries').clear(); tx.oncomplete = ok; };
  }));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-pret', '1');
  await page.locator('#nav button[data-page="3d"]').click();
  await expect(page.getByRole('heading', { name: 'La 3D de ce fichier n’est pas encore prête' })).toBeVisible();
  await page.locator('#choix-fichier').setInputFiles({ name: 'residence-les-tilleuls.ifc', mimeType: 'application/octet-stream',
    buffer: await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch('assets/exemple/residence-les-tilleuls.ifc')).arrayBuffer()))).then((a) => Buffer.from(a)),
    lastModified: 1767225600000 });
  await expect(page.locator('.v3d-canvas canvas')).toBeVisible();
});

test('changer de maquette remet les filtres 3D à zéro (niveaux, familles, coupe)', async ({ page }) => {
  await page.locator('#nav button[data-page="3d"]').click();
  await expect(page.locator('.v3d-canvas canvas')).toBeVisible();
  await page.getByRole('button', { name: 'R+3', exact: true }).click();
  await page.locator('.frow').filter({ hasText: 'Murs' }).click();
  await expect(page.locator('.frow.cache')).toHaveCount(1);
  // Une autre maquette s'ouvre : ses niveaux et familles ne doivent pas hériter des filtres de la précédente
  await page.locator('#choix-fichier').setInputFiles('tests/fixtures/residence-ifc2x3.ifc');
  await expect(page.locator('.file-tab')).toHaveCount(2);
  await page.locator('#nav button[data-page="3d"]').click();
  await expect(page.locator('.v3d-canvas canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tous niveaux' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.frow.cache')).toHaveCount(0);
  await expect(page.locator('.side-panel .note.warn')).toHaveCount(0); // toute la maquette a sa 3D
});

test('un objet isolé à des kilomètres (point topo, famille égarée) ne vide pas la vue 3D', async ({ page }) => {
  // Copie de l'exemple dont un poteau est placé à 47 km : la caméra doit rester cadrée sur le bâtiment
  let ifc = readFileSync('assets/exemple/residence-les-tilleuls.ifc', 'utf8');
  const lignes = Object.fromEntries([...ifc.matchAll(/^#(\d+)=(.*);\s*$/gm)].map((m) => [m[1], m[2]]));
  const poteau = Object.values(lignes).find((v) => v.startsWith('IFCCOLUMN('));
  const placement = poteau.match(/#(\d+)/g)[1].slice(1);
  const axe = lignes[placement].match(/IFCLOCALPLACEMENT\([^,]*,#(\d+)\)/)[1];
  const point = lignes[axe].match(/IFCAXIS2PLACEMENT3D\(#(\d+)/)[1];
  ifc = ifc.replace(`#${point}=${lignes[point]};`, `#${point}=IFCCARTESIANPOINT((40000000.,25000000.,0.));`);
  await page.locator('#choix-fichier').setInputFiles({ name: 'objet-isole.ifc', mimeType: 'application/octet-stream', buffer: Buffer.from(ifc) });
  await expect(page.locator('.file-tab')).toHaveCount(2);
  await page.locator('#nav button[data-page="3d"]').click();
  await expect(page.locator('.v3d-canvas canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const c = document.querySelector('.v3d-canvas canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    const px = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4);
    g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, px);
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200 && px[i] + px[i + 1] + px[i + 2] > 400) n++;
    return n / (px.length / 4);
  }), { timeout: 20000 }).toBeGreaterThan(0.1); // le bâtiment occupe plus de 10 % de la vue (0 % avant la correction)
});
