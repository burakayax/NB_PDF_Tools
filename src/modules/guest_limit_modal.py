"""Misafir günlük kota doldu — web’deki kota/upgrade kartına yakın sunum."""

from __future__ import annotations

import customtkinter as ctk

from modules.i18n import t
from modules.ui_theme import theme


class GuestLimitModal(ctk.CTkToplevel):
    def __init__(
        self,
        master,
        center_fn,
        *,
        used: int,
        limit: int,
        on_sign_in,
        on_register,
    ):
        super().__init__(master)
        self.ui = theme()
        self._on_sign_in = on_sign_in
        self._on_register = on_register

        self.title(t("guest_limit.title"))
        self.configure(fg_color=self.ui["bg"])
        self.resizable(True, True)
        self.minsize(480, 360)
        self.grab_set()
        center_fn(self, 520, 400)

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
            text=t("guest_limit.kicker"),
            font=("Segoe UI Semibold", 10),
            text_color="#fcd34d",
        ).pack(anchor="w")
        ctk.CTkLabel(
            inner,
            text=t("guest_limit.headline"),
            font=("Segoe UI Semibold", 17, "bold"),
            text_color=self.ui["text"],
            wraplength=460,
            justify="left",
        ).pack(anchor="w", pady=(6, 10))

        ctk.CTkLabel(
            inner,
            text=t("guest_limit.used_line", used=used, limit=limit),
            font=("Segoe UI Semibold", 13),
            text_color=self.ui["text"],
        ).pack(anchor="w")
        ctk.CTkLabel(
            inner,
            text=t("guest_limit.detail"),
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
            wraplength=460,
            justify="left",
        ).pack(anchor="w", pady=(12, 18))

        row = ctk.CTkFrame(inner, fg_color="transparent")
        row.pack(fill="x")
        ctk.CTkButton(
            row,
            text=t("guest_limit.cta_sign_in"),
            height=44,
            font=("Segoe UI Semibold", 13, "bold"),
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            text_color=self.ui["button_text"],
            command=self._sign_in,
        ).pack(side="left", fill="x", expand=True, padx=(0, 8))
        ctk.CTkButton(
            row,
            text=t("guest_limit.cta_register"),
            height=44,
            font=("Segoe UI Semibold", 12),
            fg_color=self.ui["panel_soft"],
            hover_color=self.ui["border"],
            text_color=self.ui["text"],
            border_width=1,
            border_color=self.ui["border_subtle"],
            command=self._register,
        ).pack(side="left", fill="x", expand=True)

    def _sign_in(self) -> None:
        try:
            self._on_sign_in()
        finally:
            self.destroy()

    def _register(self) -> None:
        try:
            self._on_register()
        finally:
            self.destroy()
