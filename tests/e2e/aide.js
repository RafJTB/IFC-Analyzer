// Outils communs aux tests navigateur.
import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';

export const attendu = JSON.parse(readFileSync(new URL('../fixtures/attendu.json', import.meta.url), 'utf8'));

/** « 2 342,52 » → 2342.52 */
export const nombre = (texte) => Number(String(texte).replace(/[\s  ]/g, '').replace(',', '.'));

/** Ouvre l'appli et relève les erreurs de la console (une erreur = test raté). */
export async function ouvrir(page, chemin = '/index.html') {
  const erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(chemin);
  await expect(page.locator('html')).toHaveAttribute('data-pret', '1');
  return erreurs;
}

/** Ouvre l'IFC d'exemple et attend la fin de l'analyse. */
export async function ouvrirExemple(page) {
  await page.getByRole('button', { name: "Essayer avec l'exemple" }).first().click();
  await expect(page.locator('.fam-card').first()).toBeVisible();
}

/** Valeur du pied de tableau pour une colonne (par son titre). */
export async function totalColonne(page, titre) {
  const entetes = await page.locator('.tbl thead th').allInnerTexts();
  const i = entetes.findIndex((t) => t.toLowerCase().startsWith(titre.toLowerCase()));
  if (i < 0) throw new Error(`colonne « ${titre} » introuvable : ${entetes.join(' | ')}`);
  return nombre(await page.locator('.tbl tfoot td').nth(i).innerText());
}

export const somme = (famille, champ) => Object.values(attendu.familles[famille]).reduce((s, t) => s + (t[champ] ?? 0), 0);
