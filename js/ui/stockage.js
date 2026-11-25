// Mémoire locale des analyses (IndexedDB) : les quantités et la géométrie 3D calculée, jamais le fichier IFC.
// Tout est protégé : en navigation privée ou si le stockage est refusé, l'appli marche sans.

const BASE = 'ifc-analyzer';
const ANALYSES = 'analyses';
const GEOMETRIES = 'geometries';
let ouverture = null;

function base() {
  if (!ouverture) {
    ouverture = new Promise((ok, ko) => {
      const r = indexedDB.open(BASE, 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(ANALYSES)) db.createObjectStore(ANALYSES, { keyPath: 'cle' });
        if (!db.objectStoreNames.contains(GEOMETRIES)) db.createObjectStore(GEOMETRIES, { keyPath: 'cle' });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    }).catch(() => null);
  }
  return ouverture;
}

async function transaction(table, mode, faire) {
  try {
    const db = await base();
    if (!db) return null;
    return await new Promise((ok, ko) => {
      const tx = db.transaction(table, mode);
      const r = faire(tx.objectStore(table));
      tx.oncomplete = () => ok(r?.result ?? null);
      tx.onerror = () => ko(tx.error);
    });
  } catch {
    return null;
  }
}

export const enregistrer = (analyse) => transaction(ANALYSES, 'readwrite', (s) => s.put(analyse));
export const lire = (cle) => transaction(ANALYSES, 'readonly', (s) => s.get(cle));
export async function supprimer(cle) {
  await transaction(ANALYSES, 'readwrite', (s) => s.delete(cle));
  await transaction(GEOMETRIES, 'readwrite', (s) => s.delete(cle));
}

export const enregistrerGeometrie = (cle, geometrie) => transaction(GEOMETRIES, 'readwrite', (s) => s.put({ cle, geometrie }));
export const lireGeometrie = async (cle) => (await transaction(GEOMETRIES, 'readonly', (s) => s.get(cle)))?.geometrie ?? null;

/** Résumé des analyses (sans le détail des éléments), les plus récentes d'abord. */
export async function lister() {
  const toutes = (await transaction(ANALYSES, 'readonly', (s) => s.getAll())) ?? [];
  return toutes.map(({ modele, ...resume }) => resume).sort((a, b) => b.date - a.date);
}

// Fichiers ouverts et fichier actif : retrouvés après un rechargement de la page
const CLE_SESSION = 'ifc-analyzer.session';
export function memoriserSession(cles, actif) {
  try { localStorage.setItem(CLE_SESSION, JSON.stringify({ cles, actif })); } catch { /* ignore */ }
}
export function sessionMemorisee() {
  try { return JSON.parse(localStorage.getItem(CLE_SESSION) || 'null') ?? { cles: [], actif: null }; } catch { return { cles: [], actif: null }; }
}
