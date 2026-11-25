"""Génère l'IFC d'exemple « Résidence Les Tilleuls » (fictive) et les totaux attendus.

Le fichier imite un export Revit : unités en millimètres, types nommés, noms
d'occurrences « Famille:Type:Id », quantités de base (BaseQuantities), réservations
reliées aux fenêtres et portes, Psets *Common avec IsExternal.

Les totaux attendus sont calculés ici, à la source, puis écrits en JSON : les tests
vérifient que l'appli retrouve exactement ces valeurs.

Usage :
    python tools/generer_ifc_exemple.py                    # IFC4 + IFC2X3 + variante sans quantités
    python tools/generer_ifc_exemple.py --schema IFC4 --sortie fichier.ifc

Dépendance : ifcopenshell >= 0.8
"""
import argparse
import json
import random
import uuid
from collections import defaultdict
from pathlib import Path

import ifcopenshell
import ifcopenshell.api as api
import ifcopenshell.api.owner.settings as owner_settings
import ifcopenshell.guid

RACINE = Path(__file__).resolve().parent.parent
H_ETAGE = 2900           # hauteur d'étage (mm)
H_MUR = 2700             # hauteur des murs (mm)
NIVEAUX = ["RDC", "R+1", "R+2", "R+3"]


class Generateur:
    def __init__(self, schema, avec_quantites=True, graine=42):
        self.schema = schema
        self.avec_quantites = avec_quantites
        self.rng = random.Random(graine)
        self.f = api.run("project.create_file", version=schema)
        self.attendu = {"familles": defaultdict(lambda: defaultdict(lambda: defaultdict(float)))}
        self.types = {}
        self.ids = 345000
        self._proprietaire()
        self._structure_spatiale()

    # ---------- outils ----------
    def guid(self):
        return ifcopenshell.guid.compress(uuid.UUID(int=self.rng.getrandbits(128)).hex)

    def nouvel_id(self):
        self.ids += 17
        return self.ids

    def _proprietaire(self):
        f = self.f
        org = f.create_entity("IfcOrganization", Name="RJB")
        pers = f.create_entity("IfcPerson", FamilyName="Exemple")
        user = f.create_entity("IfcPersonAndOrganization", ThePerson=pers, TheOrganization=org)
        app = f.create_entity("IfcApplication", ApplicationDeveloper=org, Version="1.0",
                              ApplicationFullName="Générateur d'exemple IFC Analyzer", ApplicationIdentifier="ifc-analyzer-exemple")
        owner_settings.get_user = lambda _f: user
        owner_settings.get_application = lambda _f: app

    def entite(self, classe, nom, **attrs):
        e = api.run("root.create_entity", self.f, ifc_class=classe, name=nom)
        e.GlobalId = self.guid()
        for k, v in attrs.items():
            setattr(e, k, v)
        return e

    def _structure_spatiale(self):
        f = self.f
        self.projet = self.entite("IfcProject", "Résidence Les Tilleuls (exemple)")
        mm = f.create_entity("IfcSIUnit", UnitType="LENGTHUNIT", Prefix="MILLI", Name="METRE")
        m2 = f.create_entity("IfcSIUnit", UnitType="AREAUNIT", Name="SQUARE_METRE")
        m3 = f.create_entity("IfcSIUnit", UnitType="VOLUMEUNIT", Name="CUBIC_METRE")
        api.run("unit.assign_unit", f, units=[mm, m2, m3])
        api.run("context.add_context", f, context_type="Model")  # contexte 3D (obligatoire en IFC2X3)
        site = self.entite("IfcSite", "Terrain")
        bat = self.entite("IfcBuilding", "Bâtiment A")
        api.run("aggregate.assign_object", f, relating_object=self.projet, products=[site])
        api.run("aggregate.assign_object", f, relating_object=site, products=[bat])
        self.niveaux = {}
        for i, n in enumerate(NIVEAUX):
            s = self.entite("IfcBuildingStorey", n, Elevation=float(i * H_ETAGE))
            api.run("aggregate.assign_object", f, relating_object=bat, products=[s])
            self.niveaux[n] = s

    def type_de(self, classe_type, nom):
        cle = (classe_type, nom)
        if cle not in self.types:
            self.types[cle] = self.entite(classe_type, nom)
        return self.types[cle]

    def quantites(self, produit, valeurs):
        """Quantités typées (Length/Area/Volume) dans un IfcElementQuantity « BaseQuantities »."""
        if not self.avec_quantites:
            return self._pset_revit(produit, valeurs)
        genre = lambda k: ("Area" if "Area" in k else "Volume" if "Volume" in k else "Length")
        qs = [self.f.create_entity(f"IfcQuantity{genre(k)}", Name=k, **{f"{genre(k)}Value": float(v)})
              for k, v in valeurs.items()]
        eq = self.f.create_entity("IfcElementQuantity", GlobalId=self.guid(), Name="BaseQuantities", Quantities=qs)
        self.f.create_entity("IfcRelDefinesByProperties", GlobalId=self.guid(),
                             RelatedObjects=[produit], RelatingPropertyDefinition=eq)

    def _pset_revit(self, produit, valeurs):
        """Variante sans BaseQuantities : seules des propriétés Revit « Cotes » (françaises) existent."""
        traduction = {"Length": ("Longueur", "IfcLengthMeasure"), "GrossSideArea": ("Surface", "IfcAreaMeasure"),
                      "GrossArea": ("Surface", "IfcAreaMeasure"), "Area": ("Surface", "IfcAreaMeasure"),
                      "GrossVolume": ("Volume", "IfcVolumeMeasure"), "Width": ("Épaisseur", "IfcLengthMeasure")}
        props = []
        for k, v in valeurs.items():
            if k in traduction:
                nom, mesure = traduction[k]
                if any(p.Name == nom for p in props):
                    continue
                props.append(self.f.create_entity("IfcPropertySingleValue", Name=nom,
                                                  NominalValue=self.f.create_entity(mesure, float(v))))
        ps = self.f.create_entity("IfcPropertySet", GlobalId=self.guid(), Name="Cotes", HasProperties=props)
        self.f.create_entity("IfcRelDefinesByProperties", GlobalId=self.guid(),
                             RelatedObjects=[produit], RelatingPropertyDefinition=ps)

    def pset(self, produit, nom, valeurs):
        p = api.run("pset.add_pset", self.f, product=produit, name=nom)
        api.run("pset.edit_pset", self.f, pset=p, properties=valeurs)

    def placer(self, produit, niveau, classe_type=None, nom_type=None):
        api.run("spatial.assign_container", self.f, relating_structure=self.niveaux[niveau], products=[produit])
        if classe_type:
            api.run("type.assign_type", self.f, related_objects=[produit], relating_type=self.type_de(classe_type, nom_type))

    def compter(self, famille, type_nom, niveau, **valeurs):
        """Mémorise la vérité terrain (en m, m², m³) pour les tests."""
        t = self.attendu["familles"][famille][type_nom]
        t["nombre"] += 1
        for k, v in valeurs.items():
            t[k] += v
        t[f"niveau:{niveau}"] += 1

    # ---------- éléments ----------
    def mur(self, type_nom, famille_revit, niveau, longueur, ep, exterieur, baies=()):
        """Mur + réservations. *baies* : liste de (classe, type, largeur, hauteur, statut) ou (None, ..) = trou sans menuiserie."""
        classe = "IfcWallStandardCase" if self.schema == "IFC2X3" else "IfcWall"
        m = self.entite(classe, f"{famille_revit}:{type_nom}:{self.nouvel_id()}")
        self.placer(m, niveau, "IfcWallType", type_nom)
        brute = longueur * H_MUR / 1e6
        trous = 0.0
        for classe_m, type_m, larg, haut, ext_m in baies:
            ouv = self.entite("IfcOpeningElement", "Réservation")
            self.f.create_entity("IfcRelVoidsElement", GlobalId=self.guid(), RelatingBuildingElement=m, RelatedOpeningElement=ouv)
            aire = larg * haut / 1e6
            trous += aire
            if self.avec_quantites:
                self.quantites(ouv, {"Width": larg, "Height": haut, "Depth": ep})
            if classe_m:
                self.menuiserie(classe_m, type_m, niveau, larg, haut, ext_m, ouv)
        nette = brute - trous
        self.quantites(m, {"Length": longueur, "Width": ep, "Height": H_MUR, "GrossSideArea": brute,
                           "NetSideArea": nette, "GrossVolume": brute * ep / 1000, "NetVolume": nette * ep / 1000})
        self.pset(m, "Pset_WallCommon", {"IsExternal": exterieur, "LoadBearing": "Voile" in type_nom, "Reference": type_nom})
        self.compter("murs", type_nom, niveau, longueur=longueur / 1000, brute=brute, nette=nette,
                     volume=nette * ep / 1000, baies=trous, exterieur=1 if exterieur else 0)
        return m

    def menuiserie(self, classe, type_nom, niveau, larg, haut, exterieur, ouverture):
        porte = classe == "IfcDoor"
        famille_revit = "Porte" if porte else "Fenêtre"
        style = ("IfcDoorStyle" if porte else "IfcWindowStyle") if self.schema == "IFC2X3" else ("IfcDoorType" if porte else "IfcWindowType")
        e = self.entite(classe, f"{famille_revit}:{type_nom}:{self.nouvel_id()}", OverallWidth=float(larg), OverallHeight=float(haut))
        self.placer(e, niveau, style, type_nom)
        self.f.create_entity("IfcRelFillsElement", GlobalId=self.guid(), RelatingOpeningElement=ouverture, RelatedBuildingElement=e)
        aire = larg * haut / 1e6
        self.quantites(e, {"Width": larg, "Height": haut, "Area": aire})
        self.pset(e, "Pset_DoorCommon" if porte else "Pset_WindowCommon", {"IsExternal": exterieur, "Reference": type_nom})
        self.compter("menuiseries", type_nom, niveau, surface=aire, largeur=larg / 1000, hauteur=haut / 1000,
                     exterieur=1 if exterieur else 0)

    def dalle(self, type_nom, niveau, predefini, surface_brute, surface_nette, perimetre, ep):
        d = self.entite("IfcSlab", f"Sol:{type_nom}:{self.nouvel_id()}", PredefinedType=predefini)
        self.placer(d, niveau, "IfcSlabType", type_nom)
        self.quantites(d, {"Width": ep, "Perimeter": perimetre, "GrossArea": surface_brute, "NetArea": surface_nette,
                           "GrossVolume": surface_brute * ep / 1000, "NetVolume": surface_nette * ep / 1000})
        self.pset(d, "Pset_SlabCommon", {"IsExternal": predefini == "ROOF", "LoadBearing": True})
        self.compter("dalles", type_nom, niveau, surface=surface_nette, perimetre=perimetre / 1000, volume=surface_nette * ep / 1000)

    def revetement(self, type_nom, niveau, predefini, surface, perimetre, ep):
        famille = "plafonds" if predefini == "CEILING" else "revetements_sol"
        c = self.entite("IfcCovering", f"{'Plafond' if predefini == 'CEILING' else 'Revêtement de sol'}:{type_nom}:{self.nouvel_id()}",
                        PredefinedType=predefini)
        self.placer(c, niveau, "IfcCoveringType", type_nom)
        self.quantites(c, {"Width": ep, "Perimeter": perimetre, "GrossArea": surface, "NetArea": surface})
        self.compter(famille, type_nom, niveau, surface=surface, perimetre=perimetre / 1000)

    def lineaire(self, classe, classe_type, famille, famille_revit, type_nom, niveau, longueur, section=None, extra_q=None, psets=None):
        e = self.entite(classe, f"{famille_revit}:{type_nom}:{self.nouvel_id()}")
        self.placer(e, niveau, classe_type, type_nom)
        q = {"Length": longueur}
        vol = 0.0
        if section:
            vol = section * longueur / 1000
            q.update({"CrossSectionArea": section, "GrossVolume": vol, "NetVolume": vol})
        q.update(extra_q or {})
        self.quantites(e, q)
        for nom, valeurs in (psets or {}).items():
            self.pset(e, nom, valeurs)
        valeurs = {"longueur": longueur / 1000}
        if section:
            valeurs["volume"] = vol
        self.compter(famille, type_nom, niveau, **valeurs)
        return e

    def volee(self, niveau, contremarches, girons, escalier):
        """Volée rattachée à un IfcStair (comme Revit) : elle n'est pas directement contenue dans le niveau."""
        attrs = {"RiserHeight": H_ETAGE / 17, "TreadLength": 280.0, "NumberOfTreads": girons}
        attrs["NumberOfRiser" if self.schema == "IFC2X3" else "NumberOfRisers"] = contremarches
        e = self.entite("IfcStairFlight", f"Escalier:Volée béton:{self.nouvel_id()}", **attrs)
        api.run("aggregate.assign_object", self.f, relating_object=escalier, products=[e])
        api.run("type.assign_type", self.f, related_objects=[e], relating_type=self.type_de("IfcStairFlightType", "Volée béton"))
        longueur = girons * 280.0
        self.quantites(e, {"Length": longueur, "GrossVolume": longueur * 1200 * 180 / 1e9})
        self.compter("escaliers", "Volée béton", niveau, contremarches=contremarches, marches=girons, longueur=longueur / 1000)

    # ---------- le bâtiment ----------
    def construire(self):
        F1, PF2, PE, P83 = ("IfcWindow", "F1 120x135", 1200, 1350, True), ("IfcDoor", "PF2 90x215", 900, 2150, True), \
            ("IfcDoor", "Porte d'entrée 140x220", 1400, 2200, True), ("IfcDoor", "Porte 83x204", 830, 2040, False)
        trou_doublage = lambda b: [(None, None, b[2], b[3], b[4])]  # le doublage a le même trou, sans menuiserie
        for i, n in enumerate(NIVEAUX):
            rdc = n == "RDC"
            # Façades Sud (3 segments) et Nord (3 segments) : 10 m chacun
            for seg in range(3):
                sud = [PF2] + ([F1] if not rdc else [])
                nord = [PE] if (rdc and seg == 1) else [F1, F1]
                self.mur("Voile BA 20 cm", "Mur de base", n, 10000, 200, True, sud)
                self.mur("Voile BA 20 cm", "Mur de base", n, 10000, 200, True, nord)
                self.mur("Doublage 10+80", "Mur de base", n, 10000, 90, True, [t for b in sud for t in trou_doublage(b)])
                self.mur("Doublage 10+80", "Mur de base", n, 10000, 90, True, [t for b in nord for t in trou_doublage(b)])
            # Pignons Est / Ouest : 12 m (maçonnerie au RDC pour le local vélos)
            for _ in range(2):
                if rdc:
                    self.mur("Maçonnerie bloc 20 cm", "Mur de base", n, 12000, 200, True)
                else:
                    self.mur("Voile BA 20 cm", "Mur de base", n, 12000, 200, True)
                    self.mur("Doublage 10+80", "Mur de base", n, 12000, 90, True)
            # Refends et cloisons
            for _ in range(2):
                self.mur("Voile BA 18 cm", "Mur de base", n, 12000, 180, False, [P83])
            for lg in (4000, 3500, 3000, 4500, 2500, 3800):
                self.mur("Cloison 72/48", "Mur de base", n, lg, 72, False, [P83])
            if not rdc:
                for lg in (5000, 4200, 3600):
                    self.mur("Cloison 98/48", "Mur de base", n, lg, 98, False)

            # Dalles : dallage au RDC, planchers avec trémie d'escalier (12,5 m²) aux étages
            if rdc:
                self.dalle("Dallage BA 15 cm", n, "BASESLAB", 360.0, 360.0, 84000, 150)
            else:
                self.dalle("Plancher BA 20 cm", n, "FLOOR", 360.0, 347.5, 84000, 200)
            if n == "R+3":
                self.dalle("Dalle toiture BA 22 cm", n, "ROOF", 360.0, 360.0, 84000, 220)

            # Revêtements de sol et plafonds
            if rdc:
                self.revetement("Résine hall", n, "FLOORING", 64.0, 34000, 5)
                self.revetement("Carrelage 30x30 local vélos", n, "FLOORING", 72.0, 36000, 10)
            else:
                self.revetement("Carrelage 45x45", n, "FLOORING", 138.5, 96000, 10)
                self.revetement("Parquet stratifié", n, "FLOORING", 176.0, 112000, 8)
            self.revetement("Faux plafond BA13", n, "CEILING", 248.0 if not rdc else 120.0, 90000, 13)
            if not rdc:
                self.revetement("Plafond plâtre lissé", n, "CEILING", 64.5, 38000, 10)

            # Structure
            if rdc:
                for _ in range(6):
                    self.lineaire("IfcColumn", "IfcColumnType", "poteaux", "Poteau béton", "Poteau BA 30x30", n, 2700, section=0.09)
                for _ in range(2):
                    self.lineaire("IfcColumn", "IfcColumnType", "poteaux", "Poteau béton", "Poteau BA Ø40", n, 2700, section=0.1257)
            for _ in range(3):
                self.lineaire("IfcBeam", "IfcBeamType", "poutres", "Poutre béton", "Poutre BA 20x50", n, 6000, section=0.10)
            for _ in range(2):
                self.lineaire("IfcBeam", "IfcBeamType", "poutres", "Poutre béton", "Linteau BA 20x30", n, 2400, section=0.06)
            if not rdc:
                self.lineaire("IfcBuildingElementProxy", "IfcBuildingElementProxyType", "bords_dalle", "Bord de dalle",
                              "Rive de dalle 20 cm", n, 84000)

            # Garde-corps (balcons Sud + escalier) aux étages
            if not rdc:
                for _ in range(3):
                    self.lineaire("IfcRailing", "IfcRailingType", "garde_corps", "Garde-corps", "Garde-corps vitré", n, 3200)
                self.lineaire("IfcRailing", "IfcRailingType", "garde_corps", "Garde-corps", "Garde-corps métallique", n, 5600)

            # Descentes EP : une par angle et par étage
            classe_tuyau = "IfcFlowSegment" if self.schema == "IFC2X3" else "IfcPipeSegment"
            for _ in range(4):
                self.lineaire(classe_tuyau, "IfcPipeSegmentType", "reseaux_ep", "Canalisation", "Descente EP Ø100", n, H_ETAGE,
                              psets={"Pset_PipeSegmentTypeCommon": {"NominalDiameter": 100.0}})
            if rdc:
                for _ in range(2):
                    self.lineaire(classe_tuyau, "IfcPipeSegmentType", "reseaux_ep", "Canalisation", "Collecteur EP Ø125", n, 15000,
                                  psets={"Pset_PipeSegmentTypeCommon": {"NominalDiameter": 125.0}})

            # Escalier : deux volées par étage (9 + 8 contremarches)
            if n != "R+3":
                escalier = self.entite("IfcStair", f"Escalier:Escalier béton:{self.nouvel_id()}")
                self.placer(escalier, n)
                self.volee(n, 9, 8, escalier)
                self.volee(n, 8, 7, escalier)

        # Objet générique sans type prédéfini (faisait planter l'ancienne version)
        proxy = self.entite("IfcBuildingElementProxy", "Objet générique")
        self.placer(proxy, "RDC")

    def ecrire(self, sortie):
        """Écriture reproductible : un seul historique de propriétaire, dates fixes (fichier identique à chaque génération)."""
        historiques = self.f.by_type("IfcOwnerHistory")
        if historiques:
            commun = historiques[0]
            commun.CreationDate = commun.LastModifiedDate = 1767225600  # 1er janvier 2026
            for e in self.f.by_type("IfcRoot"):
                e.OwnerHistory = commun
        # Les relations créées par ifcopenshell reçoivent un GlobalId aléatoire : on les renumérote dans l'ordre
        rng = random.Random(7)
        for e in sorted(self.f.by_type("IfcRoot"), key=lambda x: x.id()):
            e.GlobalId = ifcopenshell.guid.compress(uuid.UUID(int=rng.getrandbits(128)).hex)
        if historiques:
            for h in historiques[1:]:
                self.f.remove(h)
        self.f.header.file_name.name = Path(sortie).name
        self.f.header.file_name.time_stamp = "2026-01-01T00:00:00"
        self.f.write(str(sortie))

    def verite(self):
        """Totaux attendus, arrondis à 6 décimales (m, m², m³)."""
        fam = {f: {t: {k: round(v, 6) for k, v in d.items()} for t, d in types.items()}
               for f, types in self.attendu["familles"].items()}
        return {"schema": self.schema, "niveaux": NIVEAUX, "avec_quantites": self.avec_quantites, "familles": fam}


def generer(schema, sortie, avec_quantites=True):
    g = Generateur(schema, avec_quantites)
    g.construire()
    g.ecrire(sortie)
    return g.verite()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", choices=["IFC4", "IFC2X3"])
    ap.add_argument("--sortie")
    args = ap.parse_args()
    if args.schema and args.sortie:
        generer(args.schema, args.sortie)
    else:
        exemple = RACINE / "assets" / "exemple"
        fixtures = RACINE / "tests" / "fixtures"
        exemple.mkdir(parents=True, exist_ok=True)
        fixtures.mkdir(parents=True, exist_ok=True)
        verite = generer("IFC4", exemple / "residence-les-tilleuls.ifc")
        generer("IFC2X3", fixtures / "residence-ifc2x3.ifc")
        sans_q = generer("IFC4", fixtures / "residence-sans-quantites.ifc", avec_quantites=False)
        (fixtures / "attendu.json").write_text(json.dumps(verite, ensure_ascii=False, indent=1), encoding="utf-8")
        (fixtures / "attendu-sans-quantites.json").write_text(json.dumps(sans_q, ensure_ascii=False, indent=1), encoding="utf-8")
        print("IFC d'exemple et totaux attendus générés.")
