import threading
import tkinter.messagebox as messagebox

import customtkinter as ctk

from modules.desktop_auth import DesktopAuthClient, DesktopAuthError, DesktopNetworkError
from modules.i18n import t
from modules.ui_theme import theme
from version_info import get_version_string


class SettingsDialog(ctk.CTkToplevel):
    def __init__(
        self,
        master,
        ortalama_func,
        on_saved=None,
        *,
        api_base_url: str = "",
        web_app_url: str = "",
        update_manifest_url: str = "",
        on_check_updates=None,
        user: dict | None = None,
        access_token: str | None = None,
        auth_client: DesktopAuthClient | None = None,
        auth_provider: str = "local",
        on_open_change_password=None,
    ):
        super().__init__(master)
        self.ui = theme()
        self.ortalama_func = ortalama_func
        self.on_saved = on_saved
        self._user = user or {}
        self._token = access_token
        self._auth = auth_client
        self._auth_provider = (auth_provider or "local").lower()
        self._on_open_change_password = on_open_change_password

        self.title(t("settings.title"))
        self.ortalama_func(self, 560, 640)
        self.grab_set()
        self.resizable(True, True)
        self.minsize(520, 560)
        self.configure(fg_color=self.ui["bg"])

        scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=16, pady=16)

        header = ctk.CTkFrame(scroll, fg_color=self.ui["accent"], height=52, corner_radius=12)
        header.pack(fill="x", pady=(0, 12))
        ctk.CTkLabel(
            header,
            text=t("settings.title"),
            font=self.ui["title_font"],
            text_color="white",
        ).pack(pady=12)

        if self._token and self._auth and self._user:
            self._build_profile_block(scroll)

        card = ctk.CTkFrame(
            scroll,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=18,
        )
        card.pack(fill="x", pady=(0, 12))

        ctk.CTkLabel(
            card,
            text=t("settings.version_line", version=get_version_string()),
            font=("Segoe UI Semibold", 12),
            text_color=self.ui["accent_soft"],
        ).pack(anchor="w", padx=22, pady=(18, 6))

        ctk.CTkLabel(
            card,
            text=t("settings.body"),
            font=self.ui["body_font"],
            text_color=self.ui["muted"],
            wraplength=480,
            justify="left",
        ).pack(anchor="w", padx=22, pady=(0, 10))

        if api_base_url or web_app_url:
            ctk.CTkLabel(
                card,
                text=t("settings.server_api", url=api_base_url or "—"),
                font=self.ui["small_font"],
                text_color=self.ui["text"],
                wraplength=480,
                justify="left",
            ).pack(anchor="w", padx=22, pady=(0, 6))
            ctk.CTkLabel(
                card,
                text=t("settings.server_web", url=web_app_url or "—"),
                font=self.ui["small_font"],
                text_color=self.ui["text"],
                wraplength=480,
                justify="left",
            ).pack(anchor="w", padx=22, pady=(0, 10))
            ctk.CTkLabel(
                card,
                text=t("settings.config_hint"),
                font=self.ui["small_font"],
                text_color=self.ui["muted"],
                wraplength=480,
                justify="left",
            ).pack(anchor="w", padx=22, pady=(0, 16))

        if update_manifest_url:
            ctk.CTkLabel(
                card,
                text=t("settings.update_manifest_hint", url=update_manifest_url),
                font=self.ui["small_font"],
                text_color=self.ui["muted"],
                wraplength=480,
                justify="left",
            ).pack(anchor="w", padx=22, pady=(0, 8))

        if on_check_updates:
            ctk.CTkButton(
                card,
                text=t("settings.check_updates"),
                height=36,
                corner_radius=10,
                fg_color=self.ui["panel_soft"],
                hover_color=self.ui["accent"],
                text_color=self.ui["text"],
                border_width=1,
                border_color=self.ui["border_subtle"],
                command=on_check_updates,
            ).pack(fill="x", padx=22, pady=(0, 18))
        else:
            ctk.CTkFrame(card, height=8, fg_color="transparent").pack()

        ctk.CTkButton(
            scroll,
            text=t("app.close"),
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            command=self.destroy,
        ).pack(fill="x", pady=(4, 8))

    def _build_profile_block(self, parent) -> None:
        ui = self.ui
        fn = (self._user.get("firstName") or "").strip()
        ln = (self._user.get("lastName") or "").strip()
        if not fn and not ln:
            name = (self._user.get("name") or "").strip()
            if name:
                parts = name.split(None, 1)
                fn = parts[0]
                ln = parts[1] if len(parts) > 1 else ""

        prof = ctk.CTkFrame(
            parent,
            fg_color=ui["panel"],
            border_width=1,
            border_color=ui["border"],
            corner_radius=18,
        )
        prof.pack(fill="x", pady=(0, 12))

        ctk.CTkLabel(
            prof,
            text=t("settings.section_profile"),
            font=("Segoe UI Semibold", 10),
            text_color=ui["muted"],
        ).pack(anchor="w", padx=22, pady=(18, 4))
        ctk.CTkLabel(
            prof,
            text=t("settings.personal_details"),
            font=ui["title_font"],
            text_color=ui["text"],
        ).pack(anchor="w", padx=22, pady=(0, 12))

        ctk.CTkLabel(prof, text=t("settings.first_name"), font=ui["subtitle_font"], text_color=ui["text"]).pack(
            anchor="w", padx=22, pady=(0, 4)
        )
        self._entry_fn = ctk.CTkEntry(
            prof,
            height=44,
            fg_color=ui.get("input_bg", ui["panel"]),
            border_color=ui.get("input_border", ui["border"]),
            text_color=ui["text"],
        )
        self._entry_fn.insert(0, fn)
        self._entry_fn.pack(fill="x", padx=22, pady=(0, 8))

        ctk.CTkLabel(prof, text=t("settings.last_name"), font=ui["subtitle_font"], text_color=ui["text"]).pack(
            anchor="w", padx=22, pady=(0, 4)
        )
        self._entry_ln = ctk.CTkEntry(
            prof,
            height=44,
            fg_color=ui.get("input_bg", ui["panel"]),
            border_color=ui.get("input_border", ui["border"]),
            text_color=ui["text"],
        )
        self._entry_ln.insert(0, ln)
        self._entry_ln.pack(fill="x", padx=22, pady=(0, 8))

        ctk.CTkLabel(prof, text=t("settings.email"), font=ui["subtitle_font"], text_color=ui["text"]).pack(
            anchor="w", padx=22, pady=(8, 4)
        )
        email_val = (self._user.get("email") or "—").strip()
        ro = ctk.CTkEntry(
            prof,
            height=44,
            fg_color=ui["panel_alt"],
            border_color=ui["border"],
            text_color=ui["muted"],
        )
        ro.insert(0, email_val)
        ro.configure(state="disabled")
        ro.pack(fill="x", padx=22, pady=(0, 6))
        ctk.CTkLabel(
            prof,
            text=t("settings.email_hint"),
            font=ui["small_font"],
            text_color=ui["muted"],
        ).pack(anchor="w", padx=22, pady=(0, 12))

        self._btn_save = ctk.CTkButton(
            prof,
            text=t("settings.save_profile"),
            fg_color=ui["accent"],
            hover_color=ui["accent_hover"],
            text_color=ui["button_text"],
            command=self._save_profile,
        )
        self._btn_save.pack(anchor="w", padx=22, pady=(0, 18))

        sec = ctk.CTkFrame(
            parent,
            fg_color=ui["panel"],
            border_width=1,
            border_color=ui["border"],
            corner_radius=18,
        )
        sec.pack(fill="x", pady=(0, 12))
        ctk.CTkLabel(
            sec,
            text=t("settings.section_security"),
            font=("Segoe UI Semibold", 10),
            text_color=ui["muted"],
        ).pack(anchor="w", padx=22, pady=(18, 4))
        ctk.CTkLabel(
            sec,
            text=t("settings.change_password"),
            font=ui["title_font"],
            text_color=ui["text"],
        ).pack(anchor="w", padx=22, pady=(0, 8))

        if self._auth_provider == "google":
            ctk.CTkLabel(
                sec,
                text=t("settings.password_google_only"),
                font=ui["small_font"],
                text_color=ui["muted"],
                wraplength=480,
                justify="left",
            ).pack(anchor="w", padx=22, pady=(0, 18))
        else:
            ctk.CTkLabel(
                sec,
                text=t("settings.password_hint_local"),
                font=ui["small_font"],
                text_color=ui["muted"],
                wraplength=480,
                justify="left",
            ).pack(anchor="w", padx=22, pady=(0, 8))
            ctk.CTkButton(
                sec,
                text=t("desktop.profile_password"),
                fg_color=ui["panel_soft"],
                hover_color=ui["border"],
                text_color=ui["text"],
                border_width=1,
                border_color=ui["border_subtle"],
                command=self._open_password,
            ).pack(anchor="w", padx=22, pady=(0, 18))

    def _open_password(self) -> None:
        if self._on_open_change_password:
            self._on_open_change_password()

    def _save_profile(self) -> None:
        if not self._auth or not self._token:
            return
        fn = (self._entry_fn.get() or "").strip()
        ln = (self._entry_ln.get() or "").strip()
        if not fn:
            messagebox.showwarning(t("app.warning"), t("settings.first_name_required"), parent=self)
            return
        if not ln:
            messagebox.showwarning(t("app.warning"), t("settings.last_name_required"), parent=self)
            return
        self._btn_save.configure(state="disabled")

        def worker():
            try:
                user = self._auth.update_profile(self._token, fn, ln)
                self.after(0, lambda: self._on_saved_ok(user))
            except (DesktopAuthError, DesktopNetworkError) as e:
                self.after(0, lambda: self._on_saved_fail(str(e)))
            except Exception as e:
                self.after(0, lambda: self._on_saved_fail(str(e)))

        threading.Thread(target=worker, daemon=True).start()

    def _on_saved_ok(self, user: dict) -> None:
        self._btn_save.configure(state="normal")
        messagebox.showinfo(t("settings.title"), t("settings.profile_saved"), parent=self)
        if self.on_saved:
            try:
                self.on_saved(user)
            except Exception:
                pass

    def _on_saved_fail(self, msg: str) -> None:
        self._btn_save.configure(state="normal")
        messagebox.showerror(t("app.error"), msg[:400], parent=self)
