import customtkinter as ctk
from tkinter import PhotoImage, TclError, messagebox
import os
import sys
import webbrowser
import ctypes
import threading
import time
from ctypes import wintypes
from queue import Empty, Queue

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    import pdf_engine
    from modules.compress_pdf_window import CompressPdfWindow
    from modules.desktop_auth import (
        DesktopAuthClient,
        DesktopAccessBlockedError,
        DesktopAuthError,
        DesktopAuthExpiredError,
        GuestUsageStore,
        DesktopNetworkError,
        DesktopSessionStore,
        build_session_payload,
        capture_google_oauth_token,
        get_device_id,
        load_desktop_auth_config,
        open_register_page,
    )
    from modules.encrypt_pdf_window import EncryptPdfWindow
    from modules.excel_to_pdf_window import ExcelToPdfWindow
    from modules.extract_window import ExtractWindow
    from modules.change_password_dialog import ChangePasswordDialog
    from modules.contact_dialog import ContactDialog
    from modules.guest_limit_modal import GuestLimitModal
    from modules.quota_exhausted_modal import QuotaExhaustedModal
    from modules.subscription_workspace import SubscriptionWorkspaceModal
    from modules.i18n import get_language, set_language, t
    from modules.merge_window import MergeWindow
    from modules.pdf_to_excel_window import PdfToExcelWindow
    from modules.settings_dialog import SettingsDialog
    from modules.success_dialog import SuccessDialog
    from modules.ui_polish import (
        LoadingPulseDots,
        attach_feature_button_polish,
        stagger_raise_buttons,
        thin_accent_line,
        vertical_gradient_strip,
    )
    from modules.app_paths import resource_path
    from modules.ui_theme import add_footer, theme
    from modules.word_to_pdf_window import WordToPdfWindow
    from modules.word_window import WordWindow
    from version_info import __version__, get_version_string
except ImportError as e:
    print(f"Modül Yükleme Hatası: {e}")


def merge_subscription_status(license_info: dict, sub: dict) -> dict:
    """GET /subscription/status yanıtını masaüstü lisans önbelleğine ekler (geri sayım sunucu hesaplı)."""
    if not isinstance(license_info, dict) or not isinstance(sub, dict):
        return license_info
    license_info["subscriptionStatus"] = {
        "plan": sub.get("plan"),
        "remaining_days": sub.get("remaining_days"),
    }
    return license_info


class NBPDFApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.ui = theme()
        self.auth_queue: Queue = Queue()
        self.footer = None
        self.current_session = None
        self.license_info = None
        self.device_id = get_device_id()
        self.auth_config = load_desktop_auth_config()
        self.auth_client = DesktopAuthClient(self.auth_config["api_base_url"], self.device_id)
        self.session_store = DesktopSessionStore()
        self.guest_store = GuestUsageStore(device_id=self.device_id)
        self.guest_state = self.guest_store.load()
        self.feature_buttons = {}
        self.refresh_status_button = None
        self.upgrade_button = None
        self.session_action_button = None
        self.guest_action_button = None
        self.is_refreshing_license = False
        self.awaiting_upgrade_return = False
        self.periodic_validation_after_id = None
        self.active_sidebar_key = "split"
        self.profile_menu_window = None
        self.sidebar_tool_buttons = {}
        self.nav_subscription_label = None
        self.nav_upgrade_btn = None
        self.nav_profile_btn = None
        self.nav_center_inner = None
        self.sidebar_refresh_btn = None
        self.hero_refresh_btn = None
        self.shell_main_area = None
        self._focus_refresh_after_id = None
        self._last_focus_subscription_sync = None
        self._loading_pulse = None
        self._closing = False
        self._auth_queue_after_id = None
        self.feature_specs = [
            {"key": "split", "label_key": "main.feature_split", "icon": "📄"},
            {"key": "merge", "label_key": "main.feature_merge", "icon": "🗂"},
            {"key": "pdf-to-word", "label_key": "main.feature_pdf_to_word", "icon": "📝"},
            {"key": "compress", "label_key": "main.feature_compress", "icon": "🗜"},
            {"key": "word-to-pdf", "label_key": "main.feature_word_to_pdf", "icon": "🧾"},
            {"key": "excel-to-pdf", "label_key": "main.feature_excel_to_pdf", "icon": "📊"},
            {"key": "pdf-to-excel", "label_key": "main.feature_pdf_to_excel", "icon": "📈"},
            {"key": "encrypt", "label_key": "main.feature_encrypt", "icon": "🔒"},
        ]

        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")
        self.title(f"{t('app.name')} · v{get_version_string()}")
        self.configure(fg_color=self.ui["bg"])
        self._configure_windows_identity()
        self._configure_window_icon()
        self.bind("<FocusIn>", self._handle_window_focus)

        # Uygulama ana pencere alanını üst içerik ve alt sabit çubuk olarak ayırıyoruz.
        self.after(0, lambda: self.state('zoomed'))

        self.lang_bar = ctk.CTkFrame(self, fg_color="transparent")
        self.lang_bar.pack(fill="x", padx=24, pady=(10, 0))
        self.lang_menu = None
        self._build_language_bar()

        self.content_container = ctk.CTkFrame(self, fg_color="transparent")
        self.content_container.pack(expand=True, fill="both", padx=0, pady=0)

        self._auth_queue_after_id = self.after(100, self._process_auth_queue)
        self.show_loading_screen(t("main.loading_title"), t("main.loading_detail"))
        self.after(150, self.bootstrap_session)

    def _ui_alive(self) -> bool:
        if getattr(self, "_closing", False):
            return False
        try:
            return bool(self.winfo_exists())
        except TclError:
            return False

    def destroy(self):
        if not getattr(self, "_closing", False):
            self._closing = True
            self._stop_ui_polish_animations()
            self._cancel_auth_queue_polling()
            self._cancel_periodic_validation()
            self._cancel_focus_refresh_schedule()
        super().destroy()

    def _stop_ui_polish_animations(self):
        if getattr(self, "_loading_pulse", None) is not None:
            try:
                self._loading_pulse.stop()
            except Exception:
                pass
            self._loading_pulse = None

    def _clear_content(self):
        self._stop_ui_polish_animations()
        for widget in self.content_container.winfo_children():
            widget.destroy()

    def _set_footer(self, left_text, center_text, right_text, action_text, action_command):
        if self.footer is not None:
            try:
                self.footer.destroy()
            except Exception:
                pass
        self.footer = add_footer(
            self,
            left_text=left_text,
            center_text=center_text,
            right_text=right_text,
            action_text=action_text,
            action_command=action_command,
        )

    def _feature_label(self, spec):
        return t(spec["label_key"])

    def _tool_sidebar_label(self, key: str) -> str:
        slug = key.replace("-", "_")
        return t(f"desktop.tool_{slug}")

    def _user_first_name(self) -> str:
        if self._is_guest_mode():
            parts = t("main.guest_user").split()
            return parts[0] if parts else "—"
        user = (self.current_session or {}).get("user") or {}
        fn = (user.get("firstName") or "").strip()
        if fn:
            return fn
        name = (user.get("name") or "").strip()
        if name:
            return name.split()[0]
        return "User" if get_language() == "en" else "Kullanıcı"

    def _user_nav_greeting(self) -> str:
        return t("desktop.nav_greeting", name=self._user_first_name())

    def _subscription_nav_pill_text(self) -> str:
        if self._is_guest_mode():
            return t("desktop.nav_guest_pill")
        sub = (self.license_info or {}).get("subscriptionStatus") or {}
        plan = sub.get("plan") or (self.license_info or {}).get("plan") or "FREE"
        rd = sub.get("remaining_days")
        lang = get_language()
        if plan == "FREE":
            return "Ücretsiz Plan" if lang == "tr" else "Free Plan"
        tier = "PRO" if plan == "PRO" else "BUSINESS"
        if rd is None:
            return tier
        suffix = f"{rd} gün kaldı" if lang == "tr" else f"{rd} days left"
        return f"{tier} • {suffix}"

    def _nav_upgrade_visible(self) -> bool:
        if not self._is_authenticated_session():
            return False
        plan = (self.license_info or {}).get("plan", "FREE")
        return plan in ("FREE", "PRO")

    def _show_language_bar(self, visible: bool) -> None:
        if visible:
            if not self.lang_bar.winfo_ismapped():
                self.lang_bar.pack(fill="x", padx=24, pady=(10, 0), before=self.content_container)
        else:
            self.lang_bar.pack_forget()

    def _close_profile_menu(self) -> None:
        if self.profile_menu_window is not None:
            try:
                self.profile_menu_window.destroy()
            except Exception:
                pass
            self.profile_menu_window = None

    def _open_web_workspace(self) -> None:
        self._close_profile_menu()
        url = (self.auth_config.get("web_app_url") or "").strip().rstrip("/")
        if url:
            webbrowser.open(f"{url}/workspace")

    def _on_profile_saved(self, user: dict) -> None:
        if self.current_session and isinstance(user, dict):
            self.current_session["user"] = {**(self.current_session.get("user") or {}), **user}
            self._save_current_session()
            self._apply_license_visuals()

    def _open_change_password_dialog(self) -> None:
        if not self._is_authenticated_session():
            return
        u = (self.current_session or {}).get("user") or {}
        if (u.get("authProvider") or "local").lower() == "google":
            messagebox.showinfo(t("settings.title"), t("settings.password_google_only"))
            return
        ChangePasswordDialog(self, self.ekran_ortala, self.auth_client, self.current_session["accessToken"])

    def _open_change_password_from_menu(self) -> None:
        self._close_profile_menu()
        self._open_change_password_dialog()

    def open_subscription_workspace(self) -> None:
        if not self._is_authenticated_session():
            messagebox.showinfo(t("main.upgrade"), t("main.guest_sign_in_required"))
            return
        self.awaiting_upgrade_return = True
        SubscriptionWorkspaceModal(
            self,
            self.ekran_ortala,
            self.auth_client,
            self.current_session["accessToken"],
            self.auth_config.get("web_app_url", ""),
            on_refresh_license=self.refresh_subscription_status,
        )
        if self.license_notice:
            self.license_notice.configure(text=t("main.payment_return_hint"))

    def _toggle_profile_menu(self) -> None:
        if self.profile_menu_window is not None:
            self._close_profile_menu()
            return
        self.profile_menu_window = ctk.CTkToplevel(self)
        self.profile_menu_window.overrideredirect(True)
        self.profile_menu_window.attributes("-topmost", True)
        self.profile_menu_window.configure(fg_color=self.ui["bg"])
        fr = ctk.CTkFrame(
            self.profile_menu_window,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=self.ui.get("radius_md", 12),
        )
        fr.pack(fill="both", expand=True)

        def row(txt, cmd, danger=False):
            ctk.CTkButton(
                fr,
                text=txt,
                anchor="w",
                height=42,
                corner_radius=10,
                fg_color="transparent",
                hover_color=self.ui["panel_soft"],
                text_color=self.ui["danger"] if danger else self.ui["text"],
                font=self.ui["small_font"],
                command=lambda c=cmd: (self._close_profile_menu(), c()),
            ).pack(fill="x", padx=4, pady=2)

        if self._is_guest_mode():
            row(t("desktop.profile_sign_in"), lambda: self.show_login_screen())
            row(t("desktop.profile_create_account"), self.open_register_page)
            row(t("desktop.profile_settings"), self.open_settings_dialog)
        else:
            row(t("desktop.profile_settings"), self.open_settings_dialog)
            row(t("desktop.profile_password"), self._open_change_password_from_menu)
            row(t("desktop.profile_logout"), self.logout, danger=True)

        self.profile_menu_window.update_idletasks()
        self.nav_profile_btn.update_idletasks()
        w_m = 232
        x = self.nav_profile_btn.winfo_rootx() + self.nav_profile_btn.winfo_width() - w_m
        y = self.nav_profile_btn.winfo_rooty() + self.nav_profile_btn.winfo_height() + 6
        self.profile_menu_window.geometry(f"{w_m}x168+{max(8, x)}+{y}")
        self.profile_menu_window.bind("<Escape>", lambda _e: self._close_profile_menu())

    def _set_sidebar_active(self, key: str) -> None:
        self.active_sidebar_key = key
        blocked = set()
        if self.license_info and not self.license_info.get("guest"):
            ent = self.license_info.get("entitlements") or {}
            blocked = set(ent.get("blockedFeatures") or [])
        for k, btn in self.sidebar_tool_buttons.items():
            is_active = k == key
            is_locked = k in blocked
            self._sidebar_style_row(btn, is_active, is_locked)

    def _sidebar_style_row(self, btn, active: bool, locked: bool) -> None:
        if active:
            btn.configure(
                fg_color=self.ui.get("nav_active_bg", self.ui["panel_soft"]),
                border_width=1,
                border_color=self.ui.get("nav_active_border", self.ui["accent"]),
                text_color=self.ui.get("accent_soft", self.ui["accent"]),
            )
        elif locked:
            btn.configure(
                fg_color=self.ui["panel_alt"],
                border_width=1,
                border_color=self.ui["warning"],
                text_color=self.ui["muted"],
            )
        else:
            btn.configure(
                fg_color="transparent",
                border_width=1,
                border_color=self.ui["border_subtle"],
                text_color=self.ui["muted"],
            )

    def _sidebar_hover(self, btn, key: str, entering: bool) -> None:
        if key == self.active_sidebar_key:
            return
        blocked = set()
        if self.license_info and not self.license_info.get("guest"):
            ent = self.license_info.get("entitlements") or {}
            blocked = set(ent.get("blockedFeatures") or [])
        locked = key in blocked
        if entering:
            btn.configure(fg_color=self.ui.get("sidebar_hover", self.ui["panel_soft"]))
        else:
            self._sidebar_style_row(btn, False, locked)

    def _on_sidebar_tool_click(self, key: str) -> None:
        label = self._tool_sidebar_label(key)
        self._set_sidebar_active(key)
        flat = label.replace("\n", " ")
        self.handle_click(key, flat)

    def _grid_tool_launch(self, key: str, label: str) -> None:
        self._set_sidebar_active(key)
        self.handle_click(key, label)

    def _on_sidebar_subscription_click(self) -> None:
        self._set_sidebar_active("subscription")
        self.open_subscription_workspace()

    def _open_web_home(self) -> None:
        url = (self.auth_config.get("web_app_url") or "").strip()
        if url:
            webbrowser.open(url)

    def _is_authenticated_session(self):
        return bool(self.current_session and self.current_session.get("accessToken"))

    def _is_guest_mode(self):
        return bool(self.current_session and self.current_session.get("mode") == "guest" and not self.current_session.get("accessToken"))

    def _load_guest_state(self, force_reload=False):
        if force_reload or self.guest_state is None:
            self.guest_state = self.guest_store.load()
        return self.guest_state

    def _build_guest_license_info(self, guest_state=None):
        guest_state = guest_state or self._load_guest_state()
        return {
            "plan": "GUEST",
            "status": "active",
            "usage": {
                "guestOperationsUsed": guest_state.guest_operations_used,
                "guestLimit": guest_state.guest_limit,
                "remainingGuestOperations": guest_state.remaining_operations,
            },
            "entitlements": {"blockedFeatures": []},
            "devices": {},
            "guest": True,
            "guestState": guest_state.to_dict(),
            "upgradeMessage": t("main.guest_create_account_to_continue") if guest_state.guest_locked else "",
        }

    def _build_guest_session(self, guest_state=None):
        guest_state = guest_state or self._load_guest_state()
        session = guest_state.to_dict()
        session.update(
            {
                "mode": "guest",
                "user": {"email": t("main.guest_user")},
                "license": self._build_guest_license_info(guest_state),
            }
        )
        return session

    def _sync_guest_session(self, guest_state=None, force_reload=False):
        guest_state = guest_state or self._load_guest_state(force_reload=force_reload)
        if self._is_guest_mode():
            self.current_session = self._build_guest_session(guest_state)
            self.license_info = self.current_session["license"]
        return guest_state

    def _refresh_guest_ui(self, force_reload=False):
        guest_state = self._sync_guest_session(force_reload=force_reload)
        if self._is_guest_mode() and self.license_info:
            self._apply_license_visuals()
        return guest_state

    def _schedule_guest_ui_refresh(self, force_reload=False):
        self.after(0, lambda: self._refresh_guest_ui(force_reload=force_reload))

    def _show_guest_account_wall(self):
        gs = self._load_guest_state(force_reload=True)
        GuestLimitModal(
            self,
            self.ekran_ortala,
            used=gs.guest_operations_used,
            limit=gs.guest_limit,
            on_sign_in=lambda: self.show_login_screen(t("main.guest_create_account_to_continue")),
            on_register=self.open_register_page,
        )

    def _schedule_guest_account_wall(self):
        self.after(0, self._show_guest_account_wall)

    def _enter_guest_mode(self):
        self._cancel_periodic_validation()
        self.awaiting_upgrade_return = False
        guest_state = self._load_guest_state(force_reload=True)
        self.current_session = self._build_guest_session(guest_state)
        self.license_info = self.current_session["license"]
        self.setup_ui()

    def open_settings_dialog(self):
        user = (self.current_session or {}).get("user") if self._is_authenticated_session() else None
        token = (self.current_session or {}).get("accessToken") if self._is_authenticated_session() else None
        provider = ((user or {}).get("authProvider") or "local").lower()
        SettingsDialog(
            self,
            self.ekran_ortala,
            api_base_url=self.auth_config.get("api_base_url", ""),
            web_app_url=self.auth_config.get("web_app_url", ""),
            update_manifest_url=self.auth_config.get("update_manifest_url", ""),
            on_check_updates=self._check_for_updates_dialog if self.auth_config.get("update_manifest_url") else None,
            user=user if isinstance(user, dict) else None,
            access_token=token,
            auth_client=self.auth_client if token else None,
            auth_provider=provider,
            on_open_change_password=self._open_change_password_dialog if token else None,
            on_saved=self._on_profile_saved,
        )

    def _check_for_updates_dialog(self):
        url = (self.auth_config.get("update_manifest_url") or "").strip()
        if not url:
            messagebox.showinfo(t("app.name"), t("settings.update_no_manifest"))
            return
        try:
            from modules.auto_update import check_manifest

            has_new, remote_ver, download_url = check_manifest(url)
        except Exception as exc:
            messagebox.showwarning(t("app.warning"), t("settings.update_error", detail=str(exc)))
            return
        if has_new and remote_ver:
            msg = t("settings.update_available", version=remote_ver, current=__version__)
            if download_url:
                msg = f"{msg}\n\n{t('settings.update_open_browser')}"
            if messagebox.askyesno(t("settings.update_title"), msg):
                if download_url:
                    webbrowser.open(download_url)
        else:
            messagebox.showinfo(t("settings.update_title"), t("settings.update_uptodate", version=__version__))

    def _build_language_bar(self):
        for child in self.lang_bar.winfo_children():
            child.destroy()
        inner = ctk.CTkFrame(self.lang_bar, fg_color="transparent")
        inner.pack(side="right")
        d_tr = t("app.lang_display_tr")
        d_en = t("app.lang_display_en")
        self._lang_display_to_code = {d_tr: "tr", d_en: "en"}
        cur = get_language()
        initial = d_tr if cur == "tr" else d_en
        self.lang_menu = ctk.CTkOptionMenu(
            inner,
            values=[d_tr, d_en],
            command=self._on_language_selected,
            width=130,
            fg_color=self.ui["panel_soft"],
            button_color=self.ui["border"],
            button_hover_color=self.ui["accent"],
            dropdown_fg_color=self.ui["panel"],
            dropdown_hover_color=self.ui["panel_soft"],
        )
        self.lang_menu.set(initial)
        self.lang_menu.pack(side="right", padx=(10, 0))
        ctk.CTkLabel(
            inner,
            text=t("app.language_label"),
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
        ).pack(side="right")

    def _on_language_selected(self, display_value):
        code = self._lang_display_to_code.get(display_value)
        if not code or code == get_language():
            return
        set_language(code)
        self._refresh_full_ui()

    def _refresh_full_ui(self):
        self.title(f"{t('app.name')} · v{get_version_string()}")
        self._build_language_bar()
        phase = getattr(self, "_ui_phase", "loading")
        if (
            phase == "main"
            and self.license_info
            and self.current_session
            and (self._is_authenticated_session() or self._is_guest_mode())
        ):
            if self._is_guest_mode():
                self._sync_guest_session(force_reload=True)
            self.setup_ui()
            return
        if phase == "login":
            preserve = None
            err = ""
            try:
                if hasattr(self, "email_entry"):
                    preserve = {
                        "email": self.email_entry.get(),
                        "password": self.password_entry.get(),
                    }
                if hasattr(self, "login_error_label"):
                    err = self.login_error_label.cget("text") or ""
            except Exception:
                pass
            self.show_login_screen(err, preserve_credentials=preserve)
            return
        t1 = t("main.loading_title")
        d1 = t("main.loading_detail")
        if hasattr(self, "loading_title_label"):
            self.update_loading_screen(t1, d1)
            self._set_footer(
                t("app.name"),
                f"{t('app.secure_access')} · v{get_version_string()}",
                t("app.desktop_edition"),
                t("main.create_account"),
                self.open_register_page,
            )
        else:
            self.show_loading_screen(t1, d1)

    def show_loading_screen(self, title, detail):
        self._ui_phase = "loading"
        self._show_language_bar(True)
        self._clear_content()
        outer = ctk.CTkFrame(self.content_container, fg_color="transparent")
        outer.pack(expand=True, fill="both", padx=24, pady=12)
        loading_card = ctk.CTkFrame(
            outer,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=28,
        )
        loading_card.place(relx=0.5, rely=0.5, anchor="center")
        strip = ctk.CTkFrame(loading_card, fg_color="transparent", height=76)
        strip.pack(fill="x", side="top")
        strip.pack_propagate(False)
        gt = self.ui.get("gradient_card_top", self.ui["accent"])
        gb = self.ui.get("gradient_card_bottom", self.ui["panel"])
        _gw = 680
        _grad_lbl = vertical_gradient_strip(strip, _gw, 76, gt, gb, bg_hex=gb)
        _grad_lbl.pack(fill="both", expand=True)
        inner = ctk.CTkFrame(loading_card, fg_color="transparent")
        inner.pack(expand=True, padx=48, pady=(20, 40))
        brand = self.ui.get("accent_soft", self.ui["accent"])
        ctk.CTkLabel(inner, text=t("app.name"), font=("Segoe UI Semibold", 32, "bold"), text_color=brand).pack(pady=(0, 10))
        self.loading_title_label = ctk.CTkLabel(inner, text=title, font=self.ui["title_font"], text_color=self.ui["text"])
        self.loading_title_label.pack()
        self.loading_detail_label = ctk.CTkLabel(inner, text=detail, font=self.ui["body_font"], text_color=self.ui["muted"], wraplength=620)
        self.loading_detail_label.pack(pady=(12, 0))
        self._loading_pulse = LoadingPulseDots(inner, self.ui, self)
        self._loading_pulse.pack(pady=(18, 0))
        self._set_footer(
            t("app.name"),
            f"{t('app.secure_access')} · v{get_version_string()}",
            t("app.desktop_edition"),
            t("main.create_account"),
            self.open_register_page,
        )

    def update_loading_screen(self, title, detail):
        if hasattr(self, "loading_title_label"):
            self.loading_title_label.configure(text=title)
        if hasattr(self, "loading_detail_label"):
            self.loading_detail_label.configure(text=detail)

    def show_login_screen(self, error_text="", preserve_credentials=None):
        if not self._ui_alive():
            return
        self._ui_phase = "login"
        self._show_language_bar(True)
        self._clear_content()
        self._cancel_periodic_validation()
        self.current_session = None
        self.license_info = None
        outer = ctk.CTkFrame(self.content_container, fg_color="transparent")
        outer.pack(expand=True, fill="both", padx=24, pady=12)
        login_card = ctk.CTkFrame(
            outer,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=28,
        )
        login_card.place(relx=0.5, rely=0.5, anchor="center")

        top = ctk.CTkFrame(login_card, fg_color="transparent")
        top.pack(fill="x", padx=36, pady=(32, 8))
        brand = self.ui.get("accent_soft", self.ui["accent"])
        ctk.CTkLabel(top, text=t("app.name"), font=("Segoe UI Semibold", 28, "bold"), text_color=brand).pack()
        ctk.CTkLabel(top, text=t("main.login_title"), font=self.ui["title_font"], text_color=self.ui["text"]).pack(pady=(10, 4))
        ctk.CTkLabel(
            top,
            text=t("main.login_description"),
            font=self.ui["body_font"],
            text_color=self.ui["muted"],
            wraplength=400,
        ).pack()
        _line = thin_accent_line(top, self.ui, width=400, height=3)
        _line.pack(pady=(14, 0))

        form = ctk.CTkFrame(
            login_card,
            fg_color=self.ui["panel_alt"],
            corner_radius=20,
            border_width=1,
            border_color=self.ui["border"],
        )
        form.pack(fill="x", padx=28, pady=(12, 28))
        form.grid_columnconfigure(0, weight=1)

        entry_bg = self.ui.get("input_bg", self.ui["panel"])
        entry_border = self.ui.get("input_border", self.ui["border"])

        ctk.CTkLabel(form, text=t("main.email"), font=self.ui["subtitle_font"], text_color=self.ui["text"]).grid(row=0, column=0, sticky="w", padx=24, pady=(22, 8))
        self.email_entry = ctk.CTkEntry(
            form,
            height=48,
            corner_radius=12,
            border_width=1,
            placeholder_text=t("main.email_placeholder"),
            fg_color=entry_bg,
            border_color=entry_border,
            text_color=self.ui["text"],
        )
        self.email_entry.grid(row=1, column=0, sticky="ew", padx=24)

        ctk.CTkLabel(form, text=t("main.password"), font=self.ui["subtitle_font"], text_color=self.ui["text"]).grid(row=2, column=0, sticky="w", padx=24, pady=(16, 8))
        self.password_entry = ctk.CTkEntry(
            form,
            height=48,
            corner_radius=12,
            border_width=1,
            placeholder_text=t("main.password_placeholder"),
            show="*",
            fg_color=entry_bg,
            border_color=entry_border,
            text_color=self.ui["text"],
        )
        self.password_entry.grid(row=3, column=0, sticky="ew", padx=24)

        self.login_error_label = ctk.CTkLabel(
            form,
            text=error_text,
            font=self.ui["small_font"],
            text_color=self.ui["danger"],
            wraplength=460,
            justify="left",
        )
        self.login_error_label.grid(row=4, column=0, sticky="w", padx=24, pady=(14, 0))

        self.login_status_label = ctk.CTkLabel(
            form,
            text="",
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
            wraplength=400,
            justify="left",
        )
        self.login_status_label.grid(row=5, column=0, sticky="w", padx=24, pady=(8, 0))

        self.login_button = ctk.CTkButton(
            form,
            text=t("main.login"),
            height=50,
            corner_radius=14,
            font=("Segoe UI Semibold", 15, "bold"),
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            text_color=self.ui["button_text"],
            command=self.submit_login,
        )
        self.login_button.grid(row=6, column=0, sticky="ew", padx=24, pady=(20, 8))

        self.google_login_button = ctk.CTkButton(
            form,
            text=t("main.google_sign_in"),
            height=44,
            corner_radius=14,
            font=("Segoe UI Semibold", 14, "bold"),
            fg_color=self.ui["panel_soft"],
            hover_color=self.ui["border"],
            text_color=self.ui["text"],
            border_width=1,
            border_color=self.ui["border"],
            command=self.start_google_login,
        )
        self.google_login_button.grid(row=7, column=0, sticky="ew", padx=24, pady=(0, 12))

        ctk.CTkButton(
            form,
            text=t("main.continue_guest"),
            height=32,
            corner_radius=10,
            fg_color="transparent",
            hover_color=self.ui["panel_soft"],
            text_color=self.ui["muted"],
            font=self.ui["small_font"],
            command=self._enter_guest_mode,
        ).grid(row=8, column=0, pady=(0, 4))
        ctk.CTkButton(
            form,
            text=t("main.create_account"),
            height=32,
            corner_radius=10,
            fg_color="transparent",
            hover_color=self.ui["panel_soft"],
            text_color=self.ui.get("accent_soft", self.ui["accent"]),
            font=self.ui["small_font"],
            command=self.open_register_page,
        ).grid(row=9, column=0, pady=(0, 4))
        ctk.CTkButton(
            form,
            text=t("main.settings"),
            height=32,
            corner_radius=10,
            fg_color="transparent",
            hover_color=self.ui["panel_soft"],
            text_color=self.ui["muted"],
            font=self.ui["small_font"],
            command=self.open_settings_dialog,
        ).grid(row=10, column=0, pady=(0, 22))

        self.password_entry.bind("<Return>", lambda _event: self.submit_login())
        self.email_entry.bind("<Return>", lambda _event: self.submit_login())
        self.email_entry.focus_set()
        self._set_footer(
            t("app.name"),
            f"{t('app.secure_access')} · v{get_version_string()}",
            t("app.desktop_edition"),
            t("app.contact"),
            self.open_contact_dialog,
        )
        if preserve_credentials:
            em = preserve_credentials.get("email") or ""
            pw = preserve_credentials.get("password") or ""
            if em:
                self.email_entry.insert(0, em)
            if pw:
                self.password_entry.insert(0, pw)

    def setup_ui(self):
        self._ui_phase = "main"
        self.ui = theme()
        self.configure(fg_color=self.ui["bg"])
        self._close_profile_menu()
        self._show_language_bar(False)
        self._clear_content()
        self.feature_buttons = {}
        self.sidebar_tool_buttons = {}
        self.nav_subscription_label = None
        self.nav_upgrade_btn = None
        self.nav_profile_btn = None
        self.sidebar_refresh_btn = None
        self.hero_refresh_btn = None
        if self._is_authenticated_session():
            self._schedule_periodic_validation()
        else:
            self._cancel_periodic_validation()

        shell = ctk.CTkFrame(self.content_container, fg_color=self.ui["bg"])
        shell.pack(expand=True, fill="both")

        nav_h = int(self.ui.get("nav_height", 56))
        navbar = ctk.CTkFrame(
            shell,
            fg_color=self.ui.get("nav_bar", self.ui["panel"]),
            border_width=1,
            border_color=self.ui["border_subtle"],
            corner_radius=0,
            height=nav_h,
        )
        navbar.pack(fill="x", padx=0, pady=0)
        navbar.pack_propagate(False)
        navbar.grid_columnconfigure(1, weight=1)

        nav_left = ctk.CTkFrame(navbar, fg_color="transparent")
        nav_left.grid(row=0, column=0, sticky="w", padx=(16, 8), pady=8)
        logo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "nb_pdf_PLARTFORM_icon.png"))
        logo_lbl = None
        if os.path.isfile(logo_path):
            try:
                img = PhotoImage(file=logo_path)
                if img.width() > 36:
                    img = img.subsample(max(1, img.width() // 36))
                logo_lbl = ctk.CTkLabel(nav_left, image=img, text="")
                logo_lbl.image = img
            except Exception:
                logo_lbl = None
        if logo_lbl is None:
            logo_lbl = ctk.CTkLabel(nav_left, text="◆", font=("Segoe UI", 22), text_color=self.ui["accent_soft"])
        logo_lbl.pack(side="left", padx=(0, 10))
        brand_col = ctk.CTkFrame(nav_left, fg_color="transparent")
        brand_col.pack(side="left")
        ctk.CTkLabel(
            brand_col,
            text=t("desktop.nav_kicker"),
            font=("Segoe UI", 10, "bold"),
            text_color=self.ui["muted"],
        ).pack(anchor="w")
        ctk.CTkLabel(
            brand_col,
            text=t("app.name"),
            font=("Segoe UI Semibold", 15, "bold"),
            text_color=self.ui["text"],
        ).pack(anchor="w")

        nav_center = ctk.CTkFrame(navbar, fg_color="transparent")
        nav_center.grid(row=0, column=1, sticky="ew")
        self.nav_center_inner = ctk.CTkFrame(nav_center, fg_color="transparent")
        self.nav_center_inner.place(relx=0.5, rely=0.5, anchor="center")

        pill = ctk.CTkFrame(
            self.nav_center_inner,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border_subtle"],
            corner_radius=20,
        )
        pill.pack(side="left", padx=(0, 8))
        self.nav_subscription_label = ctk.CTkLabel(
            pill,
            text=self._subscription_nav_pill_text(),
            font=("Segoe UI", 11, "bold"),
            text_color=self.ui["accent_soft"],
            padx=14,
            pady=6,
        )
        self.nav_subscription_label.pack()

        self.nav_upgrade_btn = ctk.CTkButton(
            self.nav_center_inner,
            text=t("desktop.navbar_upgrade"),
            height=32,
            font=("Segoe UI Semibold", 11, "bold"),
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            text_color=self.ui["button_text"],
            corner_radius=14,
            command=self.open_upgrade_page,
        )
        if self._nav_upgrade_visible():
            self.nav_upgrade_btn.pack(side="left", padx=4)
        else:
            self.nav_upgrade_btn.pack_forget()

        nav_right = ctk.CTkFrame(navbar, fg_color="transparent")
        nav_right.grid(row=0, column=2, sticky="e", padx=(8, 16), pady=6)
        self.nav_profile_btn = ctk.CTkButton(
            nav_right,
            text=f"{self._user_nav_greeting()}   ▾",
            height=34,
            font=("Segoe UI Semibold", 13),
            fg_color=self.ui["panel"],
            hover_color=self.ui["panel_soft"],
            text_color=self.ui["text"],
            border_width=1,
            border_color=self.ui["border_subtle"],
            corner_radius=12,
            command=self._toggle_profile_menu,
        )
        self.nav_profile_btn.pack(side="right")

        _nav_accent = thin_accent_line(shell, self.ui, width=1600, height=2)
        _nav_accent.pack(fill="x", padx=0, pady=0)

        body = ctk.CTkFrame(shell, fg_color=self.ui["bg"])
        body.pack(expand=True, fill="both", padx=0, pady=0)

        sb_w = int(self.ui.get("sidebar_width", 240))
        sidebar = ctk.CTkFrame(
            body,
            fg_color=self.ui.get("sidebar_bg", self.ui["panel"]),
            border_width=1,
            border_color=self.ui["border_subtle"],
            width=sb_w,
            corner_radius=0,
        )
        sidebar.pack(side="left", fill="y", padx=0, pady=0)
        sidebar.pack_propagate(False)

        s_nav = ctk.CTkScrollableFrame(sidebar, fg_color="transparent", scrollbar_button_color=self.ui["panel_soft"])
        s_nav.pack(fill="both", expand=True, padx=10, pady=(8, 8))

        self.sidebar_tool_buttons = {}
        for spec in self.feature_specs:
            key = spec["key"]
            txt = self._tool_sidebar_label(key)
            blocked = set()
            if self.license_info and not self.license_info.get("guest"):
                ent = self.license_info.get("entitlements") or {}
                blocked = set(ent.get("blockedFeatures") or [])
            locked = key in blocked
            prefix = "🔒 " if locked else "•  "
            btn = ctk.CTkButton(
                s_nav,
                text=f"{prefix}{txt}",
                height=40,
                anchor="w",
                font=("Segoe UI Semibold", 13),
                corner_radius=14,
                border_width=1,
                command=lambda k=key: self._on_sidebar_tool_click(k),
            )
            btn.pack(fill="x", pady=3)
            self.sidebar_tool_buttons[key] = btn
            btn.bind("<Enter>", lambda e, b=btn, k=key: self._sidebar_hover(b, k, True))
            btn.bind("<Leave>", lambda e, b=btn, k=key: self._sidebar_hover(b, k, False))
            self._sidebar_style_row(btn, self.active_sidebar_key == key, locked)

        plan_btn = ctk.CTkButton(
            s_nav,
            text=t("desktop.plan_nav"),
            height=40,
            anchor="w",
            font=("Segoe UI Semibold", 13),
            corner_radius=14,
            border_width=1,
            command=self._on_sidebar_subscription_click,
        )
        plan_btn.pack(fill="x", pady=(10, 3))
        self.sidebar_tool_buttons["subscription"] = plan_btn
        plan_btn.bind("<Enter>", lambda e, b=plan_btn, k="subscription": self._sidebar_hover(b, k, True))
        plan_btn.bind("<Leave>", lambda e, b=plan_btn, k="subscription": self._sidebar_hover(b, k, False))
        self._sidebar_style_row(plan_btn, self.active_sidebar_key == "subscription", False)

        lang_head = ctk.CTkLabel(
            sidebar,
            text=t("desktop.lang_section"),
            font=("Segoe UI", 10, "bold"),
            text_color=self.ui["muted"],
            anchor="w",
        )
        lang_head.pack(fill="x", padx=14, pady=(4, 4))
        lang_row = ctk.CTkFrame(sidebar, fg_color="transparent")
        lang_row.pack(fill="x", padx=10, pady=(0, 6))
        d_tr = t("app.lang_display_tr")
        d_en = t("app.lang_display_en")

        def _set_lang_tr():
            set_language("tr")
            self._refresh_full_ui()

        def _set_lang_en():
            set_language("en")
            self._refresh_full_ui()

        ctk.CTkButton(
            lang_row,
            text="TR",
            width=100,
            height=32,
            corner_radius=12,
            fg_color=self.ui["panel"] if get_language() == "tr" else "transparent",
            border_width=1,
            border_color=self.ui["border"],
            command=_set_lang_tr,
        ).pack(side="left", expand=True, fill="x", padx=(0, 4))
        ctk.CTkButton(
            lang_row,
            text="EN",
            width=100,
            height=32,
            corner_radius=12,
            fg_color=self.ui["panel"] if get_language() == "en" else "transparent",
            border_width=1,
            border_color=self.ui["border"],
            command=_set_lang_en,
        ).pack(side="left", expand=True, fill="x", padx=(4, 0))

        ctk.CTkButton(
            sidebar,
            text=t("desktop.home_nav"),
            height=34,
            font=("Segoe UI", 12),
            fg_color="transparent",
            border_width=1,
            border_color=self.ui["border_subtle"],
            hover_color=self.ui["panel_soft"],
            command=self._open_web_home,
        ).pack(fill="x", padx=10, pady=(0, 6))

        self.sidebar_refresh_btn = ctk.CTkButton(
            sidebar,
            text=t("desktop.refresh_subscription"),
            height=34,
            font=("Segoe UI", 12),
            fg_color=self.ui["panel_soft"],
            hover_color=self.ui["border"],
            command=self.refresh_subscription_status,
        )
        self.sidebar_refresh_btn.pack(fill="x", padx=10, pady=(0, 10))

        self.shell_main_area = ctk.CTkScrollableFrame(
            body,
            fg_color=self.ui["bg"],
            scrollbar_button_color=self.ui["panel_soft"],
        )
        self.shell_main_area.pack(side="right", expand=True, fill="both", padx=(16, 20), pady=(16, 12))

        hero = ctk.CTkFrame(
            self.shell_main_area,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border_subtle"],
            corner_radius=self.ui.get("radius_lg", 16),
        )
        hero.pack(fill="x", pady=(0, 18))
        hero_strip = ctk.CTkFrame(hero, fg_color="transparent", height=84)
        hero_strip.pack(fill="x", side="top")
        hero_strip.pack_propagate(False)
        _hw = 920
        _ht = 84
        _hb = self.ui.get("gradient_hero_bottom", self.ui["panel"])
        _hl = vertical_gradient_strip(
            hero_strip,
            _hw,
            _ht,
            self.ui.get("gradient_hero_top", self.ui["accent"]),
            _hb,
            bg_hex=_hb,
        )
        _hl.pack(fill="both", expand=True)
        hero_inner = ctk.CTkFrame(hero, fg_color="transparent")
        hero_inner.pack(fill="x", padx=24, pady=(14, 22))
        ctk.CTkLabel(
            hero_inner,
            text=t("desktop.workspace_title"),
            font=("Segoe UI Semibold", 26, "bold"),
            text_color=self.ui["accent_soft"],
        ).pack(anchor="w")
        ctk.CTkLabel(
            hero_inner,
            text=t("desktop.workspace_subtitle"),
            font=("Segoe UI Semibold", 12, "bold"),
            text_color=self.ui["text"],
        ).pack(anchor="w", pady=(4, 0))
        ctk.CTkLabel(
            hero_inner,
            text=t("desktop.workspace_desc"),
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
            wraplength=720,
            justify="left",
        ).pack(anchor="w", pady=(8, 0))

        self.account_badge = ctk.CTkLabel(
            hero_inner,
            text="",
            font=self.ui["small_font"],
            text_color=self.ui["text"],
            fg_color=self.ui["panel_soft"],
            corner_radius=12,
            padx=12,
            pady=6,
        )
        self.account_badge.pack(anchor="w", pady=(14, 0))

        self.license_notice = ctk.CTkLabel(
            hero_inner,
            text="",
            font=self.ui["small_font"],
            text_color=self.ui["warning"],
            wraplength=720,
            justify="left",
        )
        self.license_notice.pack(anchor="w", pady=(8, 0))

        if self._is_authenticated_session() and not self._is_guest_mode():
            hero_sync_row = ctk.CTkFrame(hero_inner, fg_color="transparent")
            hero_sync_row.pack(anchor="w", pady=(8, 0))
            self.hero_refresh_btn = ctk.CTkButton(
                hero_sync_row,
                text=t("desktop.refresh_subscription"),
                height=34,
                corner_radius=10,
                font=("Segoe UI Semibold", 12, "bold"),
                fg_color=self.ui["panel_soft"],
                hover_color=self.ui["accent"],
                text_color=self.ui["text"],
                border_width=1,
                border_color=self.ui["border_subtle"],
                command=self.refresh_subscription_status,
            )
            self.hero_refresh_btn.pack(side="left")
            ctk.CTkLabel(
                hero_sync_row,
                text=t("desktop.sync_web_hint"),
                font=("Segoe UI", 11),
                text_color=self.ui["muted"],
                padx=(14, 0),
            ).pack(side="left")

        self.button_frame = ctk.CTkFrame(self.shell_main_area, fg_color="transparent")
        self.button_frame.pack(fill="x")
        for idx in range(3):
            self.button_frame.grid_columnconfigure(idx, weight=1)

        for i, spec in enumerate(self.feature_specs):
            isim = self._feature_label(spec)
            ikon = spec["icon"]
            btn = ctk.CTkButton(
                self.button_frame,
                text=f"{ikon}\n\n{isim}",
                width=220,
                height=160,
                corner_radius=self.ui.get("radius_lg", 16),
                font=("Segoe UI Semibold", 16, "bold"),
                fg_color=self.ui["panel"],
                hover_color=self.ui["accent"],
                text_color=self.ui["text"],
                border_width=1,
                border_color=self.ui["border_subtle"],
                command=lambda key=spec["key"], label=isim: self._grid_tool_launch(key, label),
            )
            btn.grid(row=i // 3, column=i % 3, padx=12, pady=16)
            self.feature_buttons[spec["key"]] = btn

        self._apply_license_visuals()

        _blocked = set()
        if self.license_info and not self.license_info.get("guest"):
            _blocked = set((self.license_info.get("entitlements") or {}).get("blockedFeatures") or [])
        _unlock_btns = []
        for spec in self.feature_specs:
            k = spec["key"]
            if k in _blocked:
                continue
            b = self.feature_buttons.get(k)
            if b:
                b.configure(fg_color=self.ui["panel_alt"])
                _unlock_btns.append(b)
        stagger_raise_buttons(self, _unlock_btns, self.ui, self.ui["panel_alt"], self.ui["panel"], 36)
        for spec in self.feature_specs:
            if spec["key"] not in _blocked:
                attach_feature_button_polish(self.feature_buttons[spec["key"]], self.ui)
        self._set_footer(
            t("app.name"),
            f"{t('app.footer_byline')} · v{get_version_string()}",
            t("app.desktop_edition"),
            t("app.contact"),
            self.open_contact_dialog,
        )

    def _apply_license_visuals(self):
        if not self.license_info:
            return
        if self.nav_subscription_label:
            self.nav_subscription_label.configure(text=self._subscription_nav_pill_text())
        if self.nav_profile_btn:
            self.nav_profile_btn.configure(text=f"{self._user_nav_greeting()}   ▾")
        if self.license_info.get("guest"):
            guest_state = self._load_guest_state(force_reload=True)
            remaining = guest_state.remaining_operations
            badge_key = "main.guest_badge_locked" if guest_state.guest_locked else "main.guest_badge"
            notice_key = "main.guest_notice_locked" if guest_state.guest_locked else "main.guest_notice"
            self.account_badge.configure(text=t(badge_key, remaining=remaining, limit=guest_state.guest_limit))
            self.license_notice.configure(
                text=t(
                    notice_key,
                    remaining=remaining,
                    limit=guest_state.guest_limit,
                    cta=t("main.guest_create_account_to_continue"),
                )
            )
            if self.nav_upgrade_btn:
                self.nav_upgrade_btn.pack_forget()
            if self.sidebar_refresh_btn:
                self.sidebar_refresh_btn.configure(
                    state="normal",
                    text=t("main.login"),
                    command=lambda: self.show_login_screen(),
                )
            for spec in self.feature_specs:
                button = self.feature_buttons.get(spec["key"])
                if button:
                    button.configure(
                        fg_color=self.ui["panel"],
                        hover_color=self.ui["accent"],
                        border_color=self.ui.get("border_subtle", self.ui["border"]),
                        text=f"{spec['icon']}\n\n{self._feature_label(spec)}",
                    )
            for key, sbtn in self.sidebar_tool_buttons.items():
                if key == "subscription":
                    self._sidebar_style_row(sbtn, self.active_sidebar_key == "subscription", False)
                    continue
                self._sidebar_style_row(sbtn, self.active_sidebar_key == key, False)
                sbtn.configure(text=f"•  {self._tool_sidebar_label(key)}")
            return
        user = self.current_session.get("user", {}) if self.current_session else {}
        plan = self.license_info.get("plan", user.get("plan", "-"))
        usage = self.license_info.get("usage", {})
        entitlements = self.license_info.get("entitlements", {})
        used_today = usage.get("usedToday", 0)
        daily_limit = usage.get("dailyLimit")
        if daily_limit is None:
            usage_text = t("main.usage_unlimited")
        elif plan == "FREE":
            usage_text = t("desktop.usage_today", used=used_today, limit=daily_limit)
        else:
            usage_text = t("main.usage_daily", used=used_today, limit=daily_limit)
        device_text = t(
            "app.device_usage",
            active=(self.license_info.get("devices", {}) or {}).get("activeCount", 0),
            limit=(self.license_info.get("devices", {}) or {}).get("limit", 3),
        )
        self.account_badge.configure(text=f"{user.get('email', t('app.name'))} | {plan} | {usage_text}")

        if plan == "FREE":
            limit_text = entitlements.get("maxFileSizeMb")
            usage_head = t("desktop.usage_today", used=used_today, limit=daily_limit) if daily_limit is not None else ""
            free_body = t(
                "main.free_notice",
                limit_text=limit_text,
                device_text=device_text,
            ).strip()
            self.license_notice.configure(
                text=f"{usage_head}\n\n{free_body}" if usage_head else free_body
            )
            if self.nav_upgrade_btn and self._nav_upgrade_visible():
                self.nav_upgrade_btn.pack(side="left", padx=4)
        else:
            self.license_notice.configure(
                text=t("main.active_notice", device_text=device_text)
            )
            if self.nav_upgrade_btn:
                self.nav_upgrade_btn.pack_forget()
        idle_label = t("desktop.refresh_subscription")
        if self.sidebar_refresh_btn:
            self.sidebar_refresh_btn.configure(
                state="disabled" if self.is_refreshing_license else "normal",
                text=t("main.refresh_loading") if self.is_refreshing_license else idle_label,
                command=self.refresh_subscription_status,
            )
        if getattr(self, "hero_refresh_btn", None):
            self.hero_refresh_btn.configure(
                state="disabled" if self.is_refreshing_license else "normal",
                text=t("main.refresh_loading") if self.is_refreshing_license else idle_label,
                command=self.refresh_subscription_status,
            )

        blocked = set(entitlements.get("blockedFeatures", []))
        for spec in self.feature_specs:
            button = self.feature_buttons.get(spec["key"])
            if not button:
                continue
            if spec["key"] in blocked:
                button.configure(
                    fg_color=self.ui["panel_alt"],
                    hover_color=self.ui["panel_soft"],
                    border_color=self.ui["warning"],
                    text=f"{spec['icon']}\n\n{self._feature_label(spec)}\n\n{t('desktop.locked_badge')}",
                )
            else:
                button.configure(
                    fg_color=self.ui["panel"],
                    hover_color=self.ui["accent"],
                    border_color=self.ui.get("border_subtle", self.ui["border"]),
                    text=f"{spec['icon']}\n\n{self._feature_label(spec)}",
                )
        for key, sbtn in self.sidebar_tool_buttons.items():
            if key == "subscription":
                self._sidebar_style_row(sbtn, self.active_sidebar_key == "subscription", False)
                continue
            locked = key in blocked
            prefix = "🔒 " if locked else "•  "
            sbtn.configure(text=f"{prefix}{self._tool_sidebar_label(key)}")
            self._sidebar_style_row(sbtn, self.active_sidebar_key == key, locked)

    def bootstrap_session(self):
        """If no access token → login. Otherwise re-validate on the server (never trust cached plan on disk)."""
        if not self._ui_alive():
            return

        def worker():
            session = self.session_store.load()
            if not session or not session.get("accessToken"):
                self.auth_queue.put(("restore_missing",))
                return
            try:
                token = session["accessToken"]
                self.auth_queue.put(("status", t("main.loading_title"), t("main.loading_verify")))
                user = self.auth_client.fetch_profile(token)
                self.auth_queue.put(("status", t("main.profile_loading"), t("main.loading_profile")))
                sub = self.auth_client.subscription_status(token)
                license_info = self.auth_client.check_license(token)
                merge_subscription_status(license_info, sub)
                self.auth_queue.put(("restore_ok", build_session_payload(token, user, license_info), license_info))
            except DesktopAuthExpiredError as error:
                self.session_store.clear()
                self.auth_queue.put(("restore_expired", str(error)))
            except DesktopAccessBlockedError as error:
                self.session_store.clear()
                self.auth_queue.put(("restore_blocked", str(error)))
            except DesktopNetworkError as error:
                self.auth_queue.put(("restore_error", str(error)))
            except DesktopAuthError as error:
                self.session_store.clear()
                self.auth_queue.put(("restore_error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def _process_auth_queue(self):
        self._auth_queue_after_id = None
        try:
            if not self._ui_alive():
                return
            while True:
                item = self.auth_queue.get_nowait()
                if not self._ui_alive():
                    break
                self._handle_auth_queue_item(item)
        except Empty:
            pass
        if not self._ui_alive():
            return
        self._auth_queue_after_id = self.after(120, self._process_auth_queue)

    def _handle_auth_queue_item(self, item):
        if not self._ui_alive():
            return
        kind = item[0]
        if kind == "status":
            _, title, detail = item
            self.update_loading_screen(title, detail)
        elif kind == "restore_missing":
            self.current_session = None
            self.license_info = None
            self.show_login_screen(t("main.sign_in_to_continue"))
        elif kind == "ui_callback":
            _, fn = item
            try:
                fn()
            except Exception:
                pass
        elif kind == "restore_expired":
            self.current_session = None
            self.license_info = None
            self.show_login_screen(t("main.session_expired"))
        elif kind == "restore_blocked":
            _, message = item
            self.current_session = None
            self.license_info = None
            self.show_login_screen(message or t("main.device_blocked"))
        elif kind == "restore_error":
            _, message = item
            self.current_session = None
            self.license_info = None
            self.show_login_screen(message or t("main.session_retry"))
        elif kind == "restore_ok":
            _, session, license_info = item
            self.current_session = session
            self.current_session["license"] = license_info
            self.license_info = license_info
            self.setup_ui()
        elif kind == "login_status":
            _, message = item
            if hasattr(self, "login_status_label"):
                self.login_status_label.configure(text=message)
        elif kind == "login_ok":
            _, session, license_info = item
            self.current_session = session
            self.current_session["license"] = license_info
            self.license_info = license_info
            self.session_store.save(build_session_payload(session["accessToken"], session["user"], license_info))
            self.setup_ui()
        elif kind == "login_error":
            _, message = item
            if hasattr(self, "login_button"):
                self.login_button.configure(state="normal", text=t("main.login"))
            if hasattr(self, "google_login_button"):
                self.google_login_button.configure(state="normal")
            if hasattr(self, "login_error_label"):
                self.login_error_label.configure(text=message)
            if hasattr(self, "login_status_label"):
                self.login_status_label.configure(text="")
        elif kind == "license_refresh_ok":
            _, user, license_info, success_message, silent = item
            self.current_session = build_session_payload(self.current_session["accessToken"], user, license_info)
            self.current_session["license"] = license_info
            self.license_info = license_info
            if license_info.get("plan") != "FREE":
                self.awaiting_upgrade_return = False
            self._save_current_session()
            self._apply_license_visuals()
            self._set_refresh_button_state(False)
            self._schedule_periodic_validation()
            if success_message and not silent and self.license_notice:
                self.license_notice.configure(text=success_message)
        elif kind == "license_refresh_blocked":
            _, message = item
            self._set_refresh_button_state(False)
            self.force_logout(message or "Bu cihaz için erişim engellendi.")
        elif kind == "license_refresh_expired":
            _, message = item
            self._set_refresh_button_state(False)
            self.force_logout(message or "Oturum süresi doldu. Lütfen yeniden giriş yapın.")
        elif kind == "license_refresh_error":
            _, message = item
            self._set_refresh_button_state(False)
            self._schedule_periodic_validation()
            if self.license_notice:
                self.license_notice.configure(text=message or t("main.subscription_refreshing"))

    def start_google_login(self):
        self.login_error_label.configure(text="")
        self.login_status_label.configure(text=t("main.google_waiting"))
        self.login_button.configure(state="disabled")
        if hasattr(self, "google_login_button"):
            self.google_login_button.configure(state="disabled")

        def worker():
            try:
                lang = get_language()
                token = capture_google_oauth_token(self.auth_config["api_base_url"], lang, 300.0)
                if not token:
                    self.auth_queue.put(("login_error", t("main.google_timeout")))
                    return
                self.auth_queue.put(("login_status", t("main.profile_loading")))
                user = self.auth_client.fetch_profile(token)
                self.auth_queue.put(("login_status", t("main.license_loading")))
                sub = self.auth_client.subscription_status(token)
                license_info = self.auth_client.check_license(token)
                merge_subscription_status(license_info, sub)
                self.auth_queue.put(("login_ok", build_session_payload(token, user, license_info), license_info))
            except DesktopAccessBlockedError as error:
                self.auth_queue.put(("login_error", str(error)))
            except DesktopAuthExpiredError as error:
                self.auth_queue.put(("login_error", str(error)))
            except DesktopAuthError as error:
                self.auth_queue.put(("login_error", str(error)))
            except DesktopNetworkError as error:
                self.auth_queue.put(("login_error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def submit_login(self):
        email = (self.email_entry.get() or "").strip()
        password = (self.password_entry.get() or "").strip()
        if not email or not password:
            self.login_error_label.configure(text=t("main.login_required"))
            return

        self.login_error_label.configure(text="")
        self.login_status_label.configure(text=t("main.connecting"))
        self.login_button.configure(state="disabled", text=t("main.login_loading"))
        if hasattr(self, "google_login_button"):
            self.google_login_button.configure(state="disabled")

        def worker():
            try:
                session = self.auth_client.login(email, password)
                self.auth_queue.put(("login_status", t("main.profile_loading")))
                user = self.auth_client.fetch_profile(session["accessToken"])
                self.auth_queue.put(("login_status", t("main.license_loading")))
                sub = self.auth_client.subscription_status(session["accessToken"])
                license_info = self.auth_client.check_license(session["accessToken"])
                merge_subscription_status(license_info, sub)
                self.auth_queue.put(("login_ok", build_session_payload(session["accessToken"], user, license_info), license_info))
            except DesktopAccessBlockedError as error:
                self.auth_queue.put(("login_error", str(error)))
            except DesktopAuthExpiredError as error:
                self.auth_queue.put(("login_error", str(error)))
            except DesktopAuthError as error:
                self.auth_queue.put(("login_error", str(error)))
            except DesktopNetworkError as error:
                self.auth_queue.put(("login_error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def logout(self):
        self._cancel_periodic_validation()
        self._cancel_focus_refresh_schedule()
        self.session_store.clear()
        self.current_session = None
        self.license_info = None
        self.awaiting_upgrade_return = False
        self.show_login_screen(t("main.signed_out"))

    def force_logout(self, reason):
        self._cancel_periodic_validation()
        self._cancel_focus_refresh_schedule()
        self.session_store.clear()
        self.current_session = None
        self.license_info = None
        self.awaiting_upgrade_return = False
        self.show_login_screen(reason)

    def _save_current_session(self):
        if self._is_authenticated_session():
            self.current_session["license"] = self.license_info
            self.session_store.save(
                build_session_payload(
                    self.current_session["accessToken"],
                    self.current_session.get("user", {}),
                    self.license_info or {},
                )
            )

    def _sync_subscription_for_auth(self):
        """GET /subscription/status + GET /license/check — server is source of truth (plan, usage, devices)."""
        if not self._is_authenticated_session():
            return
        token = self.current_session["accessToken"]
        sub = self.auth_client.subscription_status(token)
        self.license_info = self.auth_client.check_license(token)
        self.current_session["license"] = self.license_info
        lic_user = (self.license_info or {}).get("user")
        if isinstance(lic_user, dict) and isinstance(self.current_session.get("user"), dict) and "plan" in lic_user:
            self.current_session["user"]["plan"] = lic_user["plan"]
        self._save_current_session()
        merge_subscription_status(self.license_info or {}, sub)

    def _set_refresh_button_state(self, loading):
        self.is_refreshing_license = loading
        idle_label = t("desktop.refresh_subscription")
        if self.sidebar_refresh_btn:
            self.sidebar_refresh_btn.configure(
                state="disabled" if loading else "normal",
                text=t("main.refresh_loading") if loading else idle_label,
            )
        if getattr(self, "hero_refresh_btn", None):
            self.hero_refresh_btn.configure(
                state="disabled" if loading else "normal",
                text=t("main.refresh_loading") if loading else idle_label,
            )

    def _cancel_auth_queue_polling(self):
        if self._auth_queue_after_id is not None:
            try:
                self.after_cancel(self._auth_queue_after_id)
            except Exception:
                pass
            self._auth_queue_after_id = None

    def _cancel_periodic_validation(self):
        if self.periodic_validation_after_id is not None:
            try:
                self.after_cancel(self.periodic_validation_after_id)
            except Exception:
                pass
            self.periodic_validation_after_id = None

    def _schedule_periodic_validation(self):
        self._cancel_periodic_validation()
        if self._is_authenticated_session():
            self.periodic_validation_after_id = self.after(3 * 60 * 1000, self._run_periodic_validation)

    def _run_periodic_validation(self):
        self.periodic_validation_after_id = None
        if self._is_authenticated_session():
            self._refresh_license_in_background(None, silent=True)

    def _cancel_focus_refresh_schedule(self):
        if self._focus_refresh_after_id is not None:
            try:
                self.after_cancel(self._focus_refresh_after_id)
            except Exception:
                pass
            self._focus_refresh_after_id = None

    def _handle_window_focus(self, _event=None):
        if self.awaiting_upgrade_return and not self.is_refreshing_license and self._is_authenticated_session():
            self._refresh_license_in_background(t("main.subscription_returned"))
            return
        if self._is_authenticated_session() and not self._is_guest_mode():
            self._schedule_focus_subscription_pull()

    def _schedule_focus_subscription_pull(self):
        self._cancel_focus_refresh_schedule()
        self._focus_refresh_after_id = self.after(450, self._run_focus_subscription_pull)

    def _run_focus_subscription_pull(self):
        self._focus_refresh_after_id = None
        if not self._is_authenticated_session() or self._is_guest_mode() or self.is_refreshing_license:
            return
        now = time.monotonic()
        if self._last_focus_subscription_sync is not None and now - self._last_focus_subscription_sync < 25.0:
            return
        self._last_focus_subscription_sync = now
        self._refresh_license_in_background(None, silent=True)

    def _refresh_license_in_background(self, success_message=None, silent=False):
        if not self.current_session or not self.current_session.get("accessToken"):
            self.show_login_screen(t("main.session_retry"))
            return
        if self.is_refreshing_license:
            return

        self._set_refresh_button_state(True)
        if not silent and self.license_notice:
            self.license_notice.configure(text=t("main.subscription_refreshing"))

        def worker():
            try:
                token = self.current_session["accessToken"]
                user = self.auth_client.fetch_profile(token)
                sub = self.auth_client.subscription_status(token)
                license_info = self.auth_client.check_license(token)
                merge_subscription_status(license_info, sub)
                self.auth_queue.put(("license_refresh_ok", user, license_info, success_message, silent))
            except DesktopAccessBlockedError as error:
                self.auth_queue.put(("license_refresh_blocked", str(error)))
            except DesktopAuthExpiredError as error:
                self.auth_queue.put(("license_refresh_expired", str(error)))
            except DesktopAuthError as error:
                self.auth_queue.put(("license_refresh_error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def refresh_subscription_status(self):
        self._refresh_license_in_background(t("main.subscription_updated"))

    def _server_error_suggests_upgrade(self, message: str) -> bool:
        """403 texts from /license/authorize: quota, wrong plan, file size — offer upgrade on main thread."""
        low = (message or "").lower()
        if "daily" in low and ("limit" in low or "reached" in low):
            return True
        if "not available on your current plan" in low:
            return True
        if "encryption is available on pro" in low:
            return True
        if "batch processing" in low and "upgrade" in low:
            return True
        if "large files" in low and "plan" in low:
            return True
        if "günlük" in low and "limit" in low:
            return True
        return False

    def _free_plan_daily_quota_exhausted(self) -> bool:
        """FREE plan: server-enforced daily cap (e.g. 5/day). True when no operations left today."""
        li = self.license_info
        if not li or li.get("guest"):
            return False
        if (li.get("plan") or "").upper() != "FREE":
            return False
        usage = li.get("usage") or {}
        daily_limit = usage.get("dailyLimit")
        if daily_limit is None:
            return False
        try:
            limit_n = int(daily_limit)
        except (TypeError, ValueError):
            return False
        if limit_n <= 0:
            return False
        used = int(usage.get("usedToday") or 0)
        rem = usage.get("remainingToday")
        if rem is not None:
            try:
                if int(rem) <= 0:
                    return True
            except (TypeError, ValueError):
                pass
        return used >= limit_n

    def _open_upgrade_modal_quota_limit(self, detail: str | None = None) -> None:
        if not self._is_authenticated_session():
            return
        li = self.license_info or {}
        usage = li.get("usage") or {}
        lim = usage.get("dailyLimit")
        try:
            lim_n = int(lim) if lim is not None else 5
        except (TypeError, ValueError):
            lim_n = 5
        try:
            used = int(usage.get("usedToday") or 0)
        except (TypeError, ValueError):
            used = lim_n
        detail_text = detail if detail else t("desktop.quota_exhausted_detail", limit=lim_n)
        try:
            self.awaiting_upgrade_return = True
            QuotaExhaustedModal(
                self,
                self.ekran_ortala,
                used_today=used,
                daily_limit=max(1, lim_n),
                on_upgrade=self.open_subscription_workspace,
                detail=detail_text,
            )
            if self.license_notice:
                self.license_notice.configure(text=t("main.payment_return_hint"))
        except Exception:
            pass

    def _offer_upgrade_for_server_error(self, message: str) -> None:
        self._open_upgrade_modal_quota_limit(detail=message)

    def authorize_operation(self, feature_key, file_paths):
        if self._is_guest_mode():
            guest_state = self._load_guest_state(force_reload=True)
            if guest_state.guest_locked or guest_state.remaining_operations <= 0:
                self._schedule_guest_account_wall()
                raise DesktopAuthError(t("main.guest_create_account_to_continue"))
            self.guest_state = self.guest_store.record_operation()
            self._schedule_guest_ui_refresh(force_reload=True)
            return self._build_guest_license_info(self.guest_state)
        if not self._is_authenticated_session():
            self.show_login_screen(t("main.guest_sign_in_required"))
            raise DesktopAuthError(t("main.guest_sign_in_required"))
        try:
            self._sync_subscription_for_auth()
        except (DesktopAuthError, DesktopNetworkError) as error:
            raise DesktopAuthError(str(error)) from error
        try:
            result = self.auth_client.authorize_operation(self.current_session["accessToken"], feature_key, file_paths)
        except DesktopAuthExpiredError as error:
            self.force_logout(t("main.session_expired"))
            raise DesktopAuthError(str(error)) from error
        except DesktopAccessBlockedError as error:
            self.force_logout(t("main.device_blocked"))
            raise DesktopAuthError(str(error)) from error
        except DesktopAuthError as error:
            msg = str(error)
            if self._server_error_suggests_upgrade(msg):
                self.auth_queue.put(("ui_callback", lambda m=msg: self._offer_upgrade_for_server_error(m)))
            raise
        self.license_info = {
            **(self.license_info or {}),
            "plan": result.get("plan"),
            "status": result.get("status"),
            "usage": result.get("usage"),
            "entitlements": result.get("entitlements"),
            "devices": result.get("devices", self.license_info.get("devices") if self.license_info else {}),
        }
        self._save_current_session()
        return result

    def _show_upgrade_required(self):
        message = (self.license_info or {}).get("upgradeMessage") or t("main.upgrade_required")
        messagebox.showinfo(t("main.upgrade"), message)

    def handle_click(self, feature_key, isim):
        if self._is_authenticated_session():
            try:
                self._sync_subscription_for_auth()
                self._apply_license_visuals()
            except (DesktopAuthError, DesktopNetworkError) as error:
                messagebox.showwarning(t("app.warning"), str(error))
                return

        if not self.license_info:
            messagebox.showwarning(t("app.warning"), t("main.license_missing"))
            return

        if self.license_info.get("status") != "active":
            self._show_upgrade_required()
            return

        blocked = set(self.license_info.get("entitlements", {}).get("blockedFeatures", []))
        if feature_key in blocked:
            if self._is_authenticated_session():
                self.open_subscription_workspace()
            else:
                messagebox.showinfo(t("main.upgrade"), t("main.guest_sign_in_required"))
            return

        if self._is_authenticated_session() and self._free_plan_daily_quota_exhausted():
            self._open_upgrade_modal_quota_limit()
            return

        if feature_key == "merge":
            MergeWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog, access_controller=self)
        elif feature_key == "split":
            ExtractWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog, access_controller=self)
        elif feature_key == "pdf-to-word":
            WordWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog, access_controller=self)
        elif feature_key == "word-to-pdf":
            WordToPdfWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog, access_controller=self)
        elif feature_key == "excel-to-pdf":
            ExcelToPdfWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog, access_controller=self)
        elif feature_key == "pdf-to-excel":
            PdfToExcelWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog, access_controller=self)
        elif feature_key == "compress":
            CompressPdfWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog, access_controller=self)
        elif feature_key == "encrypt":
            EncryptPdfWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog, access_controller=self)
        else:
            messagebox.showinfo(t("app.name"), f"{isim.replace('\n', ' ')}")

    def open_contact_dialog(self):
        ContactDialog(self, self.ekran_ortala, self.auth_client)

    def open_register_page(self):
        try:
            open_register_page(self.auth_config.get("register_url", ""))
        except DesktopAuthError as error:
            messagebox.showerror(t("main.create_account"), str(error))

    def open_upgrade_page(self):
        self.open_subscription_workspace()

    def _configure_windows_identity(self):
        """Windows görev çubuğunda özel uygulama kimliğini görünür hale getirir."""
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("nbglobalstudio.nbpdfPLARTFORM.desktop")
        except Exception:
            pass

    def _configure_window_icon(self):
        """Pencere ve görev çubuğu için uygulama ikonunu yüklemeyi dener."""
        try:
            icon_path = resource_path("assets", "nb_pdf_PLARTFORM_icon.png")
            if os.path.isfile(icon_path):
                self._window_icon = PhotoImage(file=icon_path)
                self.iconphoto(True, self._window_icon)
        except Exception:
            pass

    def ekran_ortala(self, pencere, genislik, yukseklik):
        pencere.update_idletasks()

        # Windows çoklu monitörde doğru merkeze oturtmak için
        # fare konumunun bulunduğu monitörün rect bilgisini alıp ortalıyoruz.
        try:
            user32 = ctypes.windll.user32

            pt = wintypes.POINT()
            user32.GetCursorPos(ctypes.byref(pt))
            px, py = int(pt.x), int(pt.y)

            rects = []

            # BOOL CALLBACK EnumDisplayMonitors(HDC, LPCRECT, MONITORENUMPROC, LPARAM)
            MONITORENUMPROC = ctypes.WINFUNCTYPE(
                ctypes.c_bool,
                ctypes.c_void_p,
                ctypes.c_void_p,
                ctypes.POINTER(wintypes.RECT),
                ctypes.c_void_p
            )

            def _cb(hMonitor, hdc, lprcMonitor, dwData):
                r = lprcMonitor.contents
                rects.append((int(r.left), int(r.top), int(r.right), int(r.bottom)))
                return True

            enum_proc = MONITORENUMPROC(_cb)
            user32.EnumDisplayMonitors(0, 0, enum_proc, 0)

            monitor = None
            for (l, t, r, b) in rects:
                if l <= px < r and t <= py < b:
                    monitor = (l, t, r, b)
                    break

            # Bulamazsak fallback: primary screen
            if monitor is None:
                screen_w = pencere.winfo_screenwidth()
                screen_h = pencere.winfo_screenheight()
                x = int((screen_w / 2) - (genislik / 2))
                y = int((screen_h / 2) - (yukseklik / 2))
            else:
                l, t, r, b = monitor
                monitor_w = r - l
                monitor_h = b - t
                x = int(l + (monitor_w / 2) - (genislik / 2))
                y = int(t + (monitor_h / 2) - (yukseklik / 2))

            pencere.geometry(f"{genislik}x{yukseklik}+{x}+{y}")
        except Exception:
            # Herhangi bir sebeple API çalışmazsa eski basit ekran ortası mantığı
            x = int((pencere.winfo_screenwidth() / 2) - (genislik / 2))
            y = int((pencere.winfo_screenheight() / 2) - (yukseklik / 2))
            pencere.geometry(f"{genislik}x{yukseklik}+{x}+{y}")

if __name__ == "__main__":
    from entry_desktop import main as run_desktop

    run_desktop()