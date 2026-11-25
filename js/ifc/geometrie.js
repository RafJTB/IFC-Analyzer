// Géométrie 3D d'une maquette avec web-ifc → tampons fusionnés, un bloc par élément (fonction pure, sans interface).
// Les coordonnées sont en mètres, axe Y vers le haut (convention de web-ifc et de three.js).
// Les réservations (IfcOpeningElement) sont déjà soustraites des murs par web-ifc et ne sont pas renvoyées.

/**
 * @param {object} api  instance IfcAPI initialisée
 * @param {number} id   modèle ouvert
 * @param {(part: number) => void} [progression]
 * @param {number} [estimation]  nombre d'éléments attendus (pour la barre de progression)
 * @returns {{ ids: Int32Array, debutsV: Uint32Array, nbV: Uint32Array, debutsI: Uint32Array, nbI: Uint32Array,
 *   couleurs: Float32Array, positions: Float32Array, normales: Float32Array, indices: Uint32Array, min: number[], max: number[] }}
 */
export function extraireGeometrie(api, id, progression = () => {}, estimation = 1000) {
  const blocs = []; // par élément : { id, pos: Float32Array, nor: Float32Array, idx: Uint32Array, couleur }
  let totalV = 0;
  let totalI = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  api.StreamAllMeshes(id, (mesh) => {
    const morceaux = [];
    let nV = 0;
    let nI = 0;
    let couleur = null;
    for (let i = 0; i < mesh.geometries.size(); i++) {
      const pg = mesh.geometries.get(i);
      const g = api.GetGeometry(id, pg.geometryExpressID);
      const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
      const ix = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
      morceaux.push({ v: v.slice(), ix: ix.slice(), m: pg.flatTransformation });
      nV += v.length / 6;
      nI += ix.length;
      couleur ??= [pg.color.x, pg.color.y, pg.color.z, pg.color.w];
      g.delete();
    }
    if (!nV) return;
    // Sommets transformés dans le repère du projet ; normales tournées (transformations sans déformation)
    const pos = new Float32Array(nV * 3);
    const nor = new Float32Array(nV * 3);
    const idx = new Uint32Array(nI);
    let o = 0;
    let oi = 0;
    for (const { v, ix, m } of morceaux) {
      const base = o;
      for (let k = 0; k < v.length; k += 6) {
        const x = v[k];
        const y = v[k + 1];
        const z = v[k + 2];
        const px = m[0] * x + m[4] * y + m[8] * z + m[12];
        const py = m[1] * x + m[5] * y + m[9] * z + m[13];
        const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
        pos[o * 3] = px; pos[o * 3 + 1] = py; pos[o * 3 + 2] = pz;
        if (px < min[0]) min[0] = px; if (py < min[1]) min[1] = py; if (pz < min[2]) min[2] = pz;
        if (px > max[0]) max[0] = px; if (py > max[1]) max[1] = py; if (pz > max[2]) max[2] = pz;
        const nx = v[k + 3];
        const ny = v[k + 4];
        const nz = v[k + 5];
        let ax = m[0] * nx + m[4] * ny + m[8] * nz;
        let ay = m[1] * nx + m[5] * ny + m[9] * nz;
        let az = m[2] * nx + m[6] * ny + m[10] * nz;
        const l = Math.hypot(ax, ay, az) || 1;
        nor[o * 3] = ax / l; nor[o * 3 + 1] = ay / l; nor[o * 3 + 2] = az / l;
        o++;
      }
      for (let k = 0; k < ix.length; k++) idx[oi++] = ix[k] + base;
    }
    blocs.push({ id: mesh.expressID, pos, nor, idx, couleur });
    totalV += nV;
    totalI += nI;
    if (blocs.length % 100 === 0) progression(Math.min(0.98, blocs.length / estimation));
  });

  // Tampons uniques (un seul envoi vers la page, un seul maillage à dessiner)
  const n = blocs.length;
  const g = {
    ids: new Int32Array(n), debutsV: new Uint32Array(n), nbV: new Uint32Array(n), debutsI: new Uint32Array(n), nbI: new Uint32Array(n),
    couleurs: new Float32Array(n * 4), positions: new Float32Array(totalV * 3), normales: new Float32Array(totalV * 3), indices: new Uint32Array(totalI),
    min: n ? min : [0, 0, 0], max: n ? max : [0, 0, 0],
  };
  let v0 = 0;
  let i0 = 0;
  blocs.forEach((b, k) => {
    const nV = b.pos.length / 3;
    g.ids[k] = b.id;
    g.debutsV[k] = v0;
    g.nbV[k] = nV;
    g.debutsI[k] = i0;
    g.nbI[k] = b.idx.length;
    g.couleurs.set(b.couleur, k * 4);
    g.positions.set(b.pos, v0 * 3);
    g.normales.set(b.nor, v0 * 3);
    for (let j = 0; j < b.idx.length; j++) g.indices[i0 + j] = b.idx[j] + v0; // indices globaux
    v0 += nV;
    i0 += b.idx.length;
  });
  progression(1);
  return g;
}

/** Tampons à transférer sans copie entre le worker et la page. */
export const tamponsDe = (g) => [g.ids, g.debutsV, g.nbV, g.debutsI, g.nbI, g.couleurs, g.positions, g.normales, g.indices].map((t) => t.buffer);
