"""
Premium plan comparison modal: FREE vs PRO vs BUSINESS with iyzico checkout (browser).
"""

from __future__ import annotations

import threading
import tkinter.messagebox as messagebox
import webbrowser

import customtkinter as ctk

from modules.desktop_auth import (
    DesktopAuthClient,
    DesktopAuthError,
    DesktopNetworkError,
    open_payment_checkout_in_browser,
)
from modules.i18n import t
from modules.ui_theme import theme


class UpgradeModal(ctk.CTkToplevel):
    """Persuasive upgrade experience with plan matrix and PRO / BUSINESS CTAs."""

    def __init__(
        self,
        master,
        auth_client: DesktopAuthClient,
        access_token: str,
        web_app_url: str,
        *,
        reason: str = "general",
        detail: str | None = None,
    ):
        super().__init__(master)
        self.ui = theme()
        self.auth_client = auth_client
        self.access_token = access_token
        self.web_app_url = (web_app_url or "").strip().rstrip("/")

        self.title(t("upgrade_modal.window_title"))
        self.configure(fg_color=self.ui["bg"])
        self.resizable(True, True)
        self.minsize(700, 560)
        self.grab_set()
        self.after(80, self.lift)

        if hasattr(master, "ekran_ortala"):
            master.ekran_ortala(self, 780, 680)
        else:
            self.geometry("780x680")

        self._build_shell(reason, detail)

    def _build_shell(self, reason: str, detail: str | None) -> None:
        ui = self.ui

        top = ctk.CTkFrame(self, fg_color=ui["panel"], height=88, corner_radius=0)
        top.pack(fill="x", side="top")
        inner = ctk.CTkFrame(top, fg_color="transparent")
        inner.pack(fill="both", expand=True, padx=28, pady=20)
        ctk.CTkLabel(
            inner,
            text=t("upgrade_modal.headline"),
            font=("Segoe UI Semibold", 20, "bold"),
            text_color=ui.get("accent_soft", ui["accent"]),
            anchor="w",
        ).pack(anchor="w")
        sub = self._subtitle_for_reason(reason)
        ctk.CTkLabel(
            inner,
            text=sub,
            font=ui["small_font"],
            text_color=ui["muted"],
            anchor="w",
            wraplength=700,
            justify="left",
        ).pack(anchor="w", pady=(8, 0))
        if detail and reason == "limit":
            ctk.CTkLabel(
                inner,
                text=detail[:420] + ("…" if len(detail) > 420 else ""),
                font=("Segoe UI", 11),
                text_color=ui["warning"],
                anchor="w",
                wraplength=700,
                justify="left",
            ).pack(anchor="w", pady=(10, 0))

        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=22, pady=(12, 16))

        table_card = ctk.CTkFrame(
            body,
            fg_color=ui["panel_alt"],
            corner_radius=16,
            border_width=1,
            border_color=ui.get("border_subtle", ui["border"]),
        )
        table_card.pack(fill="both", expand=True, pady=(0, 14))

        scroll = ctk.CTkScrollableFrame(table_card, fg_color="transparent", corner_radius=0)
        scroll.pack(fill="both", expand=True, padx=12, pady=12)

        self._build_matrix(scroll)

        self.status_label = ctk.CTkLabel(
            body,
            text="",
            font=ui["small_font"],
            text_color=ui["warning"],
            wraplength=720,
            anchor="w",
        )
        self.status_label.pack(anchor="w", pady=(0, 6))

        cta_row = ctk.CTkFrame(body, fg_color="transparent")
        cta_row.pack(fill="x", pady=(4, 8))

        ctk.CTkButton(
            cta_row,
            text=t("upgrade_modal.cta_pro"),
            height=52,
            corner_radius=14,
            font=("Segoe UI Semibold", 15, "bold"),
            fg_color=ui["accent"],
            hover_color=ui["accent_hover"],
            text_color=ui["button_text"],
            command=lambda: self._start_checkout("PRO"),
        ).pack(side="left", fill="x", expand=True, padx=(0, 10))

        ctk.CTkButton(
            cta_row,
            text=t("upgrade_modal.cta_business"),
            height=52,
            corner_radius=14,
            font=("Segoe UI Semibold", 15, "bold"),
            fg_color=ui["panel_soft"],
            hover_color=ui["border"],
            text_color=ui["text"],
            border_width=1,
            border_color=ui.get("border_subtle", ui["border"]),
            command=lambda: self._start_checkout("BUSINESS"),
        ).pack(side="left", fill="x", expand=True)

        ctk.CTkLabel(
            body,
            text=t("upgrade_modal.footer_hint"),
            font=("Segoe UI", 10),
            text_color=ui["muted"],
            wraplength=720,
            justify="center",
        ).pack(pady=(4, 8))

        bottom = ctk.CTkFrame(body, fg_color="transparent")
        bottom.pack(fill="x")

        ctk.CTkButton(
            bottom,
            text=t("upgrade_modal.open_browser"),
            fg_color="transparent",
            border_width=1,
            border_color=ui["border"],
            text_color=ui["text"],
            hover_color=ui["panel_soft"],
            height=36,
            command=self._open_web_fallback,
        ).pack(side="left", padx=(0, 12))

        ctk.CTkButton(
            bottom,
            text=t("upgrade_modal.not_now"),
            fg_color=ui["panel_alt"],
            hover_color=ui["border"],
            text_color=ui["muted"],
            height=36,
            command=self.destroy,
        ).pack(side="right")

    def _subtitle_for_reason(self, reason: str) -> str:
        if reason == "limit":
            return t("upgrade_modal.subtitle_limit")
        if reason == "locked":
            return t("upgrade_modal.subtitle_locked")
        return t("upgrade_modal.subtitle_general")

    def _build_matrix(self, parent) -> None:
        ui = self.ui
        headers = [
            ("", 200),
            (t("upgrade_modal.col_free"), 140),
            (t("upgrade_modal.col_pro"), 140),
            (t("upgrade_modal.col_business"), 140),
        ]
        hdr = ctk.CTkFrame(parent, fg_color=ui["panel_soft"], corner_radius=10)
        hdr.pack(fill="x", pady=(0, 6))
        hrow = ctk.CTkFrame(hdr, fg_color="transparent")
        hrow.pack(fill="x", padx=10, pady=10)
        for i, (text, w) in enumerate(headers):
            accent = i == 2
            ctk.CTkLabel(
                hrow,
                text=text,
                width=w,
                font=("Segoe UI Semibold", 12, "bold"),
                text_color=ui.get("accent_soft", ui["accent"]) if accent else ui["text"],
            ).pack(side="left", padx=(0, 4))

        rows = [
            (
                t("upgrade_modal.row_daily"),
                t("upgrade_modal.row_daily_free"),
                t("upgrade_modal.row_daily_unlimited"),
                t("upgrade_modal.row_daily_unlimited"),
            ),
            (
                t("upgrade_modal.row_TOOLS"),
                t("upgrade_modal.row_TOOLS_free"),
                t("upgrade_modal.row_TOOLS_all"),
                t("upgrade_modal.row_TOOLS_all"),
            ),
            (
                t("upgrade_modal.row_convert"),
                t("upgrade_modal.row_convert_free"),
                t("upgrade_modal.row_convert_yes"),
                t("upgrade_modal.row_convert_yes"),
            ),
            (
                t("upgrade_modal.row_encrypt"),
                t("upgrade_modal.row_no"),
                t("upgrade_modal.row_yes"),
                t("upgrade_modal.row_yes"),
            ),
            (
                t("upgrade_modal.row_usage_cap"),
                t("upgrade_modal.row_yes_limited"),
                t("upgrade_modal.row_no_unlimited"),
                t("upgrade_modal.row_no_unlimited"),
            ),
            (
                t("upgrade_modal.row_team"),
                t("upgrade_modal.row_no"),
                t("upgrade_modal.row_no"),
                t("upgrade_modal.row_yes"),
            ),
        ]

        for r in rows:
            row_fr = ctk.CTkFrame(parent, fg_color="transparent")
            row_fr.pack(fill="x", pady=3)
            for i, cell in enumerate(r):
                w = headers[i][1]
                ctk.CTkLabel(
                    row_fr,
                    text=cell,
                    width=w,
                    font=ui["small_font"] if i == 0 else ("Segoe UI Semibold", 11, "bold"),
                    text_color=ui["text"] if i == 0 else ui["muted"],
                    anchor="w" if i == 0 else "center",
                ).pack(side="left", padx=(0, 4))

    def _set_busy(self, msg: str) -> None:
        self.status_label.configure(text=msg)

    def _start_checkout(self, plan: str) -> None:
        self._set_busy(t("payment.starting"))

        def worker():
            try:
                result = self.auth_client.create_payment_checkout(self.access_token, plan)
                open_payment_checkout_in_browser(result)
                self.after(0, self._on_checkout_opened)
            except DesktopNetworkError as e:
                self.after(0, lambda: self._on_error(str(e)))
            except DesktopAuthError as e:
                self.after(0, lambda: self._on_error(str(e)))
            except Exception as e:
                self.after(0, lambda: self._on_error(str(e)))

        threading.Thread(target=worker, daemon=True).start()

    def _on_checkout_opened(self) -> None:
        self._set_busy(t("payment.browser_opened"))
        if self.master and hasattr(self.master, "awaiting_upgrade_return"):
            self.master.awaiting_upgrade_return = True
        try:
            self.destroy()
        except Exception:
            pass

    def _on_error(self, msg: str) -> None:
        self._set_busy("")
        messagebox.showerror(t("app.error"), msg, parent=self)

    def _open_web_fallback(self) -> None:
        if not self.web_app_url:
            messagebox.showwarning(t("app.warning"), t("payment.no_web_url"), parent=self)
            return
        webbrowser.open(f"{self.web_app_url}/workspace")
        if self.master and hasattr(self.master, "awaiting_upgrade_return"):
            self.master.awaiting_upgrade_return = True
