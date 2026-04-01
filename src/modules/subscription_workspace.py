"""
Web dashboard «subscription» paneline paralel: plan özeti, günlük kullanım, plan kartları, yükseltme.
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


def _plan_label(name: str) -> str:
    key = f"subscription_workspace.plan_{str(name).strip().upper()}"
    try:
        s = t(key)
        if s != key:
            return s
    except Exception:
        pass
    return str(name)


class SubscriptionWorkspaceModal(ctk.CTkToplevel):
    def __init__(
        self,
        master,
        center_fn,
        auth_client: DesktopAuthClient,
        access_token: str,
        web_app_url: str,
        *,
        on_refresh_license=None,
    ):
        super().__init__(master)
        self.ui = theme()
        self.auth_client = auth_client
        self.access_token = access_token
        self.web_app_url = (web_app_url or "").strip().rstrip("/")
        self._on_refresh_license = on_refresh_license
        self._summary: dict | None = None
        self._plans: list | None = None
        self._load_error: str | None = None

        self.title(t("subscription_workspace.window_title"))
        self.configure(fg_color=self.ui["bg"])
        self.resizable(True, True)
        self.minsize(720, 620)
        self.grab_set()
        self.after(80, self.lift)
        center_fn(self, 880, 720)

        self._body = ctk.CTkFrame(self, fg_color="transparent")
        self._body.pack(fill="both", expand=True, padx=20, pady=16)
        self._status = ctk.CTkLabel(
            self._body,
            text=t("subscription_workspace.loading"),
            font=self.ui["body_font"],
            text_color=self.ui["muted"],
        )
        self._status.pack(expand=True)

        threading.Thread(target=self._worker_load, daemon=True).start()

    def _worker_load(self) -> None:
        err = None
        summary = None
        plans = None
        try:
            summary = self.auth_client.fetch_subscription_current(self.access_token)
            plans = self.auth_client.fetch_subscription_plans()
        except (DesktopAuthError, DesktopNetworkError) as e:
            err = str(e)
        except Exception as e:
            err = str(e)
        self.after(0, lambda: self._apply_data(summary, plans, err))

    def _apply_data(self, summary: dict | None, plans: list | None, err: str | None) -> None:
        self._load_error = err
        self._summary = summary
        self._plans = plans
        for w in self._body.winfo_children():
            w.destroy()
        if err:
            ctk.CTkLabel(
                self._body,
                text=t("subscription_workspace.load_error", detail=err[:400]),
                font=self.ui["small_font"],
                text_color=self.ui["danger"],
                wraplength=780,
                justify="left",
            ).pack(anchor="w", pady=20)
            ctk.CTkButton(
                self._body,
                text=t("app.close"),
                command=self.destroy,
                fg_color=self.ui["accent"],
            ).pack(pady=12)
            return
        self._build_content()

    def _build_content(self) -> None:
        ui = self.ui
        summary = self._summary or {}
        plans = self._plans or []
        current = summary.get("currentPlan") or {}
        current_name = (current.get("name") or "FREE").upper()
        usage = summary.get("usage") or {}
        used = int(usage.get("usedToday") or 0)
        remaining = usage.get("remainingToday")
        daily_limit = usage.get("dailyLimit")

        head = ctk.CTkFrame(self._body, fg_color=ui["panel"], corner_radius=16, border_width=1, border_color=ui["border"])
        head.pack(fill="x", pady=(0, 12))
        hi = ctk.CTkFrame(head, fg_color="transparent")
        hi.pack(fill="x", padx=22, pady=18)
        ctk.CTkLabel(
            hi,
            text=t("subscription_workspace.kicker"),
            font=("Segoe UI Semibold", 10),
            text_color=ui["muted"],
        ).pack(anchor="w")
        ctk.CTkLabel(
            hi,
            text=t("subscription_workspace.headline"),
            font=("Segoe UI Semibold", 18, "bold"),
            text_color=ui["text"],
            anchor="w",
            justify="left",
        ).pack(anchor="w", pady=(4, 10))

        badge_row = ctk.CTkFrame(hi, fg_color="transparent")
        badge_row.pack(anchor="w", fill="x")
        ctk.CTkLabel(
            badge_row,
            text=_plan_label(current_name),
            font=("Segoe UI Semibold", 12, "bold"),
            text_color=ui.get("accent_soft", ui["accent"]),
            fg_color=ui["panel_alt"],
            corner_radius=10,
            padx=12,
            pady=6,
        ).pack(side="left", padx=(0, 8))
        lim_txt = (
            t("subscription_workspace.unlimited_badge")
            if daily_limit is None
            else t("subscription_workspace.usage_badge", used=used, limit=int(daily_limit))
        )
        ctk.CTkLabel(
            badge_row,
            text=lim_txt,
            font=self.ui["small_font"],
            text_color=ui["muted"],
            fg_color=ui["panel_alt"],
            corner_radius=10,
            padx=12,
            pady=6,
        ).pack(side="left")

        stats = ctk.CTkFrame(self._body, fg_color="transparent")
        stats.pack(fill="x", pady=(0, 12))
        for col, (label, value) in enumerate(
            [
                (t("subscription_workspace.stat_plan"), _plan_label(current_name)),
                (
                    t("subscription_workspace.stat_daily"),
                    t("subscription_workspace.unlimited")
                    if daily_limit is None
                    else t(
                        "subscription_workspace.usage_fraction",
                        used=used,
                        limit=int(daily_limit),
                    ),
                ),
                (
                    t("subscription_workspace.stat_remaining"),
                    t("subscription_workspace.unlimited")
                    if remaining is None
                    else str(int(remaining)),
                ),
            ]
        ):
            box = ctk.CTkFrame(stats, fg_color=ui["panel_alt"], corner_radius=12, border_width=1, border_color=ui.get("border_subtle", ui["border"]))
            box.grid(row=0, column=col, padx=4, sticky="nsew", ipadx=8, ipady=10)
            stats.grid_columnconfigure(col, weight=1)
            ctk.CTkLabel(box, text=label, font=("Segoe UI", 11), text_color=ui["muted"]).pack(anchor="w", padx=12, pady=(8, 2))
            ctk.CTkLabel(box, text=value, font=("Segoe UI Semibold", 14), text_color=ui["text"]).pack(anchor="w", padx=12, pady=(0, 8))

        scroll = ctk.CTkScrollableFrame(self._body, fg_color=ui["panel"], corner_radius=14, border_width=1, border_color=ui["border"])
        scroll.pack(fill="both", expand=True, pady=(0, 12))

        ctk.CTkLabel(
            scroll,
            text=t("subscription_workspace.plans_heading"),
            font=("Segoe UI Semibold", 13),
            text_color=ui["text"],
            anchor="w",
        ).pack(anchor="w", padx=12, pady=(12, 8))

        for plan in plans:
            name = str((plan.get("name") or "")).upper()
            is_current = name == current_name
            card = ctk.CTkFrame(
                scroll,
                fg_color=ui["panel_alt"] if not is_current else ui.get("nav_active_bg", ui["panel_soft"]),
                corner_radius=12,
                border_width=2 if is_current else 1,
                border_color=ui.get("accent_soft", ui["accent"]) if is_current else ui.get("border_subtle", ui["border"]),
            )
            card.pack(fill="x", padx=8, pady=6)
            row = ctk.CTkFrame(card, fg_color="transparent")
            row.pack(fill="x", padx=14, pady=12)
            ctk.CTkLabel(
                row,
                text=_plan_label(name),
                font=("Segoe UI Semibold", 15),
                text_color=ui["text"],
            ).pack(side="left")
            if is_current:
                ctk.CTkLabel(
                    row,
                    text=t("subscription_workspace.current_badge"),
                    font=("Segoe UI Semibold", 10),
                    text_color=ui.get("accent_soft", ui["accent"]),
                    fg_color=ui["panel"],
                    corner_radius=8,
                    padx=10,
                    pady=4,
                ).pack(side="right")
            dl = plan.get("dailyLimit")
            meta = (
                t("subscription_workspace.unlimited_ops")
                if dl is None
                else t("subscription_workspace.ops_per_day", n=int(dl))
            )
            ctk.CTkLabel(
                card,
                text=meta,
                font=self.ui["small_font"],
                text_color=ui["muted"],
                anchor="w",
            ).pack(anchor="w", padx=14, pady=(0, 10))

        cta = ctk.CTkFrame(self._body, fg_color="transparent")
        cta.pack(fill="x", pady=(4, 8))
        if current_name == "FREE":
            ctk.CTkButton(
                cta,
                text=t("upgrade_modal.cta_pro"),
                height=48,
                font=("Segoe UI Semibold", 14, "bold"),
                fg_color=ui["accent"],
                hover_color=ui["accent_hover"],
                text_color=ui["button_text"],
                command=lambda: self._checkout("PRO"),
            ).pack(side="left", fill="x", expand=True, padx=(0, 8))
            ctk.CTkButton(
                cta,
                text=t("upgrade_modal.cta_business"),
                height=48,
                font=("Segoe UI Semibold", 14, "bold"),
                fg_color=ui["panel_soft"],
                hover_color=ui["border"],
                text_color=ui["text"],
                border_width=1,
                border_color=ui.get("border_subtle", ui["border"]),
                command=lambda: self._checkout("BUSINESS"),
            ).pack(side="left", fill="x", expand=True)
        else:
            ctk.CTkLabel(
                cta,
                text=t("subscription_workspace.paid_hint"),
                font=self.ui["small_font"],
                text_color=ui["muted"],
                wraplength=820,
                justify="left",
            ).pack(anchor="w")

        bottom = ctk.CTkFrame(self._body, fg_color="transparent")
        bottom.pack(fill="x", pady=(8, 0))
        ctk.CTkButton(
            bottom,
            text=t("subscription_workspace.refresh"),
            fg_color="transparent",
            border_width=1,
            border_color=ui["border"],
            text_color=ui["text"],
            height=36,
            command=self._refresh_click,
        ).pack(side="left", padx=(0, 10))
        if self.web_app_url:
            ctk.CTkButton(
                bottom,
                text=t("subscription_workspace.open_web_same"),
                fg_color="transparent",
                border_width=1,
                border_color=ui.get("border_subtle", ui["border"]),
                text_color=ui["muted"],
                height=36,
                command=self._open_web_workspace,
            ).pack(side="left", padx=(0, 10))
        ctk.CTkButton(
            bottom,
            text=t("app.close"),
            fg_color=ui["panel_soft"],
            hover_color=ui["border"],
            text_color=ui["text"],
            height=36,
            command=self.destroy,
        ).pack(side="right")

    def _checkout(self, plan: str) -> None:
        def worker():
            try:
                result = self.auth_client.create_payment_checkout(self.access_token, plan)
                open_payment_checkout_in_browser(result)
                self.after(0, self._after_checkout)
            except (DesktopAuthError, DesktopNetworkError) as e:
                self.after(0, lambda: messagebox.showerror(t("app.error"), str(e), parent=self))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror(t("app.error"), str(e), parent=self))

        threading.Thread(target=worker, daemon=True).start()

    def _after_checkout(self) -> None:
        if self.master and hasattr(self.master, "awaiting_upgrade_return"):
            self.master.awaiting_upgrade_return = True
        if self._on_refresh_license:
            try:
                self._on_refresh_license()
            except Exception:
                pass
        try:
            self.destroy()
        except Exception:
            pass

    def _refresh_click(self) -> None:
        if self._on_refresh_license:
            try:
                self._on_refresh_license()
            except Exception:
                pass
        for w in self._body.winfo_children():
            w.destroy()
        ctk.CTkLabel(
            self._body,
            text=t("subscription_workspace.loading"),
            font=self.ui["body_font"],
            text_color=self.ui["muted"],
        ).pack(expand=True)
        threading.Thread(target=self._worker_load, daemon=True).start()

    def _open_web_workspace(self) -> None:
        if self.web_app_url:
            base = self.web_app_url.split("#")[0].rstrip("/")
            webbrowser.open(f"{base}/workspace")
