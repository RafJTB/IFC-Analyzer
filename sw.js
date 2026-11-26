// Service worker : l'appli s'installe et s'ouvre hors connexion.
// Réseau d'abord (fichiers toujours revérifiés : jamais de vieille version coincée), copie locale si pas de réseau.
// Sécurité : en-têtes que GitHub Pages ne permet pas d'envoyer.
const VERSION = '0.5.0';
const CACHE = `ifc-analyzer-${VERSION}`;
const SOCLE = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'assets/fonds/maquette-filaire.webp', 'icons/icon.svg', 'icons/icon-192.png',
  'js/boot.js', 'js/app.js', 'js/ifc/worker.js', 'js/ifc/extract.js', 'js/ifc/noms.js', 'js/ifc/geometrie.js',
  'js/metre/familles.js', 'js/metre/quantites.js', 'js/metre/export.js', 'js/metre/assistant.js',
  'js/ui/accueil.js', 'js/ui/page-famille.js', 'js/ui/palette.js', 'js/ui/icones.js', 'js/ui/format.js', 'js/ui/toast.js',
  'js/ui/stockage.js', 'js/ui/hover-glow.js', 'js/ui/liquid-tabs.js', 'js/ui/page-3d.js', 'js/ui/vue3d.js',
  'js/ui/perso.js', 'js/ui/page-perso.js', 'js/ui/reglages.js', 'js/ui/page-reglages.js',
  'vendor/web-ifc/web-ifc-api.js', 'vendor/web-ifc/web-ifc.wasm',
  'vendor/three/three.core.js', 'vendor/three/three.module.js', 'vendor/three/OrbitControls.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SOCLE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.filter((k) => k.startsWith('ifc-analyzer-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const securiser = (res, navigation) => {
  if (!res || res.status === 0 || res.type === 'opaque') return res;
  const h = new Headers(res.headers);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'no-referrer');
  if (navigation) {
    h.set('X-Frame-Options', 'SAMEORIGIN');
    h.set('Content-Security-Policy', "frame-ancestors 'self'");
    h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const navigation = req.mode === 'navigate';
  event.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) {
        const copie = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copie)).catch(() => {});
      }
      return securiser(res, navigation);
    } catch (err) {
      const enCache = await caches.match(req, { ignoreSearch: true }) || (navigation ? await caches.match('index.html') : null);
      if (enCache) return securiser(enCache, navigation);
      throw err;
    }
  })());
});
