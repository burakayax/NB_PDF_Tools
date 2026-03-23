"""
Central UI theme settings.

To revert the project to the previous simpler look later, change
`ACTIVE_THEME` from "modern" to "classic".
"""

from datetime import datetime

import customtkinter as ctk

ACTIVE_THEME = "modern"

THEMES = {
    "classic": {
        "bg": "#202020",
        "panel": "#1e1e1e",
        "panel_alt": "#2a2a2a",
        "border": "#333333",
        "text": "#ffffff",
        "muted": "#8a8f98",
        "accent": "#3a86ff",
        "accent_hover": "#2a66cc",
        "success": "#2ecc71",
        "warning": "#f39c12",
        "danger": "#e74c3c",
        "button_text": "#ffffff",
        "app_title_font": ("Segoe UI", 46, "bold"),
        "title_font": ("Segoe UI", 22, "bold"),
        "subtitle_font": ("Segoe UI", 13, "bold"),
        "body_font": ("Segoe UI", 12),
        "small_font": ("Segoe UI", 11),
        "badge_font": ("Segoe UI", 10, "bold"),
    },
    "modern": {
        "bg": "#14181f",
        "panel": "#171c24",
        "panel_alt": "#202632",
        "border": "#2b3442",
        "text": "#f4f7fb",
        "muted": "#93a0b4",
        "accent": "#4f8cff",
        "accent_hover": "#3b74de",
        "success": "#37c978",
        "warning": "#ffb547",
        "danger": "#ff6b5e",
        "button_text": "#f8fbff",
        "app_title_font": ("Segoe UI Semibold", 48, "bold"),
        "title_font": ("Segoe UI Semibold", 24, "bold"),
        "subtitle_font": ("Segoe UI Semibold", 13, "bold"),
        "body_font": ("Segoe UI", 12),
        "small_font": ("Segoe UI", 11),
        "badge_font": ("Segoe UI Semibold", 10, "bold"),
    },
}

BADGE_TONES = {
    "neutral": {"fg": "#273142", "text": "#c8d3e0"},
    "info": {"fg": "#213554", "text": "#9cc3ff"},
    "success": {"fg": "#173626", "text": "#63e19b"},
    "warning": {"fg": "#473217", "text": "#ffcc75"},
    "danger": {"fg": "#4a2323", "text": "#ff9b95"},
}


def theme():
    return THEMES.get(ACTIVE_THEME, THEMES["modern"])


def badge_colors(tone: str = "neutral"):
    return BADGE_TONES.get(tone, BADGE_TONES["neutral"])


def add_footer(parent, left_text: str = "NB Global Studio", right_text: str | None = None):
    ui = theme()
    if right_text is None:
        right_text = datetime.now().strftime("%d.%m.%Y")

    footer = ctk.CTkFrame(
        parent,
        fg_color=ui["panel"],
        border_width=1,
        border_color=ui["border"],
        corner_radius=16,
        height=44,
    )
    footer.pack(fill="x", padx=30, pady=(8, 16))
    footer.pack_propagate(False)

    ctk.CTkLabel(
        footer,
        text=left_text,
        font=ui["small_font"],
        text_color=ui["muted"],
    ).pack(side="left", padx=16)

    ctk.CTkLabel(
        footer,
        text=right_text,
        font=ui["small_font"],
        text_color=ui["muted"],
    ).pack(side="right", padx=16)

    return footer
