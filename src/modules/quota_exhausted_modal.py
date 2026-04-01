"""Web’deki günlük kota doldu uyarısına yakın tam genişlik kart — amber vurgu."""

from __future__ import annotations

import customtkinter as ctk

from modules.i18n import t
from modules.ui_theme import theme


class QuotaExhaustedModal(ctk.CTkToplevel):
    def __init__(
        self,
        master,
        center_fn,
        *,
        used_today: int,
        daily_limit: int,
        on_upgrade,
        on_close=None,
        detail: str | None = None,
    ):
        super().__init__(master)
        self.ui = theme()
        self._on_upgrade = on_upgrade
        self._on_close = on_close

        self.title(t("quota_modal.title"))
        self.configure(fg_color=self.ui["bg"])
        self.resizable(True, True)
        self.minsize(520, 380)
        self.grab_set()
        center_fn(self, 560, 420)

        outer = ctk.CTkFrame(
            self,
            fg_color=self.ui["panel_alt"],
            corner_radius=18,
            border_width=2,
            border_color="#f59e0b66",
        )
        outer.pack(fill="both", expand=True, padx=18, pady=18)

        inner = ctk.CTkFrame(outer, fg_color="transparent")
        inner.pack(fill="both", expand=True, padx=22, pady=22)

        ctk.CTkLabel(
            inner,
            text=t("quota_modal.kicker"),
            font=("Segoe UI Semibold", 10),
            text_color="#fcd34d",
        ).pack(anchor="w")
        ctk.CTkLabel(
            inner,
            text=t("quota_modal.headline"),
            font=("Segoe UI Semibold", 18, "bold"),
            text_color=self.ui["text"],
            wraplength=500,
            justify="left",
        ).pack(anchor="w", pady=(6, 12))

        frac = min(1.0, (used_today / daily_limit) if daily_limit and daily_limit > 0 else 1.0)
        ctk.CTkLabel(
            inner,
            text=t("quota_modal.used_line", used=used_today, limit=daily_limit),
            font=("Segoe UI Semibold", 13),
            text_color=self.ui["text"],
        ).pack(anchor="w")
        ctk.CTkLabel(
            inner,
            text=t("quota_modal.remaining_line", n=0),
            font=("Segoe UI Semibold", 12),
            text_color="#fde68a",
        ).pack(anchor="w", pady=(4, 10))

        bar = ctk.CTkProgressBar(inner, height=10, progress_color="#d97706", fg_color="#00000059")
        bar.set(frac)
        bar.pack(fill="x", pady=(4, 16))

        detail_text = (detail or "").strip() or t("quota_modal.detail")
        ctk.CTkLabel(
            inner,
            text=detail_text[:520] + ("…" if len(detail_text) > 520 else ""),
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
            wraplength=500,
            justify="left",
        ).pack(anchor="w", pady=(0, 16))

        row = ctk.CTkFrame(inner, fg_color="transparent")
        row.pack(fill="x")
        ctk.CTkButton(
            row,
            text=t("quota_modal.upgrade_cta"),
            height=44,
            font=("Segoe UI Semibold", 13, "bold"),
            fg_color="#d97706",
            hover_color="#b45309",
            text_color="#fffbeb",
            command=self._upgrade,
        ).pack(side="left", fill="x", expand=True, padx=(0, 10))
        ctk.CTkButton(
            row,
            text=t("quota_modal.later"),
            height=44,
            fg_color=self.ui["panel_soft"],
            hover_color=self.ui["border"],
            text_color=self.ui["muted"],
            command=self._close,
        ).pack(side="right")

    def _upgrade(self) -> None:
        try:
            self._on_upgrade()
        finally:
            try:
                self.destroy()
            except Exception:
                pass

    def _close(self) -> None:
        if self._on_close:
            try:
                self._on_close()
            except Exception:
                pass
        self.destroy()
