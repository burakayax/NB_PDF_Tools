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
        "bg": "#0f172a",
        "panel": "#1e293b",
        "panel_alt": "#243447",
        "panel_soft": "#334155",
        "border": "#334155",
        "text": "#f8fafc",
        "muted": "#94a3b8",
        "accent": "#2563eb",
        "accent_hover": "#1d4ed8",
        "accent_soft": "#38bdf8",
        "success": "#2ecc71",
        "warning": "#f39c12",
        "danger": "#e74c3c",
        "button_text": "#ffffff",
        "input_bg": "#0f172a",
        "input_border": "#475569",
        "app_title_font": ("Segoe UI", 46, "bold"),
        "title_font": ("Segoe UI", 22, "bold"),
        "subtitle_font": ("Segoe UI", 13, "bold"),
        "body_font": ("Segoe UI", 12),
        "small_font": ("Segoe UI", 11),
        "badge_font": ("Segoe UI", 10, "bold"),
    },
    "modern": {
        "bg": "#0f172a",
        "panel": "#1e293b",
        "panel_alt": "#243447",
        "panel_soft": "#334155",
        "border": "#334155",
        "text": "#f8fafc",
        "muted": "#94a3b8",
        "accent": "#2563eb",
        "accent_hover": "#1d4ed8",
        "accent_soft": "#38bdf8",
        "success": "#22c55e",
        "warning": "#f59e0b",
        "danger": "#f87171",
        "button_text": "#ffffff",
        "input_bg": "#0f172a",
        "input_border": "#475569",
        "app_title_font": ("Segoe UI Semibold", 48, "bold"),
        "title_font": ("Segoe UI Semibold", 24, "bold"),
        "subtitle_font": ("Segoe UI Semibold", 13, "bold"),
        "body_font": ("Segoe UI", 12),
        "small_font": ("Segoe UI", 11),
        "badge_font": ("Segoe UI Semibold", 10, "bold"),
    },
}

BADGE_TONES = {
    "neutral": {"fg": "#1e293b", "text": "#cbd5e1"},
    "info": {"fg": "#1e3a5f", "text": "#7dd3fc"},
    "success": {"fg": "#14532d", "text": "#86efac"},
    "warning": {"fg": "#422006", "text": "#fcd34d"},
    "danger": {"fg": "#450a0a", "text": "#fca5a5"},
}


def theme():
    return THEMES.get(ACTIVE_THEME, THEMES["modern"])


def badge_colors(tone: str = "neutral"):
    return BADGE_TONES.get(tone, BADGE_TONES["neutral"])


def add_footer(
    parent,
    left_text: str = "NB PDF Tools",
    center_text: str | None = None,
    right_text: str | None = None,
    action_text: str | None = None,
    action_command=None,
):
    ui = theme()
    if center_text is None:
        center_text = "by NB Global Studio"
    if right_text is None:
        right_text = datetime.now().strftime("%d.%m.%Y")

    footer = ctk.CTkFrame(
        parent,
        fg_color=ui["panel"],
        border_width=1,
        border_color=ui["border"],
        corner_radius=20,
        height=48,
    )
    footer.pack(fill="x", padx=30, pady=(8, 16))
    footer.pack_propagate(False)

    content = ctk.CTkFrame(footer, fg_color="transparent")
    content.pack(fill="both", expand=True, padx=14, pady=7)

    left_frame = ctk.CTkFrame(content, fg_color="transparent")
    left_frame.pack(side="left", fill="y")

    center_frame = ctk.CTkFrame(content, fg_color="transparent")
    center_frame.pack(side="left", fill="both", expand=True)

    right_frame = ctk.CTkFrame(content, fg_color="transparent")
    right_frame.pack(side="right", fill="y")

    ctk.CTkLabel(
        left_frame,
        text=left_text,
        font=ui["small_font"],
        text_color=ui["muted"],
        anchor="w",
        fg_color="transparent",
    ).pack(side="left")

    ctk.CTkLabel(
        center_frame,
        text=center_text,
        font=ui["small_font"],
        text_color=ui["muted"],
        anchor="center",
        fg_color="transparent",
    ).pack(expand=True)

    if action_text and action_command:
        ctk.CTkButton(
            right_frame,
            text=action_text,
            height=28,
            width=92,
            font=ui["small_font"],
            fg_color=ui["panel_soft"],
            hover_color=ui["border"],
            text_color=ui["text"],
            command=action_command,
        ).pack(side="right", padx=(10, 0))

    ctk.CTkLabel(
        right_frame,
        text=right_text,
        font=ui["small_font"],
        text_color=ui["muted"],
        fg_color="transparent",
    ).pack(side="right")

    return footer
