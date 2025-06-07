import ifcopenshell
import ifcopenshell.geom
import os
import re

# Chemin vers le fichier IFC
fichier_ifc = r"C:\Users\r.jeantin.PATRIARCHE-TX\OneDrive - Patriarche\Bureau\PROJET TOP SECRET\TEST\bonsai_py312-0.8.2-alpha250407-windows-x64\bonsai\3171-PAT-ARC-MAQ-A01-1910.ifc"


# Initialisation du contexte géométrique
settings = ifcopenshell.geom.settings()
settings.set(settings.USE_WORLD_COORDS, True)

# Lecture du fichier IFC
try:
    modele = ifcopenshell.open(fichier_ifc)
    print("✅ Fichier IFC chargé")
except Exception as e:
    print(f"❌ Erreur chargement fichier IFC: {e}")
    exit()

# Récupération des murs
murs = modele.by_type("IfcWall") + modele.by_type("IfcWallStandardCase")

# Fonctions utilitaires
def vec_sub(v1, v2):
    return [v1[i] - v2[i] for i in range(3)]

def cross(a, b):
    return [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0]
    ]

def norm(v):
    return sum(x**2 for x in v) ** 0.5

def extrait_epaisseur(nom):
    match = re.search(r"(\d+)\s*cm", nom)
    if match:
        return int(match.group(1)) / 100  # cm → m
    return None

# Boucle de traitement
# Boucle de traitement
for mur in murs:
    try:
        shape = ifcopenshell.geom.create_shape(settings, mur)
        verts = shape.geometry.verts

        # Extraire les coordonnées
        xs = verts[0::3]
        ys = verts[1::3]
        zs = verts[2::3]

        # Dimensions (en mm → diviser par 1000)
        longueur_x = (max(xs) - min(xs)) / 1000
        longueur_y = (max(ys) - min(ys)) / 1000
        hauteur_z = (max(zs) - min(zs)) / 1000

        # Longueur ML = max(X, Y)
        longueur_ml = round(max(longueur_x, longueur_y), 2)
        hauteur_m = round(hauteur_z, 2)

        # Surface = longueur * hauteur
        surface_m2 = round(longueur_ml * hauteur_m, 2)

        # Épaisseur estimée depuis le nom
        epaisseur = extrait_epaisseur(mur.Name or "")
        volume_m3 = round(surface_m2 * epaisseur, 3) if epaisseur else "?"

        print(f"✅ Mur: {mur.Name or 'Sans nom'} – Surface: {surface_m2} m² – Longueur: {longueur_ml} ml – Volume: {volume_m3} m³")

    except Exception as e:
        print(f"❌ Erreur géométrie pour le mur {mur.Name}: {e}")

    except Exception as e:
        print(f"❌ Erreur géométrie pour le mur {mur.Name}: {e}")
