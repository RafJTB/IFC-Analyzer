// Analyse d'un fichier IFC hors de la page (Web Worker) : l'interface reste fluide, même sur une grosse maquette.
// Messages reçus : { octets: ArrayBuffer, nom } — envoyés : progression, resultat ou erreur.
import * as W from '../../vendor/web-ifc/web-ifc-api.js';
import { extraireModele } from './extract.js';
import { preparerModele } from '../metre/quantites.js';

let api = null;

async function moteur() {
  if (!api) {
    api = new W.IfcAPI();
    // Un seul fil d'exécution : pas besoin d'en-têtes spéciaux sur GitHub Pages
    await api.Init((chemin) => new URL(`../../vendor/web-ifc/${chemin}`, import.meta.url).href, true);
  }
  return api;
}

self.onmessage = async ({ data }) => {
  const debut = performance.now();
  const envoyer = (m) => self.postMessage(m);
  let id = null;
  try {
    envoyer({ type: 'progression', etape: 'Chargement du moteur IFC', part: 0 });
    const a = await moteur();
    envoyer({ type: 'progression', etape: 'Lecture du fichier', part: 0.01 });
    id = a.OpenModel(new Uint8Array(data.octets));
    if (id < 0) throw new Error('Ce fichier n’a pas pu être lu : est-ce bien un fichier IFC ?');
    const modele = preparerModele(extraireModele(a, W, id, (etape, part) => envoyer({ type: 'progression', etape, part })));
    envoyer({ type: 'resultat', modele, duree: Math.round(performance.now() - debut) });
  } catch (e) {
    envoyer({ type: 'erreur', message: e?.message || String(e) });
  } finally {
    if (id != null && id >= 0) try { api.CloseModel(id); } catch { /* ignore */ }
  }
};
