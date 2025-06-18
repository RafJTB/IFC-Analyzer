def afficher_infos_mur_resume(event=None):
    """Affiche les infos complémentaires pour la sélection dans le résumé."""
    sel = tree_surfaces_murs.selection()
    if not sel:
        return
    nom_sel = tree_surfaces_murs.item(sel[0])["values"][0]
    _update_infos_mur(nom_sel)
    _update_resume_mur(nom_sel)


def _format_summary_value(value: float, unit: str = "") -> str:
    """Format the value for the summary, returning 'N/A' when value is non positive."""
    try:
        val = float(value)
    except (TypeError, ValueError):
        return "N/A"
    if val <= 0:
        return "N/A"
    return f"{round(val, 2):.2f}{unit}"


def _calc_surface_menuiseries(murs_list):
    """Calcule dynamiquement la surface cumulée des menuiseries liées aux *murs_list*.

    La méthode :
    1. On calcule la surface totale des murs *affichés* (murs_list) pour chaque paire (storey, statut Ext/Int).
    2. On calcule la surface totale de *tous* les murs du projet pour ces mêmes paires.
    3. Pour chaque menuiserie, on applique un ratio = surface_affichée / surface_totale_pair
       afin de « répartir » la surface des menuiseries au prorata des murs visibles.
       ⇒ Cela conserve une cohérence même lorsqu’on filtre par niveau, type ou nom.
    """

    # 1️⃣ Surfaces sélectionnées par paire
    selected_pairs = {}
    infos = donnees_ifc.get(ifc_actif, {}).get("murs_infos", {})
    for nom, surface, _l, _v, _t, storey in murs_list:
        info = infos.get((nom, storey), {})
        ext = info.get("IsExternal")
        if isinstance(ext, str):
            ext = ext.lower() in ("true", "1", "yes", "oui")
        statut = "Extérieure" if ext else "Intérieure"
        key = (storey, statut)
        selected_pairs[key] = selected_pairs.get(key, 0.0) + surface

    if not selected_pairs:
        return 0.0

    # 2️⃣ Surfaces totales par paire dans tout le projet
    total_pairs = {}
    all_murs = donnees_ifc.get(ifc_actif, {}).get("murs", [])
    for nom, surface, _l, _v, _t, storey in all_murs:
        info = infos.get((nom, storey), {})
        ext = info.get("IsExternal")
        if isinstance(ext, str):
            ext = ext.lower() in ("true", "1", "yes", "oui")
        statut = "Extérieure" if ext else "Intérieure"
        key = (storey, statut)
        total_pairs[key] = total_pairs.get(key, 0.0) + surface

    # 3️⃣ Répartition prorata des menuiseries
    menu = donnees_ifc.get(ifc_actif, {}).get("menuiseries", [])
    surface_menuiseries = 0.0
    for m in menu:
        surf_menu, statut_m, storey_m = m[1], m[4], m[5]
        key = (storey_m, statut_m)
        if key in selected_pairs and total_pairs.get(key, 0) > 0:
            ratio = selected_pairs[key] / total_pairs[key]
            surface_menuiseries += surf_menu * ratio

    return surface_menuiseries


def _calc_total_facade_surface():
    """Retourne la surface totale des murs extérieurs du projet."""
    infos = donnees_ifc.get(ifc_actif, {}).get("murs_infos", {})
    murs = donnees_ifc.get(ifc_actif, {}).get("murs", [])
    total = 0.0
    for nom, surface, _l, _v, _t, storey in murs:
        info = infos.get((nom, storey), {})
        ext = info.get("IsExternal")
        if isinstance(ext, str):
            ext = ext.lower() in ("true", "1", "yes", "oui")
        if ext:
            total += surface
    return total


def _calc_surface_nette_sols(sols_list):
    """Retourne la surface nette des sols passés en paramètre.

    Si la surface nette est disponible dans les ``sols_infos`` pour tous les
    éléments sélectionnés, cette valeur est utilisée. À défaut, la surface nette
    est approximée en retranchant l'empreinte des poteaux et poutres présents
    dans le projet à la surface brute cumulée.
    """

    infos = donnees_ifc.get(ifc_actif, {}).get("sols_infos", {})

    net_total = 0.0
    all_have_net = True
    for nom, surface, _len, _tp, storey in sols_list:
        info = infos.get((nom, storey), {})
        net_val = info.get("Surface nette")
        if net_val in (None, "", "None"):
            all_have_net = False
            break
        try:
            net_total += float(net_val)
        except (TypeError, ValueError):
            all_have_net = False
            break

    if all_have_net:
        return net_total

    surface_brute = sum(s[1] for s in sols_list)
    data = donnees_ifc.get(ifc_actif, {})

    surface_obstacles = 0.0

    # Empreinte approximative des poteaux : largeur²
    for _nom, largeur, _surf, _vol, _tp, _storey in data.get("poteaux", []):
        try:
            larg = float(largeur)
        except (TypeError, ValueError):
            continue
        if larg > 0:
            surface_obstacles += larg * larg

    # Empreinte approximative des poutres : volume / longueur
    for _nom, longueur, _surf, volume, _tp, _storey in data.get("poutres", []):
        try:
            longu = float(longueur)
            vol = float(volume)
        except (TypeError, ValueError):
            continue
        if longu > 0:
            surface_obstacles += vol / longu

    surface_nette = surface_brute - surface_obstacles
    return max(surface_nette, 0.0)


def on_configure_grid_types_murs(event):
    """Réajuste la zone de scroll du canvas des types de murs."""
    canvas_grid_types_murs.configure(scrollregion=canvas_grid_types_murs.bbox("all"))

import sys


# --- Fonctions de filtrage pour ESCALIER ---
def appliquer_filtre_escalier():
    filtre = entree_filtre_escalier.get().lower()
    for item in tree_escalier.get_children():
        valeurs = tree_escalier.item(item)['values']
        if filtre in " ".join(str(v).lower() for v in valeurs):
            tree_escalier.reattach(item, '', 'end')
        else:
            tree_escalier.detach(item)

def reinitialiser_filtre_escalier():
    for item in tree_escalier.get_children(''):
        tree_escalier.reattach(item, '', 'end')

def appliquer_filtre_zero_escalier():
    # Affiche uniquement les éléments ayant au moins une valeur nulle
    for item in tree_escalier.get_children():
        valeurs = tree_escalier.item(item)['values'][1:]
        if any(v == 0 or v == '0' for v in valeurs):
            tree_escalier.reattach(item, '', 'end')
        else:
            tree_escalier.detach(item)

# --- Fonctions de filtrage pour BORD DE DALLE ---
def appliquer_filtre_bord_dalle():
    filtre = entree_filtre_bord_dalle.get().lower()
    for item in tree_bord_dalle.get_children():
        valeurs = tree_bord_dalle.item(item)['values']
        if filtre in " ".join(str(v).lower() for v in valeurs):
            tree_bord_dalle.reattach(item, '', 'end')
        else:
            tree_bord_dalle.detach(item)

def reinitialiser_filtre_bord_dalle():
    """Réinitialise le filtre et réaffiche toutes les données de bord de dalle."""
    entree_filtre_bord_dalle.delete(0, tk.END)
    afficher_donnees_bord_dalle()


def appliquer_filtre_zero_bord_dalle():
    # Affiche uniquement les éléments ayant une longueur nulle
    for item in tree_bord_dalle.get_children():
        longueur = tree_bord_dalle.item(item)['values'][1]  # colonne longueur
        if longueur in (0, '0', 0.0, '0.0'):
            tree_bord_dalle.reattach(item, '', 'end')
        else:
            tree_bord_dalle.detach(item)

def afficher_donnees_bord_dalle(bords=None):
    bords = bords or donnees_ifc.get(ifc_actif, {}).get("bords_dalle", [])
    # vider tableau
    tree_bord_dalle.delete(*tree_bord_dalle.get_children())
    longueur_totale = 0.0
    for idx, (nom, lg, ifc_type) in enumerate(sorted(bords, key=lambda x: x[0])):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_bord_dalle.insert("", "end", values=(nom, lg, ifc_type), tags=(tag,))
        longueur_totale += lg
    # maj résumé
    label_longueur_totale_bord_dalle.config(text=f"{round(longueur_totale,2)} ml")

    # maj résumé par type
    tree_longueurs_par_type_bord_dalle.delete(*tree_longueurs_par_type_bord_dalle.get_children())
    agg = {}
    for nom, lg, _ in bords:
        agg[nom] = agg.get(nom, 0) + lg
    for idx, (nom_type, lg_cum) in enumerate(sorted(agg.items())):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_longueurs_par_type_bord_dalle.insert("", "end", values=(nom_type, round(lg_cum,2)), tags=(tag,))

def filter_main_by_type_bord_dalle(event=None):
    sel = tree_longueurs_par_type_bord_dalle.selection()
    if sel:
        type_sel = tree_longueurs_par_type_bord_dalle.item(sel[0])["values"][0]
        afficher_donnees_bord_dalle([b for b in donnees_ifc.get(ifc_actif, {}).get("bords_dalle", []) if b[0]==type_sel])

def copy_type_summary_bord_dalle(event=None):
    sel = tree_longueurs_par_type_bord_dalle.selection()
    if sel:
        root.clipboard_clear()
        root.clipboard_append("\n".join(["\t".join(map(str, tree_longueurs_par_type_bord_dalle.item(i)["values"])) for i in sel]))

print(f"Version Python : {sys.version}")

try:
    import tkinter as tk
    import tkinter.font as tkFont
    from tkinter import ttk, filedialog, messagebox
    print("tkinter importé avec succès")
except ImportError as e:
    print(f"Erreur lors de l'importation de tkinter : {e}")
    input("Appuyez sur Entrée pour quitter...")
    sys.exit(1)

try:
    import ifcopenshell
    import ifcopenshell.util.element
    print("ifcopenshell importé avec succès")
except ImportError as e:
    print(f"Erreur lors de l'importation de ifcopenshell : {e}")
    input("Appuyez sur Entrée pour quitter...")
    sys.exit(1)

try:
    import pandas as pd
    print("pandas importés avec succès")
except ImportError as e:
    print(f"Erreur lors de l'importation de pandas : {e}")
    input("Appuyez sur Entrée pour quitter...")
    sys.exit(1)

try:
    from PIL import Image, ImageTk
    print("Pillow importé avec succès")
except ImportError as e:
    print(f"Erreur lors de l'importation de Pillow : {e}")
    input("Appuyez sur Entrée pour quitter...")
    sys.exit(1)

import os
import threading
import time
import re              # NEW ➜ même niveau d’indent que les autres
print("Imports de base (os, threading, time, re) réussis")
TITLE_FONT = ("Helvetica", 12, "bold")

# --------------------------------------
# Variables Globales
# --------------------------------------
donnees_ifc = {} # {chemin_fichier : {"murs" : [], "menuiseries" : [], "sols" : [], "garde_corps" : []}}
ifc_actif = None
progress_bar = None
tabs_frame = None
tab_buttons = []

# Bouton filtrage par niveau (référence conservée pour le menu déroulant)
btn_niveau_murs = None
btn_niveau_menuiseries = None
btn_niveau_type_sol = None
btn_niveau_garde_corps = None
btn_niveau_poteaux = None
btn_niveau_poutres = None
btn_niveau_ep = None

# Filtres actifs pour le tableau MURS
filtre_texte_murs = ""
filtre_niveaux_murs = []
filtre_zero_murs = False

# Filtres actifs pour le tableau MENUISERIES
filtre_texte_menuiseries = ""
filtre_niveaux_menuiseries = []
filtre_zero_menuiseries = False

# Filtres actifs pour le tableau TYPE DE SOL
filtre_texte_type_sol = ""
filtre_zero_type_sol = False
filtre_niveaux_type_sol = []
# Filtres actifs pour le tableau GARDE CORPS
filtre_texte_garde_corps = ""
filtre_zero_garde_corps = False
filtre_niveaux_garde_corps = []
filtre_texte_poteaux = ""
filtre_niveaux_poteaux = []
filtre_texte_poutres = ""
filtre_niveaux_poutres = []
filtre_texte_ep = ""
filtre_zero_ep = False
filtre_niveaux_ep = []

# Résumés en Treeview (créés plus bas dans l’UI)
tree_surfaces_garde_corps = None
tree_surfaces_poteaux = None
tree_surfaces_poutres = None
tree_surfaces_ep = None


# --------------------------------------
# Fonctions utilitaires
# --------------------------------------
def clean_string(value) :
    if not value or "inconnu" in value.lower() or "non spécifié" in value.lower() :
        return ""
    return value.replace(" - Inconnu", "").replace(" - Non spécifié", "").strip()

# Normalize strings by removing accents and lowercasing
import unicodedata

def _normalize_key(text: str) -> str:
    """Return a case-insensitive and accent-free representation of *text*."""
    if not isinstance(text, str):
        return ""
    text = unicodedata.normalize('NFD', text)
    text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn')
    return text.lower().strip()

def _find_storey(element) -> str:
    """Return the name of the ``IfcBuildingStorey`` containing *element*.

    This helper walks up the spatial containment hierarchy using
    ``ifcopenshell.util.element.get_container`` to robustly retrieve the
    storey even when ``ContainedInStructure`` is not directly populated on
    the object.  Returns an empty string when no storey can be found.
    """
    try:
        container = ifcopenshell.util.element.get_container(element)
        while container and not container.is_a("IfcBuildingStorey"):
            container = ifcopenshell.util.element.get_container(container)
        if container and container.is_a("IfcBuildingStorey"):
            return container.Name or ""
    except Exception:
        pass
    return ""

# ---------- utils -------------------------------------------------
def by_type_safe(ifc_file, entity):
    """Renvoie la liste des entités demandées ou [] si le schéma ne la connaît pas."""
    try:
        return ifc_file.by_type(entity)
    except RuntimeError as e:
        # Cas fréquent : entité IFC4 absente dans un fichier IFC2x3
        if "not found in schema" in str(e):
            return []
        raise             # autre RuntimeError ? on la laisse remonter


