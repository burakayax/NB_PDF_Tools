"""Branded splash shown while heavy modules load (entry_desktop → import main)."""

from __future__ import annotations

import os

import customtkinter as ctk

from modules.app_paths import resource_path
from modules.ui_theme import theme
from version_info import COMPANY_NAME, PRODUCT_NAME, __version__


def show_splash() -> ctk.CTk:
    ctk.set_appearance_mode("dark")
    splash = ctk.CTk()
    splash.overrideredirect(True)
    ui = theme()
    splash.configure(fg_color=ui["bg"])
    w, h = 440, 300
    splash.geometry(f"{w}x{h}")
    splash.update_idletasks()
    sw = splash.winfo_screenwidth()
    sh = splash.winfo_screenheight()
    x = max(0, (sw - w) // 2)
    y = max(0, (sh - h) // 2)
    splash.geometry(f"{w}x{h}+{x}+{y}")

    card = ctk.CTkFrame(
        splash,
        fg_color=ui["panel"],
        border_width=1,
        border_color=ui["border_subtle"],
        corner_radius=20,
    )
    card.pack(expand=True, fill="both", padx=18, pady=18)

    inner = ctk.CTkFrame(card, fg_color="transparent")
    inner.pack(expand=True, fill="both", padx=28, pady=28)

    logo_path = resource_path("assets", "nb_pdf_tools_icon.png")
    if os.path.isfile(logo_path):
        try:
            from PIL import Image

            pil = Image.open(logo_path)
            try:
                resample = Image.Resampling.LANCZOS
            except AttributeError:
                resample = Image.LANCZOS  # type: ignore[attr-defined]
            pil = pil.resize((72, 72), resample)
            img = ctk.CTkImage(light_image=pil, dark_image=pil, size=(72, 72))
            ctk.CTkLabel(inner, image=img, text="").pack(pady=(0, 12))
        except Exception:
            ctk.CTkLabel(inner, text="◆", font=("Segoe UI", 42), text_color=ui["accent_soft"]).pack(pady=(0, 12))
    else:
        ctk.CTkLabel(inner, text="◆", font=("Segoe UI", 42), text_color=ui["accent_soft"]).pack(pady=(0, 12))

    ctk.CTkLabel(
        inner,
        text=PRODUCT_NAME,
        font=("Segoe UI Semibold", 22, "bold"),
        text_color=ui["text"],
    ).pack()
    ctk.CTkLabel(
        inner,
        text=f"{COMPANY_NAME} · Desktop Edition",
        font=("Segoe UI", 11),
        text_color=ui["muted"],
    ).pack(pady=(4, 0))
    ctk.CTkLabel(
        inner,
        text=f"v{__version__}",
        font=("Segoe UI Semibold", 12),
        text_color=ui["accent_soft"],
    ).pack(pady=(16, 0))
    ctk.CTkLabel(
        inner,
        text="Loading…",
        font=("Segoe UI", 11),
        text_color=ui["muted"],
    ).pack(pady=(20, 0))

    splash.attributes("-topmost", True)
    splash.update()
    return splash
