// Démarrage (chargé avant la page, de façon bloquante) : protection contre l'affichage dans un cadre,
// thème et personnalisation sans flash, service worker. (Hors de index.html pour une politique de sécurité sans script intégré.)

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
  var racine = document.documentElement;
  racine.setAttribute('data-theme', t);
  // Personnalisation (js/ui/perso.js) : fond, flou, voile, panneaux, couleur d'accent, survol
  try {
    var p = JSON.parse(localStorage.getItem('ifc-analyzer.perso') || 'null');
    if (p) {
      var s = racine.style;
      var img = p.fond === 'perso' ? localStorage.getItem('ifc-analyzer.perso.image') : null;
      if (img || p.css) s.setProperty('--bg-image', img ? 'url("' + img + '")' : p.css);
      s.setProperty('--bg-blur', (p.flou == null ? 14 : p.flou) + 'px');
      s.setProperty('--veil-k', String((p.voile == null ? 100 : p.voile) / 100));
      s.setProperty('--panel-k', String((p.panneaux == null ? 100 : p.panneaux) / 100));
      var va = p.varsAccent && p.varsAccent[t];
      if (va) for (var k in va) s.setProperty(k, va[k]);
      if (p.survol) racine.setAttribute('data-hover', p.survol);
    }
  } catch (e) { /* réglages illisibles : présentation d'origine */ }
  // Paramètres (js/ui/reglages.js) : animations coupées
  try {
    var r = JSON.parse(localStorage.getItem('ifc-analyzer.reglages') || 'null');
    racine.setAttribute('data-anim', r && r.animations === false ? 'off' : 'on');
  } catch (e) { /* ignore */ }
})();

// Service worker : appli installable et utilisable hors connexion (fichiers revérifiés à chaque visite)
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !navigator.webdriver) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* l'appli marche sans */ });
  });
}
