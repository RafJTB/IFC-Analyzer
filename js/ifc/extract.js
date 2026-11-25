// Lecture d'une maquette IFC avec web-ifc → données brutes par élément (fonction pure, sans interface).
// Fonctionne dans le navigateur (Web Worker) et sous Node (tests). Toutes les grandeurs sont converties
// en unités SI (m, m², m³) d'après les unités déclarées dans le fichier.

import { cle, familleDe, nomDeType } from './noms.js';

const PREFIXES = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1,
  DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12 };
const GENRES_QUANTITE = ['Length', 'Area', 'Volume', 'Count', 'Weight', 'Time'];

// Propriétés de secours (quand le fichier n'a pas de quantités de base), noms comparés sans accents ni majuscules
const SECOURS = {
  longueur: ['longueur', 'length'],
  surface: ['surface', 'area', 'aire'],
  volume: ['volume'],
  epaisseur: ['epaisseur', 'largeur', 'thickness', 'width'],
  hauteur: ['hauteur', 'height', 'hauteur non contrainte', 'unconnected height'],
  diametre: ['nominaldiameter', 'diametre', 'diameter', 'dim_diametre', 'diametre nominal'],
};

/** Valeur simple d'un attribut web-ifc ({ value } ou { _representationValue }). */
export const valeur = (x) => (x == null ? null : typeof x === 'object' ? (x._representationValue ?? x.value ?? null) : x);
const nombre = (x) => { const v = Number(valeur(x)); return Number.isFinite(v) ? v : null; };
const vrai = (x) => { const v = valeur(x); return v === true || v === 'T' || v === '.T.' || v === 'TRUE' || v === 'true'; };

/**
 * @param {object} api  instance IfcAPI initialisée
 * @param {object} W    module web-ifc (constantes IFCWALL…)
 * @param {number} id   modèle ouvert (api.OpenModel)
 * @param {(etape: string, part: number) => void} [progression]
 */
