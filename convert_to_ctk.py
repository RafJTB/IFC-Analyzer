import re
from pathlib import Path

def convert_file(src: Path, dst: Path):
    text = src.read_text(encoding='utf-8')

    # Insert CustomTkinter initialization after the main import block
    lines = text.splitlines()
    last_import = -1
    limit = None
    for i, line in enumerate(lines):
        if 'TITLE_FONT' in line:
            limit = i
            break
    search_until = limit if limit is not None else len(lines)
    for i in range(search_until):
        stripped = lines[i].strip()
        if stripped.startswith('import ') or stripped.startswith('from '):
            last_import = i
    if last_import != -1:
        init_block = [
            'import customtkinter as ctk',
            'ctk.set_appearance_mode("dark")',
            'ctk.set_default_color_theme("blue")',
        ]
        lines[last_import + 1:last_import + 1] = init_block
    text = "\n".join(lines)

    replacements = {
        r"\btk\.Frame\(": "ctk.CTkFrame(",
        r"\btk\.Label\(": "ctk.CTkLabel(",
        r"\btk\.Button\(": "ctk.CTkButton(",
        r"\btk\.Entry\(": "ctk.CTkEntry(",
        r"\btk\.Checkbutton\(": "ctk.CTkCheckBox(",
        r"\btk\.Canvas\(": "ctk.CTkCanvas(",
        r"\btk\.Scrollbar\(": "ctk.CTkScrollbar(",
        r"\btk\.Tk\(": "ctk.CTk(",
    }
    for pattern, repl in replacements.items():
        text = re.sub(pattern, repl, text)

    option_map = {
        r"\bbg=": "fg_color=",
        r"\bfg=": "text_color=",
        r"\brelief=": "corner_radius=",
        r"\bborderwidth=": "border_width=",
    }
    for pattern, repl in option_map.items():
        text = re.sub(pattern, repl, text)

    dst.write_text(text, encoding='utf-8')

if __name__ == '__main__':
    src = Path('IFC_Analyzer.py')
    dst = Path('IFC_Analyzer_ctk.py')
    convert_file(src, dst)
    print(f'Converted {src} -> {dst}')
