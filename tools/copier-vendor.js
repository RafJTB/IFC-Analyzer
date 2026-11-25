// Copie les bibliothèques installées par npm dans vendor/ : l'appli les charge depuis le site lui-même,
// sans CDN (fonctionne hors connexion et respecte la politique de sécurité « self »).
// Usage après une mise à jour d'une version dans package.json : npm install && npm run vendor
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const version = (paquet) => JSON.parse(readFileSync(`node_modules/${paquet}/package.json`, 'utf8')).version;
const copier = (src, dst, fichiers) => {
  mkdirSync(dst, { recursive: true });
  for (const f of fichiers) copyFileSync(src + f, dst + f.split('/').pop());
};

// web-ifc : lecture des fichiers IFC (moteur WebAssembly)
copier('node_modules/web-ifc/', 'vendor/web-ifc/', ['web-ifc-api.js', 'web-ifc.wasm', 'LICENSE.md']);
console.log(`web-ifc ${version('web-ifc')} copié dans vendor/web-ifc/`);

// three.js : affichage 3D. Les contrôles de caméra importent « three » : on pointe vers la copie locale.
copier('node_modules/three/', 'vendor/three/', ['build/three.core.js', 'build/three.module.js', 'LICENSE']);
const controles = readFileSync('node_modules/three/examples/jsm/controls/OrbitControls.js', 'utf8').replace("from 'three';", "from './three.module.js';");
writeFileSync('vendor/three/OrbitControls.js', controles);
console.log(`three ${version('three')} copié dans vendor/three/`);