# --------------------------------------
# Importation et Chargement IFC
# --------------------------------------
def importer_ifc():
    global ifc_actif, donnees_ifc, progress_bar
    chemin_fichier = filedialog.askopenfilename(filetypes=[("Fichiers IFC", "*.ifc")])
    if chemin_fichier :
        print(f"Début import IFC : {chemin_fichier}")
        if progress_bar:
            progress_bar.destroy()
        progress_bar = ttk.Progressbar(
            center_container,
            mode="determinate",
            length=300,
            style="green.Horizontal.TProgressbar",
        )
        progress_bar.pack(before=label_titre_accueil, pady=20)

        def update_progress(current, total) :
            if total == 0 :
                percentage = 0
            else:
                percentage = min(int((current / total) * 100), 100)
            progress_bar["value"] = percentage
            progress_bar.update()

        def load_ifc(chemin) :
            global ifc_actif
            try:
                ifc_file = ifcopenshell.open(chemin)
                print(f"Fichier IFC ouvert : {chemin}")
            except Exception as e:
                print(f"Erreur ouverture IFC : {e}")
                progress_bar.destroy()
                return
            donnees_ifc[chemin] = {
                "bords_dalle": [],
                "murs":        [],
                "murs_infos": {},
                "storeys":    [],
                "menuiseries": [],
                "menuiseries_infos": {},
                "sols":        [],
                "sols_infos": {},
                "plafonds":    [],
                "garde_corps": [],
                "garde_corps_infos": {},
                "poteaux":     [],
                "poutres":     [],
                "descente_ep": [],
                "descente_ep_infos": {}
            }

            donnees_ifc[chemin]["storeys"] = [s.Name for s in ifc_file.by_type("IfcBuildingStorey") if getattr(s, "Name", None)]

          
            # Estimer le nombre total d'éléments pour la progression
            murs = ifc_file.by_type("IfcWall") + ifc_file.by_type("IfcWallStandardCase")
            menuiseries_ifc = ifc_file.by_type("IfcWindow") + ifc_file.by_type("IfcDoor")
            dalles = ifc_file.by_type("IfcSlab")
            revetements_sol = [dalle for dalle in dalles if getattr(dalle, "PredefinedType", None) == "FLOOR"]
            
            # ---- Identifie les couvertures jouant le rôle de plafonds ----
            all_coverings = ifc_file.by_type("IfcCovering")
            revetements_plafond = []
            for cov in all_coverings:
                ptype = getattr(cov, "PredefinedType", None)
                name_lower = (getattr(cov, "Name", "") or "").lower()
                # Critères : PredefinedType explicite ou nom contenant un mot‑clé
                if ptype == "CEILING" or "plaf" in name_lower or "ceil" in name_lower or "faux-plafond" in name_lower:
                    revetements_plafond.append(cov)
            print(f"[DBG] plafonds potentiels trouvés : {len(revetements_plafond)}")
            garde_corps_ifc = ifc_file.by_type("IfcRailing")
            # Récupérer poteaux et poutres
            poteaux = by_type_safe(ifc_file, "IfcColumn") \
                    + by_type_safe(ifc_file, "IfcColumnStandardCase")
            poutres = by_type_safe(ifc_file, "IfcBeam") \
                    + by_type_safe(ifc_file, "IfcBeamStandardCase")
            # Estimer le nombre total d'éléments pour la progression
            total_elements = (
                len(murs)
              + len(menuiseries_ifc)
              + len(revetements_sol)
              + len(revetements_plafond)
              + len(garde_corps_ifc)
              + len(poteaux)
              + len(poutres)
            )
            processed_elements = 0
            # Murs
            for i, mur in enumerate(murs) :
                type_mur = "MUR_INCONNU"
                epaisseur = "N/A"
                materiau = ""
                surface = longueur = volume = 0.0
                mur_type = mur.is_a()
                try:
                    psets = ifcopenshell.util.element.get_psets(mur)
                    for pset_name, pset_data in psets.items() :
                        if "Type" in pset_data and pset_data["Type"] :
                            type_mur = pset_data["Type"]
                            break
                        elif "Référence" in pset_data and pset_data["Référence"] :
                            type_mur = pset_data["Référence"]
                            break
                        elif "Nom" in pset_data and pset_data["Nom"] :
                            type_mur = pset_data["Nom"]
                            break
                    type_mur = clean_string(type_mur) or "MUR_INCONNU"
                    quantity = psets.get("BaseQuantities", {})
                    epaisseur_value = quantity.get("Width", None)
                    if epaisseur_value :
                        epaisseur = f"{int(epaisseur_value * 100)}cm"
                    else:
                        for pset_name, pset_data in psets.items() :
                            if "Épaisseur" in pset_data and pset_data["Épaisseur"] :
                                epaisseur = f"{int(pset_data['Épaisseur'] * 100)}cm"
                                break
                            elif "Width" in pset_data and pset_data["Width"] :
                                epaisseur = f"{int(pset_data['Width'] * 100)}cm"
                                break
                    for pset_name, pset_data in psets.items() :
                        if "Matériau" in pset_data and pset_data["Matériau"] :
                            materiau = pset_data["Matériau"]
                            break
                        elif "Material" in pset_data and pset_data["Material"] :
                            materiau = pset_data["Material"]
                            break
                        elif "Description" in pset_data :
                            description = str(pset_data["Description"]).lower()
                            if "isolée" in description :
                                materiau = "Isolée"
                            elif "béton" in description :
                                materiau = "Béton"
                            elif "plâtre" in description:
                                materiau = "Plâtre"
                            break
                    if not materiau :
                        try:
                            materials = ifcopenshell.util.element.get_material(mur)
                            if materials and hasattr(materials, "Name") and materials.Name :
                                materiau = materials.Name
                        except:
                            pass
                    if not materiau :
                        mur_name = str(mur.Name).lower()
                        if "béton" in mur_name :
                            materiau = "Béton"
                        elif "plâtre" in mur_name :
                            materiau = "Plâtre"
                        elif "isolée" in mur_name :
                            materiau = "Isolée"
                    materiau = clean_string(materiau)
                    name = f"{type_mur} - {epaisseur}" + (f" - {materiau}" if materiau else "")
                    surface = quantity.get("GrossSideArea", 0.0)
                    longueur = quantity.get("Length", 0.0)
                    volume = quantity.get("GrossVolume", 0.0)
                except Exception as e:
                    print(f"Erreur extraction mur {mur.Name} : {e}")
                # --- Infos complémentaires pour la vue MURS ---
                storey = ""
                try:
                    for rel in getattr(mur, "ContainedInStructure", []):
                        container = rel.RelatingStructure
                        if container and container.is_a("IfcBuildingStorey"):
                            storey = container.Name or ""
                            break
                except Exception:
                    pass
                def _find_prop(names):
                    """Return the value for the first matching property in *psets*.

                    Matching is done in a case-insensitive and accent-free manner
                    and allows partial matches to better support varying
                    nomenclatures found in IFC exports."""
                    names_norm = {_normalize_key(n) for n in names}
                    for ps in psets.values():
                        if isinstance(ps, dict):
                            for key, val in ps.items():
                                norm_key = _normalize_key(key)
                                if any(norm in norm_key for norm in names_norm) and val not in (None, ""):
                                    if isinstance(val, str):
                                        val = val.replace(",", ".")
                                        try:
                                            return float(val)
                                        except ValueError:
                                            return val
                                    return val
                    return None

                info_props = {
                    "Fonction": _find_prop(["Fonction", "Function", "Reference"]),
                    "Largeur": _find_prop(["Largeur", "Width"]),
                    "Hauteur non contrainte": _find_prop(["Hauteur non contrainte", "UnconstrainedHeight", "Height"]),
                    "Matériau structurel": _find_prop(["Matériau structurel", "StructuralMaterial", "Material", "Matériau"]),
                    "IsExternal": _find_prop(["IsExternal", "External"]),
                    "Storey": storey,
                }
                # Clé incluant le niveau pour distinguer les éléments identiques
                donnees_ifc[chemin]["murs_infos"][(name, storey)] = info_props

                donnees_ifc[chemin]["murs"].append((name, round(surface, 2), round(longueur, 2), round(volume, 2), mur_type, storey))
                processed_elements += 1
                if processed_elements % 10 == 0: # Mettre à jour tous les 10 éléments
                    update_progress(processed_elements, total_elements)
            print(f"Murs chargés : {len(donnees_ifc[chemin]['murs'])}")
            # Menuiseries
            menuiseries_temp = []
            for i, el in enumerate(menuiseries_ifc) :
                famille = "Fenêtre" if el.is_a() == "IfcWindow" else "Porte"
                type_menuiserie = "N/A"
                largeur = hauteur = surface = 0.0
                is_external = False
                try:
                    psets = ifcopenshell.util.element.get_psets(el)
                    for pset_name, pset_data in psets.items() :
                        if "Type" in pset_data and pset_data["Type"] :
                            type_menuiserie = pset_data["Type"]
                            break
                        elif "Référence" in pset_data and pset_data["Référence"] :
                            type_menuiserie = pset_data["Référence"]
                            break
                        elif "Nom" in pset_data and pset_data["Nom"] :
                            type_menuiserie = pset_data["Nom"]
                            break
                    if type_menuiserie == "N/A" :
                        nom_brut = el.Name or ""
                        if nom_brut and " - " in nom_brut :
                            type_menuiserie = nom_brut.split(" - ")[-1]
                        elif nom_brut :
                            type_menuiserie = nom_brut
                    type_menuiserie = clean_string(type_menuiserie) or "N/A"
                    name = f"{famille} - {type_menuiserie}" if type_menuiserie != "N/A" else famille
                    for pset_name, pset_data in psets.items() :
                        if "IsExternal" in pset_data :
                            is_external = pset_data["IsExternal"]
                            break
                    q = psets.get("BaseQuantities", {})
                    largeur = q.get("Width", 0.0)
                    hauteur = q.get("Height", 0.0)
                    surface = q.get("Area", largeur * hauteur)
                except Exception as e:
                    print(f"Erreur extraction menuiserie {name} : {e}")
                storey = ""
                for rel in getattr(el, "ContainedInStructure", []):
                    container = rel.RelatingStructure
                    if container and container.is_a("IfcBuildingStorey"):
                        storey = container.Name or ""
                        break
                statut = "Extérieure" if is_external else "Intérieure"
                info_menu = {
                    "Cotes(Type)/Cadre_epaisseur": psets.get("Cotes(Type)", {}).get("Cadre_epaisseur"),
                    "Cotes(Type)/Cadre_profondeur": psets.get("Cotes(Type)", {}).get("Cadre_profondeur"),
                    "Données(Type)/COM_Codification type": psets.get("Données(Type)", {}).get("COM_Codification type"),
                    "Pset_WindowCommon/IsExternal": psets.get("Pset_WindowCommon", {}).get("IsExternal"),
                    "Données d'identification(Type)/Description": psets.get("Données d'identification(Type)", {}).get("Description"),
                }
                donnees_ifc[chemin]["menuiseries_infos"][(name, storey)] = info_menu
                menuiseries_temp.append(
                    (name, round(surface, 2), round(largeur, 2), round(hauteur, 2), statut, storey)
                )
                processed_elements += 1
                if processed_elements % 10 == 0: # Mettre à jour tous les 10 éléments
                    update_progress(processed_elements, total_elements)
            menuiseries_temp.sort(key=lambda x: (x[0], x[4]))
            donnees_ifc[chemin]["menuiseries"] = menuiseries_temp
            print(f"Menuiseries chargées : {len(donnees_ifc[chemin]['menuiseries'])}")
                        # Sols
            donnees_ifc[chemin]["sols"] = []
            donnees_ifc[chemin]["sols_infos"] = {}
            for i, obj in enumerate(revetements_sol):
                nom = clean_string(obj.Name) or ""
                # Retire références numériques ET les deux-petits-points qui traînent en bout
                nom = re.sub(r"(?:\s*[-–]?\s*\d+)+\s*$", "", nom)   # vire les IDs
                nom = re.sub(r"\s*:+\s*$", "", nom)                # vire ':' (un ou plusieurs) en fin de chaîne


                surface = longueur = 0.0
                revetement_type = obj.is_a()
                
                try:
                    psets = ifcopenshell.util.element.get_psets(obj)
                    quantity = psets.get("BaseQuantities", {})
                    # Recherche de la surface en privilégiant la surface nette si disponible
                    surface_keys = ("NetArea", "NetSideArea", "NetFloorArea", "GrossArea", "Area")
                    surface = 0.0
                    for k in surface_keys:
                        val = quantity.get(k)
                        if val:
                            surface = val
                            break

                    length_keys = ("Perimeter", "Périmètre", "Perimetre", "Length", "Longueur", "Width")
                    longueur = 0.0
                    for k in length_keys:
                        val = quantity.get(k)
                        if val:
                            longueur = val
                            break
                except Exception as e:
                    print(f"Erreur extraction sol {nom} : {e}")
                    psets = {}
                    quantity = {}

                famille  = "Sol"
                type_sol = nom or "N/A"
                name     = f"{famille} - {type_sol}" if type_sol != "N/A" else famille

                storey = ""
                for rel in getattr(obj, "ContainedInStructure", []):
                    container = rel.RelatingStructure
                    if container and container.is_a("IfcBuildingStorey"):
                        storey = container.Name or ""
                        break

                def _find_prop(names):
                    """Return the value for the first matching property in *psets*.

                    The search is accent and case insensitive and supports
                    partial matching to cope with different IFC exporters."""
                    names_norm = {_normalize_key(n) for n in names}
                    for p in psets.values():
                        if isinstance(p, dict):
                            for key, val in p.items():
                                norm_key = _normalize_key(key)
                                if any(norm in norm_key for norm in names_norm) and val not in (None, ""):
                                    if isinstance(val, str):
                                        val = val.replace(",", ".")
                                        try:
                                            return float(val)
                                        except ValueError:
                                            return val
                                    return val
                    return None

                net_area = quantity.get("NetArea") or quantity.get("NetSideArea") or quantity.get("NetFloorArea")
                info_sol = {
                    "Cotes / Élévation haut": _find_prop([
                        "Élévation haut",
                        "Élévation en haut",
                        "ElevationTop",
                        "Elevation At Top",
                        "TopElevation",
                    ]),
                    "Cotes / Élévation base": _find_prop([
                        "Élévation base",
                        "Élévation à la base",
                        "ElevationBase",
                        "Elevation At Base",
                        "BaseElevation",
                    ]),
                    "Cotes / Épaisseur": _find_prop(["Épaisseur", "Thickness"]),
                    "Surface nette": net_area,
                    "Contraintes / Niveau": storey,
                }

                donnees_ifc[chemin]["sols"].append(
                    (name, round(surface, 2), round(longueur, 2), revetement_type, storey)
                )
                donnees_ifc[chemin]["sols_infos"][(name, storey)] = info_sol

                processed_elements += 1
                if processed_elements % 10 == 0:
                    update_progress(processed_elements, total_elements)

            print(f"Sols chargés : {len(donnees_ifc[chemin]['sols'])}")

            # Plafonds
            donnees_ifc[chemin]["plafonds"] = []
            for i, obj in enumerate(revetements_plafond):
                nom = clean_string(obj.Name) or ""
                # Retire références numériques ET les deux-petits-points qui traînent en bout
                nom = re.sub(r"(?:\s*[-–]?\s*\d+)+\s*$", "", nom)   # vire les IDs
                nom = re.sub(r"\s*:+\s*$", "", nom)                  # vire ':' (un ou plusieurs) en fin de chaîne

                surface = longueur = 0.0
                revetement_type = obj.is_a()

                try:
                    psets = ifcopenshell.util.element.get_psets(obj)
                    quantity = psets.get("BaseQuantities", {})
                    # --- Improved keys for ceiling area ---
                    surface_keys = ("GrossSideArea", "NetSideArea", "GrossArea", "Area")
                    surface = 0.0
                    for k in surface_keys:
                        val = quantity.get(k)
                        if val:
                            surface = val
                            break

                    # --- Improved keys for ceiling length ---
                    length_keys = ("Périmètre", "Perimeter", "Perimetre", "Longueur", "Length", "Width")
                    longueur = 0.0
                    
                    for k in length_keys:

                        val_l = quantity.get(k)

                        if val_l:

                            try:

                                longueur = float(str(val_l).replace(",", "."))

                            except Exception:

                                longueur = val_l

                            break

                    # --- Fallback: search all psets for any Area/Perimeter-like props if none found above ---
                    if surface == 0.0:
                        for pset_name, props in psets.items():
                            for key, val in props.items():
                                if isinstance(val, (int, float)) and val > 0 and "area" in key.lower():
                                    surface = val
                                    break
                            if surface > 0:
                                break
                    if longueur == 0.0:
                        for pset_name, props in psets.items():
                            for key, val in props.items():
                                if isinstance(val, (int, float)) and val > 0 and any(x in key.lower() for x in ("perimeter","perimetre","périmètre","length","longueur","width")):
                                    longueur = val
                                    break
                            if longueur > 0:
                                break
                except Exception as e:
                    print(f"Erreur extraction plafond {nom} : {e}")

                famille  = "Plafond"
                type_plafond = nom or "N/A"
                name     = f"{famille} - {type_plafond}" if type_plafond != "N/A" else famille

                donnees_ifc[chemin]["plafonds"].append(
                    (name, round(surface, 2), round(longueur, 2), revetement_type)
                )

                processed_elements += 1
                if processed_elements % 10 == 0:
                    update_progress(processed_elements, total_elements)

            print(f"Plafonds chargés : {len(donnees_ifc[chemin]['plafonds'])}")
            
            
            # --------------------------------------
            # Bords de dalle (version v4 robuste)
            # --------------------------------------
            from ifcopenshell import util
            try:
                from ifcopenshell.geom import settings, create_shape
                geom_available = True
            except ImportError:
                geom_available = False

            # 1) Collecte des candidats IFC
            proxies = ifc_file.by_type("IfcBuildingElementProxy")
            slabs   = ifc_file.by_type("IfcSlab")
            candidats = proxies + slabs
            print(f"[DBG] nombre de proxies={len(proxies)}, slabs={len(slabs)}")

            bords_dalle = []
            for elem in candidats:
                name_raw = (getattr(elem, "Name", "") or "").lower()
                ptype    = getattr(elem, "PredefinedType", "").upper()
                # mots-clés et PredefinedType
                if any(keyword in name_raw for keyword in ["bord de dalle", "rive de dalle", "bordure de dalle"]) or ptype == "SLAB_EDGE":
                    bords_dalle.append(elem)
            print(f"[DBG] bords_dalle identifiés : {len(bords_dalle)}")
            donnees_ifc[chemin]["bords_dalle"] = []

            # 2) Extraction longueur pour chaque bord
            for bord in bords_dalle:
                gid     = bord.GlobalId
                raw_nom = clean_string(bord.Name) or "Bord de dalle"
                nom     = raw_nom.split(":", 1)[0].strip()

                # a) Psets standard (Length/Longueur/Perimeter)
                psets   = util.element.get_psets(bord)
                print(f"[DBG-PS] Psets de {gid} => {list(psets.keys())}")
                longueur = None
                for ps in psets.values():
                    if isinstance(ps, dict):
                        longueur = ps.get("Length") or ps.get("Longueur") or ps.get("Perimeter") or longueur
                        if longueur:
                            print(f"[DBG-PS] trouvé dans pset : {ps}")
                            break

                # b) IfcElementQuantity (occurrence ou type)
                if longueur is None:
                    # occurrence
                    for rel in bord.IsDefinedBy:
                        if hasattr(rel, "RelatingPropertyDefinition"):
                            def_prop = rel.RelatingPropertyDefinition
                        elif hasattr(rel, "RelatingType"):
                            def_prop = rel.RelatingType
                        else:
                            continue
                        if def_prop.is_a("IfcElementQuantity"):
                            for q in def_prop.Quantities:
                                if q.is_a("IfcQuantityLength"):
                                    longueur = q.LengthValue
                                    print(f"[DBG-Q] trouvé IfcQuantityLength => {longueur}")
                                    break
                        if longueur:
                            break
                    # type
                    if longueur is None and hasattr(bord, "IsTypedBy"):
                        for r in bord.IsTypedBy:
                            typ = r.RelatingType
                            if typ.is_a("IfcElementQuantity"):
                                for q in typ.Quantities:
                                    if q.is_a("IfcQuantityLength"):
                                        longueur = q.LengthValue
                                        print(f"[DBG-QT] trouvé sur type => {longueur}")
                                        break
                            if longueur:
                                break

                # c) Fallback géométrique
                if longueur is None and geom_available:
                    try:
                        geo_s = settings()
                        geo_s.set(geo_s.USE_PYTHON_OPENCASCADE, True)
                        shape = create_shape(geo_s, bord)
                        bbox = shape.geometry.BoundingBox
                        longueur = max(bbox[3]-bbox[0], bbox[4]-bbox[1], bbox[5]-bbox[2])
                        print(f"[DBG-GEO] bbox => {longueur}")
                    except Exception as e:
                        print(f"[ERR-GEO] échec géo {gid}: {e}")
                if longueur is None:
                    longueur = 0.0

                longueur = round(longueur, 2)
                typ_final = getattr(bord, "PredefinedType", bord.is_a())
                print(f"[RESULT] Bord {gid} '{nom}' => longueur = {longueur}")
                donnees_ifc[chemin]["bords_dalle"].append((nom, longueur, typ_final))

            print(f"Bords de dalle chargés : {len(donnees_ifc[chemin]['bords_dalle'])}")

            # Garde-corps
            donnees_ifc[chemin]["garde_corps"] = []
            donnees_ifc[chemin]["garde_corps_infos"] = {}
            for i, railing in enumerate(garde_corps_ifc):
                nom = clean_string(railing.Name) or ""
                # 🔪 1) vire les IDs ‹ - 548204 ›, ‹-548204›, ‹ 548204›…
                nom = re.sub(r"(?:\s*[-–]?\s*\d+)+\s*$", "", nom)
                # 🔪 2) vire les deux-points restants en fin de chaîne
                nom = re.sub(r"\s*:+\s*$", "", nom).strip()

                largeur = 0.0
                railing_type = railing.is_a()
                psets = {}
                try:
                    psets = ifcopenshell.util.element.get_psets(railing)
                    q = psets.get("BaseQuantities", {})
                    # 📏 on prend Width si dispo, sinon Length
                    largeur = q.get("Width", 0.0) or q.get("Length", 0.0) or 0.0
                except Exception as e:
                    print(f"Erreur extraction garde-corps {nom} : {e}")

                storey = ""
                for rel in getattr(railing, "ContainedInStructure", []):
                    container = rel.RelatingStructure
                    if container and container.is_a("IfcBuildingStorey"):
                        storey = container.Name or ""
                        break

                def _find_prop(names):
                    names_norm = {_normalize_key(n) for n in names}
                    for ps in psets.values():
                        if isinstance(ps, dict):
                            for key, val in ps.items():
                                norm_key = _normalize_key(key)
                                if any(norm in norm_key for norm in names_norm) and val not in (None, ""):
                                    if isinstance(val, str):
                                        val = val.replace(",", ".")
                                        try:
                                            return float(val)
                                        except ValueError:
                                            return val
                                    return val
                    return None

                info_gc = {
                    "Contraintes": _find_prop(["Contraintes", "Constraints"]),
                    "Niveau de base": _find_prop(["Niveau de base", "Base Level", "Ref Level", "Reference Level"]) or storey,
                }

                donnees_ifc[chemin]["garde_corps"].append(
                    (nom, round(largeur, 2), railing_type, storey)
                )
                donnees_ifc[chemin]["garde_corps_infos"][(nom, storey)] = info_gc

                processed_elements += 1
                if processed_elements % 10 == 0:
                    update_progress(processed_elements, total_elements)

            print(f"Garde-corps chargés : {len(donnees_ifc[chemin]['garde_corps'])}")
            update_ifc_tabs(chemin)


            # → Poteaux
            poteaux = by_type_safe(ifc_file, "IfcColumn") \
                     + by_type_safe(ifc_file, "IfcColumnStandardCase")
            donnees_ifc[chemin]["poteaux"] = []
            for col in poteaux:
                nom     = clean_string(col.Name) or "Colonne"
                # Nettoyer les références numériques et les deux-points en fin de nom
                nom = re.sub(r"(?:\s*[-–]?\s*\d+)+\s*$", "", nom).strip()
                nom = re.sub(r"\s*:+\s*$", "", nom).strip()
                q       = ifcopenshell.util.element.get_psets(col).get("BaseQuantities", {})
                largeur = round(q.get("Width", q.get("Length", 0.0)), 2)
                surface = round(q.get('GrossSideArea', 0.0), 2)
                volume  = round(q.get('GrossVolume', 0.0), 2)
                storey  = ""
                for rel in getattr(col, "ContainedInStructure", []):
                    container = rel.RelatingStructure
                    if container and container.is_a("IfcBuildingStorey"):
                        storey = container.Name or ""
                        break
                donnees_ifc[chemin]["poteaux"].append((nom, largeur, surface, volume, col.is_a(), storey))
                processed_elements += 1
                update_progress(processed_elements, total_elements)
            print(f"[DEBUG] Poteaux trouvés : {len(donnees_ifc[chemin]['poteaux'])}")


            # → Poutres
            poutres    = by_type_safe(ifc_file, "IfcBeam") \
                     + by_type_safe(ifc_file, "IfcBeamStandardCase")

            # --- Détection du schéma IFC pour l’upgrade futur-proof ----------
            schema = ifc_file.wrapped_data.schema.lower()
            use_ifc4 = "ifc4" in schema

            if use_ifc4:                 # Si le fichier est déjà en IFC4
                # On enrichit simplement les listes existantes
                poteaux += ifc_file.by_type("IfcColumnStandardCase")
                poutres  += ifc_file.by_type("IfcBeamStandardCase")
		
            donnees_ifc[chemin]["poutres"] = []
            for beam in poutres:
                nom       = clean_string(beam.Name) or "Poutre"
                # Nettoyer les références numériques et les deux-points en fin de nom
                nom = re.sub(r"(?:\s*[-–]?\s*\d+)+\s*$", "", nom).strip()
                nom = re.sub(r"\s*:+\s*$", "", nom).strip()
                q         = ifcopenshell.util.element.get_psets(beam).get("BaseQuantities", {})
                longueur  = round(q.get("Length", 0.0), 2)
                surface = round(q.get('OuterSurfaceArea', q.get('GrossSurfaceArea', 0.0)), 2)
                volume  = round(q.get('GrossVolume', 0.0), 2)
                storey  = ""
                for rel in getattr(beam, "ContainedInStructure", []):
                    container = rel.RelatingStructure
                    if container and container.is_a("IfcBuildingStorey"):
                        storey = container.Name or ""
                        break
                donnees_ifc[chemin]["poutres"].append((nom, longueur, surface, volume, beam.is_a(), storey))
                processed_elements += 1
                update_progress(processed_elements, total_elements)
            print(f"[DEBUG] Poutres trouvées : {len(donnees_ifc[chemin]['poutres'])}")

            # → Descentes EP / Flow Controllers
            flow_controllers = by_type_safe(ifc_file, "IfcFlowController")
            total_elements += len(flow_controllers)
            donnees_ifc[chemin]["descente_ep"] = []
            donnees_ifc[chemin]["descente_ep_infos"] = {}
            for fc in flow_controllers:
                nom = clean_string(fc.Name) or fc.is_a()
                # Supprimer références ou suffixes à la fin
                nom = re.sub(r"(?:\s*[-–]?\s*\d+)+\s*$", "", nom)
                nom = re.sub(r"\s*:+\s*$", "", nom).strip()
                psets = ifcopenshell.util.element.get_psets(fc)
                # Combine all property sets to find DIM_Hauteur et diamètre
                quantity = {}
                for props in psets.values():
                    if isinstance(props, dict):
                        quantity.update(props)

                # Récupère la hauteur prioritairement sur DIM_Hauteur
                if "DIM_Hauteur" in quantity:
                    hauteur = quantity["DIM_Hauteur"]
                elif "Height" in quantity:
                    hauteur = quantity["Height"]
                elif "Length" in quantity:
                    hauteur = quantity["Length"]
                else:
                    hauteur = 0.0
                dim = round(hauteur, 2)
                # Diamètre éventuel
                diam = quantity.get("DIM_Diametre") or quantity.get("DIM_Diam\xe8tre") \
                    or quantity.get("NominalDiameter") or quantity.get("Diameter")
                try:
                    diam = round(float(diam), 2)
                except (TypeError, ValueError):
                    diam = ""
                # Try to determine the level of the element. ``ContainedInStructure``
                # is not always populated, so fall back to the more robust
                # ``_find_storey`` helper which walks the containment hierarchy.
                storey = _find_storey(fc)
                donnees_ifc[chemin]["descente_ep"].append((nom, dim, fc.is_a(), storey, diam))
                donnees_ifc[chemin]["descente_ep_infos"][(nom, storey)] = {
                    "Longueur": dim,
                    "Type": fc.is_a(),
                    "Diametre": diam,
                    "Storey": storey,
                }
                processed_elements += 1
                if processed_elements % 10 == 0:
                    update_progress(processed_elements, total_elements)
            print(f"[DEBUG] Descente EP trouvées : {len(donnees_ifc[chemin]['descente_ep'])}")
            # --- Escaliers (volées) custom fix ---
            flights = ifc_file.by_type("IfcStairFlight")
            donnees_ifc[chemin]["escaliers"] = []
            for flight in flights:
                raw_nom = clean_string(flight.Name) or flight.is_a()
                nom = raw_nom.split(":",1)[0].strip()
                # Extraction via Psets : 'Contraintes' et 'Cotes'
                psets = ifcopenshell.util.element.get_psets(flight)
                # HT volee
                ht_volee = float(psets.get("Contraintes", {}).get("Hauteur de la volée", 0.0))
                # HT contremarches
                ht_contrem = float(psets.get("Cotes", {}).get("Hauteur réelle des contremarches", 0.0))
                # NB contremarches
                nb_contrem = int(psets.get("Cotes", {}).get("Nombre réel de contremarches", 0))
                # NB marches fallback
                nb_marches = int(getattr(flight, "NumberOfTreads", nb_contrem))
                # Round values
                ht_volee = round(ht_volee, 2)
                ht_contrem = round(ht_contrem, 2)
                # Append tuple
                donnees_ifc[chemin]["escaliers"].append(
                    (nom, ht_volee, ht_contrem, nb_contrem, nb_marches)
                )
            print(f"[DEBUG] Escaliers custom : {len(donnees_ifc[chemin]['escaliers'])}")
            # Remplir l'onglet DESCENTE EP
            root.after(0, afficher_donnees_descente_ep)
            



            update_progress(total_elements, total_elements)
            progress_bar.destroy()
        # Lancer le chargement dans un thread séparé
        threading.Thread(target=lambda: load_ifc(chemin_fichier), daemon=True).start()

    # → Une fois l’IFC importé, on affiche enfin les onglets
    for btn in hidden_nav_buttons:
        btn.master.master.pack(fill="x", padx=2, pady=2)


# --------------------------------------
# Gestion des Onglets IFC
# --------------------------------------
def update_ifc_tabs(new_ifc) :
    global ifc_actif, tabs_frame, tab_buttons
    if not tabs_frame :
        tabs_frame = tk.Frame(header_frame, bg="#004D40")
        tabs_frame.pack(side="left", padx=10, pady=5)
    for btn in tab_buttons :
        btn.destroy()
    tab_buttons.clear()
    # Créer un style pour les onglets
    style = ttk.Style()
    style.configure("Tab.TButton", font=("Helvetica", 9, "bold"), padding=[8, 4], background="#B0BEC5", foreground="#263238")
    style.map("Tab.TButton", background=[("active", "#4DB6AC"), ("!active", "#B0BEC5")])
    # Fond vert clair pour simuler une transparence sur l'onglet actif
    style.configure("ActiveTab.TButton", font=("Helvetica", 9, "bold"), padding=[8, 4], background="#81C784", foreground="#FFFFFF")
    # Dictionnaire pour associer chaque bouton à son frame
    frame_dict = {}
    for chemin in donnees_ifc.keys() :
        nom_fichier = os.path.basename(chemin)
        display_name = nom_fichier[:15] + "..." if len(nom_fichier) > 15 else nom_fichier
        # Créer un cadre pour chaque bouton
        btn_frame = tk.Frame(tabs_frame, bg="#004D40")
        btn_frame.pack(side="left", padx=2)
        # Créer le bouton ttk avec takefocus=False pour supprimer les bordures en pointillés
        btn = ttk.Button(btn_frame, text=display_name, style="Tab.TButton", command=lambda c=chemin: switch_ifc(c), takefocus=False)
        btn.pack(fill="x")
        # Stocker le cadre et le bouton
        frame_dict[btn] = btn_frame
        tab_buttons.append(btn)
        # Lier pour survoler
        btn.bind("<Enter>", lambda e, b=btn: b.configure(style="Tab.TButton"))
        btn.bind("<Leave>", lambda e, b=btn: b.configure(style="Tab.TButton"))
    ifc_actif = new_ifc
    update_active_tab(frame_dict)

def update_active_tab(frame_dict) :
    style = ttk.Style()
    for btn in tab_buttons :
        # Réinitialiser tous les frames
        frame = frame_dict.get(btn)
        if frame :
            frame.config(bg="#004D40")
        chemin = btn.cget("text")
        if len(chemin) > 15 :
            chemin = chemin[:15] + "..."
        if os.path.basename(ifc_actif) == chemin or os.path.basename(ifc_actif)[:15] + "..." == chemin :
            btn.configure(style="ActiveTab.TButton")
            if frame :
                frame.config(bg="#004D40") # Le frame reste en fond sombre, seule la couleur du bouton change
        else:
            btn.configure(style="Tab.TButton")
    # Mettre à jour l'affichage des données
    if ifc_actif in donnees_ifc :
        afficher_donnees_murs(donnees_ifc[ifc_actif]["murs"])
        afficher_donnees_menuiseries(donnees_ifc[ifc_actif]["menuiseries"])
        afficher_donnees_type_sol()
        afficher_donnees_garde_corps()
        afficher_donnees_poteaux()
        afficher_donnees_poutres()
    # Mettre à jour immédiatement les résumés Treeview
    maj_largeur_par_type_garde_corps()
    maj_par_type_poteaux()
    maj_par_type_poutres()
    maj_surface_coffrage_totale()

    # -- maj du résumé           ❌ À virer
    # label_largeur_totale_garde_corps.config(text=f"{round(largeur_totale, 2)} m")

    # NEW ➜ on remplit…          ❌ À virer
    # maj_largeur_par_type_garde_corps(garde_corps)


def switch_ifc(chemin):
    global ifc_actif
    ifc_actif = chemin
    print(f"Basculer vers IFC : {ifc_actif}")
    # Récréer frame_dict pour update_active_tab
    frame_dict = {btn : btn.master for btn in tab_buttons}
    update_active_tab(frame_dict)

