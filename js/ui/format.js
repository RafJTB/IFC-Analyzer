// Mise en forme (nombres à la française, texte sûr dans le HTML).

const formats = new Map();
/** 1 234,56 — espace insécable fine comme séparateur de milliers. */
export function nombre(v, decimales = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (!formats.has(decimales)) formats.set(decimales, new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }));
  return formats.get(decimales).format(Math.abs(v) < 0.5 * 10 ** -decimales ? 0 : v);
}

/** Échappe un texte venant du fichier IFC avant de l'insérer dans la page. */
export function echapper(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function taille(octets) {
  if (!octets) return '';
  if (octets < 1024 * 1024) return `${nombre(octets / 1024, 0)} Ko`;
  return `${nombre(octets / 1024 / 1024, 1)} Mo`;
}

export function date(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const auj = new Date();
  const memeJour = d.toDateString() === auj.toDateString();
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return memeJour ? `aujourd'hui à ${heure}` : `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${heure}`;
}

/** « 3 murs », « 1 mur » */
export const pluriel = (n, singulier, plurielForme = `${singulier}s`) => `${nombre(n, 0)} ${n > 1 ? plurielForme : singulier}`;
