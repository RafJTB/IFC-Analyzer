// Outils communs aux tests : ouvre un IFC avec web-ifc (version Node) et l'analyse comme le fait l'appli.
import { readFileSync } from 'node:fs';
import * as W from 'web-ifc';
import { extraireModele } from '../../js/ifc/extract.js';
import { preparerModele } from '../../js/metre/quantites.js';

let api = null;

export async function analyser(chemin) {
  if (!api) {
    api = new W.IfcAPI();
    await api.Init();
  }
  const id = api.OpenModel(new Uint8Array(readFileSync(new URL(`../../${chemin}`, import.meta.url))));
  try {
    return preparerModele(extraireModele(api, W, id));
  } finally {
    api.CloseModel(id);
  }
}

export const attendu = (nom) => JSON.parse(readFileSync(new URL(`../fixtures/${nom}`, import.meta.url), 'utf8'));

/** Égalité à 1e-6 près (les quantités passent par des flottants). */
export function proche(assert, reel, voulu, message) {
  assert.ok(Math.abs((reel ?? 0) - voulu) < 1e-6, `${message} : obtenu ${reel}, attendu ${voulu}`);
}
