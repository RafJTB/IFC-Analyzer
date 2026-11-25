# Ancienne version (Python / Tkinter)

`IFC_Analyzer_fixed.py` est la première version de l'outil, gardée ici **pour référence** jusqu'à ce que
la version web fasse tout ce qu'elle faisait (estimation, export Excel). Elle n'est plus maintenue.

Ses défauts connus, corrigés dans la version web :

- murs, poteaux et poutres comptés deux ou trois fois (`IfcWall` + `IfcWallStandardCase`) ;
- unités du fichier ignorées (un export en millimètres donnait des épaisseurs de « 20000cm ») ;
- surface nette des murs estimée au prorata au lieu d'utiliser les réservations de la maquette ;
- plantages silencieux sur certains fichiers IFC4 (type prédéfini vide, escaliers) ;
- onglet Estimation : PU perdus au changement de fichier, total HT faux, sous-chapitres en double ;
- environ 580 lignes jamais exécutées (placées après `root.mainloop()`).
