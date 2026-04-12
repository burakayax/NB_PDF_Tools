"""
Production entry point: splash screen, then main application.

Development:
  python src/entry_desktop.py

Distribution (PyInstaller):
  NB_PDF_TOOLS.exe built from this script.
"""

from __future__ import annotations

import sys
from pathlib import Path


def _ensure_paths() -> None:
    here = Path(__file__).resolve().parent
    if str(here) not in sys.path:
        sys.path.insert(0, str(here))
    root = here.parent
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))


def main() -> None:
    _ensure_paths()
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            import os

            try:
                os.chdir(meipass)
            except OSError:
                pass

    splash = None
    try:
        from modules.splash_screen import show_splash

        splash = show_splash()
    except Exception:
        pass

    # Splash must be destroyed *before* NBPDFApp(): two CTk() roots fight for tkinter's
    # default root; destroying the splash after the main window clears _default_root and
    # breaks CTkFont / tkinter.font ("Too early to use font: no default root window").
    try:
        import main as main_module
    finally:
        if splash is not None:
            try:
                splash.destroy()
            except Exception:
                pass

    app = main_module.NBPDFApp()
    app.mainloop()


if __name__ == "__main__":
    main()