export function extraireModele(api, W, id, progression = () => {}) {
  const lire = (eid) => api.GetLine(id, eid, false);
  const ids = (t) => {
    if (typeof t !== 'number') return [];
    let v;
    try { v = api.GetLineIDsWithType(id, t, true); } catch { return []; } // classe absente de ce schéma
    const a = [];
    for (let i = 0; i < v.size(); i++) a.push(v.get(i));
    return a;
  };
  const classeDe = (l) => api.GetNameFromTypeCode(l.type) || '';

  // 1) Unités du fichier → facteurs vers m, m², m³
  progression('Lecture des unités', 0.02);
  const echelle = { LENGTHUNIT: 1, AREAUNIT: 1, VOLUMEUNIT: 1 };
  const echelleUnite = (u, profondeur = 0) => {
    if (!u || profondeur > 3) return 1;
    if (u.type === W.IFCSIUNIT) {
      const k = PREFIXES[valeur(u.Prefix)] ?? 1;
      const t = valeur(u.UnitType);
      return t === 'AREAUNIT' ? k * k : t === 'VOLUMEUNIT' ? k * k * k : k;
    }
    if (u.type === W.IFCCONVERSIONBASEDUNIT && u.ConversionFactor) { // pieds, pouces… : facteur fourni par le fichier
      const m = lire(u.ConversionFactor.value);
      const base = m.UnitComponent ? echelleUnite(lire(m.UnitComponent.value), profondeur + 1) : 1;
      return (nombre(m.ValueComponent) ?? 1) * base;
    }
    return 1;
  };
  for (const ua of ids(W.IFCUNITASSIGNMENT)) {
    for (const ref of lire(ua).Units ?? []) {
      const u = lire(ref.value);
      const t = valeur(u.UnitType);
      if (t in echelle) echelle[t] = echelleUnite(u);
    }
  }
  const facteur = { Length: echelle.LENGTHUNIT, Area: echelle.AREAUNIT, Volume: echelle.VOLUMEUNIT, Count: 1, Weight: 1, Time: 1 };
  const facteurMesure = (nom) => {
    const n = String(nom || '').toUpperCase();
    if (n.includes('AREAMEASURE')) return echelle.AREAUNIT;
    if (n.includes('VOLUMEMEASURE')) return echelle.VOLUMEUNIT;
    if (n.includes('LENGTHMEASURE')) return echelle.LENGTHUNIT;
    return 1;
  };

  // 2) Index des relations, construits une seule fois
  progression('Lecture des relations', 0.08);
  const definitions = new Map(); // élément → [IfcPropertySet | IfcElementQuantity]
  const typeDe = new Map(); //      élément → objet type
  const contenuDans = new Map(); // élément → structure spatiale
  const parentDe = new Map(); //    objet → objet qui l'agrège (volée → escalier, espace → niveau…)
  const ouverturesDe = new Map(); // élément → [réservations]
  const rempliePar = new Map(); //  réservation → menuiserie
  const ajouter = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const r of ids(W.IFCRELDEFINESBYPROPERTIES)) {
    const l = lire(r);
    for (const o of l.RelatedObjects ?? []) ajouter(definitions, o.value, l.RelatingPropertyDefinition.value);
  }
  for (const r of ids(W.IFCRELDEFINESBYTYPE)) {
    const l = lire(r);
    for (const o of l.RelatedObjects ?? []) typeDe.set(o.value, l.RelatingType.value);
  }
  for (const r of ids(W.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const l = lire(r);
    for (const e of l.RelatedElements ?? []) contenuDans.set(e.value, l.RelatingStructure.value);
  }
  for (const r of ids(W.IFCRELAGGREGATES)) {
    const l = lire(r);
    for (const e of l.RelatedObjects ?? []) parentDe.set(e.value, l.RelatingObject.value);
  }
  for (const r of ids(W.IFCRELVOIDSELEMENT)) {
    const l = lire(r);
    ajouter(ouverturesDe, l.RelatingBuildingElement.value, l.RelatedOpeningElement.value);
  }
  for (const r of ids(W.IFCRELFILLSELEMENT)) {
    const l = lire(r);
    rempliePar.set(l.RelatingOpeningElement.value, l.RelatedBuildingElement.value);
  }

  // Niveaux (triés par altitude) et niveau d'un élément, en remontant contenance et agrégations
  const niveaux = new Map();
  for (const s of ids(W.IFCBUILDINGSTOREY)) {
    const l = lire(s);
    niveaux.set(s, { nom: String(valeur(l.Name) ?? '').trim() || `Niveau ${niveaux.size + 1}`, altitude: (nombre(l.Elevation) ?? 0) * echelle.LENGTHUNIT });
  }
  const niveauDe = (eid) => {
    let x = eid;
    for (let i = 0; i < 12 && x != null; i++) {
      if (niveaux.has(x)) return niveaux.get(x).nom;
      x = contenuDans.get(x) ?? parentDe.get(x);
    }
    return '';
  };

  // 3) Propriétés et quantités d'un objet (type puis occurrence, l'occurrence l'emporte)
  const lireDefinitions = (eid) => {
    const q = {};
    const p = {};
    const psets = [];
    const t = typeDe.get(eid);
    const defs = [];
    if (t != null) for (const h of lire(t).HasPropertySets ?? []) defs.push(h.value);
    defs.push(...(definitions.get(eid) ?? []));
    for (const d of defs) {
      const pd = lire(d);
      if (pd.type === W.IFCELEMENTQUANTITY) {
        for (const qr of pd.Quantities ?? []) {
          const ql = lire(qr.value);
          const genre = GENRES_QUANTITE.find((g) => ql[`${g}Value`] != null);
          const v = genre ? nombre(ql[`${genre}Value`]) : null;
          if (v != null) q[valeur(ql.Name)] = v * facteur[genre];
        }
      } else if (pd.type === W.IFCPROPERTYSET) {
        const nomSet = String(valeur(pd.Name) ?? '');
        for (const pr of pd.HasProperties ?? []) {
          const prop = lire(pr.value);
          if (prop.type !== W.IFCPROPERTYSINGLEVALUE || !prop.NominalValue) continue;
          psets.push({ set: nomSet, nom: String(valeur(prop.Name) ?? ''), brut: prop.NominalValue });
        }
      }
    }
    for (const { set, nom, brut } of psets) {
      const k = cle(nom);
      if (k === 'isexternal') p.exterieur = vrai(brut);
      else if (k === 'reference' && /common/i.test(set)) p.reference = String(valeur(brut) ?? '');
      else if (k === 'loadbearing') p.porteur = vrai(brut);
      else {
        for (const [champ, noms] of Object.entries(SECOURS)) {
          if (!noms.includes(k)) continue;
          const v = nombre(brut);
          if (v != null) p[champ] = v * facteurMesure(brut.name);
        }
      }
    }
    return { q, p };
  };

  // 4) Éléments par famille. GetLineIDsWithType(…, true) inclut déjà les sous-types (IfcWallStandardCase…) :
  //    chaque élément n'est lu qu'une fois.
  const CLASSES = ['IFCWALL', 'IFCWINDOW', 'IFCDOOR', 'IFCSLAB', 'IFCCOVERING', 'IFCCOLUMN', 'IFCBEAM', 'IFCRAILING',
    'IFCFLOWSEGMENT', 'IFCSTAIRFLIGHT', 'IFCBUILDINGELEMENTPROXY', 'IFCMEMBER'];
  const candidats = [...new Set(CLASSES.flatMap((c) => ids(W[c])))];
  const elements = [];
  const ignores = {};
  let n = 0;
  for (const eid of candidats) {
    if (++n % 200 === 0) progression('Analyse des éléments', 0.1 + 0.85 * (n / candidats.length));
    const l = lire(eid);
    const classe = classeDe(l);
    const predefini = String(valeur(l.PredefinedType) ?? '');
    const nomBrut = String(valeur(l.Name) ?? '');
    const nomTypeIfc = typeDe.has(eid) ? String(valeur(lire(typeDe.get(eid)).Name) ?? '') : '';
    const famille = familleDe(classe, predefini, `${nomBrut} ${nomTypeIfc} ${valeur(l.ObjectType) ?? ''}`);
    if (!famille) { ignores[classe] = (ignores[classe] ?? 0) + 1; continue; }
    const { q, p } = lireDefinitions(eid);
    const el = {
      id: eid,
      gid: String(valeur(l.GlobalId) ?? ''),
      classe,
      famille,
      type: nomDeType(nomTypeIfc, nomBrut, nomParDefaut(famille, classe)),
      niveau: niveauDe(eid),
      exterieur: p.exterieur ?? null,
      predefini: predefini === 'NOTDEFINED' || predefini === 'USERDEFINED' ? '' : predefini,
      q,
      p,
    };
    // Attributs directs utiles au métré
    const a = {};
    const lg = (x) => { const v = nombre(x); return v == null ? null : v * echelle.LENGTHUNIT; };
    if (l.OverallWidth != null) a.largeur = lg(l.OverallWidth);
    if (l.OverallHeight != null) a.hauteur = lg(l.OverallHeight);
    const contremarches = nombre(l.NumberOfRisers ?? l.NumberOfRiser);
    if (contremarches != null) a.contremarches = contremarches;
    if (l.NumberOfTreads != null) a.marches = nombre(l.NumberOfTreads);
    if (l.RiserHeight != null) a.hauteurContremarche = lg(l.RiserHeight);
    if (l.TreadLength != null) a.giron = lg(l.TreadLength);
    if (Object.keys(a).length) el.a = a;
    // Réservations : surface de chaque trou (quantités de la réservation) et menuiserie qui la remplit
    const ouv = ouverturesDe.get(eid);
    if (ouv?.length) {
      el.ouvertures = ouv.map((o) => {
        const { q: qo } = lireDefinitions(o);
        const aire = qo.Area ?? (qo.Width != null && qo.Height != null ? qo.Width * qo.Height : null);
        return { menuiserie: rempliePar.get(o) ?? null, aire };
      });
    }
    elements.push(el);
  }
  progression('Terminé', 1);
  const listeNiveaux = [...niveaux.values()].sort((x, y) => x.altitude - y.altitude);
  return { schema: api.GetModelSchema(id), echelle, niveaux: listeNiveaux, elements, ignores };
}

function nomParDefaut(famille, classe) {
  const noms = { murs: 'Mur', dalles: 'Dalle', revetements_sol: 'Revêtement de sol', plafonds: 'Plafond', poteaux: 'Poteau',
    poutres: 'Poutre', bords_dalle: 'Bord de dalle', garde_corps: 'Garde-corps', reseaux_ep: 'Canalisation EP', escaliers: 'Volée' };
  if (famille === 'menuiseries') return /DOOR/i.test(classe) ? 'Porte' : 'Fenêtre';
  return noms[famille] ?? 'Élément';
}
