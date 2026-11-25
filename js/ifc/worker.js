// Analyse d'un fichier IFC hors de la page (Web Worker) : l'interface reste fluide, même sur une grosse maquette.
// Message reçu : { octets: ArrayBuffer, geometrie: false si la 3D est désactivée dans les paramètres }.
// Messages envoyés, dans l'ordre :
//   progression…, resultat (le métré, affiché tout de suite), progression-3d…, geometrie (la 3D) — ou erreur / erreur-3d.
import * as W from '../../vendor/web-ifc/web-ifc-api.js';
import { extraireModele } from './extract.js';
import { extraireGeometrie, tamponsDe } from './geometrie.js';
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
  const envoyer = (m, transfert) => self.postMessage(m, transfert ?? []);
  let id = null;
  let metreEnvoye = false;
  try {
    envoyer({ type: 'progression', etape: 'Chargement du moteur IFC', part: 0 });
    const a = await moteur();
    envoyer({ type: 'progression', etape: 'Lecture du fichier', part: 0.01 });
    // Coordonnées ramenées près de l'origine : pas de tremblement sur les maquettes géoréférencées
    id = a.OpenModel(new Uint8Array(data.octets), { COORDINATE_TO_ORIGIN: true });
    if (id < 0) throw new Error('Ce fichier n’a pas pu être lu : est-ce bien un fichier IFC ?');
    const modele = preparerModele(extraireModele(a, W, id, (etape, part) => envoyer({ type: 'progression', etape, part })));
    envoyer({ type: 'resultat', modele, duree: Math.round(performance.now() - debut) });
    metreEnvoye = true;
    if (data.geometrie === false) return;

    // 2e temps : la géométrie 3D (le métré est déjà affiché)
    const estimation = modele.elements.length + Object.values(modele.ignores).reduce((s, n) => s + n, 0);
    const geometrie = extraireGeometrie(a, id, (part) => envoyer({ type: 'progression-3d', part }), estimation);
    envoyer({ type: 'geometrie', geometrie }, tamponsDe(geometrie));
  } catch (e) {
    envoyer({ type: metreEnvoye ? 'erreur-3d' : 'erreur', message: e?.message || String(e) });
  } finally {
    if (id != null && id >= 0) try { api.CloseModel(id); } catch { /* ignore */ }
  }
};
