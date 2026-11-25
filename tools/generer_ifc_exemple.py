"""Génère l'IFC d'exemple « Résidence Les Tilleuls » (fictive) et les totaux attendus.

Le fichier imite un export Revit : unités en millimètres, types nommés, noms
d'occurrences « Famille:Type:Id », quantités de base (BaseQuantities), réservations
reliées aux fenêtres et portes, Psets *Common avec IsExternal, et une géométrie 3D
simple mais cohérente (volumes extrudés, murs percés par leurs réservations).

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
        modele = api.run("context.add_context", f, context_type="Model")  # contexte 3D (obligatoire en IFC2X3)
        self.corps = api.run("context.add_context", f, context_type="Model", context_identifier="Body",
                             target_view="MODEL_VIEW", parent=modele)
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

    # ---------- géométrie (coordonnées absolues, en mm, Z vers le haut) ----------
    def _pt(self, *c):
        return self.f.create_entity("IfcCartesianPoint", Coordinates=[float(x) for x in c])

    def _dir(self, *c):
        return self.f.create_entity("IfcDirection", DirectionRatios=[float(x) for x in c])

    def _repere(self, origine=(0, 0, 0), axe=(0, 0, 1), ref=(1, 0, 0)):
        return self.f.create_entity("IfcAxis2Placement3D", Location=self._pt(*origine), Axis=self._dir(*axe), RefDirection=self._dir(*ref))

    def boite(self, x0, y0, z0, dx, dy, dz):
        """Parallélépipède aligné sur les axes, coin bas (x0, y0, z0)."""
        profil = self.f.create_entity("IfcRectangleProfileDef", ProfileType="AREA", XDim=float(dx), YDim=float(dy),
                                      Position=self.f.create_entity("IfcAxis2Placement2D", Location=self._pt(x0 + dx / 2, y0 + dy / 2)))
        return self.f.create_entity("IfcExtrudedAreaSolid", SweptArea=profil, Position=self._repere((0, 0, z0)),
                                    ExtrudedDirection=self._dir(0, 0, 1), Depth=float(dz))

    def cylindre(self, origine, rayon, longueur, axe=(0, 0, 1), ref=(1, 0, 0)):
        profil = self.f.create_entity("IfcCircleProfileDef", ProfileType="AREA", Radius=float(rayon),
                                      Position=self.f.create_entity("IfcAxis2Placement2D", Location=self._pt(0, 0)))
        return self.f.create_entity("IfcExtrudedAreaSolid", SweptArea=profil, Position=self._repere(origine, axe, ref),
                                    ExtrudedDirection=self._dir(0, 0, 1), Depth=float(longueur))

    def profil_extrude(self, points, origine, axe, ref, profondeur):
        """Profil 2D quelconque (ex. marches d'une volée) extrudé selon *axe*."""
        poly = self.f.create_entity("IfcPolyline", Points=[self._pt(*pt) for pt in points + [points[0]]])
        profil = self.f.create_entity("IfcArbitraryClosedProfileDef", ProfileType="AREA", OuterCurve=poly)
        return self.f.create_entity("IfcExtrudedAreaSolid", SweptArea=profil, Position=self._repere(origine, axe, ref),
                                    ExtrudedDirection=self._dir(0, 0, 1), Depth=float(profondeur))

    def forme(self, produit, solides):
        """Représentation « Body » de l'élément, placé à l'origine (les solides sont en coordonnées absolues)."""
        if not solides:
            return
        rep = self.f.create_entity("IfcShapeRepresentation", ContextOfItems=self.corps, RepresentationIdentifier="Body",
                                   RepresentationType="SweptSolid", Items=list(solides))
        produit.Representation = self.f.create_entity("IfcProductDefinitionShape", Representations=[rep])
        produit.ObjectPlacement = self.f.create_entity("IfcLocalPlacement", RelativePlacement=self._repere())

    # ---------- éléments ----------
    def mur(self, type_nom, famille_revit, niveau, longueur, ep, exterieur, baies=(), pos=(0, 0, "x")):
        """Mur + réservations. *baies* : liste de (classe, type, largeur, hauteur, statut) ou (None, ..) = trou sans menuiserie.
        *pos* : (x0, y0, axe) — le mur part de (x0, y0) le long de l'axe « x » ou « y », son épaisseur du côté positif."""
        classe = "IfcWallStandardCase" if self.schema == "IFC2X3" else "IfcWall"
        m = self.entite(classe, f"{famille_revit}:{type_nom}:{self.nouvel_id()}")
        self.placer(m, niveau, "IfcWallType", type_nom)
        x0, y0, axe = pos
        z0 = NIVEAUX.index(niveau) * H_ETAGE
        boite_le_long = lambda debut, long_, z, haut, e0, e1: (
            self.boite(x0 + debut, y0 + e0, z, long_, e1 - e0, haut) if axe == "x" else self.boite(x0 + e0, y0 + debut, z, e1 - e0, long_, haut))
        self.forme(m, [boite_le_long(0, longueur, z0, H_MUR, 0, ep)])
        brute = longueur * H_MUR / 1e6
        trous = 0.0
        for k, (classe_m, type_m, larg, haut, ext_m) in enumerate(baies):
            ouv = self.entite("IfcOpeningElement", "Réservation")
            self.f.create_entity("IfcRelVoidsElement", GlobalId=self.guid(), RelatingBuildingElement=m, RelatedOpeningElement=ouv)
            centre = longueur * (k + 1) / (len(baies) + 1)
            allege = 900 if classe_m == "IfcWindow" or (classe_m is None and haut < 2000) else 0
            self.forme(ouv, [boite_le_long(centre - larg / 2, larg, z0 + allege, haut, -60, ep + 60)])
            aire = larg * haut / 1e6
            trous += aire
            if self.avec_quantites:
                self.quantites(ouv, {"Width": larg, "Height": haut, "Depth": ep})
            if classe_m:
                men = self.menuiserie(classe_m, type_m, niveau, larg, haut, ext_m, ouv)
                self.forme(men, [boite_le_long(centre - larg / 2, larg, z0 + allege, haut, ep / 2 - 30, ep / 2 + 30)])
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
        return e

    def dalle(self, type_nom, niveau, predefini, surface_brute, surface_nette, perimetre, ep, z0=0):
        d = self.entite("IfcSlab", f"Sol:{type_nom}:{self.nouvel_id()}", PredefinedType=predefini)
        self.placer(d, niveau, "IfcSlabType", type_nom)
        self.forme(d, [self.boite(0, 0, z0, 30000, 12000, ep)])
        self.quantites(d, {"Width": ep, "Perimeter": perimetre, "GrossArea": surface_brute, "NetArea": surface_nette,
                           "GrossVolume": surface_brute * ep / 1000, "NetVolume": surface_nette * ep / 1000})
        self.pset(d, "Pset_SlabCommon", {"IsExternal": predefini == "ROOF", "LoadBearing": True})
        self.compter("dalles", type_nom, niveau, surface=surface_nette, perimetre=perimetre / 1000, volume=surface_nette * ep / 1000)

    def revetement(self, type_nom, niveau, predefini, surface, perimetre, ep, rect=None, z=0):
        famille = "plafonds" if predefini == "CEILING" else "revetements_sol"
        c = self.entite("IfcCovering", f"{'Plafond' if predefini == 'CEILING' else 'Revêtement de sol'}:{type_nom}:{self.nouvel_id()}",
                        PredefinedType=predefini)
        self.placer(c, niveau, "IfcCoveringType", type_nom)
        if rect:  # rectangle (x0, y0, largeur) : la profondeur donne la bonne surface
            x0, y0, lx = rect
            self.forme(c, [self.boite(x0, y0, z, lx, surface * 1e6 / lx, ep)])
        self.quantites(c, {"Width": ep, "Perimeter": perimetre, "GrossArea": surface, "NetArea": surface})
        self.compter(famille, type_nom, niveau, surface=surface, perimetre=perimetre / 1000)

    def lineaire(self, classe, classe_type, famille, famille_revit, type_nom, niveau, longueur, section=None, extra_q=None, psets=None, solides=()):
        e = self.entite(classe, f"{famille_revit}:{type_nom}:{self.nouvel_id()}")
        self.placer(e, niveau, classe_type, type_nom)
        self.forme(e, solides)
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

    def volee(self, niveau, contremarches, girons, escalier, depart, montee_vers_x=True):
        """Volée rattachée à un IfcStair (comme Revit) : elle n'est pas directement contenue dans le niveau.
        Géométrie : profil en marches extrudé sur la largeur d'emmarchement (1,20 m)."""
        attrs = {"RiserHeight": H_ETAGE / 17, "TreadLength": 280.0, "NumberOfTreads": girons}
        attrs["NumberOfRiser" if self.schema == "IFC2X3" else "NumberOfRisers"] = contremarches
        e = self.entite("IfcStairFlight", f"Escalier:Volée béton:{self.nouvel_id()}", **attrs)
        api.run("aggregate.assign_object", self.f, relating_object=escalier, products=[e])
        api.run("type.assign_type", self.f, related_objects=[e], relating_type=self.type_de("IfcStairFlightType", "Volée béton"))
        h = H_ETAGE / 17
        pts = [(0, 0)]
        for k in range(contremarches):
            pts.append((k * 280, (k + 1) * h))
            if k < girons:
                pts.append(((k + 1) * 280, (k + 1) * h))
        pts.append((girons * 280, contremarches * h - 300))
        # Repère local : X = sens de montée, Y = verticale, extrusion = largeur d'emmarchement
        ref, axe = ((1, 0, 0), (0, -1, 0)) if montee_vers_x else ((-1, 0, 0), (0, 1, 0))
        self.forme(e, [self.profil_extrude(pts, depart, axe, ref, 1200)])
        longueur = girons * 280.0
        self.quantites(e, {"Length": longueur, "GrossVolume": longueur * 1200 * 180 / 1e9})
        self.compter("escaliers", "Volée béton", niveau, contremarches=contremarches, marches=girons, longueur=longueur / 1000)

    # ---------- le bâtiment ----------
    def construire(self):
        F1, PF2, PE, P83 = ("IfcWindow", "F1 120x135", 1200, 1350, True), ("IfcDoor", "PF2 90x215", 900, 2150, True), \
            ("IfcDoor", "Porte d'entrée 140x220", 1400, 2200, True), ("IfcDoor", "Porte 83x204", 830, 2040, False)
        trou_doublage = lambda b: [(None, None, b[2], b[3], b[4])]  # le doublage a le même trou, sans menuiserie
        # Plan : bâtiment de 30 m (x) × 12 m (y). Façade Sud en y = 0, Nord en y = 12 m. Niveaux tous les 2,90 m.
        for i, n in enumerate(NIVEAUX):
            rdc = n == "RDC"
            z = i * H_ETAGE
            # Façades Sud (3 segments) et Nord (3 segments) : 10 m chacun
            for seg in range(3):
                sud = [PF2] + ([F1] if not rdc else [])
                nord = [PE] if (rdc and seg == 1) else [F1, F1]
                x0 = seg * 10000
                self.mur("Voile BA 20 cm", "Mur de base", n, 10000, 200, True, sud, (x0, 0, "x"))
                self.mur("Voile BA 20 cm", "Mur de base", n, 10000, 200, True, nord, (x0, 11800, "x"))
                self.mur("Doublage 10+80", "Mur de base", n, 10000, 90, True, [t for b in sud for t in trou_doublage(b)], (x0, 200, "x"))
                self.mur("Doublage 10+80", "Mur de base", n, 10000, 90, True, [t for b in nord for t in trou_doublage(b)], (x0, 11710, "x"))
            # Pignons Ouest / Est : 12 m (maçonnerie au RDC pour le local vélos)
            for x_mur, x_doub in ((0, 200), (29800, 29710)):
                if rdc:
                    self.mur("Maçonnerie bloc 20 cm", "Mur de base", n, 12000, 200, True, (), (x_mur, 0, "y"))
                else:
                    self.mur("Voile BA 20 cm", "Mur de base", n, 12000, 200, True, (), (x_mur, 0, "y"))
                    self.mur("Doublage 10+80", "Mur de base", n, 12000, 90, True, (), (x_doub, 0, "y"))
            # Refends et cloisons
            for x_ref in (9910, 19910):
                self.mur("Voile BA 18 cm", "Mur de base", n, 12000, 180, False, [P83], (x_ref, 0, "y"))
            for x0, lg in ((500, 4000), (5000, 3500), (10500, 3000), (14000, 4500), (20500, 2500), (23500, 3800)):
                self.mur("Cloison 72/48", "Mur de base", n, lg, 72, False, [P83], (x0, 5964, "x"))
            if not rdc:
                for x0, lg in ((4951, 5000), (14951, 4200), (24951, 3600)):
                    self.mur("Cloison 98/48", "Mur de base", n, lg, 98, False, (), (x0, 6036, "y"))

            # Dalles : dallage au RDC, planchers avec trémie d'escalier (12,5 m²) aux étages
            if rdc:
                self.dalle("Dallage BA 15 cm", n, "BASESLAB", 360.0, 360.0, 84000, 150, z0=-150)
            else:
                self.dalle("Plancher BA 20 cm", n, "FLOOR", 360.0, 347.5, 84000, 200, z0=z - 200)
            if n == "R+3":
                self.dalle("Dalle toiture BA 22 cm", n, "ROOF", 360.0, 360.0, 84000, 220, z0=z + H_MUR)

            # Revêtements de sol et plafonds
            if rdc:
                self.revetement("Résine hall", n, "FLOORING", 64.0, 34000, 5, (290, 290, 8000), z)
                self.revetement("Carrelage 30x30 local vélos", n, "FLOORING", 72.0, 36000, 10, (20700, 290, 9000), z)
            else:
                self.revetement("Carrelage 45x45", n, "FLOORING", 138.5, 96000, 10, (290, 290, 13850), z)
                self.revetement("Parquet stratifié", n, "FLOORING", 176.0, 112000, 8, (14200, 290, 15510), z)
            self.revetement("Faux plafond BA13", n, "CEILING", 248.0 if not rdc else 120.0, 90000, 13,
                            (290, 290, 22000 if not rdc else 12000), z + 2500)
            if not rdc:
                self.revetement("Plafond plâtre lissé", n, "CEILING", 64.5, 38000, 10, (22400, 290, 6450), z + 2690)

            # Structure
            haut = z + H_MUR
            if rdc:
                for x, y in ((5000, 3000), (15000, 3000), (25000, 3000), (5000, 9000), (15000, 9000), (25000, 9000)):
                    self.lineaire("IfcColumn", "IfcColumnType", "poteaux", "Poteau béton", "Poteau BA 30x30", n, 2700, section=0.09,
                                  solides=[self.boite(x - 150, y - 150, 0, 300, 300, 2700)])
                for x in (12500, 17500):
                    self.lineaire("IfcColumn", "IfcColumnType", "poteaux", "Poteau béton", "Poteau BA Ø40", n, 2700, section=0.1257,
                                  solides=[self.cylindre((x, 3000, 0), 200, 2700)])
            for x in (5000, 15000, 25000):
                self.lineaire("IfcBeam", "IfcBeamType", "poutres", "Poutre béton", "Poutre BA 20x50", n, 6000, section=0.10,
                              solides=[self.boite(x - 100, 3000, haut - 500, 200, 6000, 500)])
            for x0 in (7000, 20600):
                self.lineaire("IfcBeam", "IfcBeamType", "poutres", "Poutre béton", "Linteau BA 20x30", n, 2400, section=0.06,
                              solides=[self.boite(x0, 2900, haut - 300, 2400, 200, 300)])
            if not rdc:
                rive = [self.boite(0, -30, z - 200, 30000, 30, 200), self.boite(0, 12000, z - 200, 30000, 30, 200),
                        self.boite(-30, -30, z - 200, 30, 12060, 200), self.boite(30000, -30, z - 200, 30, 12060, 200)]
                self.lineaire("IfcBuildingElementProxy", "IfcBuildingElementProxyType", "bords_dalle", "Bord de dalle",
                              "Rive de dalle 20 cm", n, 84000, solides=rive)

            # Garde-corps vitrés devant les portes-fenêtres de la façade Sud, garde-corps métallique de trémie
            if not rdc:
                for seg in range(3):
                    centre = seg * 10000 + 10000 / 3
                    self.lineaire("IfcRailing", "IfcRailingType", "garde_corps", "Garde-corps", "Garde-corps vitré", n, 3200,
                                  solides=[self.boite(centre - 1600, -170, z, 3200, 20, 1000)])
                self.lineaire("IfcRailing", "IfcRailingType", "garde_corps", "Garde-corps", "Garde-corps métallique", n, 5600,
                              solides=[self.boite(23600, 8050, z, 5600, 40, 1000)])

            # Descentes EP : une par angle et par étage (hors œuvre), collecteurs enterrés au RDC
            classe_tuyau = "IfcFlowSegment" if self.schema == "IFC2X3" else "IfcPipeSegment"
            for x, y in ((-120, -120), (30120, -120), (30120, 12120), (-120, 12120)):
                self.lineaire(classe_tuyau, "IfcPipeSegmentType", "reseaux_ep", "Canalisation", "Descente EP Ø100", n, H_ETAGE,
                              psets={"Pset_PipeSegmentTypeCommon": {"NominalDiameter": 100.0}},
                              solides=[self.cylindre((x, y, z - 200 if not rdc else -600), 50, H_ETAGE if not rdc else H_ETAGE + 400)])
            if rdc:
                for x0 in (-120, 15000):
                    self.lineaire(classe_tuyau, "IfcPipeSegmentType", "reseaux_ep", "Canalisation", "Collecteur EP Ø125", n, 15000,
                                  psets={"Pset_PipeSegmentTypeCommon": {"NominalDiameter": 125.0}},
                                  solides=[self.cylindre((x0, -120, -600), 62.5, 15000, axe=(1, 0, 0), ref=(0, 1, 0))])

            # Escalier : deux volées par étage (9 + 8 contremarches), dans la trémie côté Est
            if n != "R+3":
                forme_esc = {"ShapeType" if self.schema == "IFC2X3" else "PredefinedType": "HALF_TURN_STAIR"}
                escalier = self.entite("IfcStair", f"Escalier:Escalier béton:{self.nouvel_id()}", **forme_esc)
                self.placer(escalier, n)
                self.volee(n, 9, 8, escalier, (26200, 9400, z), True)
                self.volee(n, 8, 7, escalier, (28440, 9500, z + 9 * H_ETAGE / 17), False)

        # Objet générique sans type prédéfini (faisait planter l'ancienne version)
        proxy = self.entite("IfcBuildingElementProxy", "Objet générique")
        self.placer(proxy, "RDC")
        self.forme(proxy, [self.boite(1500, 1500, 0, 600, 600, 900)])

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
