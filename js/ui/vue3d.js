// Visionneuse 3D (three.js) : toute la maquette en un seul maillage fusionné (rapide même sur de gros fichiers),
// sélection en couleur d'accent sur fond « fantôme », filtres par niveau et par famille, coupe horizontale, clic.
// Rendu à la demande : rien ne tourne quand on ne touche à rien.
import * as THREE from '../../vendor/three/three.module.js';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';

// Teintes « maquette » par famille : neutres et lisibles, le verre est transparent
const TEINTES = {
  murs: 0xdfe2ef, dalles: 0xb9bdd0, revetements_sol: 0xd8ccb4, plafonds: 0xf1f2f8, poteaux: 0xa7acc0, poutres: 0xa7acc0,
  bords_dalle: 0x9ea3b8, garde_corps: 0x8fc2ff, reseaux_ep: 0x3fc6d8, escaliers: 0xc3c7d6, menuiseries: 0xc9a27a, verre: 0x8ec5ff, autre: 0x9aa0b4,
};
const ACCENT = 0x8b93ff;
const RE_VERRE = /vitr|verre|glass|glaz/i;

/** Indice de l'élément qui contient le sommet *v* (recherche dichotomique dans les débuts de blocs). */
function blocDuSommet(debuts, v) {
  let a = 0;
  let b = debuts.length - 1;
  while (a < b) {
    const m = (a + b + 1) >> 1;
    if (debuts[m] <= v) a = m; else b = m - 1;
  }
  return a;
}

