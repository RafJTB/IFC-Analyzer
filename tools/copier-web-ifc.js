// Copie web-ifc (installé par npm) dans vendor/ : l'appli le charge depuis le site lui-même,
// sans CDN (fonctionne hors connexion et respecte la politique de sécurité « self »).
// Usage après une mise à jour de la version dans package.json : npm install && npm run vendor
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';

const src = 'node_modules/web-ifc/';
const dst = 'vendor/web-ifc/';
mkdirSync(dst, { recursive: true });
for (const f of ['web-ifc-api.js', 'web-ifc.wasm', 'LICENSE.md']) copyFileSync(src + f, dst + f);
const { version } = JSON.parse(readFileSync(src + 'package.json', 'utf8'));
console.log(`web-ifc ${version} copié dans ${dst}`);
