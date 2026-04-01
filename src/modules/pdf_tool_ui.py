"""
Premium shared UI for PDF tool windows: file cards, drop zones, headers.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Iterable

import customtkinter as ctk

from modules.i18n import t
from modules.ui_theme import theme


def format_file_size(num_bytes: int) -> str:
    if num_bytes < 0:
        return "—"
    n = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024.0 or unit == "GB":
            if unit == "B":
                return f"{int(n)} {unit}"
            return f"{n:.1f} {unit}"
        n /= 1024.0
    return f"{int(num_bytes)} B"


def file_icon_emoji(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        return "📕"
    if ext in (".doc", ".docx"):
        return "📘"
    if ext in (".xls", ".xlsx", ".xlsm", ".xltx", ".xltm"):
        return "📗"
    return "📄"


def filter_paths_by_extensions(paths: Iterable[str], extensions: set[str]) -> list[str]:
    out: list[str] = []
    ext_lower = {e.lower() if e.startswith(".") else f".{e.lower()}" for e in extensions}
    for p in paths:
        if not p or not os.path.isfile(p):
            continue
        suf = os.path.splitext(p)[1].lower()
        if suf in ext_lower:
            out.append(os.path.normpath(p))
    return out


def register_file_drop(widget, callback: Callable[[list[str]], None], extensions: set[str]) -> None:
    """Windows: drag files onto widget. No-op if windnd unavailable."""

    def _handler(files) -> None:
        raw: list[str] = []
        for f in files:
            if isinstance(f, bytes):
                try:
                    raw.append(f.decode("utf-8"))
                except Exception:
                    raw.append(f.decode("mbcs", errors="replace"))
            else:
                raw.append(str(f))
        picked = filter_paths_by_extensions(raw, extensions)
        if picked:
            callback(picked)

    try:
        import windnd

        windnd.hook_dropfiles(widget, func=_handler)
    except Exception:
        pass


def build_tool_header(parent, title: str, subtitle: str | None = None) -> ctk.CTkFrame:
    """Top bar aligned with desktop shell (panel, not flat blue)."""
    ui = theme()
    fr = ctk.CTkFrame(
        parent,
        fg_color=ui["panel"],
        height=76,
        corner_radius=0,
        border_width=0,
    )
    fr.pack(fill="x", side="top")
    fr.pack_propagate(False)
    inner = ctk.CTkFrame(fr, fg_color="transparent")
    inner.pack(fill="both", expand=True, padx=22, pady=14)
    ctk.CTkLabel(
        inner,
        text=title,
        font=("Segoe UI Semibold", 18, "bold"),
        text_color=ui.get("accent_soft", ui["accent"]),
    ).pack(anchor="w")
    if subtitle:
        ctk.CTkLabel(
            inner,
            text=subtitle,
            font=ui["small_font"],
            text_color=ui["muted"],
            wraplength=640,
            justify="left",
        ).pack(anchor="w", pady=(6, 0))
    return fr


def build_drop_zone(
    parent,
    *,
    on_paths: Callable[[list[str]], None],
    on_browse: Callable[[], None],
    title: str | None = None,
    hint: str | None = None,
    extensions: set[str] | None = None,
) -> ctk.CTkFrame:
    """Dashed-style drop area + primary browse. When ``extensions`` is set, Windows file drop is enabled (windnd)."""
    ui = theme()
    title = title or t("tool_ui.drop_title")
    hint = hint or t("tool_ui.drop_hint")

    outer = ctk.CTkFrame(
        parent,
        fg_color=ui["panel_alt"],
        corner_radius=18,
        border_width=2,
        border_color=ui.get("border_subtle", ui["border"]),
    )
    inner = ctk.CTkFrame(outer, fg_color="transparent")
    inner.pack(expand=True, fill="both", padx=28, pady=36)

    if extensions:
        register_file_drop(outer, on_paths, extensions)

    ctk.CTkLabel(inner, text="⬍", font=("Segoe UI", 42), text_color=ui["muted"]).pack()
    ctk.CTkLabel(
        inner,
        text=title,
        font=("Segoe UI Semibold", 16, "bold"),
        text_color=ui["text"],
    ).pack(pady=(10, 4))
    ctk.CTkLabel(
        inner,
        text=hint,
        font=ui["small_font"],
        text_color=ui["muted"],
    ).pack(pady=(0, 16))
    ctk.CTkButton(
        inner,
        text=t("app.select_file"),
        height=42,
        corner_radius=12,
        font=("Segoe UI Semibold", 13, "bold"),
        fg_color=ui["accent"],
        hover_color=ui["accent_hover"],
        text_color=ui["button_text"],
        command=on_browse,
    ).pack()

    return outer


def build_file_card(
    parent,
    path: str,
    *,
    second_line: str | None = None,
    badge_text: str | None = None,
    badge_warning: bool = False,
    on_change: Callable[[], None] | None = None,
) -> ctk.CTkFrame:
    """Single file row: icon | name + size | optional badge | change."""
    ui = theme()
    card = ctk.CTkFrame(
        parent,
        fg_color=ui["panel_alt"],
        corner_radius=14,
        border_width=1,
        border_color=ui.get("border_subtle", ui["border"]),
    )
    card.pack(fill="x", pady=(0, 12))

    row = ctk.CTkFrame(card, fg_color="transparent")
    row.pack(fill="x", padx=16, pady=14)

    ctk.CTkLabel(row, text=file_icon_emoji(path), font=("Segoe UI", 30)).pack(side="left", padx=(0, 14))

    mid = ctk.CTkFrame(row, fg_color="transparent")
    mid.pack(side="left", fill="x", expand=True)

    name = os.path.basename(path)
    if len(name) > 56:
        name = name[:53] + "…"
    ctk.CTkLabel(
        mid,
        text=name,
        font=("Segoe UI Semibold", 14, "bold"),
        text_color=ui["text"],
        anchor="w",
    ).pack(anchor="w")

    size_line = "—"
    try:
        if os.path.isfile(path):
            size_line = format_file_size(os.path.getsize(path))
    except OSError:
        pass
    ctk.CTkLabel(
        mid,
        text=size_line,
        font=ui["small_font"],
        text_color=ui["muted"],
        anchor="w",
    ).pack(anchor="w", pady=(2, 0))

    if second_line:
        ctk.CTkLabel(
            mid,
            text=second_line,
            font=ui["small_font"],
            text_color=ui["accent_soft"],
            anchor="w",
            wraplength=480,
            justify="left",
        ).pack(anchor="w", pady=(4, 0))

    if badge_text:
        from modules.ui_theme import badge_colors

        tone = "warning" if badge_warning else "info"
        bc = badge_colors(tone)
        ctk.CTkLabel(
            mid,
            text=f"  {badge_text}  ",
            font=ui["badge_font"],
            text_color=bc["text"],
            fg_color=bc["fg"],
            corner_radius=8,
        ).pack(anchor="w", pady=(8, 0))

    if on_change:
        ctk.CTkButton(
            row,
            text=t("app.change"),
            width=96,
            height=34,
            corner_radius=10,
            fg_color=ui["panel_soft"],
            hover_color=ui["border"],
            text_color=ui["text"],
            command=on_change,
        ).pack(side="right", padx=(12, 0))

    return card


def build_merge_file_row(
    parent,
    path: str,
    *,
    status_line: str | None,
    status_ok: bool,
    on_remove: Callable[[], None],
    on_up: Callable[[], None],
    on_down: Callable[[], None],
) -> ctk.CTkFrame:
    """Merge list row: icon, name, size, status, reorder + remove."""
    ui = theme()
    card = ctk.CTkFrame(
        parent,
        fg_color=ui["panel_alt"],
        corner_radius=12,
        border_width=1,
        border_color=ui.get("border_subtle", ui["border"]),
        height=78,
    )
    card.pack_propagate(False)

    row = ctk.CTkFrame(card, fg_color="transparent")
    row.pack(fill="both", expand=True, padx=12, pady=10)

    ctk.CTkLabel(row, text=file_icon_emoji(path), font=("Segoe UI", 24)).pack(side="left", padx=(0, 10))

    mid = ctk.CTkFrame(row, fg_color="transparent")
    mid.pack(side="left", fill="both", expand=True)

    fname = os.path.basename(path)
    disp = fname if len(fname) <= 48 else fname[:45] + "…"
    ctk.CTkLabel(
        mid,
        text=disp,
        font=("Segoe UI Semibold", 12, "bold"),
        text_color=ui["text"],
        anchor="w",
    ).pack(anchor="w")

    try:
        sz = format_file_size(os.path.getsize(path)) if os.path.isfile(path) else "—"
    except OSError:
        sz = "—"
    ctk.CTkLabel(mid, text=sz, font=ui["small_font"], text_color=ui["muted"], anchor="w").pack(anchor="w")

    if status_line:
        from modules.ui_theme import badge_colors

        tone = "success" if status_ok else "warning"
        bc = badge_colors(tone)
        ctk.CTkLabel(
            mid,
            text=f"  {status_line}  ",
            font=("Segoe UI", 10, "bold"),
            text_color=bc["text"],
            fg_color=bc["fg"],
            corner_radius=8,
            anchor="w",
        ).pack(anchor="w", pady=(4, 0))

    ctk.CTkButton(row, text="↑", width=32, height=30, fg_color=ui["panel_soft"], command=on_up).pack(side="right", padx=4)
    ctk.CTkButton(row, text="↓", width=32, height=30, fg_color=ui["panel_soft"], command=on_down).pack(side="right", padx=4)
    ctk.CTkButton(
        row,
        text=t("merge.remove"),
        width=80,
        height=30,
        fg_color=ui["danger"],
        hover_color="#c0392b",
        command=on_remove,
    ).pack(side="right", padx=(8, 0))

    return card