export class Visionneuse {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'v3d-canvas';
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', 'Vue 3D de la maquette');
    this.el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('change', () => this.rendre());
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3d4466, 1.6));
    const soleil = new THREE.DirectionalLight(0xffffff, 1.6);
    soleil.position.set(0.8, 1.6, 1.1);
    this.scene.add(soleil);
    const contre = new THREE.DirectionalLight(0xb9c1ff, 0.5);
    contre.position.set(-1, 0.4, -0.8);
    this.scene.add(contre);
    this.coupePlan = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);

    new ResizeObserver(() => this.redimensionner()).observe(this.el);
    this.renderer.domElement.addEventListener('pointerdown', (e) => { this.depart = [e.clientX, e.clientY]; });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (!this.depart || Math.hypot(e.clientX - this.depart[0], e.clientY - this.depart[1]) > 5) return; // c'était une rotation
      this.surClic?.(this.choisir(e));
    });
  }

  redimensionner() {
    const { clientWidth: w, clientHeight: h } = this.el;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.rendre();
  }

  rendre() {
    if (this.attente) return;
    this.attente = requestAnimationFrame(() => {
      this.attente = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }

  /**
   * Charge une maquette.
   * @param {object} g     géométrie (extraireGeometrie)
   * @param {Map<number, {famille: string, niveau: string, type: string}>} infos  éléments du métré, par identifiant IFC
   */
  charger(g, infos) {
    this.vider();
    this.g = g;
    this.infos = infos;
    const n = g.ids.length;
    this.indexDe = new Map();
    for (let k = 0; k < n; k++) this.indexDe.set(g.ids[k], k);
    // Hauteurs basse et haute de chaque élément : la coupe se règle sur ce qui est affiché
    this.basY = new Float32Array(n);
    this.hautY = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let bas = Infinity;
      let haut = -Infinity;
      for (let v = g.debutsV[k]; v < g.debutsV[k] + g.nbV[k]; v++) {
        const y = g.positions[v * 3 + 1];
        if (y < bas) bas = y;
        if (y > haut) haut = y;
      }
      this.basY[k] = bas;
      this.hautY[k] = haut;
    }
    // Couleur et transparence de chaque élément
    this.verre = new Uint8Array(n);
    const couleurs = new Float32Array(g.positions.length);
    const c = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const info = infos.get(g.ids[k]);
      const verre = g.couleurs[k * 4 + 3] < 0.99 || (info && ((info.famille === 'menuiseries' && info.genre === 'Fenêtre') || (info.famille === 'garde_corps' && RE_VERRE.test(info.type))));
      this.verre[k] = verre ? 1 : 0;
      c.setHex(verre ? TEINTES.verre : TEINTES[info?.famille] ?? TEINTES.autre, THREE.SRGBColorSpace);
      for (let v = g.debutsV[k]; v < g.debutsV[k] + g.nbV[k]; v++) couleurs.set([c.r, c.g, c.b], v * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(g.normales, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(g.indices.length), 1));
    this.geo = geo;
    const plans = [this.coupePlan];
    this.matOpaque = new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: plans, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.matVerre = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false, clippingPlanes: plans, side: THREE.DoubleSide });
    this.matSelection = new THREE.MeshLambertMaterial({ color: ACCENT, emissive: 0x3d3fb8, emissiveIntensity: 0.35, clippingPlanes: plans, side: THREE.DoubleSide });
    // Deux maillages partagent les sommets : opaque et verre (le verre est dessiné après)
    this.opaque = new THREE.Mesh(geo, this.matOpaque);
    const partage = () => {
      const b = new THREE.BufferGeometry();
      for (const nom of ['position', 'normal', 'color']) b.setAttribute(nom, geo.getAttribute(nom));
      return b;
    };
    this.transparent = new THREE.Mesh(partage(), this.matVerre);
    this.transparent.renderOrder = 2;
    this.selection = new THREE.Mesh(partage(), this.matSelection);
    this.selection.renderOrder = 3;
    this.scene.add(this.opaque, this.transparent, this.selection);
    // Arêtes : donnent l'aspect « maquette » (seulement si la maquette reste légère)
    if (g.indices.length / 3 < 400_000) {
      const tout = new THREE.BufferGeometry();
      tout.setAttribute('position', geo.getAttribute('position'));
      tout.setIndex(new THREE.BufferAttribute(g.indices, 1));
      this.aretes = new THREE.LineSegments(new THREE.EdgesGeometry(tout, 25),
        new THREE.LineBasicMaterial({ color: 0x232845, transparent: true, opacity: 0.35, clippingPlanes: plans }));
      this.scene.add(this.aretes);
    }
    // Sol : une grille discrète sous le bâtiment
    const taille = Math.max(g.max[0] - g.min[0], g.max[2] - g.min[2]) * 1.6 || 10;
    this.grille = new THREE.GridHelper(taille, Math.round(taille / 2), 0x7a80b0, 0x6a70a0);
    this.grille.material.transparent = true;
    this.grille.material.opacity = 0.16;
    this.grille.material.depthWrite = false;
    this.grille.position.set((g.min[0] + g.max[0]) / 2, g.min[1] - 0.02, (g.min[2] + g.max[2]) / 2);
    this.scene.add(this.grille);
    this.etat = null;
    this.appliquer({});
    this.cadrer();
  }

  vider() {
    for (const o of [this.opaque, this.transparent, this.selection, this.aretes, this.grille]) {
      if (!o) continue;
      this.scene.remove(o);
      o.geometry?.dispose();
    }
    this.opaque = this.transparent = this.selection = this.aretes = this.grille = null;
  }

  /**
   * Affiche ce qui doit l'être.
   * @param {{ niveaux?: string[], masquees?: string[], selection?: Set<number>|null, coupe?: number|null }} e
   */
  appliquer({ niveaux = [], masquees = [], selection = null, coupe = null }) {
    if (!this.g) return;
    const { g, infos } = this;
    const visible = (k) => {
      const i = infos.get(g.ids[k]);
      if (niveaux.length && !(i && niveaux.includes(i.niveau))) return false;
      return !masquees.includes(i?.famille ?? 'autre');
    };
    const remplir = (filtre) => {
      let total = 0;
      for (let k = 0; k < g.ids.length; k++) if (filtre(k)) total += g.nbI[k];
      const idx = new Uint32Array(total);
      let o = 0;
      for (let k = 0; k < g.ids.length; k++) if (filtre(k)) { idx.set(g.indices.subarray(g.debutsI[k], g.debutsI[k] + g.nbI[k]), o); o += g.nbI[k]; }
      return idx;
    };
    const choisi = (k) => selection?.has(g.ids[k]);
    this.opaque.geometry.setIndex(new THREE.BufferAttribute(remplir((k) => visible(k) && !this.verre[k] && !choisi(k)), 1));
    this.transparent.geometry.setIndex(new THREE.BufferAttribute(remplir((k) => visible(k) && this.verre[k] && !choisi(k)), 1));
    this.selection.geometry.setIndex(new THREE.BufferAttribute(remplir((k) => visible(k) && choisi(k)), 1));
    // Une sélection met le reste en « fantôme »
    const fantome = Boolean(selection?.size);
    Object.assign(this.matOpaque, { transparent: fantome, opacity: fantome ? 0.16 : 1, depthWrite: !fantome });
    this.matVerre.opacity = fantome ? 0.1 : 0.42;
    this.matOpaque.needsUpdate = true;
    if (this.aretes) {
      this.aretes.visible = !niveaux.length && !masquees.length;
      this.aretes.material.opacity = fantome ? 0.08 : 0.35;
    }
    // Coupe : pourcentage de la hauteur des éléments affichés (un seul niveau → coupe dans ce niveau)
    let bas = Infinity;
    let haut = -Infinity;
    for (let k = 0; k < g.ids.length; k++) {
      if (!visible(k)) continue;
      if (this.basY[k] < bas) bas = this.basY[k];
      if (this.hautY[k] > haut) haut = this.hautY[k];
    }
    if (!Number.isFinite(bas)) { bas = g.min[1]; haut = g.max[1]; }
    this.coupePlan.constant = coupe == null ? 1e6 : bas + (haut - bas) * coupe;
    this.etat = { niveaux, masquees, selection };
    this.rendre();
  }

  /** Cadre la caméra sur des éléments (ou sur toute la maquette), en vue axonométrique. */
  cadrer(ids = null) {
    if (!this.g) return;
    const { g } = this;
    const boite = new THREE.Box3();
    const p = new THREE.Vector3();
    const liste = ids?.size ? [...ids].map((id) => this.indexDe.get(id)).filter((k) => k != null) : null;
    if (!liste?.length) boite.set(new THREE.Vector3(...g.min), new THREE.Vector3(...g.max));
    else for (const k of liste) for (let v = g.debutsV[k]; v < g.debutsV[k] + g.nbV[k]; v++) boite.expandByPoint(p.fromArray(g.positions, v * 3));
    const centre = boite.getCenter(new THREE.Vector3());
    const rayon = Math.max(boite.getSize(new THREE.Vector3()).length() / 2, 1);
    const distance = rayon / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.95;
    const direction = new THREE.Vector3(1, 0.75, 1.15).normalize();
    this.camera.position.copy(centre).addScaledVector(direction, distance);
    this.camera.near = Math.max(distance / 500, 0.05);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(centre);
    this.controls.update();
    this.rendre();
  }

  /** Vue en plan, depuis le dessus (nord en haut). */
  vueDessus() {
    if (!this.g) return;
    const { min, max } = this.g;
    const centre = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const etendue = Math.max(max[0] - min[0], max[2] - min[2]);
    const distance = (etendue / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.15 + (max[1] - min[1]);
    this.camera.position.set(centre.x, centre.y + distance, centre.z + 0.001);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(centre);
    this.controls.update();
    this.rendre();
  }

  /** Identifiant IFC de l'élément sous la souris (ou null). */
  choisir(e) {
    if (!this.g) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const souris = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rayon = new THREE.Raycaster();
    rayon.setFromCamera(souris, this.camera);
    const fantome = this.etat?.selection?.size;
    const cibles = fantome ? [this.selection, this.opaque, this.transparent] : [this.opaque, this.transparent, this.selection];
    const touches = rayon.intersectObjects(cibles, false)
      .filter((t) => t.point.y <= this.coupePlan.constant + 1e-6);
    if (!touches.length) return null;
    return this.g.ids[blocDuSommet(this.g.debutsV, touches[0].face.a)];
  }

  /** Image de la vue (pour les tests et les captures). */
  image() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

/** La 3D est-elle possible dans ce navigateur ? */
export function webglDisponible() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
