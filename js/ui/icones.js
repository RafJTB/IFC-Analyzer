// Icônes au trait (24 × 24), dessinées avec currentColor.
const TRACES = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  mur: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 12h18M9 5v7M15 12v7"/>',
  fenetre: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M12 3v18M5 12h14"/>',
  couches: '<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  structure: '<path d="M4 5h16M4 9h16M8 9v11M16 9v11"/>',
  gc: '<path d="M3 8h18M3 20h18M6 8v12M10 8v12M14 8v12M18 8v12"/>',
  goutte: '<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/>',
  escalier: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  export: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  ouvrir: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
  loupe: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  lune: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
  soleil: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  fermer: '<path d="M6 6l12 12M18 6 6 18"/>',
  surface: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 14 14 4M10 20 20 10"/>',
  regle: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alerte: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  liste: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  facade: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h3v3H8zM13 7h3v3h-3zM8 13h3v3H8zM13 13h3v3h-3z"/>',
  poubelle: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
  copie: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  fichier: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
  tri: '<path d="m8 9 4-4 4 4M8 15l4 4 4-4"/>',
  haut: '<path d="m6 15 6-6 6 6"/>',
  bas: '<path d="m6 9 6 6 6-6"/>',
  fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  exemple: '<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>',
  cible: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
  dessus: '<path d="M12 3 3 8l9 5 9-5z"/><path d="M12 13v8"/><path d="m9 18 3 3 3-3"/>',
  oeil: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'oeil-barre': '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
};

/** Icône SVG (chaîne HTML). */
export const ic = (nom, classe = 'i') => `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true">${TRACES[nom] ?? ''}</svg>`;

/** Illustration des pages vides : une maquette en perspective, aux couleurs du thème. */
export const illustration = (variante = 'maquette') => {
  if (variante === 'filtre') {
    return `<svg class="art" viewBox="0 0 170 116" aria-hidden="true"><rect class="a2" x="20" y="18" width="130" height="80" rx="12"/>
      <path class="a3" d="M44 44h82M44 60h60M44 76h40"/><circle class="a1" cx="122" cy="74" r="16"/><path class="a3" d="m133 85 11 11"/></svg>`;
  }
  return `<svg class="art" viewBox="0 0 170 116" aria-hidden="true">
    <path class="a2" d="M85 10 145 40v44L85 112 25 84V40z"/><path class="a1" d="M85 10 145 40 85 70 25 40z"/>
    <path class="a3" d="M85 70v42M55 25l60 30M115 25 55 55"/><circle class="a4" cx="85" cy="40" r="5"/></svg>`;
};
