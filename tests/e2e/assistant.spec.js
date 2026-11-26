// Assistant de l'accueil : questions sur la maquette, réponses calculées avec le métré, liens vers le détail.
import { test, expect } from '@playwright/test';
import { attendu, nombre, ouvrir, ouvrirExemple, somme } from './aide.js';

test.beforeEach(async ({ page }) => {
  await ouvrir(page);
  await ouvrirExemple(page);
});

const poser = async (page, question) => {
  await page.getByRole('textbox', { name: 'Question sur la maquette' }).fill(question);
  await page.getByRole('button', { name: 'Envoyer la question' }).click();
};
const derniere = (page) => page.locator('#chat .msg.bot').last();

test('une question, une réponse exacte, puis le détail dans la page de métré', async ({ page }) => {
  await poser(page, 'Combien de portes au RDC ?');
  await expect(page.locator('#chat .msg.me').last()).toHaveText('Combien de portes au RDC ?');
  const portes = ['Porte 83x204', 'PF2 90x215', "Porte d'entrée 140x220"].reduce((s, t) => s + (attendu.familles.menuiseries[t]['niveau:RDC'] ?? 0), 0);
  await expect(derniere(page).locator('.rt')).toHaveText('Portes au RDC');
  expect(nombre(await derniere(page).locator('.rv b').first().innerText())).toBe(portes);
  // La saisie est vidée et garde le focus : on peut enchaîner
  await expect(page.locator('#chat-saisie')).toHaveValue('');
  await expect(page.locator('#chat-saisie')).toBeFocused();

  await derniere(page).getByRole('button', { name: 'Voir dans Menuiseries (fenêtres et portes)' }).click();
  await expect(page.getByRole('heading', { name: 'Menuiseries', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'RDC', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // La conversation est gardée en revenant à l'accueil
  await page.locator('#nav button[data-page="accueil"]').click();
  await expect(page.locator('#chat .msg.bot')).toHaveCount(1);
});

test('questions proposées, surface des murs, question incomprise', async ({ page }) => {
  await page.locator('.chat-hello').getByRole('button', { name: 'Surface des murs extérieurs' }).click();
  await expect(derniere(page).locator('.rt')).toHaveText('Murs extérieurs');
  const ext = Object.values(attendu.familles.murs).filter((t) => t.exterieur > 0).reduce((s, t) => s + t.nette, 0);
  expect(Math.abs(nombre((await derniere(page).locator('.rv b').first().innerText()).replace('m²', '')) - ext)).toBeLessThan(0.006);
  await expect(derniere(page)).toContainText('doublages');

  await poser(page, 'surface des murs');
  expect(Math.abs(nombre((await derniere(page).locator('.rv b').first().innerText()).replace('m²', '')) - somme('murs', 'nette'))).toBeLessThan(0.006);

  await poser(page, 'bonjour');
  await expect(derniere(page)).toContainText('Je n’ai pas compris');
  await derniere(page).getByRole('button', { name: 'Fenêtres par niveau' }).click();
  await expect(derniere(page).locator('.rd li')).toHaveCount(4);
});

test('recherche Ctrl K : « Poser une question à l’assistant » donne la main à la saisie', async ({ page }) => {
  await page.locator('#nav button[data-page="murs"]').click();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('assistant');
  await page.keyboard.press('Enter');
  await expect(page.locator('#chat-saisie')).toBeFocused();
});
