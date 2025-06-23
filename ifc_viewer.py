import argparse
import pathlib
import tempfile
import webbrowser
from tkinter import Tk, messagebox

import webview


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang='en'>
<head>
    <meta charset='UTF-8'>
    <title>IFC Viewer</title>
    <style>html,body,#viewer{margin:0;padding:0;height:100%;overflow:hidden;}</style>
    <script type='module'>
        import { IfcViewerAPI } from 'https://cdn.jsdelivr.net/npm/@ifcjs/viewer@1.7.2/dist/ifc-viewer-api.js';  # noqa: E501
        const container = document.getElementById('viewer');
        const viewer = new IfcViewerAPI({ container });
        viewer.grid.setGrid();
        viewer.axes.setAxes();
        viewer.IFC.setWasmPath('https://cdn.jsdelivr.net/npm/web-ifc@0.0.47/');
        viewer.loadIfcUrl('{ifc_url}');
    </script>
</head>
<body>
    <div id='viewer'></div>
</body>
</html>"""


def build_html(ifc_uri: str) -> str:
    """Return the HTML page to display the IFC model."""
    return HTML_TEMPLATE.replace('{ifc_url}', ifc_uri)


def parse_args() -> pathlib.Path:
    parser = argparse.ArgumentParser(description='Display an IFC file in 3D.')
    parser.add_argument('file', nargs='?', help='Chemin du fichier IFC')
    parser.add_argument('--file', dest='file_option', help='Chemin du fichier IFC')
    args = parser.parse_args()
    file_path = args.file_option or args.file
    if not file_path:
        parser.error('Aucun fichier IFC spécifié.')
    path = pathlib.Path(file_path)
    if not path.is_file():
        parser.error(f"Fichier introuvable: {file_path}")
    return path


def open_in_webview(html: str) -> None:
    webview.create_window('IFC Viewer', html=html, width=1600, height=900)
    webview.start(gui='edgechromium', http_server=True)


def fallback_in_browser(html: str) -> None:
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:  # noqa: E501
        f.write(html)
        temp_path = pathlib.Path(f.name)
    webbrowser.open(temp_path.as_uri())


def main() -> None:
    path = parse_args()
    ifc_uri = path.resolve().as_uri()
    html = build_html(ifc_uri)

    root = Tk()
    root.withdraw()
    try:
        try:
            open_in_webview(html)
            print('Affichage via WebView2')
        except Exception as exc:
            print('WebView2 indisponible, ouverture dans le navigateur')
            messagebox.showwarning('IFC Viewer', 'WebView2 indisponible. Ouverture dans le navigateur par défaut.')  # noqa: E501
            fallback_in_browser(html)
    finally:
        root.destroy()


if __name__ == '__main__':
    main()
