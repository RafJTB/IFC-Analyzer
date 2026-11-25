// Mémoire locale des analyses (IndexedDB) : seules les quantités sont gardées, jamais le fichier IFC.
// Tout est protégé : en navigation privée ou si le stockage est refusé, l'appli marche sans.

const BASE = 'ifc-analyzer';
const TABLE = 'analyses';
let ouverture = null;

function base() {
  if (!ouverture) {
    ouverture = new Promise((ok, ko) => {
      const r = indexedDB.open(BASE, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(TABLE, { keyPath: 'cle' });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    }).catch(() => null);
  }
  return ouverture;
}

async function transaction(mode, faire) {
  try {
    const db = await base();
    if (!db) return null;
    return await new Promise((ok, ko) => {
      const tx = db.transaction(TABLE, mode);
      const r = faire(tx.objectStore(TABLE));
      tx.oncomplete = () => ok(r?.result ?? null);
      tx.onerror = () => ko(tx.error);
    });
  } catch {
    return null;
  }
}

export const enregistrer = (analyse) => transaction('readwrite', (s) => s.put(analyse));
export const lire = (cle) => transaction('readonly', (s) => s.get(cle));
export const supprimer = (cle) => transaction('readwrite', (s) => s.delete(cle));

/** Résumé des analyses (sans le détail des éléments), les plus récentes d'abord. */
export async function lister() {
  const toutes = (await transaction('readonly', (s) => s.getAll())) ?? [];
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
