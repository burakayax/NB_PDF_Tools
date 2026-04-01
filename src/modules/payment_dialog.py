"""Masaüstünde PRO/Business ödeme: sunucu ile aynı iyzico oturumu, tarayıcıda ödeme sayfası.

PCI DSS: Kart numarası/CVV bu uygulamada işlenmez veya saklanmaz; ödeme sağlayıcı sayfası
HTTPS üzerinden açılır. Oturum sunucu tarafında JWT + yenileme çerezi ile yönetilir.
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


class PaymentDialog(ctk.CTkToplevel):
    def __init__(self, master, auth_client: DesktopAuthClient, access_token: str, web_app_url: str):
        super().__init__(master)
        self.ui = theme()
        self.auth_client = auth_client
        self.access_token = access_token
        self.web_app_url = (web_app_url or "").strip().rstrip("/")
        self.title(t("payment.title"))
        self.geometry("520x400")
        self.resizable(False, False)
        self.configure(fg_color=self.ui["bg"])
        self.grab_set()

        header = ctk.CTkFrame(self, fg_color=self.ui["accent"], height=52, corner_radius=0)
        header.pack(fill="x", side="top")
        ctk.CTkLabel(
            header,
            text=t("payment.title"),
            font=self.ui["title_font"],
            text_color="white",
        ).pack(pady=12)

        body = ctk.CTkFrame(self, fg_color=self.ui["panel"], corner_radius=0)
        body.pack(fill="both", expand=True, padx=20, pady=16)

        ctk.CTkLabel(
            body,
            text=t("payment.body"),
            font=self.ui["body_font"],
            text_color=self.ui["muted"],
            wraplength=460,
            justify="left",
        ).pack(anchor="w", padx=16, pady=(12, 8))

        self.status_label = ctk.CTkLabel(
            body,
            text="",
            font=self.ui["small_font"],
            text_color=self.ui["warning"],
            wraplength=460,
        )
        self.status_label.pack(anchor="w", padx=16, pady=(0, 12))

        btn_row = ctk.CTkFrame(body, fg_color="transparent")
        btn_row.pack(fill="x", padx=16, pady=8)

        ctk.CTkButton(
            btn_row,
            text=t("payment.plan_pro"),
            width=200,
            height=42,
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            text_color=self.ui["button_text"],
            command=lambda: self._start_checkout("PRO"),
        ).pack(side="left", padx=(0, 12))

        ctk.CTkButton(
            btn_row,
            text=t("payment.plan_business"),
            width=200,
            height=42,
            fg_color=self.ui["panel_soft"],
            hover_color=self.ui["border"],
            text_color=self.ui["text"],
            command=lambda: self._start_checkout("BUSINESS"),
        ).pack(side="left")

        ctk.CTkButton(
            body,
            text=t("payment.open_web_workspace"),
            fg_color="transparent",
            border_width=1,
            border_color=self.ui["border"],
            text_color=self.ui["text"],
            hover_color=self.ui["panel_soft"],
            command=self._open_web_fallback,
        ).pack(fill="x", padx=16, pady=(16, 8))

        ctk.CTkButton(
            body,
            text=t("app.close"),
            fg_color=self.ui["panel_soft"],
            hover_color=self.ui["border"],
            text_color=self.ui["text"],
            command=self.destroy,
        ).pack(fill="x", padx=16, pady=(0, 16))

    def _set_busy(self, msg: str):
        self.status_label.configure(text=msg)

    def _start_checkout(self, plan: str):
        self._set_busy(t("payment.starting"))

        def worker():
            try:
                result = self.auth_client.create_payment_checkout(self.access_token, plan)
                open_payment_checkout_in_browser(result)
                self.after(0, lambda: self._on_checkout_opened())
            except DesktopNetworkError as e:
                self.after(0, lambda: self._on_error(str(e)))
            except DesktopAuthError as e:
                self.after(0, lambda: self._on_error(str(e)))
            except Exception as e:
                self.after(0, lambda: self._on_error(str(e)))

        threading.Thread(target=worker, daemon=True).start()

    def _on_checkout_opened(self):
        self._set_busy(t("payment.browser_opened"))
        if self.master and hasattr(self.master, "awaiting_upgrade_return"):
            self.master.awaiting_upgrade_return = True
        try:
            self.destroy()
        except Exception:
            pass

    def _on_error(self, msg: str):
        self._set_busy("")
        messagebox.showerror(t("app.error"), msg, parent=self)

    def _open_web_fallback(self):
        if not self.web_app_url:
            messagebox.showwarning(t("app.warning"), t("payment.no_web_url"), parent=self)
            return
        webbrowser.open(f"{self.web_app_url}/workspace")
        if self.master and hasattr(self.master, "awaiting_upgrade_return"):
            self.master.awaiting_upgrade_return = True

