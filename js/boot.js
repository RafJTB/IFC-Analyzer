// Démarrage (chargé avant la page, de façon bloquante) : protection contre l'affichage dans un cadre,
// thème sans flash et service worker. (Hors de index.html pour une politique de sécurité sans script intégré.)

// L'appli refuse de s'afficher dans le cadre d'un autre site (« clickjacking »)
(function () {
  if (window.top === window.self) return;
  var ok = false;
  try { ok = window.top.location.origin === window.location.origin; } catch (e) { ok = false; }
  if (ok) return;
  document.documentElement.style.display = 'none';
  try { window.top.location = window.location.href; } catch (e) { /* ignore */ }
})();

// Thème clair / sombre : choix enregistré, sinon celui du système
(function () {
  var t = null;
  try { t = localStorage.getItem('ifc-analyzer.theme'); } catch (e) { /* navigation privée */ }
  if (t !== 'light' && t !== 'dark') t = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();

// Service worker : appli installable et utilisable hors connexion (fichiers revérifiés à chaque visite)
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !navigator.webdriver) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* l'appli marche sans */ });
  });
}