# --------------------------------------
# Affichage des données
# --------------------------------------
def afficher_donnees_murs(murs):
    hide_infos_murs()
    for i in tree_murs.get_children() :
        tree_murs.delete(i)
    murs_tries = sorted(murs, key=lambda x: x[0])
    longueur_totale = volume_total = 0.0
    surface_totale = surface_cloisons = surface_murs = 0.0
    surface_menuiseries_tot = _calc_surface_menuiseries(murs)
    surfaces_par_nom = {}
    for idx, mur in enumerate(murs_tries) :
        nom, surface, longueur, volume, mur_type, _storey = mur
        tag = "redrow" if mur_type == "IfcWall" else ("evenrow" if idx % 2 == 0 else "oddrow")
        tree_murs.insert("", "end", values=(nom, surface, longueur, volume, mur_type), tags=(tag,))
        longueur_totale += longueur
        volume_total += volume
        if nom in surfaces_par_nom:
            surfaces_par_nom[nom] += surface
        else:
            surfaces_par_nom[nom] = surface
        surface_totale += surface
        if "cloison" in nom.lower():
            surface_cloisons += surface
        else:
            surface_murs += surface
    surface_nette = max(surface_totale - surface_menuiseries_tot, 0.0)
    for widget in grid_resume_murs.winfo_children():
        widget.destroy()
    left_row = right_row = 0
    # --- colonne gauche
    tk.Label(grid_resume_murs, text="📏 Longueur :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(longueur_totale, " ml"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1
    tk.Label(grid_resume_murs, text="📦 Volume :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(volume_total, " m³"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1
    tk.Label(grid_resume_murs, text="📐 Surface brute :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(surface_totale, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1
    tk.Label(grid_resume_murs, text="📏 Surface nette :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(surface_nette, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1

    # --- calcul surfaces nettes par catégorie
    surface_murs_nette = surface_cloisons_nette = 0.0
    if surface_totale > 0:
        ratio_murs = surface_murs / surface_totale
        ratio_cloisons = surface_cloisons / surface_totale
        surface_murs_nette = max(surface_murs - surface_menuiseries_tot * ratio_murs, 0.0)
        surface_cloisons_nette = max(surface_cloisons - surface_menuiseries_tot * ratio_cloisons, 0.0)

    # --- colonne droite
    tk.Label(grid_resume_murs, text="🧱 Surface murs :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(surface_murs, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)
    right_row += 1
    tk.Label(grid_resume_murs, text="🧱 Surface murs nette :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(surface_murs_nette, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)
    right_row += 1
    tk.Label(grid_resume_murs, text="🏢 Surface de cloisons :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(surface_cloisons, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)
    right_row += 1
    tk.Label(grid_resume_murs, text="🏢 Surface de cloisons nette :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(surface_cloisons_nette, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)
    for widget in grid_types_murs.winfo_children() :
        widget.destroy()
    # on cache canvas au départ
    refresh_canvas_grid_types_murs()
    for i, (nom, surface) in enumerate(surfaces_par_nom.items()):
        # labels hidden for clean UI
        pass
        tag_row = "evenrow" if i % 2 == 0 else "oddrow"
        tree_surfaces_murs.insert("", "end", values=(nom, round(surface,2)), tags=(tag_row,))

    # --- Mise à jour du Treeview résumé par type pour MURS --------------------
    tree_surfaces_murs.delete(*tree_surfaces_murs.get_children())
    for jdx, (nom_type, surface_type) in enumerate(surfaces_par_nom.items()):
        tag_row = "evenrow" if jdx % 2 == 0 else "oddrow"
        tree_surfaces_murs.insert("", "end", values=(nom_type, round(surface_type, 2)), tags=(tag_row,))
    # -------------------------------------------------------------------------



def afficher_donnees_escaliers(escaliers):
    # Vide l'arborescence actuelle
    for i in tree_escalier.get_children():
        tree_escalier.delete(i)
    # Trie par nom
    escaliers_tries = sorted(escaliers, key=lambda x: x[0])
    # Insertion des données dans le Treeview sans arrondi
    for idx, escalier in enumerate(escaliers_tries):
        nom, hauteur_volee, hauteur_contrem, nb_contrem, nb_marches = escalier
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_escalier.insert("", "end",
                             values=(nom, hauteur_volee, hauteur_contrem, nb_contrem, nb_marches),
                             tags=(tag,))
    # Mise à jour du résumé : récapitulatif par colonne comme pour MURS
    # On agrège les données par nom
    summary = {}
    for nom, hauteur_volee, hauteur_contrem, nb_contrem, nb_marches in escaliers_tries:
        if nom not in summary:
            summary[nom] = [0.0, 0.0, 0, 0]
        summary[nom][0] += hauteur_volee
        summary[nom][1] += hauteur_contrem
        summary[nom][2] += nb_contrem
        summary[nom][3] += nb_marches
    # On supprime l'ancien résumé
    for widget in grid_resume_escalier.winfo_children():
        widget.destroy()
    # Création d'un Treeview récapitulatif
    summary_tree = ttk.Treeview(grid_resume_escalier,
                                columns=("Nom", "Hauteur volée", "HT contremarches", "Nb contremarches", "Nb marches"),
                                show="headings", height=len(summary))
    # Configuration des en-têtes
    summary_tree.configure(style="Summary.Treeview")
    summary_tree.heading("Nom", text="Nom")
    summary_tree.heading("Hauteur volée", text="Hauteur volée")
    summary_tree.heading("HT contremarches", text="HT contremarches")
    summary_tree.heading("Nb contremarches", text="Nb contremarches")
    summary_tree.heading("Nb marches", text="Nb marches")
    # Configuration des colonnes
    summary_tree.column("Nom", anchor="w")
    summary_tree.column("Hauteur volée", anchor="e")
    summary_tree.column("HT contremarches", anchor="e")
    summary_tree.column("Nb contremarches", anchor="center")
    summary_tree.column("Nb marches", anchor="center")
    # Insertion des données agrégées
    for idx, (nom, (hv_sum, hc_sum, cont_sum, march_sum)) in enumerate(summary.items()):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        summary_tree.insert("", "end",
                            values=(nom, hv_sum, hc_sum, cont_sum, march_sum),
                            tags=(tag,))
    # Placement dans la grille
    summary_tree.grid(row=0, column=0, columnspan=2, sticky="nsew", padx=5, pady=2)
def afficher_donnees_menuiseries(menuiseries):
    for i in tree_menuiseries.get_children() :
        tree_menuiseries.delete(i)
    menuiseries_tries = sorted(menuiseries, key=lambda x: x[0])
    longueur_totale = surface_totale = surface_mint = surface_mext = embrasures = 0.0
    count = 0
    surfaces_par_nom = {}
    nombre_par_nom = {} # Pour compter le nombre de menuiseries par type
    for idx, menuiserie in enumerate(menuiseries_tries) :
        nom, surface, longueur, hauteur, menuiserie_type, *_rest = menuiserie
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_menuiseries.insert("", "end", values=(nom, surface, longueur, hauteur, menuiserie_type), tags=(tag,))
        longueur_totale += longueur
        surface_totale += surface
        count += 1
        if menuiserie_type == "Extérieure" :
            surface_mext += surface
            embrasures += (longueur * 2 + hauteur * 2) # Formule : (largeur * 2 + hauteur * 2)
        else:
            surface_mint += surface
        if nom in surfaces_par_nom :
            surfaces_par_nom[nom] += surface
            nombre_par_nom[nom] += 1
        else:
            surfaces_par_nom[nom] = surface
            nombre_par_nom[nom] = 1
    for widget in grid_resume_menuiseries.winfo_children():
        widget.destroy()

    left_row = right_row = 0

    if count > 0:
        tk.Label(grid_resume_menuiseries, text="🔢 Nombre total :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
        tk.Label(grid_resume_menuiseries, text=f"{count} U", bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
        left_row += 1

    tk.Label(grid_resume_menuiseries, text="📏 Longueur :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_menuiseries, text=f"{round(longueur_totale, 2)} ml", bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1

    tk.Label(grid_resume_menuiseries, text="📐 Surface :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_menuiseries, text=f"{round(surface_totale, 2)} m²", bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1

    if embrasures > 0:
        tk.Label(grid_resume_menuiseries, text="🪟 Embrasures :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
        tk.Label(grid_resume_menuiseries, text=f"{round(embrasures, 2)} ml", bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
        left_row += 1

    if surface_mint > 0:
        tk.Label(grid_resume_menuiseries, text="📐 Surface MINT :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
        tk.Label(grid_resume_menuiseries, text=f"{round(surface_mint, 2)} m²", bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)
        right_row += 1

    if surface_mext > 0:
        tk.Label(grid_resume_menuiseries, text="📐 Surface MEXT :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
        tk.Label(grid_resume_menuiseries, text=f"{round(surface_mext, 2)} m²", bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)
        right_row += 1

    facade_total = _calc_total_facade_surface()
    pourc_vitree = (surface_mext / facade_total * 100) if facade_total > 0 else 0.0
    tk.Label(grid_resume_menuiseries, text="% de Façades vitrées :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
    tk.Label(grid_resume_menuiseries, text=f"{round(pourc_vitree, 2)} %", bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)
    right_row += 1
    for widget in grid_types_menuiseries.winfo_children() :
        widget.destroy()
    # Configurer les colonnes pour limiter la largeur
    grid_types_menuiseries.columnconfigure(0, weight=0, minsize=30) # Icône
    grid_types_menuiseries.columnconfigure(1, weight=0) # Nom (fixé par width=60)
    grid_types_menuiseries.columnconfigure(2, weight=0, minsize=80) # Surface
    grid_types_menuiseries.columnconfigure(3, weight=0, minsize=10) # Toile
    grid_types_menuiseries.columnconfigure(4, weight=0, minsize=40) # Unités
    for i, (nom, surface) in enumerate(surfaces_par_nom.items()):
        tag_row = "evenrow" if i % 2 == 0 else "oddrow"
        tree_surfaces_menuiseries.insert("", "end", values=(nom, nombre_par_nom[nom]), tags=(tag_row,))

    # --- Mise à jour du Treeview résumé par type pour MENUISERIES ------------
    tree_surfaces_menuiseries.delete(*tree_surfaces_menuiseries.get_children())
    for jdx, (nom_type, surface_type) in enumerate(surfaces_par_nom.items()):
        count_type = nombre_par_nom[nom_type]
        tag_row = "evenrow" if jdx % 2 == 0 else "oddrow"
        tree_surfaces_menuiseries.insert("", "end", values=(nom_type, count_type), tags=(tag_row,))
    # -------------------------------------------------------------------------

def afficher_donnees_type_sol(sols=None):
    if sols is None:
        sols = donnees_ifc[ifc_actif]["sols"]

    # -- reset tableau
    for item in tree_type_sol.get_children():
        tree_type_sol.delete(item)

    longueur_totale = surface_totale = 0.0
    surfaces_par_nom = {}

    # -- remplissage
    for idx, (nom, surface, longueur, revetement_type, storey) in enumerate(sols):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_type_sol.insert("", "end",
            values=(nom, surface, longueur, revetement_type), tags=(tag,))
        longueur_totale += longueur
        surface_totale  += surface
        surfaces_par_nom[nom] = surfaces_par_nom.get(nom, 0) + surface


    # --- maj du résumé
    for w in grid_resume_type_sol.winfo_children():
        w.destroy()
    row = 0
    tk.Label(grid_resume_type_sol, text="📏 Longueur :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_type_sol, text=_format_summary_value(longueur_totale, " ml"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=row, column=1, sticky="e", padx=10)
    row += 1
    tk.Label(grid_resume_type_sol, text="📐 Surface brute :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_type_sol, text=_format_summary_value(surface_totale, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=row, column=1, sticky="e", padx=10)
    row += 1
    surface_nette = _calc_surface_nette_sols(sols)

    tk.Label(grid_resume_type_sol, text="🏠 Surface nette :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_type_sol, text=_format_summary_value(surface_nette, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=row, column=1, sticky="e", padx=10)

    # --- bloc "Surfaces par type" remplacé par Treeview
    # Mise à jour du Treeview des surfaces par type
    for row in tree_surfaces_type_sol.get_children():
        tree_surfaces_type_sol.delete(row)
    for idx, (nom, surface) in enumerate(surfaces_par_nom.items()):
        if surface <= 0:
            continue
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_surfaces_type_sol.insert("", "end", values=(nom, round(surface, 2)), tags=(tag,))
    # Ajustement automatique de la largeur de la colonne m²
    font = tkFont.Font()
    max_w = font.measure("m²")
    for iid in tree_surfaces_type_sol.get_children():
        v = tree_surfaces_type_sol.set(iid, "m²")
        w = font.measure(str(v))
        if w > max_w:
            max_w = w
    tree_surfaces_type_sol.column("m²", width=max_w + 20, stretch=False)

def afficher_donnees_garde_corps(garde_corps=None):
    if garde_corps is None:
        garde_corps = donnees_ifc[ifc_actif]["garde_corps"]

    # -- reset tableau
    for item in tree_garde_corps.get_children():
        tree_garde_corps.delete(item)

    longueur_totale = 0.0
    # -- remplissage
    for idx, (nom, largeur, railing_type, _storey) in enumerate(garde_corps):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_garde_corps.insert(
            "", "end",
            values=(nom, largeur, railing_type),
            tags=(tag,)
        )
        longueur_totale += largeur
    
    # -- maj du résumé
    for w in grid_resume_garde_corps.winfo_children():
        w.destroy()
    row = 0
    tk.Label(grid_resume_garde_corps, text="📏 Longueur :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_garde_corps, text=_format_summary_value(longueur_totale, " m"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=row, column=1, sticky="e", padx=10)
    # ligne vide pour conserver la hauteur
    row += 1
    tk.Label(grid_resume_garde_corps, text="", bg="#FFFFFF").grid(row=row, column=0, pady=2)

    maj_largeur_par_type_garde_corps(garde_corps)

def afficher_donnees_poteaux(poteaux=None):
    """Affiche les données des poteaux dans le tableau principal et met à jour
    le résumé et le tableau des longueurs par type."""

    if poteaux is None:
        poteaux = donnees_ifc[ifc_actif]["poteaux"]

    # -- reset tableau principal
    for i in tree_poteaux.get_children():
        tree_poteaux.delete(i)

    total_larg = total_surf = total_vol = 0.0
    longueurs_par_nom = {}

    # -- remplissage
    for idx, (nom, larg, surf, vol, tp, _storey) in enumerate(poteaux):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_poteaux.insert(
            "",
            "end",
            values=(nom, larg, surf, vol, tp),
            tags=(tag,),
        )
        total_larg += larg
        total_surf += surf
        total_vol += vol
        longueurs_par_nom[nom] = longueurs_par_nom.get(nom, 0) + larg

    # --- mise à jour du résumé -------------------------------------------------
    label_largeur_totale_poteaux.config(text=f"{round(total_larg,2)} m")
    label_surface_totale_poteaux.config(text=f"{round(total_surf,2)} m²")
    label_volume_totale_poteaux.config(text=f"{round(total_vol,2)} m³")

    # --- mise à jour du tableau résumé par type -------------------------------
    tree_surfaces_poteaux.delete(*tree_surfaces_poteaux.get_children())
    for idx, (nom, larg) in enumerate(sorted(longueurs_par_nom.items())):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_surfaces_poteaux.insert(
            "",
            "end",
            values=(nom, round(larg, 2)),
            tags=(tag,),
        )
    maj_par_type_poteaux(poteaux)
    maj_surface_coffrage_totale()
def hide_infos_poteaux():
    """Masque le bloc d'informations complémentaires des poteaux."""
    for w in grid_infos_poteaux.winfo_children():
        w.destroy()


def _update_infos_poteaux(nom_sel: str, storey: str = None):
    """Affiche les niveaux du ou des poteaux sélectionnés."""
    hide_infos_poteaux()
    poteaux = donnees_ifc.get(ifc_actif, {}).get("poteaux", [])
    if storey is None:
        niveaux = sorted({p[5] for p in poteaux if p[0] == nom_sel and p[5]})
    else:
        niveaux = [storey] if storey else []
    niveau_txt = " - ".join(niveaux) if niveaux else "N/A"
    tk.Label(grid_infos_poteaux, text="Niveau :", bg="#FFFFFF", anchor="w").grid(row=0, column=0, sticky="w", padx=10)
    tk.Label(grid_infos_poteaux, text=niveau_txt, bg="#FFFFFF", anchor="e").grid(row=0, column=1, sticky="e", padx=10)


def _update_resume_poteaux(nom_sel: str):
    poteaux_src = [p for p in donnees_ifc.get(ifc_actif, {}).get("poteaux", []) if p[0] == nom_sel]
    if not poteaux_src:
        return
    total_larg = total_surf = total_vol = 0.0
    for _n, larg, surf, vol, _tp, _storey in poteaux_src:
        total_larg += larg
        total_surf += surf
        total_vol += vol
    label_largeur_totale_poteaux.config(text=_format_summary_value(total_larg, " m"))
    label_surface_totale_poteaux.config(text=_format_summary_value(total_surf, " m²"))
    label_volume_totale_poteaux.config(text=_format_summary_value(total_vol, " m³"))


def appliquer_filtre_poteaux():
    global filtre_texte_poteaux
    filtre_texte_poteaux = entree_filtre_poteaux.get().lower()
    _apply_filters_poteaux()

def reinitialiser_filtre_poteaux():
    global filtre_texte_poteaux, filtre_niveaux_poteaux
    entree_filtre_poteaux.delete(0, tk.END)
    filtre_texte_poteaux = ""
    filtre_niveaux_poteaux = []
    _apply_filters_poteaux()


def hide_infos_poutres():
    """Masque le bloc d'informations complémentaires des poutres."""
    for w in grid_infos_poutres.winfo_children():
        w.destroy()


def _update_infos_poutres(nom_sel: str, storey: str = None):
    """Affiche les informations de niveau pour la poutre sélectionnée."""
    hide_infos_poutres()
    poutres = donnees_ifc.get(ifc_actif, {}).get("poutres", [])
    if storey is None:
        niveaux = sorted({p[5] for p in poutres if p[0] == nom_sel and len(p) > 5 and p[5]})
    else:
        niveaux = [storey] if storey else []
    niveau_txt = " - ".join(niveaux) if niveaux else "N/A"
    tk.Label(grid_infos_poutres, text="Niveau :", bg="#FFFFFF", anchor="w").grid(row=0, column=0, sticky="w", padx=10)
    tk.Label(grid_infos_poutres, text=niveau_txt, bg="#FFFFFF", anchor="e").grid(row=0, column=1, sticky="e", padx=10)


def _update_resume_poutres(nom_sel: str):
    poutres_src = [p for p in donnees_ifc.get(ifc_actif, {}).get("poutres", []) if p[0] == nom_sel]
    if not poutres_src:
        return
    total_len = total_surf = total_vol = 0.0
    for _n, longu, surf, vol, _tp, _storey in poutres_src:
        total_len += longu
        total_surf += surf
        total_vol += vol
    label_longueur_totale_poutres.config(text=_format_summary_value(total_len, " m"))
    label_surface_totale_poutres.config(text=_format_summary_value(total_surf, " m²"))
    label_volume_totale_poutres.config(text=_format_summary_value(total_vol, " m³"))


def afficher_infos_poutres(event=None):
    sel = tree_poutres.selection()
    if not sel:
        hide_infos_poutres()
        return
    values = tree_poutres.item(sel[0])["values"]
    nom_sel = values[0]
    try:
        longu = float(values[1])
        surf = float(values[2])
        vol = float(values[3])
    except (ValueError, TypeError):
        longu = surf = vol = 0.0
    p_type = values[4]
    storey = None
    for p in donnees_ifc.get(ifc_actif, {}).get("poutres", []):
        if (
            p[0] == nom_sel
            and abs(p[1] - longu) < 0.01
            and abs(p[2] - surf) < 0.01
            and abs(p[3] - vol) < 0.01
            and p[4] == p_type
        ):
            storey = p[5]
            break
    _update_infos_poutres(nom_sel, storey)
    _update_resume_poutres(nom_sel)


def afficher_infos_poutres_resume(event=None):
    sel = tree_surfaces_poutres.selection()
    if not sel:
        hide_infos_poutres()
        return
    nom_sel = tree_surfaces_poutres.item(sel[0])["values"][0]
    _update_infos_poutres(nom_sel)
    _update_resume_poutres(nom_sel)


def afficher_donnees_poutres(poutres=None):
    if poutres is None:
        poutres = donnees_ifc[ifc_actif]["poutres"]
    for i in tree_poutres.get_children():
        tree_poutres.delete(i)
    total_len = total_surf = total_vol = 0.0
    for idx, (nom, longu, surf, vol, tp, _storey) in enumerate(poutres):
        tree_poutres.insert(
            "", "end",
            values=(nom, longu, surf, vol, tp),
            tags=("evenrow" if idx%2==0 else "oddrow",)
        )
        total_len += longu
        total_surf += surf
        total_vol += vol
    label_longueur_totale_poutres.config(text=f"{round(total_len,2)} m")
    label_surface_totale_poutres.config(text=f"{round(total_surf,2)} m²")
    label_volume_totale_poutres.config(text=f"{round(total_vol,2)} m³")
    maj_par_type_poutres(poutres)
    maj_surface_coffrage_totale()

def maj_par_type_poutres(poutres=None):
    if not ifc_actif or ifc_actif not in donnees_ifc:
        return
    if poutres is None:
        poutres = donnees_ifc[ifc_actif]["poutres"]
    # on vide la grille
    for w in grid_types_poutres.winfo_children():
        w.destroy()
    # agrégation
    agg = {}
    for nom, longu, *_ in poutres:
        agg[nom] = agg.get(nom, 0) + longu
    # injection
    for i, (nom, longu) in enumerate(sorted(agg.items())):
        tk.Label(grid_types_poutres, text="🧱", bg="#FFFFFF")\
            .grid(row=i, column=0, padx=10, sticky="w")
        tk.Label(grid_types_poutres, text=f"{nom} :", bg="#FFFFFF", width=60, anchor="w")\
            .grid(row=i, column=1)
        tk.Label(grid_types_poutres, text=f"{round(longu,2)} m", bg="#FFFFFF")\
            .grid(row=i, column=2, padx=(0, 20), sticky="e")

def appliquer_filtre_poutres():
    global filtre_texte_poutres
    filtre_texte_poutres = entree_filtre_poutres.get().lower()
    _apply_filters_poutres()

def reinitialiser_filtre_poutres():
    global filtre_texte_poutres, filtre_niveaux_poutres
    entree_filtre_poutres.delete(0, tk.END)
    filtre_texte_poutres = ""
    filtre_niveaux_poutres = []
    _apply_filters_poutres()



def appliquer_filtre_zero_poutres():
    """Filtrer pour n’afficher que les poutres dont la longueur est 0."""
    poutres_zero = [p for p in donnees_ifc[ifc_actif]["poutres"] if p[1] == 0]
    afficher_donnees_poutres(poutres_zero)

def maj_largeur_par_type_garde_corps(garde_corps=None):
    """Remplit le Treeview "Résumé" avec les largeurs cumulées par nom de garde-corps."""
    if garde_corps is None:
        garde_corps = donnees_ifc[ifc_actif]["garde_corps"]

    # Reset Treeview
    tree_surfaces_garde_corps.delete(*tree_surfaces_garde_corps.get_children())

    # Agrégation par libellé
    par_type = {}
    for nom, largeur, *_ in garde_corps:
        cle = nom or "Garde-corps sans nom"
        par_type[cle] = par_type.get(cle, 0) + largeur

    # Injection dans le Treeview résumé
    for idx, (lib, w) in enumerate(sorted(par_type.items())):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_surfaces_garde_corps.insert(
            "", "end",
            values=(lib, round(w, 2)),
            tags=(tag,)
        )

def appliquer_filtre_garde_corps():
    """Active le filtrage texte pour les garde-corps."""
    global filtre_texte_garde_corps
    filtre_texte_garde_corps = entree_filtre_garde_corps.get().lower()
    _apply_filters_garde_corps()


# --------------------------------------
# Filtres
# --------------------------------------

def _get_filtered_murs():
    """Retourne la liste des murs après application des filtres actifs."""
    murs = donnees_ifc.get(ifc_actif, {}).get("murs", [])
    if filtre_zero_murs:
        murs = [m for m in murs if m[1] == 0]
    if filtre_niveaux_murs:
        murs = [m for m in murs if m[5] in filtre_niveaux_murs]
    if filtre_texte_murs:
        lower = filtre_texte_murs
        murs = [m for m in murs if lower in m[0].lower()]
    return murs

def _apply_filters_murs():
    """Applique tous les filtres actifs sur la liste des murs."""
    afficher_donnees_murs(_get_filtered_murs())

def appliquer_filtre_murs():
    global filtre_texte_murs
    filtre_texte_murs = entree_filtre_murs.get().lower()
    _apply_filters_murs()

def reinitialiser_filtre_murs() :
    global filtre_texte_murs, filtre_niveaux_murs, filtre_zero_murs
    entree_filtre_murs.delete(0, tk.END)
    filtre_texte_murs = ""
    filtre_niveaux_murs = []
    filtre_zero_murs = False
    _apply_filters_murs()

# ----- Filtres pour MENUISERIES -----
def _get_filtered_menuiseries():
    menu = donnees_ifc.get(ifc_actif, {}).get("menuiseries", [])
    if filtre_zero_menuiseries:
        menu = [m for m in menu if m[1] == 0]
    if filtre_niveaux_menuiseries:
        menu = [m for m in menu if m[5] in filtre_niveaux_menuiseries]
    if filtre_texte_menuiseries:
        lower = filtre_texte_menuiseries
        menu = [m for m in menu if lower in m[0].lower()]
    return menu

def _apply_filters_menuiseries():
    afficher_donnees_menuiseries(_get_filtered_menuiseries())

# ----- Filtres pour TYPE DE SOL -----
def _get_filtered_type_sol():
    sols = donnees_ifc.get(ifc_actif, {}).get("sols", [])
    if filtre_zero_type_sol:
        sols = [s for s in sols if s[1] == 0]
    if filtre_niveaux_type_sol:
        sols = [s for s in sols if s[4] in filtre_niveaux_type_sol]
    if filtre_texte_type_sol:
        lower = filtre_texte_type_sol
        sols = [s for s in sols if lower in s[0].lower()]
    return sols

def _apply_filters_type_sol():
    afficher_donnees_type_sol(_get_filtered_type_sol())

# ----- Filtres pour GARDE CORPS -----
def _get_filtered_garde_corps():
    gc = donnees_ifc.get(ifc_actif, {}).get("garde_corps", [])
    if filtre_zero_garde_corps:
        gc = [g for g in gc if g[1] == 0]
    if filtre_niveaux_garde_corps:
        if len(gc) > 0 and len(gc[0]) > 3:
            gc = [g for g in gc if g[3] in filtre_niveaux_garde_corps]
    if filtre_texte_garde_corps:
        lower = filtre_texte_garde_corps
        gc = [g for g in gc if lower in g[0].lower()]
    return gc

def _apply_filters_garde_corps():
    afficher_donnees_garde_corps(_get_filtered_garde_corps())

# ----- Filtres pour POTEAUX -----
def _get_filtered_poteaux():
    poteaux = donnees_ifc.get(ifc_actif, {}).get("poteaux", [])
    if filtre_niveaux_poteaux:
        poteaux = [p for p in poteaux if p[5] in filtre_niveaux_poteaux]
    if filtre_texte_poteaux:
        lower = filtre_texte_poteaux
        poteaux = [p for p in poteaux if lower in p[0].lower()]
    return poteaux

def _apply_filters_poteaux():
    filtres = _get_filtered_poteaux()
    afficher_donnees_poteaux(filtres)
    maj_par_type_poteaux(filtres)

# ----- Filtres pour POUTRES -----
def _get_filtered_poutres():
    poutres = donnees_ifc.get(ifc_actif, {}).get("poutres", [])
    if filtre_niveaux_poutres:
        if len(poutres) > 0 and len(poutres[0]) > 5:
            poutres = [p for p in poutres if p[5] in filtre_niveaux_poutres]
    if filtre_texte_poutres:
        lower = filtre_texte_poutres
        poutres = [p for p in poutres if lower in p[0].lower()]
    return poutres

def _apply_filters_poutres():
    filtres = _get_filtered_poutres()
    afficher_donnees_poutres(filtres)
    maj_par_type_poutres(filtres)

def appliquer_filtre_menuiseries():
    global filtre_texte_menuiseries
    filtre_texte_menuiseries = entree_filtre_menuiseries.get().lower()
    _apply_filters_menuiseries()

def reinitialiser_filtre_menuiseries():
    global filtre_texte_menuiseries, filtre_niveaux_menuiseries, filtre_zero_menuiseries
    entree_filtre_menuiseries.delete(0, tk.END)
    filtre_texte_menuiseries = ""
    filtre_niveaux_menuiseries = []
    filtre_zero_menuiseries = False
    _apply_filters_menuiseries()

# ---------- Filtre TYPE DE SOL ----------
def appliquer_filtre_type_sol():
    """Active le filtrage texte pour les sols."""
    global filtre_texte_type_sol
    filtre_texte_type_sol = entree_filtre_type_sol.get().lower()
    _apply_filters_type_sol()

def appliquer_filtre_zero_type_sol():
    """Filtrer pour n’afficher que les sols avec surface (m²) égale à 0."""
    global filtre_zero_type_sol
    filtre_zero_type_sol = True
    _apply_filters_type_sol()

def appliquer_filtre_zero_murs():
    """Active le filtre pour n'afficher que les murs de quantité nulle."""
    global filtre_zero_murs
    filtre_zero_murs = True
    _apply_filters_murs()

# --- Outils communs pour le filtrage par niveau ---
def appliquer_filtre_niveau(var_name: str, apply_func, niveaux):
    """Met à jour la variable globale *var_name* avec les *niveaux* puis applique le filtre."""
    globals()[var_name] = niveaux or []
    apply_func()


def open_filtre_niveau(btn, callback):
    """Ouvre un menu contextuel de niveaux lié au *btn* et à son *callback*."""
    niveaux = donnees_ifc.get(ifc_actif, {}).get('storeys', [])
    if not niveaux or btn is None:
        return
    menu = tk.Menu(root, tearoff=0)
    for n in niveaux:
        menu.add_command(label=n, command=lambda level=n: (callback([level]), menu.unpost()))
    x = btn.winfo_rootx()
    y = btn.winfo_rooty() + btn.winfo_height()
    menu.tk_popup(x, y)
    menu.grab_release()

def create_niveau_button(parent, command):
    """Crée un bouton 'NIVEAU' standard dans *parent* et retourne sa référence."""
    btn = ttk.Button(parent, text="NIVEAU", style="Simple.TButton", command=command)
    btn.pack(side="left", padx=5)
    return btn

def appliquer_filtre_niveau_murs(niveaux):
    """Filtrer les murs selon une liste de niveaux."""
    appliquer_filtre_niveau("filtre_niveaux_murs", _apply_filters_murs, niveaux)

def open_filtre_niveau_murs():
    open_filtre_niveau(btn_niveau_murs, appliquer_filtre_niveau_murs)

def appliquer_filtre_niveau_menuiseries(niveaux):
    """Filtrer les menuiseries selon une liste de niveaux."""
    appliquer_filtre_niveau("filtre_niveaux_menuiseries", _apply_filters_menuiseries, niveaux)

def open_filtre_niveau_menuiseries():
    open_filtre_niveau(btn_niveau_menuiseries, appliquer_filtre_niveau_menuiseries)

def appliquer_filtre_niveau_type_sol(niveaux):
    """Filtrer les revêtements de sol selon une liste de niveaux."""
    appliquer_filtre_niveau("filtre_niveaux_type_sol", _apply_filters_type_sol, niveaux)

def open_filtre_niveau_type_sol():
    open_filtre_niveau(btn_niveau_type_sol, appliquer_filtre_niveau_type_sol)

def appliquer_filtre_niveau_garde_corps(niveaux):
    """Filtrer les garde-corps selon une liste de niveaux."""
    appliquer_filtre_niveau("filtre_niveaux_garde_corps", _apply_filters_garde_corps, niveaux)

def open_filtre_niveau_garde_corps():
    open_filtre_niveau(btn_niveau_garde_corps, appliquer_filtre_niveau_garde_corps)

def appliquer_filtre_niveau_poteaux(niveaux):
    """Filtrer les poteaux selon une liste de niveaux."""
    appliquer_filtre_niveau("filtre_niveaux_poteaux", _apply_filters_poteaux, niveaux)

def open_filtre_niveau_poteaux():
    open_filtre_niveau(btn_niveau_poteaux, appliquer_filtre_niveau_poteaux)

def appliquer_filtre_niveau_poutres(niveaux):
    """Filtrer les poutres selon une liste de niveaux."""
    appliquer_filtre_niveau("filtre_niveaux_poutres", _apply_filters_poutres, niveaux)

def open_filtre_niveau_poutres():
    open_filtre_niveau(btn_niveau_poutres, appliquer_filtre_niveau_poutres)

def appliquer_filtre_niveau_ep(niveaux):
    """Filtrer les descentes EP selon une liste de niveaux."""
    appliquer_filtre_niveau("filtre_niveaux_ep", _apply_filters_ep, niveaux)

def open_filtre_niveau_ep():
    open_filtre_niveau(btn_niveau_ep, appliquer_filtre_niveau_ep)

def appliquer_filtre_zero_menuiseries():
    """Filtrer pour n’afficher que les menuiseries avec quantité égale à 0."""
    global filtre_zero_menuiseries
    filtre_zero_menuiseries = True
    _apply_filters_menuiseries()

def appliquer_filtre_zero_garde_corps():
    """Filtrer pour n’afficher que les garde-corps avec largeur égale à 0."""
    global filtre_zero_garde_corps
    filtre_zero_garde_corps = True
    _apply_filters_garde_corps()


def appliquer_filtre_zero_poteaux():
    """Filtrer pour n’afficher que les poteaux dont la largeur est 0."""
    poteaux_zero = [p for p in donnees_ifc[ifc_actif]["poteaux"] if p[1] == 0]
    afficher_donnees_poteaux(poteaux_zero)

def reinitialiser_filtre_type_sol():
    global filtre_texte_type_sol, filtre_zero_type_sol, filtre_niveaux_type_sol
    entree_filtre_type_sol.delete(0, tk.END)
    filtre_texte_type_sol = ""
    filtre_zero_type_sol = False
    filtre_niveaux_type_sol = []
    _apply_filters_type_sol()


def appliquer_filtre_garde_corps():
    """Active le filtrage texte pour les garde-corps."""
    global filtre_texte_garde_corps
    filtre_texte_garde_corps = entree_filtre_garde_corps.get().lower()
    _apply_filters_garde_corps()
def reinitialiser_filtre_garde_corps():
    global filtre_texte_garde_corps, filtre_zero_garde_corps, filtre_niveaux_garde_corps
    entree_filtre_garde_corps.delete(0, tk.END)
    filtre_texte_garde_corps = ""
    filtre_zero_garde_corps = False
    filtre_niveaux_garde_corps = []
    _apply_filters_garde_corps()


def reinitialiser_tous_filtres(event=None):
    """Réinitialise les filtres de tous les onglets."""
    reinitialiser_filtre_murs()
    reinitialiser_filtre_menuiseries()
    reinitialiser_filtre_type_sol()
    reinitialiser_filtre_garde_corps()
    reinitialiser_filtre_escalier()
    reinitialiser_filtre_bord_dalle()
    reinitialiser_filtre_poteaux()
    reinitialiser_filtre_poutres()
    reinitialiser_filtre_ep()
    reinitialiser_filtre_type_plafond()
    reinitialiser_filtre_resume_gc()


# --------------------------------------
# Exportation Excel
# --------------------------------------
def exporter_excel():
    try:
        murs_df = pd.DataFrame([tree_murs.item(child)["values"] for child in tree_murs.get_children()], columns=["Nom du mur", "Surface (m²)", "Longueur ", "Volume (m³)", "Type"])
        menu_df = pd.DataFrame([tree_menuiseries.item(child)["values"] for child in tree_menuiseries.get_children()], columns=["Famille et type", "Surface (m²)", "Largeur (m)", "Hauteur (m)", "Statut"])
        sol_df = pd.DataFrame([tree_type_sol.item(child)["values"] for child in tree_type_sol.get_children()], columns=["Nom du revêtement", "Surface (m²)", "Longueur ", "Type"])
        garde_df = pd.DataFrame([tree_garde_corps.item(child)["values"] for child in tree_garde_corps.get_children()], columns=["Nom", "Largeur (m)", "Type"])
        fichier = filedialog.asksaveasfilename(defaultextension=".xlsx", filetypes=[("Fichier Excel", "*.xlsx")])
        if fichier:
            with pd.ExcelWriter(fichier) as writer :
                murs_df.to_excel(writer, sheet_name="Murs", index=False)
                menu_df.to_excel(writer, sheet_name="Menuiseries", index=False)
                sol_df.to_excel(writer, sheet_name="Type de Sol", index=False)
                garde_df.to_excel(writer, sheet_name="Garde Corps", index=False)
        print("Exportation réussie")
    except Exception as e:
        print(f"Erreur export Excel : {e}")

# --------------------------------------
# Configuration de l'Interface Graphique
# --------------------------------------
try:
    root = tk.Tk()

    # --- Style for green Treeviews ---
    style = ttk.Style()
    style.configure("Green.Treeview", background="#FFFFFF", fieldbackground="#FFFFFF", foreground="black")
    style.map("Green.Treeview",
                     background=[("selected", "#FFFFFF")],
                     foreground=[("selected", "black")])
    root.title("🏢 Analyseur IFC")
    root.geometry("1200x750")
    root.configure(bg="#F2F2F2")
    print("Fenêtre Tkinter initialisée")
except Exception as e:
    print(f"Erreur d'initialisation Tkinter : {e}")
    input("Appuyez sur Entrée pour quitter...")
    sys.exit(1)

print("Style ttk initialisé")
style.theme_use("clam")
print("Thème 'clam' appliqué")

# Base Treeview style (white)
style.configure("Treeview",
                font=("Helvetica", 10),
                rowheight=25,
                background="#FFFFFF",
                foreground="#263238",
                fieldbackground="#FFFFFF")

# Re-apply green Treeview style so empty areas keep green background
style.configure("Green.Treeview",
                background="#FFFFFF",
                fieldbackground="#FFFFFF",
                foreground="black")
style.map("Green.Treeview",
          background=[("selected", "#A5D6A7")],
          foreground=[("selected", "black")])
# Style spécifique pour le Treeview du résumé
style.configure("Summary.Treeview", background="white", fieldbackground="white")
print("Style Treeview configuré")
style.map("Treeview", background=[("selected", "#26A69A")], foreground=[("selected", "#FFFFFF")])
style.configure("Treeview.Heading", font=("Helvetica", 11, "bold"), background="#26A69A", foreground="#FFFFFF")
style.configure("TButton", font=("Helvetica", 10), background="#26A69A", foreground="#FFFFFF", padding=5)
style.configure("Import.TButton", font=("Helvetica", 12, "bold"), background="#4CAF50", foreground="white", padding=10)
style.map("Import.TButton", background=[("active", "#43A047")])
style.configure("green.Horizontal.TProgressbar", troughcolor="#FFFFFF", background="#4CAF50")
style.configure("Tab.TButton", font=("Helvetica", 9, "bold"), padding=[8, 4], background="#B0BEC5", foreground="#263238")
style.map("Tab.TButton", background=[("active", "#4DB6AC"), ("!active", "#B0BEC5")])
style.configure("ActiveTab.TButton", font=("Helvetica", 9, "bold"), padding=[8, 4], background="#4CAF50", foreground="#FFFFFF")
style.configure(
    "Simple.TButton",
    font=("Helvetica", 9, "bold"),
    background="white",
    foreground="black",
    padding=5,
    relief="flat",
)
style.map("Simple.TButton", background=[("active", "#E0E0E0")])
style.configure(
    "Header.TButton",
    font=("Helvetica", 8),
    background="white",
    foreground="black",
    padding=3,
    relief="flat",
)
style.map("Header.TButton", background=[("active", "#E0E0E0")])
style.configure("Reset.TButton", font=("Helvetica", 9, "bold"), background="white", foreground="black", padding=5, relief="flat")
style.map("Reset.TButton", background=[("active", "#E0E0E0")])
style.configure("redrow.Treeview", background="#EF9A9A")
print("Styles configurés")

header_frame = tk.Frame(root, bg="#004D40")
header_frame.pack(side="top", fill="x")
print("Cadre d'en-tête créé")
tk.Label(header_frame, text="IFC Analyzer", font=("Helvetica", 16, "bold"), bg="#004D40", fg="#FFFFFF").pack(side="left", padx=25, pady=10)
tk.Label(header_frame, text="par Rafael Jeantin", font=("Helvetica", 8, "italic"), bg="#004D40", fg="#B0BEC5").pack(side="left", padx=5, pady=10)

# Frame contenant les boutons d'action

# ── Helpers pour boutons arrondis ─────────────────────────────────
def create_rounded_rectangle(canvas, x1, y1, x2, y2, radius=15, **kwargs):
    """Dessine un rectangle arrondi sur *canvas*."""
    points = [
        x1+radius, y1,
        x2-radius, y1,
        x2, y1,
        x2, y1+radius,
        x2, y2-radius,
        x2, y2,
        x2-radius, y2,
        x1+radius, y2,
        x1, y2,
        x1, y2-radius,
        x1, y1+radius,
        x1, y1,
    ]
    return canvas.create_polygon(points, **kwargs, smooth=True)

def create_round_button(parent, text, command=None, width=80, height=30, radius=15,
                        bg="#FFFFFF", fg="#004D40", font=("Helvetica", 8, "bold")):
    """Crée un bouton à bords arrondis similaire à la barre de recherche."""
    canvas = tk.Canvas(parent, bg=parent.cget("bg"), highlightthickness=0,
                       width=width, height=height)
    create_rounded_rectangle(canvas, 0, 0, width, height, radius=radius,
                             fill=bg, outline=bg)
    btn = tk.Button(canvas, text=text, command=command, bd=0, bg=bg, fg=fg,
                    activebackground=bg, activeforeground=fg, font=font)
    canvas.create_window(width/2, height/2, window=btn)
    return canvas, btn
# ────────────────────────────────────────────────────────────────

header_buttons_frame = tk.Frame(header_frame, bg="#004D40")

btn_niveau_canvas, btn_niveau_global = create_round_button(
    header_buttons_frame,
    "NIVEAU",
    command=lambda: open_filtre_niveau_global(),
    width=80,
    height=30,
)
btn_niveau_canvas.pack(side="left", padx=2)

btn_reset_canvas, btn_reset_global = create_round_button(
    header_buttons_frame,
    "RÉINITIALISER",
    command=reinitialiser_tous_filtres,
    width=100,
    height=30,
)
btn_reset_canvas.pack(side="left", padx=2)
btn_reset_global.bind("<Double-Button-1>", reinitialiser_tous_filtres)

# Séparateurs et barre de recherche au centre
separator_left = tk.Frame(header_buttons_frame, bg="white", width=2, height=30)
separator_left.pack(side="left", padx=5, pady=10, fill="y")

search_frame_header = tk.Frame(header_buttons_frame, bg="#004D40")
search_frame_header.pack(side="left", padx=5, pady=10)

separator_right = tk.Frame(header_buttons_frame, bg="white", width=2, height=30)
separator_right.pack(side="left", padx=5, pady=10, fill="y")

# Sous-frame pour les boutons d'export
export_frame_header = tk.Frame(header_buttons_frame, bg="#004D40")
export_frame_header.pack(side="left", padx=2)
csv_canvas, _ = create_round_button(
    export_frame_header,
    "📄 CSV",
    width=60,
    height=30,
)
csv_canvas.pack(side="left", padx=2)
xlsx_canvas, _ = create_round_button(
    export_frame_header,
    "📊 XLSX",
    width=60,
    height=30,
)
xlsx_canvas.pack(side="left", padx=2)
pdf_canvas, _ = create_round_button(
    export_frame_header,
    "📑 PDF",
    width=60,
    height=30,
)
pdf_canvas.pack(side="left", padx=2)
# ─── Search-bar ESCRONOMISTE style ─────────────────────────────
def create_rounded_rectangle(canvas, x1, y1, x2, y2, radius=15, **kwargs):
    """Dessine un rectangle arrondi sur *canvas*."""
    points = [
        x1+radius, y1,
        x1+radius, y1,
        x2-radius, y1,
        x2-radius, y1,
        x2, y1,
        x2, y1+radius,
        x2, y1+radius,
        x2, y2-radius,
        x2, y2-radius,
        x2, y2,
        x2-radius, y2,
        x2-radius, y2,
        x1+radius, y2,
        x1+radius, y2,
        x1, y2,
        x1, y2-radius,
        x1, y2-radius,
        x1, y1+radius,
        x1, y1+radius,
        x1, y1
    ]
    return canvas.create_polygon(points, **kwargs, smooth=True)

def create_round_button(parent, text, command=None, width=80, height=30, radius=15,
                        bg="#FFFFFF", fg="#004D40", font=("Helvetica", 8, "bold")):
    """Crée un bouton à bords arrondis similaire à la barre de recherche."""
    canvas = tk.Canvas(parent, bg=parent.cget("bg"), highlightthickness=0,
                       width=width, height=height)
    create_rounded_rectangle(canvas, 0, 0, width, height, radius=radius,
                             fill=bg, outline=bg)
    btn = tk.Button(canvas, text=text, command=command, bd=0, bg=bg, fg=fg,
                    activebackground=bg, activeforeground=fg, font=font)
    canvas.create_window(width/2, height/2, window=btn)
    return canvas, btn

def _search_focus_in(event):
    if search_entry_header.get() == "🔍 Recherche":
        search_entry_header.delete(0, tk.END)
        search_entry_header.config(fg="black")

def _search_focus_out(event):
    if not search_entry_header.get():
        search_entry_header.insert(0, "🔍 Recherche")
        search_entry_header.config(fg="gray")

header_buttons_frame.pack(side="right", padx=10, pady=10)

search_canvas_header = tk.Canvas(
    search_frame_header,
    bg="#004D40",
    highlightthickness=0,
    height=30,
    width=200
)
search_canvas_header.pack()

# White rounded rectangle background
create_rounded_rectangle(
    search_canvas_header,
    0, 0, 200, 30,
    radius=15,
    fill="#FFFFFF",
    outline="#FFFFFF"
)

search_entry_header = tk.Entry(
    search_canvas_header,
    font=("Helvetica", 10),
    bg="#FFFFFF",
    fg="gray",
    bd=0,
    insertbackground="black"
)
search_entry_header.insert(0, "🔍 Recherche")

def rechercher_onglet(event=None):
    query = search_entry_header.get().strip().lower()
    if not query:
        return
    for btn in tab_buttons:
        if query in btn.cget("text").lower():
            btn.invoke()
            return
    messagebox.showinfo("Recherche", f"Aucun onglet trouvé pour « {query} »")

search_entry_header.bind("<FocusIn>", _search_focus_in)
search_entry_header.bind("<FocusOut>", _search_focus_out)
search_entry_header.bind("<Return>", rechercher_onglet)

# Center the entry inside the canvas
search_canvas_header.create_window(
    100, 15,
    window=search_entry_header,
    anchor="center",
    width=180
)
# ────────────────────────────────────────────────────────────────



sidebar_frame = tk.Frame(root, bg="#004D40", width=172)
sidebar_frame.pack(side="left", fill="y")
sidebar_frame.pack_propagate(False)
print("Cadre de la barre latérale créé")

selected_button = None
nav_buttons = []
canvas_rectangles = {}

class Tooltip :
    def __init__(self, widget, text) :
        self.widget = widget
        self.text = text
        self.tooltip_window = None
        self.widget.bind("<Enter>", self.show_tooltip)
        self.widget.bind("<Leave>", self.hide_tooltip)

    def show_tooltip(self, event=None) :
        x, y, _, _ = self.widget.bbox("insert")
        x += self.widget.winfo_rootx() + 25
        y += self.widget.winfo_rooty() + 25
        self.tooltip_window = tk.Toplevel(self.widget)
        self.tooltip_window.wm_overrideredirect(True)
        self.tooltip_window.wm_geometry(f"+{x}+{y}")
        label = tk.Label(self.tooltip_window, text=self.text, background="#FFFFE0", relief="solid", borderwidth=1, font=("Helvetica", 10))
        label.pack()

    def hide_tooltip(self, event=None) :
        if self.tooltip_window :
            self.tooltip_window.destroy()
            self.tooltip_window = None

def create_nav_button(emoji, text, command, tooltip_text) :
    global selected_button
    btn_frame = tk.Frame(sidebar_frame, bg="#004D40", height=30)
    btn_frame.pack(fill="x", padx=2, pady=2)
    canvas = tk.Canvas(btn_frame, bg="#004D40", highlightthickness=0, height=30)
    canvas.pack(fill="x")
    btn = tk.Button(canvas, bg="#004D40", bd=0, command=lambda: [set_selected(btn), command()])
    btn.place(relx=0, rely=0, relwidth=1, relheight=1)
    emoji_label = tk.Label(canvas, text=emoji, font=("Helvetica", 12), bg="#004D40", fg="#ECEFF1", width=1, anchor="w")
    text_label = tk.Label(canvas, text=text, font=("Helvetica", 9), bg="#004D40", fg="#ECEFF1", anchor="w")
    canvas.create_window(10, 15, window=emoji_label, anchor="w")
    canvas.create_window(35, 15, window=text_label, anchor="w")
    Tooltip(btn_frame, tooltip_text)
    Tooltip(emoji_label, tooltip_text)
    Tooltip(text_label, tooltip_text)
    def on_enter(e) :
        if btn != selected_button :
            canvas.config(bg="#37474F")
            emoji_label.config(bg="#37474F", fg="#ECEFF1")
            text_label.config(bg="#37474F", fg="#ECEFF1")
    def on_leave(e) :
        if btn != selected_button :
            canvas.config(bg="#004D40")
            emoji_label.config(bg="#004D40", fg="#ECEFF1")
            text_label.config(bg="#004D40", fg="#ECEFF1")
    btn_frame.bind("<Enter>", on_enter)
    btn_frame.bind("<Leave>", on_leave)
    emoji_label.bind("<Enter>", on_enter)
    emoji_label.bind("<Leave>", on_leave)
    text_label.bind("<Enter>", on_enter)
    text_label.bind("<Leave>", on_leave)
    emoji_label.bind("<Button-1>", lambda e: btn.invoke())
    text_label.bind("<Button-1>", lambda e: btn.invoke())
    nav_buttons.append(btn)
    canvas_rectangles[btn] = canvas
    return btn

def set_selected(btn) :
    global selected_button
    for button, canvas in canvas_rectangles.items() :
        canvas.delete("highlight")
        canvas.config(bg="#004D40")
        for child in canvas.winfo_children() :
            child.config(bg="#004D40", fg="#ECEFF1")
    selected_button = btn
    canvas = canvas_rectangles[btn]
    canvas.config(bg="#FFFFFF")
    canvas.create_oval(0, 0, 20, 20, fill="#FFFFFF", outline="#FFFFFF", tags="highlight")
    canvas.create_oval(canvas.winfo_width()-20, 0, canvas.winfo_width(), 20, fill="#FFFFFF", outline="#FFFFFF", tags="highlight")
    canvas.create_oval(0, 30-20, 20, 30, fill="#FFFFFF", outline="#FFFFFF", tags="highlight")
    canvas.create_oval(canvas.winfo_width()-20, 30-20, canvas.winfo_width(), 30, fill="#FFFFFF", outline="#FFFFFF", tags="highlight")
    canvas.create_rectangle(10, 0, canvas.winfo_width()-10, 30, fill="#FFFFFF", outline="#FFFFFF", tags="highlight")
    canvas.create_rectangle(0, 10, canvas.winfo_width(), 30-10, fill="#FFFFFF", outline="#FFFFFF", tags="highlight")
    for child in canvas.winfo_children() :
        child.config(bg="#FFFFFF", fg="#000000")

content_frame = tk.Frame(root, bg="#F2F2F2")
content_frame.pack(side="left", expand=True, fill="both", padx=10, pady=10)
print("Contenu frame créé")
frame_accueil = tk.Frame(content_frame, bg="#F2F2F2")
frame_murs = tk.Frame(content_frame, bg="#F2F2F2")
frame_menuiseries = tk.Frame(content_frame, bg="#F2F2F2")
frame_type_sol = tk.Frame(content_frame, bg="#F2F2F2")
frame_garde_corps = tk.Frame(content_frame, bg="#F2F2F2")
frame_poteaux = tk.Frame(content_frame, bg="#F2F2F2")
frame_poutres = tk.Frame(content_frame, bg="#F2F2F2")
frame_descente_ep = tk.Frame(content_frame, bg="#F2F2F2")
frame_escalier = tk.Frame(content_frame, bg="#F2F2F2")
frame_bord_dalle = tk.Frame(content_frame, bg="#F2F2F2")
frame_type_plafond = tk.Frame(content_frame, bg="#F2F2F2")

niveau_callbacks = {
    frame_murs: appliquer_filtre_niveau_murs,
    frame_menuiseries: appliquer_filtre_niveau_menuiseries,
    frame_type_sol: appliquer_filtre_niveau_type_sol,
    frame_garde_corps: appliquer_filtre_niveau_garde_corps,
    frame_poteaux: appliquer_filtre_niveau_poteaux,
    frame_poutres: appliquer_filtre_niveau_poutres,
    frame_descente_ep: appliquer_filtre_niveau_ep,
}

def open_filtre_niveau_global():
    cb = niveau_callbacks.get(current_frame)
    if cb:
        open_filtre_niveau(btn_niveau_global, cb)

def update_niveau_button_state():
    if current_frame in niveau_callbacks:
        btn_niveau_global.config(state="normal")
    else:
        btn_niveau_global.config(state="disabled")

print("Frames principaux créés")
current_frame = frame_accueil

def show_frame(frame) :
    global current_frame
    if current_frame :
        current_frame.pack_forget()
    current_frame = frame
    current_frame.pack(expand=True, fill="both")
    update_niveau_button_state()

btn_accueil = create_nav_button("🏠", "PAGE ACCUEIL", lambda : show_frame(frame_accueil), "Retour à la page d'accueil du logiciel.")
tk.Frame(sidebar_frame, height=2, bg="#ECEFF1").pack(fill="x", padx=2, pady=5)
create_nav_button("🏛️", "MURS", lambda: show_frame(frame_murs), "Afficher les données des murs extraites du fichier IFC.")
create_nav_button("🪟", "MENUISERIES", lambda: show_frame(frame_menuiseries), "Afficher les données des menuiseries (fenêtres et portes).")
create_nav_button("🏠", "TYPE DE SOL", lambda: show_frame(frame_type_sol), "Afficher les données des revêtements de sol.")
create_nav_button("🛡️", "GARDE CORPS", lambda: show_frame(frame_garde_corps), "Afficher les données des garde-corps.")
create_nav_button("📐", "POTEAUX",  lambda: (afficher_donnees_poteaux(), show_frame(frame_poteaux)), "Afficher les données des poteaux.")
create_nav_button("🧱", "POUTRES", lambda: (afficher_donnees_poutres(), show_frame(frame_poutres)), "Afficher les données des poutres.")
create_nav_button("💧", "DESCENTE EP", lambda: show_frame(frame_descente_ep), "Descente EP")
create_nav_button("🪜", "ESCALIER", lambda: (afficher_donnees_escaliers(donnees_ifc.get(ifc_actif, {}).get("escaliers", [])), show_frame(frame_escalier)), "Escalier")
create_nav_button("🎲", "BORD DE DALLE", lambda: (afficher_donnees_bord_dalle(), show_frame(frame_bord_dalle)), "Afficher les données de bord de dalle.")
create_nav_button("🔲", "TYPE DE PLAFOND", lambda: (afficher_donnees_type_plafond(), show_frame(frame_type_plafond)), "Afficher les données de type de plafond.")
set_selected(btn_accueil)
update_niveau_button_state()

def rechercher_onglet(event=None):
    """Recherche dans tous les onglets et affiche celui contenant le mot-clé."""
    keyword = search_entry_header.get().strip()
    if not keyword or keyword == "🔍 Recherche":
        return
    key_lower = keyword.lower()
    targets = [
        ("MURS", donnees_ifc.get(ifc_actif, {}).get("murs", []),
         entree_filtre_murs, appliquer_filtre_murs, frame_murs),
        ("MENUISERIES", donnees_ifc.get(ifc_actif, {}).get("menuiseries", []),
         entree_filtre_menuiseries, appliquer_filtre_menuiseries, frame_menuiseries),
        ("TYPE DE SOL", donnees_ifc.get(ifc_actif, {}).get("sols", []),
         entree_filtre_type_sol, appliquer_filtre_type_sol, frame_type_sol),
        ("GARDE CORPS", donnees_ifc.get(ifc_actif, {}).get("garde_corps", []),
         entree_filtre_garde_corps, appliquer_filtre_garde_corps, frame_garde_corps),
        ("POTEAUX", donnees_ifc.get(ifc_actif, {}).get("poteaux", []),
         entree_filtre_poteaux, appliquer_filtre_poteaux, frame_poteaux),
        ("POUTRES", donnees_ifc.get(ifc_actif, {}).get("poutres", []),
         entree_filtre_poutres, appliquer_filtre_poutres, frame_poutres),
        ("DESCENTE EP", donnees_ifc.get(ifc_actif, {}).get("descente_ep", []),
         entree_filtre_ep, appliquer_filtre_ep, frame_descente_ep),
        ("ESCALIER", donnees_ifc.get(ifc_actif, {}).get("escaliers", []),
         entree_filtre_escalier, appliquer_filtre_escalier, frame_escalier),
        ("BORD DE DALLE", donnees_ifc.get(ifc_actif, {}).get("bords_dalle", []),
         entree_filtre_bord_dalle, appliquer_filtre_bord_dalle, frame_bord_dalle),
        ("TYPE DE PLAFOND", donnees_ifc.get(ifc_actif, {}).get("plafonds", []),
         entree_filtre_type_plafond, appliquer_filtre_type_plafond, frame_type_plafond),
    ]

    for label, data, entry, apply_func, frame in targets:
        for row in data:
            if key_lower in " ".join(str(v).lower() for v in row):
                entry.delete(0, tk.END)
                entry.insert(0, keyword)
                apply_func()
                for b in nav_buttons:
                    if b.cget("text") == label:
                        set_selected(b)
                        break
                show_frame(frame)
                entry.focus_set()
                return
    messagebox.showinfo("Recherche", "Aucun résultat trouvé.")
# → Cacher les onglets IFC tant qu’aucun fichier n’est importé
hidden_nav_buttons = nav_buttons[1:]  # les 4 onglets MURS/MENUISERIES/…
for btn in hidden_nav_buttons:
    # btn.master.master == le Frame qui contient le bouton
    btn.master.master.pack_forget()

print("Boutons de navigation créés")

frame_accueil_content = tk.Frame(frame_accueil, bg="#F2F2F2")
frame_accueil_content.pack(expand=True, fill="both", padx=10, pady=10)
accueil_canvas = tk.Canvas(
    frame_accueil_content,
    bg="#F2F2F2",
    highlightthickness=0,
    width=360,
    height=220,
)
accueil_canvas.place(relx=0.5, rely=0.5, anchor="center")
create_rounded_rectangle(
    accueil_canvas,
    0,
    0,
    360,
    220,
    radius=20,
    fill="#004D40",
    outline="#004D40",
)
center_container = tk.Frame(accueil_canvas, bg="#004D40")
accueil_canvas.create_window(180, 110, window=center_container)

label_titre_accueil = tk.Label(
    center_container,
    text="Bienvenue sur IFC Analyzer",
    font=("Helvetica", 18, "bold"),
    bg="#004D40",
    fg="white",
)
label_titre_accueil.pack(pady=(0, 10))
tk.Label(
    center_container,
    text="📁 Formats supportés : .IFC",
    font=("Helvetica", 12),
    bg="#004D40",
    fg="white",
).pack(pady=(0, 20))
label_surface_coffrage_totale = tk.Label(
    center_container,
    text="Surface de coffrage totale : 0.00 m²",
    font=("Helvetica", 12),
    bg="#004D40",
    fg="white",
)
# label_surface_coffrage_totale.pack(pady=10)
import_btn_canvas = tk.Canvas(
    center_container,
    bg="#004D40",
    highlightthickness=0,
    width=200,
    height=40,
)
import_btn_canvas.pack(pady=10)
create_rounded_rectangle(
    import_btn_canvas,
    0,
    0,
    200,
    40,
    radius=20,
    fill="#004D40",
    outline="black",
    width=2,
)
btn_importer_ifc = tk.Button(
    import_btn_canvas,
    text="📂 Sélectionner un fichier",
    command=importer_ifc,
    font=("Helvetica", 12, "bold"),
    bg="#004D40",
    fg="white",
    bd=0,
    activebackground="#004D40",
    activeforeground="white",
)
import_btn_canvas.create_window(100, 20, window=btn_importer_ifc)
print("Cadre d'accueil configuré")

frame_murs_content = tk.Frame(frame_murs, bg="#F2F2F2")
frame_murs_content.pack(side="left", expand=True, fill="both", padx=(0, 10))
frame_filtre_murs = tk.Frame(frame_murs_content, bg="#FFFFFF", bd=1, relief="solid")
# frame_filtre_murs.pack(fill="x", padx=10, pady=10)
tk.Label(frame_filtre_murs, text="🔎 Filtrer :", bg="#FFFFFF").pack(side="left", padx=5)
entree_filtre_murs = tk.Entry(frame_filtre_murs, width=40)
entree_filtre_murs.pack(side="left", padx=5)
btn_niveau_murs = None
print("Cadre de filtrage des murs créé")

tree_murs = ttk.Treeview(frame_murs_content, columns=("Nom", "Surface (m²)", "Longueur ", "Volume (m³)", "Type"), show="headings")
for col in ("Nom", "Surface (m²)", "Longueur ", "Volume (m³)", "Type") :
    tree_murs.heading(col, text=col)
# Définir des largeurs minimales et permettre l'étirement proportionnel
tree_murs.column("Nom", anchor="center", width=70, minwidth=70, stretch=True)
tree_murs.column("Surface (m²)", anchor="center", width=40, minwidth=40, stretch=True)
tree_murs.column("Longueur ", anchor="center", width=40, minwidth=40, stretch=True)
tree_murs.column("Volume (m³)", anchor="center", width=40, minwidth=40, stretch=True)
tree_murs.column("Type", anchor="center", width=40, minwidth=40, stretch=True)
tree_murs.tag_configure("evenrow", background="#F2F2F2")
tree_murs.tag_configure("oddrow", background="#FFFFFF")
tree_murs.tag_configure("redrow", background="#EF9A9A")
scroll_murs = ttk.Scrollbar(frame_murs_content, orient="vertical", command=tree_murs.yview)
tree_murs.configure(yscrollcommand=scroll_murs.set)
tree_murs.pack(side="left", expand=True, fill="both", padx=(10, 0), pady=10)
scroll_murs.pack(side="right", fill="y")
print("Arborescence des murs créée")

# --- Onglet ESCALIER (clone de MURS) ---
frame_escalier_content = tk.Frame(frame_escalier, bg="#F2F2F2")
frame_escalier_content.pack(side="left", expand=True, fill="both", padx=(0, 10))
frame_filtre_escalier = tk.Frame(frame_escalier_content, bg="#FFFFFF", bd=1, relief="solid")
# frame_filtre_escalier.pack(fill="x", padx=10, pady=10)
tk.Label(frame_filtre_escalier, text="🔎 Filtrer :", bg="#FFFFFF").pack(side="left", padx=5)
entree_filtre_escalier = tk.Entry(frame_filtre_escalier, width=40)
entree_filtre_escalier.pack(side="left", padx=5)
print("Cadre de filtrage des escaliers créé")

tree_escalier = ttk.Treeview(frame_escalier_content, columns=("Nom", "HT volée", "HT contremarches", "NB contremarches", "NB marches"), show="headings")
for col in ("Nom", "HT volée", "HT contremarches", "NB contremarches", "NB marches"):
    tree_escalier.heading(col, text=col)
tree_escalier.column("Nom", anchor="center", width=70, minwidth=70, stretch=True)
tree_escalier.column("HT volée", anchor="center", width=80, minwidth=80, stretch=True)
tree_escalier.column("HT contremarches", anchor="center", width=80, minwidth=80, stretch=True)
tree_escalier.column("NB contremarches", anchor="center", width=80, minwidth=80, stretch=True)
tree_escalier.column("NB marches", anchor="center", width=80, minwidth=80, stretch=True)
tree_escalier.tag_configure("evenrow", background="#F2F2F2")
tree_escalier.tag_configure("oddrow", background="#FFFFFF")
scroll_escalier = ttk.Scrollbar(frame_escalier_content, orient="vertical", command=tree_escalier.yview)
tree_escalier.configure(yscrollcommand=scroll_escalier.set)
tree_escalier.pack(side="left", expand=True, fill="both", padx=(10, 0), pady=10)
scroll_escalier.pack(side="right", fill="y")
print("Arborescence des escaliers créée")

# --- Onglet BORD DE DALLE -----------------------------------------------------
frame_bord_dalle_content = tk.Frame(frame_bord_dalle, bg="#F2F2F2")
frame_bord_dalle_content.pack(side="left", expand=True, fill="both", padx=(0, 10))

# Barre de filtre
frame_filtre_bord_dalle = tk.Frame(frame_bord_dalle_content, bg="#FFFFFF", bd=1, relief="solid")
# frame_filtre_bord_dalle.pack(fill="x", padx=10, pady=10)
tk.Label(frame_filtre_bord_dalle, text="🔎 Filtrer :", bg="#FFFFFF").pack(side="left", padx=5)
entree_filtre_bord_dalle = tk.Entry(frame_filtre_bord_dalle, width=40)
entree_filtre_bord_dalle.pack(side="left", padx=5)
btn_reset_bord_dalle = None

# Tableau principal
tree_bord_dalle = ttk.Treeview(
    frame_bord_dalle_content,
    columns=("Nom", "Longueur ", "Type"),
    show="headings"
)
for col, anchor, width in [
    ("Nom", "w", 200),
    ("Longueur ", "e", 100),
    ("Type", "center", 100)
]:

    tree_bord_dalle.heading(col, text=col)
    tree_bord_dalle.column(col, anchor=anchor, width=width)
tree_bord_dalle.tag_configure("evenrow", background="#F2F2F2")
tree_bord_dalle.tag_configure("oddrow",  background="#FFFFFF")
scroll_bord_dalle = ttk.Scrollbar(frame_bord_dalle_content, orient="vertical", command=tree_bord_dalle.yview)
tree_bord_dalle.configure(yscrollcommand=scroll_bord_dalle.set)
tree_bord_dalle.pack(side="left", expand=True, fill="both", padx=(10, 0), pady=10)
scroll_bord_dalle.pack(side="right", fill="y")

# Panneau résumé à droite
frame_resume_bord_dalle = tk.Frame(frame_bord_dalle, bg="white", width=650)
frame_resume_bord_dalle.pack(side="right", fill="y", padx=10, pady=10)
frame_resume_bord_dalle.pack_propagate(False)

# Titre résumé
title_frame_resume_bord_dalle = tk.Frame(frame_resume_bord_dalle, bg="#004D40")
title_frame_resume_bord_dalle.pack(fill="x", padx=5, pady=(5,0))
tk.Label(title_frame_resume_bord_dalle, text="RÉSUMÉ", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)

# Section général
general_frame_bord_dalle = tk.Frame(frame_resume_bord_dalle, bg="white", bd=1, relief="solid")
general_frame_bord_dalle.pack(fill="x", padx=5, pady=5)
grid_resume_bord_dalle = tk.Frame(general_frame_bord_dalle, bg="white")
grid_resume_bord_dalle.pack(pady=5)
grid_resume_bord_dalle.grid_columnconfigure(1, weight=1)
# Longueur totale
tk.Label(grid_resume_bord_dalle, text="📏 Longueur totale :", bg="white", font=("Helvetica", 10)).grid(row=0, column=0, sticky="w", padx=10)
label_longueur_totale_bord_dalle = tk.Label(grid_resume_bord_dalle, text="0.00 ml", bg="white", font=("Helvetica", 10, "bold"))
label_longueur_totale_bord_dalle.grid(row=0, column=1, sticky="e", padx=10)

# Titre informations complémentaires
types_frame_bord_dalle = tk.Frame(frame_resume_bord_dalle, bg="white", bd=1, relief="solid")
types_frame_bord_dalle.pack(fill="x", padx=5, pady=5)
data_frame_types_bord_dalle = tk.Frame(types_frame_bord_dalle, bg="white")
data_frame_types_bord_dalle.pack(fill="both", padx=5, pady=5)

tree_longueurs_par_type_bord_dalle = ttk.Treeview(
    data_frame_types_bord_dalle,
    columns=("Type de Bord de Dalle", "ml "),
    show="headings",
    height=8,
    style="Summary.Treeview"
)
tree_longueurs_par_type_bord_dalle.configure(style="Summary.Treeview")
tree_longueurs_par_type_bord_dalle.heading("Type de Bord de Dalle", text="Type de Bord de Dalle")
tree_longueurs_par_type_bord_dalle.heading("ml ", text="ml ")
tree_longueurs_par_type_bord_dalle.column("Type de Bord de Dalle", anchor="w", width=400, stretch=True)
tree_longueurs_par_type_bord_dalle.column("ml ", anchor="e", width=120, stretch=False)
tree_longueurs_par_type_bord_dalle.tag_configure("evenrow", background="white")
tree_longueurs_par_type_bord_dalle.tag_configure("oddrow", background="white")

scroll_types_bord_dalle = ttk.Scrollbar(data_frame_types_bord_dalle, orient="vertical", command=tree_longueurs_par_type_bord_dalle.yview)
tree_longueurs_par_type_bord_dalle.configure(yscrollcommand=scroll_types_bord_dalle.set)
tree_longueurs_par_type_bord_dalle.pack(side="left", expand=True, fill="both", padx=(5,0), pady=5)
scroll_types_bord_dalle.pack(side="right", fill="y", pady=5)

# Bindings et menu contextuel
tree_longueurs_par_type_bord_dalle.bind("<Double-1>", filter_main_by_type_bord_dalle)
tree_longueurs_par_type_bord_dalle.bind("<Button-1>", copy_type_summary_bord_dalle)
context_menu_bord_dalle = tk.Menu(root, tearoff=0)
context_menu_bord_dalle.add_command(label="Copier", command=copy_type_summary_bord_dalle)
tree_longueurs_par_type_bord_dalle.bind("<Button-3>", lambda e: (
    tree_longueurs_par_type_bord_dalle.selection_set(tree_longueurs_par_type_bord_dalle.identify_row(e.y)),
    context_menu_bord_dalle.post(e.x_root, e.y_root)
))


# Titre informations complémentaires (moved below tableau résumé)
title_frame_types_bord_dalle = tk.Frame(frame_resume_bord_dalle, bg="#004D40")
title_frame_types_bord_dalle.pack(fill="x", padx=5, pady=(15,0))
tk.Label(title_frame_types_bord_dalle, text="INFORMATIONS COMPLÉMENTAIRES", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)

print("UI BORD DE DALLE créée")


# Bloc Résumé escalier
frame_resume_escalier = tk.Frame(frame_escalier, bg="white", width=650)
frame_resume_escalier.pack(side="right", fill="y", padx=10, pady=10)
frame_resume_escalier.pack_propagate(False)
title_frame_resume_escalier = tk.Frame(frame_resume_escalier, bg="#004D40")
title_frame_resume_escalier.pack(fill="x", padx=5, pady=(5,0))
tk.Label(title_frame_resume_escalier, text="RÉSUMÉ", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)
general_frame_escalier = tk.Frame(frame_resume_escalier, bg="white", bd=1, relief="solid")
general_frame_escalier.pack(fill="x", padx=5, pady=5)
grid_resume_escalier = tk.Frame(general_frame_escalier, bg="white")
grid_resume_escalier.pack(pady=5)
grid_resume_escalier.grid_columnconfigure(1, weight=1)
# Hauteur totale
tk.Label(grid_resume_escalier, text="Hauteur totale :", bg="#FFFFFF").grid(row=0, column=0, sticky="w", padx=5, pady=2)
hauteur_total = sum(e[1] for e in donnees_ifc.get(ifc_actif, {}).get("escaliers", []))
tk.Label(grid_resume_escalier, text=f"{hauteur_total:.2f}", bg="#FFFFFF").grid(row=0, column=1, sticky="e", padx=5, pady=2)
# Nombre total de marches
tk.Label(grid_resume_escalier, text="Nombre total de marches :", bg="#FFFFFF").grid(row=1, column=0, sticky="w", padx=5, pady=2)
nb_total_marches = sum(e[4] for e in donnees_ifc.get(ifc_actif, {}).get("escaliers", []))
tk.Label(grid_resume_escalier, text=str(nb_total_marches), bg="#FFFFFF").grid(row=1, column=1, sticky="e", padx=5, pady=2)

frame_resume_murs = tk.Frame(frame_murs, bg="white", width=650)
frame_resume_murs.pack(side="right", fill="y", padx=10, pady=10)
frame_resume_murs.pack_propagate(False)
title_frame_resume_murs = tk.Frame(frame_resume_murs, bg="#004D40")
title_frame_resume_murs.pack(fill="x", padx=5, pady=(5,0))
tk.Label(title_frame_resume_murs, text="RÉSUMÉ", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)
general_frame = tk.Frame(frame_resume_murs, bg="#FFFFFF", bd=2, relief="groove")
general_frame.pack(fill="x", padx=5, pady=5)
grid_resume_murs = tk.Frame(general_frame, bg="#FFFFFF")
grid_resume_murs.pack(pady=5)
grid_resume_murs.grid_columnconfigure(1, weight=1)
grid_resume_murs.grid_columnconfigure(3, weight=1)

# Titre Filtrage par noms
title_frame_filtrage_murs = tk.Frame(frame_resume_murs, bg="#004D40")
title_frame_filtrage_murs.pack(fill="x", padx=5, pady=(15,0))
tk.Label(title_frame_filtrage_murs, text="FILTRAGE PAR NOMS", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)
types_frame = tk.Frame(frame_resume_murs, bg="#FFFFFF", bd=2, relief="groove")
types_frame.pack(fill="both", padx=5, pady=5, expand=True)
title_frame_types_murs = tk.Frame(frame_resume_murs, bg="#004D40")
title_frame_types_murs.pack(fill="x", padx=5, pady=(15, 0))

# ----- Conteneur INFORMATIONS COMPLÉMENTAIRES pour MURS -----
info_frame_murs = tk.Frame(frame_resume_murs, bg="#FFFFFF", bd=2, relief="groove")
info_frame_murs.pack(fill="x", padx=5, pady=5)
grid_infos_murs = tk.Frame(info_frame_murs, bg="#FFFFFF")
grid_infos_murs.pack(pady=5, fill="x")
grid_infos_murs.grid_columnconfigure(1, weight=1)
grid_infos_murs.grid_columnconfigure(0, weight=1)

tk.Label(title_frame_types_murs, text="INFORMATIONS COMPLÉMENTAIRES", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)



canvas_grid_types_murs = tk.Canvas(
    types_frame,
    bg="#FFFFFF",
    highlightthickness=0,
    height=150
)
canvas_grid_types_murs.pack(side="top", fill="x", expand=False, padx=(5, 0), pady=5)
# 👉 cacher le canvas tant qu’il est vide pour éviter le trou
canvas_grid_types_murs.pack_forget()




# ---- Treeview complémentaire pour MURS --------------------------------------
data_frame_types_murs = tk.Frame(types_frame, bg="#FFFFFF")
data_frame_types_murs.pack(fill="both", padx=5, pady=5, expand=True)

tree_surfaces_murs = ttk.Treeview(data_frame_types_murs, columns=("Type", "m²"), show="headings", height=8)
tree_surfaces_murs.configure(style="Green.Treeview")
tree_surfaces_murs.heading("Type", text="Type")
tree_surfaces_murs.heading("m²", text="m²")
tree_surfaces_murs.column("Type", anchor="w", width=500, stretch=True)
tree_surfaces_murs.column("m²", anchor="e", width=80, stretch=False)
tree_surfaces_murs.tag_configure("evenrow", background="#FFFFFF")
tree_surfaces_murs.tag_configure("oddrow", background="#FFFFFF")
scroll_surfaces_murs = ttk.Scrollbar(data_frame_types_murs, orient="vertical", command=tree_surfaces_murs.yview)
tree_surfaces_murs.configure(yscrollcommand=scroll_surfaces_murs.set)
tree_surfaces_murs.pack(side="left", fill="both", expand=True, padx=(5, 0), pady=5)
scroll_surfaces_murs.pack(side="right", fill="y")

# ---- Bindings copier / double‑clic ------------------------------------------
def copy_type_summary_murs(event=None):
    sel = tree_surfaces_murs.selection()
    if sel:
        text_to_copy = "\n".join(["\t".join(map(str, tree_surfaces_murs.item(i)["values"])) for i in sel])
        root.clipboard_clear()
        root.clipboard_append(text_to_copy)

def filter_main_by_type_murs(event=None):
    row_id = tree_surfaces_murs.selection()
    if row_id:
        type_sel = tree_surfaces_murs.item(row_id[0])['values'][0]
        murs_filtres = [mur for mur in donnees_ifc[ifc_actif]["murs"]
                        if mur[4] == type_sel or mur[0] == type_sel]
        # Si aucune donnée ne correspond (par ex. surface = 0), on garde la liste complète
        if murs_filtres:
            afficher_donnees_murs(murs_filtres)
        else:
            afficher_donnees_murs(donnees_ifc[ifc_actif]["murs"])
tree_surfaces_murs.bind("<Double-1>", filter_main_by_type_murs)
tree_surfaces_murs.bind("<Button-1>", copy_type_summary_murs)
tree_surfaces_murs.bind("<<TreeviewSelect>>", afficher_infos_mur_resume)
context_menu_surfaces_murs = tk.Menu(root, tearoff=0)
context_menu_surfaces_murs.add_command(label="Copier", command=copy_type_summary_murs)
tree_surfaces_murs.bind("<Button-3>", lambda e: (tree_surfaces_murs.selection_set(tree_surfaces_murs.identify_row(e.y)), context_menu_surfaces_murs.post(e.x_root, e.y_root)))
# -----------------------------------------------------------------------------
grid_types_murs = tk.Frame(canvas_grid_types_murs, bg="white")
grid_types_murs.grid_columnconfigure(0, weight=1)
canvas_grid_types_murs.create_window((0, 0), window=grid_types_murs, anchor="nw")

def on_configure_grid_types_murs(event):
    canvas_grid_types_murs.configure(scrollregion=canvas_grid_types_murs.bbox("all"))

grid_types_murs.bind("<Configure>", on_configure_grid_types_murs)

def hide_infos_murs():
    """Masque le bloc d'informations complémentaires."""
    for w in grid_infos_murs.winfo_children():
        w.destroy()

def _update_infos_mur(nom_sel: str, storey: str = None):
    """Affiche les informations complémentaires pour le mur donné."""
    hide_infos_murs()
    infos = donnees_ifc.get(ifc_actif, {}).get("murs_infos", {})
    info = {}
    if storey is not None:
        info = infos.get((nom_sel, storey), {})
        if not info:
            for (n, s), data in infos.items():
                if n == nom_sel:
                    info = data
                    break

    storeys = sorted({s for (n, s) in infos if n == nom_sel and s})
    mapping = [
        ("Fonction", "Fonction"),
        ("Largeur", "Largeur"),
        ("Hauteur non contrainte", "Hauteur non contrainte"),
        ("Matériau structurel", "Matériau structurel"),
        ("IsExternal", "Extérieur"),
    ]
    for row, (key, label) in enumerate(mapping):
        val = info.get(key, "")
        if val in (None, "None"):
            val = ""
        elif isinstance(val, (int, float)):
            val = f"{val:.2f}"
        else:
            try:
                val = f"{float(val):.2f}"
            except (TypeError, ValueError):
                val = str(val) if val is not None else ""
        if key == "IsExternal" and val not in ("", "N/A"):
            val = "Oui" if str(val).lower() in ("true", "1", "yes", "oui") else "Non"
        tk.Label(grid_infos_murs, text=f"{label} :", bg="#FFFFFF", anchor="w").grid(row=row, column=0, sticky="w", padx=10)
        tk.Label(grid_infos_murs, text=str(val), bg="#FFFFFF", anchor="e").grid(row=row, column=1, sticky="e", padx=10)
    # Gestion des niveaux multiples
    label = "Niveau" if len(storeys) <= 1 else "Niveaux"
    valeur = " - ".join(storeys) if storeys else "N/A"
    row = len(mapping)
    tk.Label(grid_infos_murs, text=f"{label} :", bg="#FFFFFF", anchor="w").grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_infos_murs, text=valeur, bg="#FFFFFF", anchor="e").grid(row=row, column=1, sticky="e", padx=10)


def _update_resume_mur(nom_sel: str):
    """Met à jour le résumé pour le mur sélectionné."""
    # Utiliser uniquement les murs actuellement visibles (après filtres)
    murs_source = [m for m in _get_filtered_murs() if m[0] == nom_sel]
    if not murs_source:
        return
    surface_menuiseries_tot = _calc_surface_menuiseries(murs_source)
    longueur_totale = volume_total = surface_totale = 0.0
    surface_cloisons = surface_murs = 0.0
    for nom, surface, longueur, volume, _mur_type, _ in murs_source:
        longueur_totale += longueur
        volume_total += volume
        surface_totale += surface
        if "cloison" in nom.lower():
            surface_cloisons += surface
        else:
            surface_murs += surface
    surface_nette = max(surface_totale - surface_menuiseries_tot, 0.0)
    for w in grid_resume_murs.winfo_children():
        w.destroy()
    left_row = right_row = 0
    tk.Label(grid_resume_murs, text="📏 Longueur :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(longueur_totale, " ml"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1
    tk.Label(grid_resume_murs, text="📦 Volume :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(volume_total, " m³"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1
    tk.Label(grid_resume_murs, text="📐 Surface brute :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(surface_totale, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1
    tk.Label(grid_resume_murs, text="📏 Surface nette :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(surface_nette, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1

    surface_murs_nette = surface_cloisons_nette = 0.0
    if surface_totale > 0:
        ratio_murs = surface_murs / surface_totale
        ratio_cloisons = surface_cloisons / surface_totale
        surface_murs_nette = max(surface_murs - surface_menuiseries_tot * ratio_murs, 0.0)
        surface_cloisons_nette = max(surface_cloisons - surface_menuiseries_tot * ratio_cloisons, 0.0)

    tk.Label(grid_resume_murs, text="🧱 Surface murs :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(surface_murs, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)
    right_row += 1
    tk.Label(grid_resume_murs, text="🧱 Surface murs nette :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(surface_murs_nette, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)
    right_row += 1
    tk.Label(grid_resume_murs, text="🏢 Surface de cloisons :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(surface_cloisons, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)
    right_row += 1
    tk.Label(grid_resume_murs, text="🏢 Surface de cloisons nette :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
    tk.Label(grid_resume_murs, text=_format_summary_value(surface_cloisons_nette, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)


def afficher_infos_mur(event=None):
    """Affiche les informations complémentaires pour la sélection du tableau principal."""
    sel = tree_murs.selection()
    if not sel:
        hide_infos_murs()
        return
    values = tree_murs.item(sel[0])["values"]
    nom_sel = values[0]
    try:
        surface = float(values[1])
        longueur = float(values[2])
        volume = float(values[3])
    except (ValueError, TypeError):
        surface = longueur = volume = 0.0
    mur_type = values[4]
    storey = None
    for m in donnees_ifc.get(ifc_actif, {}).get("murs", []):
        if (
            m[0] == nom_sel
            and abs(m[1] - surface) < 0.01
            and abs(m[2] - longueur) < 0.01
            and abs(m[3] - volume) < 0.01
            and m[4] == mur_type
        ):
            storey = m[5]
            break
    _update_infos_mur(nom_sel, storey)
    _update_resume_mur(nom_sel)


def afficher_infos_mur_resume(event=None):
    """Affiche les informations lors de la sélection dans le résumé."""
    sel = tree_surfaces_murs.selection()
    if not sel:
        hide_infos_murs()
        return
    nom_sel = tree_surfaces_murs.item(sel[0])["values"][0]
    _update_infos_mur(nom_sel)
    _update_resume_mur(nom_sel)

tree_murs.bind("<<TreeviewSelect>>", afficher_infos_mur)

# --- Afficher / masquer dynamiquement le canvas suivant son contenu -------------
def refresh_canvas_grid_types_murs():
    """Montre le canvas uniquement s’il a des enfants (données à afficher)."""
    if grid_types_murs.winfo_children():
        if not canvas_grid_types_murs.winfo_ismapped():
            canvas_grid_types_murs.pack(side="top", fill="x", expand=False, padx=(5, 0), pady=5)
    else:
        if canvas_grid_types_murs.winfo_ismapped():
            canvas_grid_types_murs.pack_forget()

# Activation du scroll vertical à la molette de la souris
canvas_grid_types_murs.bind("<MouseWheel>", lambda event: canvas_grid_types_murs.yview_scroll(int(-1*(event.delta/120)), "units"))
# Support du scroll souris Linux
canvas_grid_types_murs.bind("<Button-4>", lambda event: canvas_grid_types_murs.yview_scroll(-1, "units"))
canvas_grid_types_murs.bind("<Button-5>", lambda event: canvas_grid_types_murs.yview_scroll(1, "units"))

print("Cadre de résumé des murs créés")

frame_menuiseries_content = tk.Frame(frame_menuiseries, bg="#F2F2F2")
frame_menuiseries_content.pack(side="left", expand=True, fill="both", padx=(0, 10))
frame_filtre_menuiseries = tk.Frame(frame_menuiseries_content, bg="#FFFFFF", bd=1, relief="solid")
# frame_filtre_menuiseries.pack(fill="x", padx=10, pady=10)
tk.Label(frame_filtre_menuiseries, text="🔎 Filtrer :", bg="#FFFFFF").pack(side="left", padx=5)
entree_filtre_menuiseries = tk.Entry(frame_filtre_menuiseries, width=40)
entree_filtre_menuiseries.pack(side="left", padx=5)
btn_niveau_menuiseries = None
print("Cadre de filtrage des menuiseries créées")

tree_menuiseries = ttk.Treeview(frame_menuiseries_content, columns=("Nom", "Surface (m²)", "Longueur ", "Hauteur (m)", "Type"), show="headings")
for col in ("Nom", "Surface (m²)", "Longueur ", "Hauteur (m)", "Type") :
    tree_menuiseries.heading(col, text=col)
# Définir des largeurs minimales identiques à celles de l'onglet "MURS"
tree_menuiseries.column("Nom", anchor="center", width=70, minwidth=70, stretch=True)
tree_menuiseries.column("Surface (m²)", anchor="center", width=40, minwidth=40, stretch=True)
tree_menuiseries.column("Longueur ", anchor="center", width=40, minwidth=40, stretch=True)
tree_menuiseries.column("Hauteur (m)", anchor="center", width=40, minwidth=40, stretch=True)
tree_menuiseries.column("Type", anchor="center", width=40, minwidth=40, stretch=True)
tree_menuiseries.tag_configure("evenrow", background="#F2F2F2")
tree_menuiseries.tag_configure("oddrow", background="#FFFFFF")
scroll_menuiseries = ttk.Scrollbar(frame_menuiseries_content, orient="vertical", command=tree_menuiseries.yview)
tree_menuiseries.configure(yscrollcommand=scroll_menuiseries.set)
tree_menuiseries.pack(side="left", expand=True, fill="both", padx=(10, 0), pady=10)
scroll_menuiseries.pack(side="right", fill="y")
print("Arborescence des menuiseries créées")

frame_resume_menuiseries = tk.Frame(frame_menuiseries, bg="white", width=650) # Même largeur que "MURS"
frame_resume_menuiseries.pack(side="right", fill="y", padx=10, pady=10)
frame_resume_menuiseries.pack_propagate(False)
title_frame_resume_menuiseries = tk.Frame(frame_resume_menuiseries, bg="#004D40")
title_frame_resume_menuiseries.pack(fill="x", padx=5, pady=(5,0))
tk.Label(title_frame_resume_menuiseries, text="RÉSUMÉ", font=("Helvetica", 12, "bold"), bg="#004D40", fg="white").pack(pady=5)
general_frame_menuiseries = tk.Frame(frame_resume_menuiseries, bg="#FFFFFF", bd=2, relief="groove")
general_frame_menuiseries.pack(fill="x", padx=5, pady=5)
grid_resume_menuiseries = tk.Frame(general_frame_menuiseries, bg="#FFFFFF")
grid_resume_menuiseries.pack(pady=5)
grid_resume_menuiseries.grid_columnconfigure(1, weight=1)
grid_resume_menuiseries.grid_columnconfigure(3, weight=1)

# Section Filtrage par noms (mimique de l'onglet MURS)
title_frame_filtrage_menuiseries = tk.Frame(frame_resume_menuiseries, bg="#004D40")
title_frame_filtrage_menuiseries.pack(fill="x", padx=5, pady=(15, 0))
tk.Label(title_frame_filtrage_menuiseries, text="FILTRAGE PAR NOMS", font=("Helvetica", 12, "bold"), bg="#004D40", fg="white").pack(pady=5)
types_frame_menuiseries = tk.Frame(frame_resume_menuiseries, bg="#FFFFFF", bd=2, relief="groove")
types_frame_menuiseries.pack(fill="both", padx=5, pady=5, expand=True)


# ---- Treeview complémentaire pour MENUISERIES -------------------------------
data_frame_types_menuiseries = tk.Frame(types_frame_menuiseries, bg="#FFFFFF")
data_frame_types_menuiseries.pack(fill="both", expand=True, padx=5, pady=5)

tree_surfaces_menuiseries = ttk.Treeview(data_frame_types_menuiseries, columns=("Type", "U"), show="headings")
for col in ("Type", "U"):
    tree_surfaces_menuiseries.configure(style="Green.Treeview")
    tree_surfaces_menuiseries.heading(col, text=col)
tree_surfaces_menuiseries.column("Type", anchor="w", width=200)
tree_surfaces_menuiseries.column("U", anchor="e", width=40, stretch=False)
tree_surfaces_menuiseries.tag_configure("evenrow", background="#FFFFFF")
tree_surfaces_menuiseries.tag_configure("oddrow", background="#FFFFFF")
scroll_surfaces_menuiseries = ttk.Scrollbar(data_frame_types_menuiseries, orient="vertical", command=tree_surfaces_menuiseries.yview)
tree_surfaces_menuiseries.configure(yscrollcommand=scroll_surfaces_menuiseries.set)
tree_surfaces_menuiseries.pack(side="left", fill="both", expand=True, padx=(5, 0), pady=5)
scroll_surfaces_menuiseries.pack(side="right", fill="y")

def copy_type_summary_menuiseries(event=None):
    sel = tree_surfaces_menuiseries.selection()
    if sel:
        text_to_copy = "\n".join(["\t".join(map(str, tree_surfaces_menuiseries.item(i)["values"])) for i in sel])
        root.clipboard_clear()
        root.clipboard_append(text_to_copy)

def filter_main_by_type_menuiseries(event=None):
    row_id = tree_surfaces_menuiseries.selection()
    if row_id:
        type_sel = tree_surfaces_menuiseries.item(row_id[0])['values'][0]
        menu_filtres = [m for m in donnees_ifc[ifc_actif]["menuiseries"] if m[0] == type_sel]
        afficher_donnees_menuiseries(menu_filtres)


tree_surfaces_menuiseries.bind("<Double-1>", filter_main_by_type_menuiseries)
tree_surfaces_menuiseries.bind("<Button-1>", copy_type_summary_menuiseries)
context_menu_surfaces_menuiseries = tk.Menu(root, tearoff=0)
context_menu_surfaces_menuiseries.add_command(label="Copier", command=copy_type_summary_menuiseries)
tree_surfaces_menuiseries.bind("<Button-3>", lambda e: (tree_surfaces_menuiseries.selection_set(tree_surfaces_menuiseries.identify_row(e.y)), context_menu_surfaces_menuiseries.post(e.x_root, e.y_root)))
# -----------------------------------------------------------------------------
grid_types_menuiseries_container = tk.Frame(types_frame_menuiseries, bg="#FFFFFF", bd=2, relief="groove")
# grid_types_menuiseries_container.pack(fill="x", padx=5, pady=5)  # removed empty frame
# Masquer par défaut le conteneur vide pour supprimer l\'espace inutile
grid_types_menuiseries_container.pack_forget()


canvas_grid_types_menuiseries = tk.Canvas(grid_types_menuiseries_container, bg="#FFFFFF", highlightthickness=0, height=150)
canvas_grid_types_menuiseries.pack(side="left", fill="x", expand=True, padx=(5, 0), pady=5)

scrollbar_grid_types_menuiseries = tk.Scrollbar(grid_types_menuiseries_container, orient="vertical", command=canvas_grid_types_menuiseries.yview)
scrollbar_grid_types_menuiseries.pack(side="right", fill="y", pady=5)

canvas_grid_types_menuiseries.configure(yscrollcommand=scrollbar_grid_types_menuiseries.set)

grid_types_menuiseries = tk.Frame(canvas_grid_types_menuiseries, bg="white")
grid_types_menuiseries.grid_columnconfigure(0, weight=1)
canvas_grid_types_menuiseries.create_window((0, 0), window=grid_types_menuiseries, anchor="nw")

def on_configure_grid_types_menuiseries(event):
    canvas_grid_types_menuiseries.configure(scrollregion=canvas_grid_types_menuiseries.bbox("all"))

grid_types_menuiseries.bind("<Configure>", on_configure_grid_types_menuiseries)

print("Frame de CV des menuiseries créées")


# --- Nouveau titre "INFORMATIONS COMPLÉMENTAIRES" sous le tableau MENUISERIES
title_frame_types_menuiseries_bottom = tk.Frame(frame_resume_menuiseries, bg="#004D40")
title_frame_types_menuiseries_bottom.pack(fill="x", padx=5, pady=(15, 0))
tk.Label(title_frame_types_menuiseries_bottom, text="INFORMATIONS COMPLÉMENTAIRES", font=("Helvetica", 12, "bold"), bg="#004D40", fg="white").pack(pady=5)
info_frame_menuiseries = tk.Frame(frame_resume_menuiseries, bg="#FFFFFF", bd=2, relief="groove")
info_frame_menuiseries.pack(fill="x", padx=5, pady=5)
grid_infos_menuiseries = tk.Frame(info_frame_menuiseries, bg="#FFFFFF")
grid_infos_menuiseries.pack(pady=5, fill="x")
grid_infos_menuiseries.grid_columnconfigure(1, weight=1)
grid_infos_menuiseries.grid_columnconfigure(0, weight=1)

def hide_infos_menuiseries():
    """Masque le bloc d'informations complémentaires."""
    for w in grid_infos_menuiseries.winfo_children():
        w.destroy()

def _update_infos_menuiseries(nom_sel: str, storey: str = None):
    """Affiche les informations complémentaires pour la menuiserie donnée."""
    hide_infos_menuiseries()
    infos = donnees_ifc.get(ifc_actif, {}).get("menuiseries_infos", {})
    info = {}
    if storey is not None:
        info = infos.get((nom_sel, storey), {})
        if not info:
            for (n, s), data in infos.items():
                if n == nom_sel:
                    info = data
                    break
    storeys = sorted({s for (n, s) in infos if n == nom_sel and s})
    mapping = [
        ("Cotes(Type)/Cadre_epaisseur", "Cadre épaisseur"),
        ("Cotes(Type)/Cadre_profondeur", "Cadre profondeur"),
        ("Données(Type)/COM_Codification type", "COM_Codification type"),
        ("Pset_WindowCommon/IsExternal", "Extérieur"),
        ("Données d'identification(Type)/Description", "Description"),
    ]
    row = 0
    for key, label in mapping:
        val = info.get(key, "")
        if val in (None, "None", ""):
            val = "N/A"
        else:
            if isinstance(val, (int, float)):
                val = f"{val:.2f}"
            else:
                try:
                    val = f"{float(val):.2f}"
                except (TypeError, ValueError):
                    pass
        if key == "Pset_WindowCommon/IsExternal" and val not in ("", "N/A"):
            val = "Oui" if str(val).lower() in ("true", "1", "yes", "oui") else "Non"
        tk.Label(grid_infos_menuiseries, text=f"{label} :", bg="#FFFFFF", anchor="w").grid(row=row, column=0, sticky="w", padx=10)
        tk.Label(grid_infos_menuiseries, text=str(val), bg="#FFFFFF", anchor="e").grid(row=row, column=1, sticky="e", padx=10)
        row += 1
    label = "Niveau" if len(storeys) <= 1 else "Niveaux"
    valeur = " - ".join(storeys) if storeys else "N/A"
    # row already incremented through mapping
    tk.Label(grid_infos_menuiseries, text=f"{label} :", bg="#FFFFFF", anchor="w").grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_infos_menuiseries, text=valeur, bg="#FFFFFF", anchor="e").grid(row=row, column=1, sticky="e", padx=10)

def _update_resume_menuiseries(nom_sel: str):
    """Met à jour le résumé pour la menuiserie sélectionnée."""
    menu_src = [m for m in _get_filtered_menuiseries() if m[0] == nom_sel]
    if not menu_src:
        return
    longueur_totale = surface_totale = surface_mint = surface_mext = embrasures = 0.0
    count = 0
    for nom, surface, longueur, hauteur, menu_type, *_ in menu_src:
        longueur_totale += longueur
        surface_totale += surface
        count += 1
        if menu_type == "Extérieure":
            surface_mext += surface
            embrasures += (longueur * 2 + hauteur * 2)
        else:
            surface_mint += surface
    for w in grid_resume_menuiseries.winfo_children():
        w.destroy()
    left_row = right_row = 0
    tk.Label(grid_resume_menuiseries, text="🔢 Nombre total :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_menuiseries, text=f"{count} U", bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1
    tk.Label(grid_resume_menuiseries, text="📏 Longueur :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_menuiseries, text=_format_summary_value(longueur_totale, " ml"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1
    tk.Label(grid_resume_menuiseries, text="📐 Surface :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_menuiseries, text=_format_summary_value(surface_totale, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1
    tk.Label(grid_resume_menuiseries, text="🪟 Embrasures :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=left_row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_menuiseries, text=_format_summary_value(embrasures, " ml"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=left_row, column=1, sticky="e", padx=10)
    left_row += 1
    tk.Label(grid_resume_menuiseries, text="📐 Surface MINT :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
    tk.Label(grid_resume_menuiseries, text=_format_summary_value(surface_mint, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)
    right_row += 1
    tk.Label(grid_resume_menuiseries, text="📐 Surface MEXT :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
    tk.Label(grid_resume_menuiseries, text=_format_summary_value(surface_mext, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)
    right_row += 1
    facade_total = _calc_total_facade_surface()
    pourc_vitree = (surface_mext / facade_total * 100) if facade_total > 0 else 0.0
    tk.Label(grid_resume_menuiseries, text="% de Façades vitrées :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=right_row, column=2, sticky="w", padx=10)
    tk.Label(grid_resume_menuiseries, text=f"{pourc_vitree:.2f} %", bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=right_row, column=3, sticky="e", padx=10)

def _update_resume_type_sol(nom_sel: str, storey: str = None):
    """Met à jour le résumé pour le revêtement de sol sélectionné."""
    sols_src = [s for s in _get_filtered_type_sol() if s[0] == nom_sel and (storey is None or s[4] == storey)]
    if not sols_src:
        return
    longueur_totale = surface_totale = 0.0
    for nom, surface, longueur, *_ in sols_src:
        longueur_totale += longueur
        surface_totale += surface
    for w in grid_resume_type_sol.winfo_children():
        w.destroy()
    row = 0
    tk.Label(grid_resume_type_sol, text="📏 Longueur :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_type_sol, text=_format_summary_value(longueur_totale, " ml"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=row, column=1, sticky="e", padx=10)
    row += 1
    tk.Label(grid_resume_type_sol, text="📐 Surface brute :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_type_sol, text=_format_summary_value(surface_totale, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=row, column=1, sticky="e", padx=10)
    row += 1
    surface_nette = _calc_surface_nette_sols(sols_src)
    tk.Label(grid_resume_type_sol, text="🏠 Surface nette :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_type_sol, text=_format_summary_value(surface_nette, " m²"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=row, column=1, sticky="e", padx=10)

def afficher_infos_menuiseries(event=None):
    sel = tree_menuiseries.selection()
    if not sel:
        hide_infos_menuiseries()
        return
    values = tree_menuiseries.item(sel[0])["values"]
    nom_sel = values[0]
    storey = None
    for m in donnees_ifc.get(ifc_actif, {}).get("menuiseries", []):
        if m[0] == nom_sel:
            storey = m[5]
            break
    _update_infos_menuiseries(nom_sel, storey)
    _update_resume_menuiseries(nom_sel)

def afficher_infos_menuiseries_resume(event=None):
    sel = tree_surfaces_menuiseries.selection()
    if not sel:
        hide_infos_menuiseries()
        return
    nom_sel = tree_surfaces_menuiseries.item(sel[0])["values"][0]
    _update_infos_menuiseries(nom_sel)
    _update_resume_menuiseries(nom_sel)

tree_menuiseries.bind("<<TreeviewSelect>>", afficher_infos_menuiseries)
tree_surfaces_menuiseries.bind("<<TreeviewSelect>>", afficher_infos_menuiseries_resume)

frame_type_sol_content = tk.Frame(frame_type_sol, bg="#F2F2F2")
frame_type_sol_content.pack(side="left", expand=True, fill="both", padx=(0, 10))
frame_filtre_type_sol = tk.Frame(frame_type_sol_content, bg="#FFFFFF", bd=1, relief="solid")
# frame_filtre_type_sol.pack(fill="x", padx=10, pady=10)
tk.Label(frame_filtre_type_sol, text="🔎 Filtrer :", bg="#FFFFFF").pack(side="left", padx=5)
entree_filtre_type_sol = tk.Entry(frame_filtre_type_sol, width=40)
entree_filtre_type_sol.pack(side="left", padx=5)
btn_niveau_type_sol = None
print("Cadre de filtrage des sols créé")

tree_type_sol = ttk.Treeview(frame_type_sol_content, columns=("Nom", "Surface (m²)", "Longueur ", "Type"), show="headings")
for col in ("Nom", "Surface (m²)", "Longueur ", "Type"):
    tree_type_sol.heading(col, text=col)
tree_type_sol.column("Nom", anchor="center", width=120, minwidth=120, stretch=True)
tree_type_sol.column("Surface (m²)", anchor="center", width=80, minwidth=80, stretch=True)
tree_type_sol.column("Longueur ", anchor="center", width=80, minwidth=80, stretch=True)
tree_type_sol.column("Type", anchor="center", width=80, minwidth=80, stretch=True)
tree_type_sol.configure(style="Treeview")
tree_type_sol.tag_configure("evenrow", background="#F2F2F2")
tree_type_sol.tag_configure("oddrow", background="#FFFFFF")
scroll_type_sol = ttk.Scrollbar(frame_type_sol_content, orient="vertical", command=tree_type_sol.yview)
tree_type_sol.configure(yscrollcommand=scroll_type_sol.set)
tree_type_sol.pack(side="left", expand=True, fill="both", padx=(10, 0), pady=10)
scroll_type_sol.pack(side="right", fill="y")
print("Arborescence des sols créée")

frame_resume_type_sol = tk.Frame(frame_type_sol, bg="white", width=650)
frame_resume_type_sol.pack(side="right", fill="y", padx=10, pady=10)
frame_resume_type_sol.pack_propagate(False)
title_frame_resume_type_sol = tk.Frame(frame_resume_type_sol, bg="#004D40")
title_frame_resume_type_sol.pack(fill="x", padx=5, pady=(5,0))
tk.Label(title_frame_resume_type_sol, text="RÉSUMÉ", font=("Helvetica", 12, "bold"), bg="#004D40", fg="white").pack(pady=5)
general_frame_type_sol = tk.Frame(frame_resume_type_sol, bg="#FFFFFF", bd=2, relief="groove")
general_frame_type_sol.pack(fill="x", padx=5, pady=5)
grid_resume_type_sol = tk.Frame(general_frame_type_sol, bg="#FFFFFF")
grid_resume_type_sol.pack(pady=5)
grid_resume_type_sol.grid_columnconfigure(1, weight=1)
grid_resume_type_sol.grid_columnconfigure(3, weight=1)

title_frame_filtrage_type_sol = tk.Frame(frame_resume_type_sol, bg="#004D40")
title_frame_filtrage_type_sol.pack(fill="x", padx=5, pady=(15, 0))
tk.Label(title_frame_filtrage_type_sol, text="FILTRAGE PAR NOMS", font=("Helvetica", 12, "bold"), bg="#004D40", fg="white").pack(pady=5)
types_frame_type_sol = tk.Frame(frame_resume_type_sol, bg="#FFFFFF", bd=2, relief="groove")
types_frame_type_sol.pack(fill="both", padx=5, pady=5, expand=True)

data_frame_types_type_sol = tk.Frame(types_frame_type_sol, bg="#FFFFFF")
data_frame_types_type_sol.pack(fill="both", expand=True, padx=5, pady=5)

tree_surfaces_type_sol = ttk.Treeview(data_frame_types_type_sol, columns=("Type", "m²"), show="headings")
for col in ("Type", "m²"):
    tree_surfaces_type_sol.configure(style="Green.Treeview")
    tree_surfaces_type_sol.heading(col, text=col)
tree_surfaces_type_sol.column("Type", anchor="w", width=200)
tree_surfaces_type_sol.column("m²", anchor="e", width=60, stretch=False)
tree_surfaces_type_sol.tag_configure("evenrow", background="#FFFFFF")
tree_surfaces_type_sol.tag_configure("oddrow", background="#FFFFFF")
scroll_surfaces_type_sol = ttk.Scrollbar(data_frame_types_type_sol, orient="vertical", command=tree_surfaces_type_sol.yview)
tree_surfaces_type_sol.configure(yscrollcommand=scroll_surfaces_type_sol.set)
tree_surfaces_type_sol.pack(side="left", fill="both", expand=True, padx=(5, 0), pady=5)
scroll_surfaces_type_sol.pack(side="right", fill="y")

def copy_type_summary_type_sol(event=None):
    sel = tree_surfaces_type_sol.selection()
    if sel:
        text_to_copy = "\n".join(["\t".join(map(str, tree_surfaces_type_sol.item(i)["values"])) for i in sel])
        root.clipboard_clear()
        root.clipboard_append(text_to_copy)

def filter_main_by_type_type_sol(event=None):
    row_id = tree_surfaces_type_sol.selection()
    if row_id:
        type_sel = tree_surfaces_type_sol.item(row_id[0])['values'][0]
        sols_filtres = [s for s in donnees_ifc[ifc_actif]["sols"] if s[0] == type_sel]
        afficher_donnees_type_sol(sols_filtres)

tree_surfaces_type_sol.bind("<Double-1>", filter_main_by_type_type_sol)
tree_surfaces_type_sol.bind("<Button-1>", copy_type_summary_type_sol)
context_menu_surfaces_type_sol = tk.Menu(root, tearoff=0)
context_menu_surfaces_type_sol.add_command(label="Copier", command=copy_type_summary_type_sol)
tree_surfaces_type_sol.bind("<Button-3>", lambda e: (tree_surfaces_type_sol.selection_set(tree_surfaces_type_sol.identify_row(e.y)), context_menu_surfaces_type_sol.post(e.x_root, e.y_root)))

def afficher_infos_type_sol(event=None):
    sel = tree_type_sol.selection()
    if not sel:
        hide_infos_type_sol()
        return
    values = tree_type_sol.item(sel[0])["values"]
    nom_sel = values[0]
    try:
        surface = float(values[1])
        longueur = float(values[2])
    except (ValueError, TypeError):
        surface = longueur = 0.0
    rev_type = values[3]
    storey = None
    for s in donnees_ifc.get(ifc_actif, {}).get("sols", []):
        if (
            s[0] == nom_sel
            and abs(s[1] - surface) < 0.01
            and abs(s[2] - longueur) < 0.01
            and s[3] == rev_type
        ):
            storey = s[4]
            break
    _update_infos_type_sol(nom_sel, storey)
    _update_resume_type_sol(nom_sel, storey)

def afficher_infos_type_sol_resume(event=None):
    sel = tree_surfaces_type_sol.selection()
    if not sel:
        hide_infos_type_sol()
        return
    nom_sel = tree_surfaces_type_sol.item(sel[0])["values"][0]
    _update_infos_type_sol(nom_sel)
    _update_resume_type_sol(nom_sel)

def afficher_infos_garde_corps(event=None):
    sel = tree_garde_corps.selection()
    if not sel:
        hide_infos_garde_corps()
        return
    values = tree_garde_corps.item(sel[0])["values"]
    nom_sel = values[0]
    try:
        largeur = float(values[1])
    except (ValueError, TypeError):
        largeur = 0.0
    typ = values[2] if len(values) > 2 else ""
    _update_infos_garde_corps(nom_sel, largeur, typ)

def afficher_infos_garde_corps_resume(event=None):
    sel = tree_surfaces_garde_corps.selection()
    if not sel:
        hide_infos_garde_corps()
        return
    nom_sel = tree_surfaces_garde_corps.item(sel[0])["values"][0]
    _update_resume_garde_corps(nom_sel)
    _update_infos_garde_corps(nom_sel)

def on_select_gc_type(event=None):
    """Gestion du clic simple sur un type de garde-corps."""
    afficher_infos_garde_corps_resume(event)

tree_type_sol.bind("<<TreeviewSelect>>", afficher_infos_type_sol)
tree_surfaces_type_sol.bind("<<TreeviewSelect>>", afficher_infos_type_sol_resume)

def afficher_infos_poteaux(event=None):
    sel = tree_poteaux.selection()
    if not sel:
        hide_infos_poteaux()
        return
    values = tree_poteaux.item(sel[0])["values"]
    nom_sel = values[0]
    try:
        larg = float(values[1])
        surf = float(values[2])
        vol = float(values[3])
    except (ValueError, TypeError):
        larg = surf = vol = 0.0
    p_type = values[4]
    storey = None
    for p in donnees_ifc.get(ifc_actif, {}).get("poteaux", []):
        if (
            p[0] == nom_sel
            and abs(p[1] - larg) < 0.01
            and abs(p[2] - surf) < 0.01
            and abs(p[3] - vol) < 0.01
            and p[4] == p_type
        ):
            storey = p[5]
            break
    _update_infos_poteaux(nom_sel, storey)
    _update_resume_poteaux(nom_sel)


def afficher_infos_poteaux_resume(event=None):
    sel = tree_surfaces_poteaux.selection()
    if not sel:
        hide_infos_poteaux()
        return
    nom_sel = tree_surfaces_poteaux.item(sel[0])["values"][0]
    _update_infos_poteaux(nom_sel)
    _update_resume_poteaux(nom_sel)

# --- Nouveau titre "INFORMATIONS COMPLÉMENTAIRES" sous le tableau TYPE DE SOL
title_frame_types_type_sol_bottom = tk.Frame(frame_resume_type_sol, bg="#004D40")
title_frame_types_type_sol_bottom.pack(fill="x", padx=5, pady=(15, 0))
tk.Label(title_frame_types_type_sol_bottom, text="INFORMATIONS COMPLÉMENTAIRES", font=("Helvetica", 12, "bold"), bg="#004D40", fg="white").pack(pady=5)
info_frame_type_sol = tk.Frame(frame_resume_type_sol, bg="#FFFFFF", bd=2, relief="groove")
info_frame_type_sol.pack(fill="x", padx=5, pady=5)
grid_infos_type_sol = tk.Frame(info_frame_type_sol, bg="#FFFFFF")
grid_infos_type_sol.pack(pady=5, fill="x")
grid_infos_type_sol.grid_columnconfigure(1, weight=1)
grid_infos_type_sol.grid_columnconfigure(0, weight=1)

def hide_infos_type_sol():
    """Masque le bloc d'informations complémentaires des sols."""
    for w in grid_infos_type_sol.winfo_children():
        w.destroy()

def _update_infos_type_sol(nom_sel: str, storey: str = None):
    """Affiche les informations complémentaires pour le revêtement de sol donné."""
    hide_infos_type_sol()
    infos = donnees_ifc.get(ifc_actif, {}).get("sols_infos", {})
    info = {}
    if storey is not None:
        info = infos.get((nom_sel, storey), {})
        if not info:
            for (n, s), data in infos.items():
                if n == nom_sel:
                    info = data
                    break
    else:
        # Lorsqu'on sélectionne seulement un type dans le résumé,
        # on n'affiche pas les informations détaillées mais "N/A".
        info = {}
    storeys = sorted({s for (n, s) in infos if n == nom_sel and s})
    mapping = [
        ("Cotes / Élévation haut", "Cotes / Élévation haut"),
        ("Cotes / Élévation base", "Cotes / Élévation base"),
        ("Cotes / Épaisseur", "Cotes / Épaisseur"),
    ]
    for row, (key, label) in enumerate(mapping):
        val = info.get(key)
        if val in (None, "", "None"):
            val = "N/A"
        elif isinstance(val, (int, float)):
            val = f"{val:.2f}"
        else:
            try:
                if isinstance(val, str):
                    val = val.replace(",", ".")
                val = f"{float(val):.2f}"
            except (TypeError, ValueError, AttributeError):
                val = str(val)
        tk.Label(grid_infos_type_sol, text=f"{label} :", bg="#FFFFFF", anchor="w").grid(row=row, column=0, sticky="w", padx=10)
        tk.Label(grid_infos_type_sol, text=str(val), bg="#FFFFFF", anchor="e").grid(row=row, column=1, sticky="e", padx=10)
    label = "Niveau" if len(storeys) <= 1 else "Niveaux"
    niveaux = " - ".join(storeys) if storeys else "N/A"
    row = len(mapping)
    tk.Label(grid_infos_type_sol, text=f"{label} :", bg="#FFFFFF", anchor="w").grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_infos_type_sol, text=niveaux, bg="#FFFFFF", anchor="e").grid(row=row, column=1, sticky="e", padx=10)


def hide_infos_garde_corps():
    """Masque le bloc d'informations complémentaires des garde-corps."""
    for w in grid_infos_garde_corps.winfo_children():
        w.destroy()


def _update_infos_garde_corps(nom_sel: str, largeur: float = None, typ: str = None, storey: str = None):
    """Affiche les informations complémentaires pour le garde-corps sélectionné."""
    hide_infos_garde_corps()
    infos = donnees_ifc.get(ifc_actif, {}).get("garde_corps_infos", {})
    info = {}
    if storey is not None:
        info = infos.get((nom_sel, storey), {})
        if not info:
            for (n, s), data in infos.items():
                if n == nom_sel:
                    info = data
                    break
    storeys = sorted({s for (n, s) in infos if n == nom_sel and s})
    niveau = storey or info.get("Niveau de base")
    if not niveau:
        niveau = " - ".join(storeys) if storeys else "N/A"
    tk.Label(grid_infos_garde_corps, text="Niveau :", bg="#FFFFFF", anchor="w").grid(row=0, column=0, sticky="w", padx=10)
    tk.Label(grid_infos_garde_corps, text=str(niveau), bg="#FFFFFF", anchor="e").grid(row=0, column=1, sticky="e", padx=10)

def _update_resume_garde_corps(nom_sel: str):
    """Met à jour le résumé pour le garde-corps sélectionné."""
    gc_src = [g for g in _get_filtered_garde_corps() if g[0] == nom_sel]
    if not gc_src:
        return
    longueur_totale = sum(g[1] for g in gc_src)
    for w in grid_resume_garde_corps.winfo_children():
        w.destroy()
    row = 0
    tk.Label(grid_resume_garde_corps, text="📏 Longueur :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_garde_corps, text=_format_summary_value(longueur_totale, " m"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=row, column=1, sticky="e", padx=10)
    row += 1
    tk.Label(grid_resume_garde_corps, text="", bg="#FFFFFF").grid(row=row, column=0, pady=2)

frame_garde_corps_content = tk.Frame(frame_garde_corps, bg="#F2F2F2")
frame_garde_corps_content.pack(side="left", expand=True, fill="both", padx=(0, 10))
frame_filtre_garde_corps = tk.Frame(frame_garde_corps_content, bg="#FFFFFF", bd=1, relief="solid")
# frame_filtre_garde_corps.pack(fill="x", padx=10, pady=10)
tk.Label(frame_filtre_garde_corps, text="🔎 Filtrer :", bg="#FFFFFF").pack(side="left", padx=5)
entree_filtre_garde_corps = tk.Entry(frame_filtre_garde_corps, width=40)
entree_filtre_garde_corps.pack(side="left", padx=5)
btn_niveau_garde_corps = None
print("Cadre de filtrage des garde-corps créé")

tree_garde_corps = ttk.Treeview(frame_garde_corps_content, columns=("Nom", "Largeur (m)", "Type"), show="headings")
for col in ("Nom", "Largeur (m)", "Type") :
    tree_garde_corps.heading(col, text=col)
    tree_garde_corps.column(col, anchor="center", width=120)
tree_garde_corps.column("Nom", width=200)
tree_garde_corps.tag_configure("evenrow", background="#F2F2F2")
tree_garde_corps.tag_configure("oddrow", background="#FFFFFF")
scroll_garde_corps = ttk.Scrollbar(frame_garde_corps_content, orient="vertical", command=tree_garde_corps.yview)
tree_garde_corps.configure(yscrollcommand=scroll_garde_corps.set)
tree_garde_corps.pack(side="left", expand=True, fill="both", padx=(10, 0), pady=10)
tree_garde_corps.bind("<<TreeviewSelect>>", afficher_infos_garde_corps)

print("Arborescence des garde-corps créée")

# Section modifiée pour l'onglet Garde-corps
# À insérer dans IFC_Analyzer_menuiseries_treeview_v4.py
# Remplacer la partie frame_resume_garde_corps par le code ci-dessous :

# Cadre de résumé
frame_resume_garde_corps = tk.Frame(frame_garde_corps, bg="white", width=650)
frame_resume_garde_corps.pack(side="right", fill="y", padx=10, pady=10)
frame_resume_garde_corps.pack_propagate(False)

# Titre Résumé
title_frame_resume_garde_corps = tk.Frame(frame_resume_garde_corps, bg="#004D40")
title_frame_resume_garde_corps.pack(fill="x", padx=5, pady=(5,0))
tk.Label(title_frame_resume_garde_corps, text="RÉSUMÉ", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)

# Cadre général
general_frame_garde_corps = tk.Frame(frame_resume_garde_corps, bg="#FFFFFF", bd=2, relief="groove")
general_frame_garde_corps.pack(fill="x", padx=5, pady=5)

grid_resume_garde_corps = tk.Frame(general_frame_garde_corps, bg="#FFFFFF")
grid_resume_garde_corps.pack(pady=5, expand=True)
grid_resume_garde_corps.grid_columnconfigure(1, weight=1)


# Titre Filtrage par noms
title_frame_filtrage_garde_corps = tk.Frame(frame_resume_garde_corps, bg="#004D40")
title_frame_filtrage_garde_corps.pack(fill="x", padx=5, pady=(15,0))
tk.Label(title_frame_filtrage_garde_corps, text="FILTRAGE PAR NOMS", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)

# Tableau Résumé : noms et quantités
types_frame_gc = tk.Frame(frame_resume_garde_corps, bg="white", bd=1, relief="solid")
types_frame_gc.pack(fill="both", padx=5, pady=5, expand=True)

data_frame_types_garde_corps = tk.Frame(types_frame_gc, bg="white")
data_frame_types_garde_corps.pack(fill="both", expand=True, padx=5, pady=5)
def appliquer_filtre_resume_gc():
    filtre = entree_filtre_resume_gc.get().strip().lower()
    for iid in tree_surfaces_garde_corps.get_children():
        val = tree_surfaces_garde_corps.item(iid)["values"][0].lower()
        if filtre and filtre not in val:
            tree_surfaces_garde_corps.detach(iid)
        else:
            tree_surfaces_garde_corps.reattach(iid, "", "end")

def reinitialiser_filtre_resume_gc():
    entree_filtre_resume_gc.delete(0, tk.END)
    for iid in tree_surfaces_garde_corps.get_children(""):
        tree_surfaces_garde_corps.reattach(iid, "", "end")

def copy_gc_summary(event=None):
    sel = tree_surfaces_garde_corps.selection()
    if sel:
        root.clipboard_clear()
        root.clipboard_append(tree_surfaces_garde_corps.item(sel[0])["values"][0])


tree_surfaces_garde_corps = ttk.Treeview(
    data_frame_types_garde_corps,
    style="Green.Treeview",
    columns=("Type", "m"),
    show="headings"
)
tree_surfaces_garde_corps.configure(style="Green.Treeview")
tree_surfaces_garde_corps.heading("Type", text="Type")
tree_surfaces_garde_corps.heading("m",    text="m")
tree_surfaces_garde_corps.column("Type", anchor="w", width=200)
tree_surfaces_garde_corps.column("m",    anchor="e", width=80, stretch=False)
tree_surfaces_garde_corps.tag_configure("evenrow", background="#FFFFFF")
tree_surfaces_garde_corps.tag_configure("oddrow",  background="#FFFFFF")

scroll_surfaces_garde_corps = ttk.Scrollbar(
    data_frame_types_garde_corps, orient="vertical", command=tree_surfaces_garde_corps.yview
)
tree_surfaces_garde_corps.configure(yscrollcommand=scroll_surfaces_garde_corps.set)
tree_surfaces_garde_corps.pack(side="left", fill="both", expand=True, padx=(5, 0), pady=5)
# Copier nom summary GC
tree_surfaces_garde_corps.bind("<Button-1>", copy_gc_summary)
tree_surfaces_garde_corps.bind("<<TreeviewSelect>>", on_select_gc_type)
tree_surfaces_garde_corps.bind("<Double-Button-1>", lambda e: filter_main_by_type_gc(e))
# Filtrer tableau principal GC et mettre à jour le résumé
def filter_main_by_type_gc(event=None):
    sel = tree_surfaces_garde_corps.selection()
    if sel:
        lib = tree_surfaces_garde_corps.item(sel[0])["values"][0]
        filt = [gc for gc in donnees_ifc[ifc_actif]["garde_corps"] if gc[0] == lib]
        afficher_donnees_garde_corps(filt)
# Menu contextuel pour copier
context_menu_gc = tk.Menu(root, tearoff=0)
context_menu_gc.add_command(label="Copier", command=copy_gc_summary)
tree_surfaces_garde_corps.bind("<Button-3>", lambda e: (
    tree_surfaces_garde_corps.selection_set(tree_surfaces_garde_corps.identify_row(e.y)),
    context_menu_gc.post(e.x_root, e.y_root)
))
scroll_surfaces_garde_corps.pack(side="right", fill="y", pady=5)

title_frame_types_garde_corps_bottom = tk.Frame(frame_resume_garde_corps, bg="#004D40")
title_frame_types_garde_corps_bottom.pack(fill="x", padx=5, pady=(15, 0))
tk.Label(title_frame_types_garde_corps_bottom, text="INFORMATIONS COMPLÉMENTAIRES", font=("Helvetica", 12, "bold"), bg="#004D40", fg="white").pack(pady=5)
info_frame_garde_corps = tk.Frame(frame_resume_garde_corps, bg="#FFFFFF", bd=2, relief="groove")
info_frame_garde_corps.pack(fill="x", padx=5, pady=5)
grid_infos_garde_corps = tk.Frame(info_frame_garde_corps, bg="#FFFFFF")
grid_infos_garde_corps.pack(pady=5, fill="x")
grid_infos_garde_corps.grid_columnconfigure(1, weight=1)
grid_infos_garde_corps.grid_columnconfigure(0, weight=1)


# Titre Informations Complémentaires
frame_poteaux_content = tk.Frame(frame_poteaux, bg="#F2F2F2")
frame_poteaux_content.pack(side="left", expand=True, fill="both", padx=(0, 10))
frame_filtre_poteaux = tk.Frame(frame_poteaux_content, bg="#FFFFFF", bd=1, relief="solid")
# frame_filtre_poteaux.pack(fill="x", padx=10, pady=10)
tk.Label(frame_filtre_poteaux, text="🔎 Filtrer :", bg="#FFFFFF").pack(side="left", padx=5)
entree_filtre_poteaux = tk.Entry(frame_filtre_poteaux, width=40)
entree_filtre_poteaux.pack(side="left", padx=5)
btn_niveau_poteaux = None


tree_poteaux = ttk.Treeview(
    frame_poteaux_content,
    columns=("Nom", "Largeur (m)", "Surface (m²)", "Volume (m³)", "Type"),
    show="headings"
)
for col in ("Nom", "Largeur (m)", "Surface (m²)", "Volume (m³)", "Type") :
    tree_poteaux.heading(col, text=col)
    tree_poteaux.column(col, anchor="center", width=120)
tree_poteaux.tag_configure("evenrow", background="#F2F2F2")
tree_poteaux.tag_configure("oddrow",  background="#FFFFFF")
scroll_poteaux = ttk.Scrollbar(frame_poteaux_content, orient="vertical", command=tree_poteaux.yview)
tree_poteaux.configure(yscrollcommand=scroll_poteaux.set)
tree_poteaux.pack(side="left", expand=True, fill="both", padx=(10, 0), pady=10)
scroll_poteaux.pack(side="right", fill="y")

frame_resume_poteaux = tk.Frame(frame_poteaux, bg="white", width=650)
frame_resume_poteaux.pack(side="right", fill="y", padx=10, pady=10)
frame_resume_poteaux.pack_propagate(False)
title_frame_resume_poteaux = tk.Frame(frame_resume_poteaux, bg="#004D40")
title_frame_resume_poteaux.pack(fill="x", padx=5, pady=(5,0))
tk.Label(title_frame_resume_poteaux, text="RÉSUMÉ", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)
general_frame_poteaux = tk.Frame(frame_resume_poteaux, bg="#FFFFFF", bd=2, relief="groove")
general_frame_poteaux.pack(fill="x", padx=5, pady=5)
grid_resume_poteaux = tk.Frame(general_frame_poteaux, bg="#FFFFFF")
grid_resume_poteaux.pack(pady=5)
# — Résumé POTEAUX —
tk.Label(grid_resume_poteaux, text="📏 Largeur totale :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=0, column=0, sticky="w", padx=10)
label_largeur_totale_poteaux = tk.Label(grid_resume_poteaux, text="0.00 m", bg="#FFFFFF", font=("Helvetica", 10, "bold"))
label_largeur_totale_poteaux.grid(row=0, column=1, sticky="e", padx=10)
tk.Label(grid_resume_poteaux, text="🏗️Surface de coffrage :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=1, column=0, sticky="w", padx=10)
label_surface_totale_poteaux = tk.Label(grid_resume_poteaux, text="0.00 m²", bg="#FFFFFF", font=("Helvetica", 10, "bold"))
label_surface_totale_poteaux.grid(row=1, column=1, sticky="e", padx=10)
tk.Label(grid_resume_poteaux, text="📦 Volume total :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=2, column=0, sticky="w", padx=10)
label_volume_totale_poteaux = tk.Label(grid_resume_poteaux, text="0.00 m³", bg="#FFFFFF", font=("Helvetica", 10, "bold"))
label_volume_totale_poteaux.grid(row=2, column=1, sticky="e", padx=10)
# Cadre Filtrage par noms pour les poteaux
title_frame_filtrage_poteaux = tk.Frame(frame_resume_poteaux, bg="#004D40")
title_frame_filtrage_poteaux.pack(fill="x", padx=5, pady=(15,0))
tk.Label(title_frame_filtrage_poteaux, text="FILTRAGE PAR NOMS", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)
types_frame_poteaux = tk.Frame(frame_resume_poteaux, bg="#FFFFFF", bd=2, relief="groove")
types_frame_poteaux.pack(fill="both", padx=5, pady=5, expand=True)

# ---- Treeview résumé POTEAUX ---------------------------------
data_frame_types_poteaux = tk.Frame(types_frame_poteaux, bg="#FFFFFF")
data_frame_types_poteaux.pack(fill="both", expand=True, padx=5, pady=5)

tree_surfaces_poteaux = ttk.Treeview(
    data_frame_types_poteaux,
    style="Green.Treeview",
    columns=("Type", "m"),
    show="headings"
)
tree_surfaces_poteaux.configure(style="Green.Treeview")
tree_surfaces_poteaux.heading("Type", text="Type")
tree_surfaces_poteaux.heading("m",    text="m")
tree_surfaces_poteaux.column("Type", anchor="w", width=500, stretch=True)
tree_surfaces_poteaux.column("m",    anchor="e", width=80,  stretch=False)
tree_surfaces_poteaux.tag_configure("evenrow", background="#FFFFFF")
tree_surfaces_poteaux.tag_configure("oddrow",  background="#FFFFFF")

scroll_surfaces_poteaux = ttk.Scrollbar(
    data_frame_types_poteaux, orient="vertical",
    command=tree_surfaces_poteaux.yview
)
tree_surfaces_poteaux.configure(yscrollcommand=scroll_surfaces_poteaux.set)
tree_surfaces_poteaux.pack(side="left", fill="both", expand=True,
                               padx=(5, 0), pady=5)
scroll_surfaces_poteaux.pack(side="right", fill="y")
# Fonctions et interactions pour le résumé POTEAUX
def filter_main_by_type_poteaux(event=None):
    row_id = tree_surfaces_poteaux.selection()
    if row_id:
        type_sel = tree_surfaces_poteaux.item(row_id[0])['values'][0]
        # Filtre le tableau principal POTEaux
        for item in tree_poteaux.get_children():
            tree_poteaux.delete(item)
        filt = [p for p in donnees_ifc[ifc_actif]['poteaux'] if p[0] == type_sel]
        for idx, (nom, larg, surface, volume, typ, _storey) in enumerate(filt):
            tag = 'evenrow' if idx % 2 == 0 else 'oddrow'
            tree_poteaux.insert('', 'end', values=(nom, larg, surface, volume, typ), tags=(tag,))

def copy_type_summary_poteaux(event=None):
    sel = tree_surfaces_poteaux.selection()
    if not sel: return
    text_to_copy = '\n'.join(['\t'.join(map(str, tree_surfaces_poteaux.item(i)['values'])) for i in sel])
    root.clipboard_clear()
    root.clipboard_append(text_to_copy)

# Menu contextuel pour copier
context_menu_surfaces_poteaux = tk.Menu(root, tearoff=0)
context_menu_surfaces_poteaux.add_command(label='Copier', command=copy_type_summary_poteaux)

# Liens d'interaction
tree_surfaces_poteaux.bind('<Double-1>', filter_main_by_type_poteaux)
tree_surfaces_poteaux.bind('<Button-1>', copy_type_summary_poteaux)
tree_surfaces_poteaux.bind('<Button-3>', lambda e: (tree_surfaces_poteaux.selection_set(tree_surfaces_poteaux.identify_row(e.y)), context_menu_surfaces_poteaux.post(e.x_root, e.y_root)))
tree_poteaux.bind("<<TreeviewSelect>>", afficher_infos_poteaux)
tree_surfaces_poteaux.bind("<<TreeviewSelect>>", afficher_infos_poteaux_resume)


# Masque l’ancien canvas+grid pour éviter le doublon visuel
# Cache l'ancien container une fois créé

def maj_par_type_poteaux(poteaux=None):
    if not ifc_actif or ifc_actif not in donnees_ifc:
        return
    global tree_surfaces_poteaux
    poteaux = poteaux or donnees_ifc[ifc_actif]["poteaux"]
    if tree_surfaces_poteaux is None:
        return
    tree_surfaces_poteaux.delete(*tree_surfaces_poteaux.get_children())
    agg = {}
    for nom, larg, *_ in poteaux:
        agg[nom] = agg.get(nom, 0) + larg
    for idx, (nom, larg) in enumerate(sorted(agg.items())):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_surfaces_poteaux.insert("", "end", values=(nom, round(larg, 2)), tags=(tag,))

def maj_surface_coffrage_totale():
    """Calcule la surface de coffrage totale Poteaux + Poutres."""
    data = donnees_ifc.get(ifc_actif, {})
    surf_poteaux = sum(p[2] for p in data.get("poteaux", []))
    surf_poutres = sum(p[2] for p in data.get("poutres", []))
    total = surf_poteaux + surf_poutres
    label_surface_coffrage_totale.config(text=f"Surface de coffrage totale : {round(total,2)} m²")


root.after(0, maj_par_type_poteaux)

grid_types_poteaux_container = tk.Frame(types_frame_poteaux, bg="#FFFFFF", bd=1, relief="solid")
grid_types_poteaux_container.pack(fill="x", padx=5, pady=5)
grid_types_poteaux_container.pack_forget()


info_frame_poteaux = tk.Frame(frame_resume_poteaux, bg="#004D40")
info_frame_poteaux.pack(fill="x", padx=5, pady=(5,0))
tk.Label(info_frame_poteaux, text="INFORMATIONS COMPLÉMENTAIRES", font=("Helvetica", 12, "bold"), bg="#004D40", fg="white").pack(pady=5)
info_container_poteaux = tk.Frame(frame_resume_poteaux, bg="#FFFFFF", bd=2, relief="groove")
info_container_poteaux.pack(fill="x", padx=5, pady=5)
grid_infos_poteaux = tk.Frame(info_container_poteaux, bg="#FFFFFF")
grid_infos_poteaux.pack(pady=5, fill="x")
grid_infos_poteaux.grid_columnconfigure(1, weight=1)
grid_infos_poteaux.grid_columnconfigure(0, weight=1)


canvas_grid_types_poteaux = tk.Canvas(grid_types_poteaux_container, bg="#FFFFFF", highlightthickness=0, height=150)
canvas_grid_types_poteaux.pack(side="left", fill="x", expand=True, padx=(5, 0), pady=5)

scrollbar_grid_types_poteaux = tk.Scrollbar(grid_types_poteaux_container, orient="vertical", command=canvas_grid_types_poteaux.yview)
scrollbar_grid_types_poteaux.pack(side="right", fill="y", pady=5)

canvas_grid_types_poteaux.configure(yscrollcommand=scrollbar_grid_types_poteaux.set)

grid_types_poteaux = tk.Frame(canvas_grid_types_poteaux, bg="#FFFFFF")
canvas_grid_types_poteaux.create_window((0, 0), window=grid_types_poteaux, anchor="nw")

def on_configure_grid_types_poteaux(event):
    canvas_grid_types_poteaux.configure(scrollregion=canvas_grid_types_poteaux.bbox("all"))

grid_types_poteaux.bind("<Configure>", on_configure_grid_types_poteaux)



# —— UI POUTRES ———————————————————————————————————————————
frame_poutres_content = tk.Frame(frame_poutres, bg="#F2F2F2")
frame_poutres_content.pack(side="left", expand=True, fill="both", padx=(0, 10))
frame_filtre_poutres = tk.Frame(frame_poutres_content, bg="#FFFFFF", bd=1, relief="solid")
# frame_filtre_poutres.pack(fill="x", padx=10, pady=10)
tk.Label(frame_filtre_poutres, text="🔎 Filtrer :", bg="#FFFFFF").pack(side="left", padx=5)
entree_filtre_poutres = tk.Entry(frame_filtre_poutres, width=40)
entree_filtre_poutres.pack(side="left", padx=5)
btn_niveau_poutres = None


tree_poutres = ttk.Treeview(
    frame_poutres_content,
    columns=("Nom", "Largeur (m)", "Surface (m²)", "Volume (m³)", "Type"),
    show="headings"
)
for col in ("Nom", "Largeur (m)", "Surface (m²)", "Volume (m³)", "Type") :
    tree_poutres.heading(col, text=col)
    tree_poutres.column(col, anchor="center", width=120)
tree_poutres.tag_configure("evenrow", background="#F2F2F2")
tree_poutres.tag_configure("oddrow",  background="#FFFFFF")
scroll_poutres = ttk.Scrollbar(frame_poutres_content, orient="vertical", command=tree_poutres.yview)
tree_poutres.configure(yscrollcommand=scroll_poutres.set)
tree_poutres.pack(side="left", expand=True, fill="both", padx=(10, 0), pady=10)
scroll_poutres.pack(side="right", fill="y")
tree_poutres.bind("<<TreeviewSelect>>", afficher_infos_poutres)

frame_resume_poutres = tk.Frame(frame_poutres, bg="white", width=650)
frame_resume_poutres.pack(side="right", fill="y", padx=10, pady=10)
frame_resume_poutres.pack_propagate(False)
title_frame_resume_poutres = tk.Frame(frame_resume_poutres, bg="#004D40")
title_frame_resume_poutres.pack(fill="x", padx=5, pady=(5,0))
tk.Label(title_frame_resume_poutres, text="RÉSUMÉ", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)
general_frame_poutres = tk.Frame(frame_resume_poutres, bg="#FFFFFF", bd=2, relief="groove")
general_frame_poutres.pack(fill="x", padx=5, pady=5)
grid_resume_poutres = tk.Frame(general_frame_poutres, bg="#FFFFFF")
grid_resume_poutres.pack(pady=5)
# Nouveau bandeau "INFORMATIONS COMPLÉMENTAIRES" juste sous le tableau Résumé
# — Résumé POUTRES —
tk.Label(grid_resume_poutres, text="📏 Longueur totale :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=0, column=0, sticky="w", padx=10)
label_longueur_totale_poutres = tk.Label(grid_resume_poutres, text="0.00 m", bg="#FFFFFF", font=("Helvetica", 10, "bold"))
label_longueur_totale_poutres.grid(row=0, column=1, sticky="e", padx=10)
tk.Label(grid_resume_poutres, text="🏗️Surface de coffrage :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=1, column=0, sticky="w", padx=10)
label_surface_totale_poutres = tk.Label(grid_resume_poutres, text="0.00 m²", bg="#FFFFFF", font=("Helvetica", 10, "bold"))
label_surface_totale_poutres.grid(row=1, column=1, sticky="e", padx=10)
tk.Label(grid_resume_poutres, text="📦 Volume total :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=2, column=0, sticky="w", padx=10)
label_volume_totale_poutres = tk.Label(grid_resume_poutres, text="0.00 m³", bg="#FFFFFF", font=("Helvetica", 10, "bold"))
label_volume_totale_poutres.grid(row=2, column=1, sticky="e", padx=10)
title_frame_filtrage_poutres = tk.Frame(frame_resume_poutres, bg="#004D40")
title_frame_filtrage_poutres.pack(fill="x", padx=5, pady=(15,0))
tk.Label(title_frame_filtrage_poutres, text="FILTRAGE PAR NOMS", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)
types_frame_poutres = tk.Frame(frame_resume_poutres, bg="#FFFFFF", bd=2, relief="groove")
types_frame_poutres.pack(fill="both", padx=5, pady=5, expand=True)

# ---- Treeview résumé POUTRES ---------------------------------
data_frame_types_poutres = tk.Frame(types_frame_poutres, bg="#FFFFFF")
data_frame_types_poutres.pack(fill="both", padx=5, pady=5, expand=True)

tree_surfaces_poutres = ttk.Treeview(
    data_frame_types_poutres,
    style="Green.Treeview",
    columns=("Type", "m"),
    show="headings"
)
tree_surfaces_poutres.configure(style="Green.Treeview")
tree_surfaces_poutres.heading("Type", text="Type")
tree_surfaces_poutres.heading("m",    text="m")
tree_surfaces_poutres.column("Type", anchor="w", width=500, stretch=True)
tree_surfaces_poutres.column("m",    anchor="e", width=80,  stretch=False)
tree_surfaces_poutres.tag_configure("evenrow", background="#FFFFFF")
tree_surfaces_poutres.tag_configure("oddrow",  background="#FFFFFF")

scroll_surfaces_poutres = ttk.Scrollbar(
    data_frame_types_poutres, orient="vertical",
    command=tree_surfaces_poutres.yview
)
tree_surfaces_poutres.configure(yscrollcommand=scroll_surfaces_poutres.set)
tree_surfaces_poutres.pack(side="left", fill="both", expand=True,
                               padx=(5, 0), pady=5)
scroll_surfaces_poutres.pack(side="right", fill="y")
# ------------------------------------------------------------------
# Ajout des interactions (double‑clic, copier, menu contextuel) pour le tableau résumé des poutres
def copy_type_summary_poutres(event=None):
    sel = tree_surfaces_poutres.selection()
    if sel:
        text_to_copy = "\n".join(["\t".join(map(str, tree_surfaces_poutres.item(i)["values"])) for i in sel])
        root.clipboard_clear()
        root.clipboard_append(text_to_copy)

def filter_main_by_type_poutres(event=None):
    row_id = tree_surfaces_poutres.selection()
    if row_id:
        type_sel = tree_surfaces_poutres.item(row_id[0])['values'][0]
        # mise à jour du tableau principal
        for item in tree_poutres.get_children():
            tree_poutres.delete(item)
        poutres_filtres = [p for p in donnees_ifc[ifc_actif]["poutres"] if p[0] == type_sel]
        for idx, (nom, largeur, surface, volume, poutre_type, _storey) in enumerate(poutres_filtres):
            tag = "evenrow" if idx % 2 == 0 else "oddrow"
            tree_poutres.insert("", "end", values=(nom, largeur, surface, volume, poutre_type), tags=(tag,))

tree_surfaces_poutres.bind("<Double-1>", filter_main_by_type_poutres)
tree_surfaces_poutres.bind("<Button-1>", copy_type_summary_poutres)
context_menu_surfaces_poutres = tk.Menu(root, tearoff=0)
context_menu_surfaces_poutres.add_command(label="Copier", command=copy_type_summary_poutres)
tree_surfaces_poutres.bind("<Button-3>", lambda e: (tree_surfaces_poutres.selection_set(tree_surfaces_poutres.identify_row(e.y)), context_menu_surfaces_poutres.post(e.x_root, e.y_root)))
tree_surfaces_poutres.bind("<<TreeviewSelect>>", afficher_infos_poutres_resume)
# Bandeau “INFORMATIONS COMPLÉMENTAIRES” sous le tableau Résumé
info_frame_poutres = tk.Frame(frame_resume_poutres, bg="#004D40")
info_frame_poutres.pack(fill="x", padx=5, pady=(5,0))
tk.Label(info_frame_poutres, text="INFORMATIONS COMPLÉMENTAIRES", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)
info_container_poutres = tk.Frame(frame_resume_poutres, bg="#FFFFFF", bd=2, relief="groove")
info_container_poutres.pack(fill="x", padx=5, pady=5)
grid_infos_poutres = tk.Frame(info_container_poutres, bg="#FFFFFF")
grid_infos_poutres.pack(pady=5, fill="x")
grid_infos_poutres.grid_columnconfigure(1, weight=1)
grid_infos_poutres.grid_columnconfigure(0, weight=1)

# ------------------------------------------------------------------

# Masque l’ancien canvas+grid pour éviter le doublon visuel
# Cache l'ancien container une fois créé

def maj_par_type_poutres(poutres=None):
    if not ifc_actif or ifc_actif not in donnees_ifc:
        return
    global tree_surfaces_poutres
    poutres = poutres or donnees_ifc[ifc_actif]["poutres"]
    if tree_surfaces_poutres is None:
        return
    tree_surfaces_poutres.delete(*tree_surfaces_poutres.get_children())
    agg = {}
    for nom, longu, *_ in poutres:
        agg[nom] = agg.get(nom, 0) + longu
    for idx, (nom, larg) in enumerate(sorted(agg.items())):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_surfaces_poutres.insert("", "end", values=(nom, round(larg, 2)), tags=(tag,))


root.after(0, maj_par_type_poutres)
# tk.Label(types_frame_poutres, text="Longueurs par type", font=("Helvetica", 12, "bold"), bg="white", fg="#004D40")\
    # .pack(anchor="center", pady=5)

grid_types_poutres_container = tk.Frame(types_frame_poutres, bg="#FFFFFF", bd=1, relief="solid")
# grid_types_poutres_container.pack(fill="x", padx=5, pady=5)
grid_types_poutres_container.pack_forget()  # hidden to remove blank area

tk.Label(grid_types_poutres_container, text="INFORMATIONS COMPLÉMENTAIRES", font=("Helvetica", 12, "bold"), bg="#FFFFFF", fg="#004D40").pack(anchor="center", pady=5)

canvas_grid_types_poutres = tk.Canvas(grid_types_poutres_container, bg="#FFFFFF", highlightthickness=0, height=150)
canvas_grid_types_poutres.pack(side="left", fill="x", expand=True, padx=(5, 0), pady=5)

scrollbar_grid_types_poutres = tk.Scrollbar(grid_types_poutres_container, orient="vertical", command=canvas_grid_types_poutres.yview)
scrollbar_grid_types_poutres.pack(side="right", fill="y", pady=5)

canvas_grid_types_poutres.configure(yscrollcommand=scrollbar_grid_types_poutres.set)

grid_types_poutres = tk.Frame(canvas_grid_types_poutres, bg="#FFFFFF")
canvas_grid_types_poutres.create_window((0, 0), window=grid_types_poutres, anchor="nw")

def on_configure_grid_types_poutres(event):
    canvas_grid_types_poutres.configure(scrollregion=canvas_grid_types_poutres.bbox("all"))

grid_types_poutres.bind("<Configure>", on_configure_grid_types_poutres)



# Chargement du logo
try:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    logo_path = os.path.join(script_dir, "IFC_Analyzer_Logo.png")
    print(f"Tentative de chargement du logo à : {logo_path}")
    if os.path.exists(logo_path) :
        logo_image = Image.open(logo_path)
        logo_image = logo_image.resize((120, 120), Image.Resampling.LANCZOS)
        logo_photo = ImageTk.PhotoImage(logo_image)
        logo_label = tk.Label(root, image=logo_photo, bg="#F2F2F2", borderwidth=0, highlightthickness=0)
        logo_label.image = logo_photo # Garder une référence pour éviter la suppression par le garbage collector
        logo_label.place(relx=0.01, rely=0.99, anchor="sw")
        print("Logo chargé avec succès")
    else:
        print(f"Erreur : Le fichier logo n'existe pas à : {logo_path}")
        tk.Label(root, text="Logo non trouvé", font=("Helvetica", 10), bg="#F2F2F2", fg="#FF0000").place(relx=0.01,rely=0.99,anchor="sw")
except Exception as e:
    print(f"Erreur lors du chargement du logo : {e}")
    tk.Label(root, text="Erreur : Logo non chargé", font=("Helvetica", 10), bg="#F2F2F2", fg="#FF0000").place(relx=0.01,rely=0.99,anchor="sw")

# --- Afficher d'abord la page d'accueil
show_frame(frame_accueil)
print("Cadre d'accueil affiché")

# --- Lancer la boucle principale
if __name__ == "__main__":
    print("Lancement de l'application…")
    
# —— UI DESCENTE EP ———————————————————————————————————————————
frame_descente_ep_content = tk.Frame(frame_descente_ep, bg="#F2F2F2")
frame_descente_ep_content.pack(side="left", expand=True, fill="both", padx=(0, 10))

frame_filtre_ep = tk.Frame(frame_descente_ep_content, bg="#FFFFFF", bd=1, relief="solid")
# frame_filtre_ep.pack(fill="x", padx=10, pady=10)
tk.Label(frame_filtre_ep, text="🔎 Filtrer :", bg="#FFFFFF").pack(side="left", padx=5)
entree_filtre_ep = tk.Entry(frame_filtre_ep, width=40)
entree_filtre_ep.pack(side="left", padx=5)
btn_niveau_ep = None

tree_ep = ttk.Treeview(
    frame_descente_ep_content,
    columns=("Nom", "Longueur (m)", "Type"),
    show="headings"
)
for col in ("Nom", "Longueur (m)", "Type"):
    tree_ep.heading(col, text=col)
    tree_ep.column(col, anchor="center", width=150)
tree_ep.tag_configure("evenrow", background="#F2F2F2")
tree_ep.tag_configure("oddrow",  background="#FFFFFF")
scroll_ep = ttk.Scrollbar(frame_descente_ep_content, orient="vertical", command=tree_ep.yview)
tree_ep.configure(yscrollcommand=scroll_ep.set)
tree_ep.pack(side="left", expand=True, fill="both", padx=(10, 0), pady=10)

def afficher_infos_descente_ep(event=None):
    """Affiche les infos complémentaires et met à jour le résumé pour la sélection dans 'Descente EP'. """
    sel = tree_ep.selection()
    if not sel:
        return
    nom_sel = tree_ep.item(sel[0])["values"][0]
    _update_infos_descente_ep(nom_sel)
    _update_resume_descente_ep(nom_sel)


def _update_infos_descente_ep(nom):
    """Stub: mettre ici la logique de mise à jour des infos complémentaires pour Descente EP."""
    # Exemple: récupérer les infos depuis un dict ou DataFrame et actualiser les widgets
    # element = data_descente_ep.get(nom, {})
    # info_widget.configure(text=str(element.get("details", "")))

def _update_resume_descente_ep(nom):
    """Stub: mettre ici la logique de mise à jour du résumé pour Descente EP."""
    # Exemple: calculer et afficher le résumé similaire aux autres onglets
    # resume_value = calcul_resume_descente_ep(nom)
    # resume_widget.configure(text=str(resume_value))

tree_ep.bind("<<TreeviewSelect>>", afficher_infos_descente_ep)
scroll_ep.pack(side="right", fill="y")

frame_resume_ep = tk.Frame(frame_descente_ep, bg="white", width=650)
frame_resume_ep.pack(side="right", fill="y", padx=10, pady=10)
frame_resume_ep.pack_propagate(False)
title_frame_resume_ep = tk.Frame(frame_resume_ep, bg="#004D40")
title_frame_resume_ep.pack(fill="x", padx=5, pady=(5,0))
tk.Label(title_frame_resume_ep, text="RÉSUMÉ", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)

general_frame_ep = tk.Frame(frame_resume_ep, bg="#FFFFFF", bd=2, relief="groove")
general_frame_ep.pack(fill="x", padx=5, pady=5)
grid_resume_ep = tk.Frame(general_frame_ep, bg="#FFFFFF")
grid_resume_ep.pack(pady=5, expand=True)
grid_resume_ep.grid_columnconfigure(1, weight=1)
tk.Label(grid_resume_ep, text="📏 Longueur totale :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=0, column=0, sticky="w", padx=10)
label_dimension_totale_ep = tk.Label(grid_resume_ep, text="0.00 m", bg="#FFFFFF", font=("Helvetica", 10, "bold"))
label_dimension_totale_ep.grid(row=0, column=1, sticky="e", padx=10)

title_frame_filtrage_ep = tk.Frame(frame_resume_ep, bg="#004D40")
title_frame_filtrage_ep.pack(fill="x", padx=5, pady=(15,0))
tk.Label(title_frame_filtrage_ep, text="FILTRAGE PAR NOMS", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)

types_frame_ep = tk.Frame(frame_resume_ep, bg="white", bd=1, relief="solid")
types_frame_ep.pack(fill="both", padx=5, pady=5, expand=True)
data_frame_types_ep = tk.Frame(types_frame_ep, bg="white")
data_frame_types_ep.pack(fill="both", expand=True, padx=5, pady=5)
tree_surfaces_ep = ttk.Treeview(
    data_frame_types_ep,
    style="Green.Treeview",
    columns=("Type", "m"),
    show="headings",
    height=8
)
tree_surfaces_ep.configure(style="Green.Treeview")
tree_surfaces_ep.heading("Type", text="Type")
tree_surfaces_ep.heading("m", text="m")
tree_surfaces_ep.column("Type", anchor="w", width=500, stretch=True)
tree_surfaces_ep.column("m", anchor="e", width=80, stretch=False)
tree_surfaces_ep.tag_configure("evenrow", background="#FFFFFF")
tree_surfaces_ep.tag_configure("oddrow",  background="#FFFFFF")
scroll_surfaces_ep = ttk.Scrollbar(data_frame_types_ep, orient="vertical", command=tree_surfaces_ep.yview)
tree_surfaces_ep.configure(yscrollcommand=scroll_surfaces_ep.set)
tree_surfaces_ep.pack(side="left", fill="both", expand=True, padx=(5, 0), pady=5)
scroll_surfaces_ep.pack(side="right", fill="y")

# ——— INFORMATIONS COMPLÉMENTAIRES ——————————————————
title_frame_info_ep = tk.Frame(frame_resume_ep, bg="#004D40")
title_frame_info_ep.pack(fill="x", padx=5, pady=(15, 0))
tk.Label(title_frame_info_ep, text="INFORMATIONS COMPLÉMENTAIRES", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)

info_frame_ep = tk.Frame(frame_resume_ep, bg="#FFFFFF", bd=2, relief="groove")
info_frame_ep.pack(fill="x", padx=5, pady=5)
grid_infos_ep = tk.Frame(info_frame_ep, bg="#FFFFFF")
grid_infos_ep.pack(pady=5, fill="x")
grid_infos_ep.grid_columnconfigure(1, weight=1)
grid_infos_ep.grid_columnconfigure(0, weight=1)


def afficher_donnees_descente_ep(flows=None):
    if flows is None:
        flows = donnees_ifc[ifc_actif].get("descente_ep", [])
    tree_ep.delete(*tree_ep.get_children())
    total_dim = 0.0
    for idx, (nom, dim, tp, *_) in enumerate(flows):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_ep.insert("", "end", values=(nom, dim, tp), tags=(tag,))
        total_dim += dim
    if label_dimension_totale_ep.winfo_exists():
        label_dimension_totale_ep.config(text=f"{round(total_dim,2)} m")
    maj_par_type_ep(flows)

def maj_par_type_ep(flows=None):
    if not ifc_actif or ifc_actif not in donnees_ifc:
        return
    if flows is None:
        flows = donnees_ifc[ifc_actif].get("descente_ep", [])
    for w in tree_surfaces_ep.get_children():
        tree_surfaces_ep.delete(w)
    agg = {}
    for nom, dim, *_ in flows:
        agg[nom] = agg.get(nom, 0) + dim
    for idx, (nom, dim) in enumerate(sorted(agg.items())):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_surfaces_ep.insert("", "end", values=(nom, round(dim,2)), tags=(tag,))

def _get_filtered_ep():
    eps = donnees_ifc.get(ifc_actif, {}).get("descente_ep", [])
    if filtre_zero_ep:
        eps = [e for e in eps if e[1] == 0]
    if filtre_niveaux_ep:
        if len(eps) > 0 and len(eps[0]) > 3:
            eps = [e for e in eps if e[3] in filtre_niveaux_ep]
    if filtre_texte_ep:
        lower = filtre_texte_ep
        eps = [e for e in eps if lower in e[0].lower()]
    return eps

def _apply_filters_ep():
    filtres = _get_filtered_ep()
    afficher_donnees_descente_ep(filtres)
    maj_par_type_ep(filtres)

def appliquer_filtre_ep():
    global filtre_texte_ep
    filtre_texte_ep = entree_filtre_ep.get().lower()
    _apply_filters_ep()

def reinitialiser_filtre_ep():
    global filtre_texte_ep, filtre_zero_ep, filtre_niveaux_ep
    entree_filtre_ep.delete(0, tk.END)
    filtre_texte_ep = ""
    filtre_zero_ep = False
    filtre_niveaux_ep = []
    _apply_filters_ep()

def appliquer_filtre_zero_ep():
    global filtre_zero_ep
    filtre_zero_ep = True
    _apply_filters_ep()

# ---- Sélection et informations complémentaires ----
def hide_infos_ep():
    for w in grid_infos_ep.winfo_children():
        w.destroy()

def _update_infos_ep(nom_sel: str, longueur: float = None, storey: str = None):
    """Update complementary information for EP based on the selected name."""
    hide_infos_ep()
    infos = donnees_ifc.get(ifc_actif, {}).get("descente_ep_infos", {})
    if storey is None:
        storeys = sorted({s for (n, s) in infos if n == nom_sel and s})
    else:
        storeys = [storey] if infos.get((nom_sel, storey)) else ([storey] if storey else [])
    niveau_txt = " - ".join(storeys) if storeys else "N/A"

    row = 0
    tk.Label(grid_infos_ep, text="Niveau :", bg="#FFFFFF", anchor="w").grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_infos_ep, text=niveau_txt, bg="#FFFFFF", anchor="e").grid(row=row, column=1, sticky="e", padx=10)
    row += 1
    if longueur is not None:
        tk.Label(grid_infos_ep, text="Longueur :", bg="#FFFFFF", anchor="w").grid(row=row, column=0, sticky="w", padx=10)
        tk.Label(grid_infos_ep, text=_format_summary_value(longueur, " m"), bg="#FFFFFF", anchor="e").grid(row=row, column=1, sticky="e", padx=10)

def _update_resume_ep(nom_sel: str):
    ep_src = [e for e in _get_filtered_ep() if e[0] == nom_sel]
    if not ep_src:
        return
    total_dim = sum(e[1] for e in ep_src)
    for w in grid_resume_ep.winfo_children():
        w.destroy()
    row = 0
    tk.Label(grid_resume_ep, text="📏 Longueur :", bg="#FFFFFF", font=("Helvetica", 10)).grid(row=row, column=0, sticky="w", padx=10)
    tk.Label(grid_resume_ep, text=_format_summary_value(total_dim, " m"), bg="#FFFFFF", font=("Helvetica", 10, "bold")).grid(row=row, column=1, sticky="e", padx=10)
    row += 1
    tk.Label(grid_resume_ep, text="", bg="#FFFFFF").grid(row=row, column=0, pady=2)

def afficher_infos_descente_ep(event=None):
    sel = tree_ep.selection()
    if not sel:
        hide_infos_ep()
        return
    values = tree_ep.item(sel[0])["values"]
    nom_sel = values[0]
    try:
        longueur = float(values[1])
    except (ValueError, TypeError):
        longueur = 0.0
    ep_type = values[2]
    storey = None
    for e in donnees_ifc.get(ifc_actif, {}).get("descente_ep", []):
        if (
            e[0] == nom_sel
            and abs(e[1] - longueur) < 0.01
            and e[2] == ep_type
        ):
            storey = e[3]
            break
    _update_infos_ep(nom_sel, longueur=longueur, storey=storey)
    _update_resume_ep(nom_sel)

def afficher_infos_descente_ep_resume(event=None):
    sel = tree_surfaces_ep.selection()
    if not sel:
        hide_infos_ep()
        return
    nom_sel = tree_surfaces_ep.item(sel[0])["values"][0]
    _update_resume_ep(nom_sel)
    _update_infos_ep(nom_sel)

# Interaction summary tree
def copy_type_summary_ep(event=None):
    sel = tree_surfaces_ep.selection()
    if sel:
        text = "\n".join(["\t".join(map(str, tree_surfaces_ep.item(i)['values'])) for i in sel])
        root.clipboard_clear()
        root.clipboard_append(text)
def filter_main_by_type_ep(event=None):
    row_id = tree_surfaces_ep.selection()
    if row_id:
        type_sel = tree_surfaces_ep.item(row_id[0])['values'][0]
        afficher_donnees_descente_ep([ep for ep in donnees_ifc[ifc_actif]['descente_ep'] if ep[0]==type_sel])

tree_surfaces_ep.bind("<Button-1>", copy_type_summary_ep)
tree_surfaces_ep.bind("<<TreeviewSelect>>", afficher_infos_descente_ep_resume)
tree_surfaces_ep.bind("<Double-1>", filter_main_by_type_ep)

# Nav button update to trigger data refresh
for btn in nav_buttons:
    if btn.cget("text") == "DESCENTE EP":
        btn.configure(command=lambda b=btn: (set_selected(b), _apply_filters_ep(), show_frame(frame_descente_ep)))
        break

root.after(0, maj_par_type_ep)
tree_ep.bind("<<TreeviewSelect>>", afficher_infos_descente_ep)

# —— UI TYPE DE PLAFOND ———————————————————————————————————————————
# (copié-collé de l’interface "TYPE DE SOL", renommé)

# ---- Contenu principal ----
frame_type_plafond_content = tk.Frame(frame_type_plafond, bg="#F2F2F2")
frame_type_plafond_content.pack(side="left", expand=True, fill="both", padx=(0, 10))

# ---- Barre de filtre ----
frame_filtre_type_plafond = tk.Frame(frame_type_plafond_content, bg="#FFFFFF", bd=1, relief="solid")
# frame_filtre_type_plafond.pack(fill="x", padx=10, pady=10)
tk.Label(frame_filtre_type_plafond, text="🔎 Filtrer :", bg="#FFFFFF").pack(side="left", padx=5)
entree_filtre_type_plafond = tk.Entry(frame_filtre_type_plafond, width=40)
entree_filtre_type_plafond.pack(side="left", padx=5)
print("Cadre de filtrage des plafonds créé")

# ---- Treeview principal ----
tree_type_plafond = ttk.Treeview(
    frame_type_plafond_content,
    columns=("Nom", "Surface (m²)", "Longueur ", "Type"),
    show="headings"
)
for col in ("Nom", "Surface (m²)", "Longueur ", "Type"):
    tree_type_plafond.heading(col, text=col)
    tree_type_plafond.column(col, anchor="center", width=80)
tree_type_plafond.column("Nom", width=120)
tree_type_plafond.tag_configure("evenrow", background="#FFFFFF")
tree_type_plafond.tag_configure("oddrow",  background="#F2F2F2")
scroll_type_plafond = ttk.Scrollbar(frame_type_plafond_content, orient="vertical", command=tree_type_plafond.yview)
tree_type_plafond.configure(yscrollcommand=scroll_type_plafond.set)
tree_type_plafond.pack(side="left", expand=True, fill="both", padx=(10, 0), pady=10)
scroll_type_plafond.pack(side="right", fill="y")

# ---- Menu contextuel pour copier le texte de la colonne Nom ----
def copy_nom_type_plafond():
    sel = tree_type_plafond.selection()
    if sel:
        nom = tree_type_plafond.item(sel[0])['values'][0]
        root.clipboard_clear()
        root.clipboard_append(nom)

context_menu_type_plafond = tk.Menu(root, tearoff=0)
context_menu_type_plafond.add_command(label="Copier", command=copy_nom_type_plafond)

def show_context_menu_type_plafond(event):
    row_id = tree_type_plafond.identify_row(event.y)
    if row_id:
        tree_type_plafond.selection_set(row_id)
        context_menu_type_plafond.post(event.x_root, event.y_root)

tree_type_plafond.bind("<Button-3>", show_context_menu_type_plafond)

print("Arborescence des plafonds créée")

# ---- Colonne de résumé / droite ----
frame_resume_type_plafond = tk.Frame(frame_type_plafond, bg="white", width=650)
frame_resume_type_plafond.pack(side="right", fill="y", padx=10, pady=10)
frame_resume_type_plafond.pack_propagate(False)

title_frame_resume_type_plafond = tk.Frame(frame_resume_type_plafond, bg="#004D40")
title_frame_resume_type_plafond.pack(fill="x", padx=5, pady=(5,0))
tk.Label(title_frame_resume_type_plafond, text="RÉSUMÉ", font=TITLE_FONT, bg="#004D40", fg="white").pack(pady=5)

general_frame_type_plafond = tk.Frame(frame_resume_type_plafond, bg="white", bd=1, relief="solid")
general_frame_type_plafond.pack(fill="x", padx=5, pady=5)
grid_resume_type_plafond = tk.Frame(general_frame_type_plafond, bg="white")
grid_resume_type_plafond.pack(pady=5)

tk.Label(grid_resume_type_plafond, text="📏 Longueur :", bg="white", font=("Helvetica", 10)).grid(row=0, column=0, sticky="w", padx=10)
label_longueur_totale_type_plafond = tk.Label(grid_resume_type_plafond, text="0.00 ml", bg="white", font=("Helvetica", 10, "bold"))
label_longueur_totale_type_plafond.grid(row=0, column=1, sticky="e", padx=10)

tk.Label(grid_resume_type_plafond, text="📐 Surface brute :", bg="white", font=("Helvetica", 10)).grid(row=1, column=0, sticky="w", padx=10)
label_surface_brut_type_plafond = tk.Label(grid_resume_type_plafond, text="0.00 m²", bg="white", font=("Helvetica", 10, "bold"))
label_surface_brut_type_plafond.grid(row=1, column=1, sticky="e", padx=10)

tk.Label(grid_resume_type_plafond, text="🏠 Surface nette :", bg="white", font=("Helvetica", 10)).grid(row=2, column=0, sticky="w", padx=10)
label_surface_net_type_plafond = tk.Label(grid_resume_type_plafond, text="0.00 m²", bg="white", font=("Helvetica", 10, "bold"))
label_surface_net_type_plafond.grid(row=2, column=1, sticky="e", padx=10)

# ---- Tableau résumé "Surfaces par type" ----
data_frame_surfaces_type_plafond = tk.Frame(frame_resume_type_plafond, bg="white", bd=1, relief="solid")
data_frame_surfaces_type_plafond.pack(fill="x", padx=5, pady=5)

title_frame_surfaces_type_plafond = tk.Frame(frame_resume_type_plafond, bg="#004D40")
title_frame_surfaces_type_plafond.pack(fill="x", padx=5, pady=(15, 0))
tk.Label(title_frame_surfaces_type_plafond, text="INFORMATIONS COMPLÉMENTAIRES", font=("Helvetica", 12, "bold"), bg="#004D40", fg="white").pack(pady=5)

tree_surfaces_type_plafond = ttk.Treeview(data_frame_surfaces_type_plafond, columns=("Type", "m²"), show="headings", height=10)
tree_surfaces_type_plafond.configure(style="Summary.Treeview")
tree_surfaces_type_plafond.heading("Type", text="Type")
tree_surfaces_type_plafond.heading("m²", text="m²")
tree_surfaces_type_plafond.column("Type", anchor="w", width=200)
tree_surfaces_type_plafond.column("m²", anchor="e", width=80)
tree_surfaces_type_plafond.tag_configure("evenrow", background="white")
tree_surfaces_type_plafond.tag_configure("oddrow",  background="white")

scroll_surfaces_type_plafond = ttk.Scrollbar(data_frame_surfaces_type_plafond, orient="vertical", command=tree_surfaces_type_plafond.yview)
tree_surfaces_type_plafond.configure(yscrollcommand=scroll_surfaces_type_plafond.set)
tree_surfaces_type_plafond.pack(side="left", fill="both", expand=True, padx=(5,0), pady=5)
scroll_surfaces_type_plafond.pack(side="right", fill="y")

# ---- Fonctions de données pour TYPE DE PLAFOND ----
def afficher_donnees_type_plafond(plafs=None):
    if plafs is None:
        plafs = donnees_ifc.get(ifc_actif, {}).get("plafonds", [])
    # reset tree
    tree_type_plafond.delete(*tree_type_plafond.get_children())

    longueur_totale = surface_totale = 0.0
    surfaces_par_nom = {}

    for idx, (nom, surface, longueur, revetement_type) in enumerate(plafs):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_type_plafond.insert("", "end", values=(nom, surface, longueur, revetement_type), tags=(tag,))
        longueur_totale += longueur
        surface_totale += surface
        surfaces_par_nom[nom] = surfaces_par_nom.get(nom, 0) + surface

    label_longueur_totale_type_plafond.config(text=f"{round(longueur_totale,2)} ml")
    label_surface_brut_type_plafond.config(text=f"{round(surface_totale,2)} m²")
    label_surface_net_type_plafond.config(text=f"{round(surface_totale,2)} m²")

    tree_surfaces_type_plafond.delete(*tree_surfaces_type_plafond.get_children())
    for idx, (nom, surface) in enumerate(surfaces_par_nom.items()):
        if surface <= 0:
            continue
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_surfaces_type_plafond.insert("", "end", values=(nom, round(surface,2)), tags=(tag,))

    # Ajuster largeur colonne m²
    font = tkFont.Font()
    max_w = font.measure("m²")
    for iid in tree_surfaces_type_plafond.get_children():
        w = font.measure(str(tree_surfaces_type_plafond.set(iid, "m²")))
        if w > max_w: max_w = w
    tree_surfaces_type_plafond.column("m²", width=max_w + 20, stretch=False)

def appliquer_filtre_type_plafond():
    txt = entree_filtre_type_plafond.get().lower()
    filtres = [p for p in donnees_ifc.get(ifc_actif, {}).get("plafonds", []) if txt in p[0].lower()]
    afficher_donnees_type_plafond(filtres)

def reinitialiser_filtre_type_plafond():
    entree_filtre_type_plafond.delete(0, tk.END)
    afficher_donnees_type_plafond()

def appliquer_filtre_zero_type_plafond():
    zero = [p for p in donnees_ifc.get(ifc_actif, {}).get("plafonds", []) if p[1] == 0]
    afficher_donnees_type_plafond(zero)

# ---- Interactions Résumé ----
def copy_type_summary_plafond(event=None):
    sel = tree_surfaces_type_plafond.selection()
    if sel:
        t = tree_surfaces_type_plafond.item(sel[0])['values'][0]
        root.clipboard_clear()
        root.clipboard_append(t)

def filter_main_by_type_plafond(event=None):
    row = tree_surfaces_type_plafond.selection()
    if row:
        type_sel = tree_surfaces_type_plafond.item(row[0])['values'][0]
        afficher_donnees_type_plafond([p for p in donnees_ifc.get(ifc_actif, {}).get("plafonds", []) if p[0]==type_sel])

tree_surfaces_type_plafond.bind("<Button-1>", copy_type_summary_plafond)
tree_surfaces_type_plafond.bind("<Double-1>", filter_main_by_type_plafond)

print("Cadre de CV des plafonds créés")

# ---- Activation de la mise à jour du résumé à l'ouverture de l’onglet ----
for btn in nav_buttons:
    if btn.cget("text") == "TYPE DE PLAFOND":
        btn.configure(command=lambda b=btn: (set_selected(b), afficher_donnees_type_plafond(), show_frame(frame_type_plafond)))
        break

# ---- Fin UI TYPE DE PLAFOND ----
root.mainloop()  # ← c'est ici que l'application reste bloquée à l'affichage
print("Application terminée")
input("Appuie sur Entrée pour fermer la console…")

# --- Nouvelles fonctions de mise à jour des Treeviews (écrasent les anciennes) ----
def maj_largeur_par_type_garde_corps(garde_corps=None):
    global tree_surfaces_garde_corps
    garde_corps = garde_corps or donnees_ifc[ifc_actif]["garde_corps"]
    if tree_surfaces_garde_corps is None:
        return
    tree_surfaces_garde_corps.delete(*tree_surfaces_garde_corps.get_children())
    par_type = {}
    for nom, largeur, *_ in garde_corps:
        cle = nom or "Garde-corps sans nom"
        par_type[cle] = par_type.get(cle, 0) + largeur
    for idx, (lib, w) in enumerate(sorted(par_type.items())):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_surfaces_garde_corps.insert("", "end", values=(lib, round(w, 2)), tags=(tag,))

def maj_par_type_poutres(poutres=None):
    if not ifc_actif or ifc_actif not in donnees_ifc:
        return
    global tree_surfaces_poutres
    poutres = poutres or donnees_ifc[ifc_actif]["poutres"]
    if tree_surfaces_poutres is None:
        return
    tree_surfaces_poutres.delete(*tree_surfaces_poutres.get_children())
    agg = {}
    for nom, longu, *_ in poutres:
        agg[nom] = agg.get(nom, 0) + longu
    for idx, (nom, longu) in enumerate(sorted(agg.items())):
        tag = "evenrow" if idx % 2 == 0 else "oddrow"
        tree_surfaces_poutres.insert("", "end", values=(nom, round(longu, 2)), tags=(tag,))

# Lors de l'affichage de l'onglet ESCALIER, charger les données
notebook.tab(tab_escalier, state="normal")
tab_escalier.bind("<Visibility>", lambda e: afficher_donnees_escaliers(donnees_ifc.get(ifc_actif, {}).get("escaliers", [])))