# PyInstaller spec — run from repo root: pyinstaller packaging/nb_pdf_tools.spec
# Requires: pip install -r requirements-build.txt

import os

from PyInstaller.utils.hooks import collect_all

PROJECT_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(SPEC)), ".."))
SRC = os.path.join(PROJECT_ROOT, "src")
ENTRY = os.path.join(SRC, "entry_desktop.py")
ICON = os.path.join(PROJECT_ROOT, "assets", "nb_pdf_tools_icon.ico")
VERSION_FILE = os.path.join(os.path.dirname(os.path.abspath(SPEC)), "version_file.txt")

ctk_datas, ctk_binaries, ctk_hidden = collect_all("customtkinter")

a = Analysis(
    [ENTRY],
    pathex=[SRC, PROJECT_ROOT],
    binaries=ctk_binaries,
    datas=[
        (os.path.join(PROJECT_ROOT, "assets"), "assets"),
        (os.path.join(SRC, "locales"), "locales"),
    ]
    + ctk_datas,
    hiddenimports=[
        "customtkinter",
        "darkdetect",
        "PIL",
        "PIL._tkinter_finder",
        "packaging",
        "packaging.version",
        "version_info",
        "pdf_engine",
        "pikepdf",
        "pypdf",
        "lxml",
        "lxml.etree",
        "cryptography",
        "docx",
        "openpyxl",
        "reportlab",
        "pdfplumber",
        "Crypto",
        "pdf2docx",
        "windnd",
    ]
    + ctk_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="NB_PDF_Tools",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=ICON if os.path.isfile(ICON) else None,
    version=VERSION_FILE if os.path.isfile(VERSION_FILE) else None,
)
