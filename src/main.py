import customtkinter as ctk
from tkinter import PhotoImage, messagebox
import os
import sys
import ctypes
import threading
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
        get_device_id,
        load_desktop_auth_config,
        open_register_page,
        open_upgrade_page,
    )
    from modules.encrypt_pdf_window import EncryptPdfWindow
    from modules.excel_to_pdf_window import ExcelToPdfWindow
    from modules.extract_window import ExtractWindow
    from modules.contact_dialog import ContactDialog
    from modules.i18n import get_language, set_language, t
    from modules.merge_window import MergeWindow
    from modules.pdf_to_excel_window import PdfToExcelWindow
    from modules.settings_dialog import SettingsDialog
    from modules.success_dialog import SuccessDialog
    from modules.ui_theme import add_footer, theme
    from modules.word_to_pdf_window import WordToPdfWindow
    from modules.word_window import WordWindow
except ImportError as e:
    print(f"Modül Yükleme Hatası: {e}")

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
        self.title(t("app.name"))
        self.configure(fg_color=self.ui["bg"])
        self._configure_windows_identity()
        self._configure_window_icon()
        self.bind("<FocusIn>", self._handle_window_focus)

        # Uygulama ana pencere alanını üst içerik ve alt sabit çubuk olarak ayırıyoruz.
        self.after(0, lambda: self.state('zoomed'))

        self.lang_bar = ctk.CTkFrame(self, fg_color="transparent")
        self.lang_bar.pack(fill="x", padx=28, pady=(12, 0))
        self.lang_menu = None
        self._build_language_bar()

        self.content_container = ctk.CTkFrame(self, fg_color="transparent")
        self.content_container.pack(expand=True, fill="both", padx=28, pady=(8, 10))

        self.after(100, self._process_auth_queue)
        self.show_loading_screen(t("main.loading_title"), t("main.loading_detail"))
        self.after(150, self.bootstrap_session)

    def _clear_content(self):
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
        self.show_login_screen(t("main.guest_create_account_to_continue"))

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
        SettingsDialog(self, self.ekran_ortala)

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
        self.title(t("app.name"))
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
                t("app.secure_access"),
                t("app.desktop_edition"),
                t("main.create_account"),
                self.open_register_page,
            )
        else:
            self.show_loading_screen(t1, d1)

    def show_loading_screen(self, title, detail):
        self._ui_phase = "loading"
        self._clear_content()
        outer = ctk.CTkFrame(self.content_container, fg_color="transparent")
        outer.pack(expand=True, fill="both")
        loading_card = ctk.CTkFrame(
            outer,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=28,
        )
        loading_card.place(relx=0.5, rely=0.5, anchor="center")
        inner = ctk.CTkFrame(loading_card, fg_color="transparent")
        inner.pack(expand=True, padx=48, pady=44)
        brand = self.ui.get("accent_soft", self.ui["accent"])
        ctk.CTkLabel(inner, text=t("app.name"), font=("Segoe UI Semibold", 32, "bold"), text_color=brand).pack(pady=(0, 10))
        self.loading_title_label = ctk.CTkLabel(inner, text=title, font=self.ui["title_font"], text_color=self.ui["text"])
        self.loading_title_label.pack()
        self.loading_detail_label = ctk.CTkLabel(inner, text=detail, font=self.ui["body_font"], text_color=self.ui["muted"], wraplength=620)
        self.loading_detail_label.pack(pady=(12, 0))
        self._set_footer(t("app.name"), t("app.secure_access"), t("app.desktop_edition"), t("main.create_account"), self.open_register_page)

    def update_loading_screen(self, title, detail):
        if hasattr(self, "loading_title_label"):
            self.loading_title_label.configure(text=title)
        if hasattr(self, "loading_detail_label"):
            self.loading_detail_label.configure(text=detail)

    def show_login_screen(self, error_text="", preserve_credentials=None):
        self._ui_phase = "login"
        self._clear_content()
        self._cancel_periodic_validation()
        self.current_session = None
        self.license_info = None
        outer = ctk.CTkFrame(self.content_container, fg_color="transparent")
        outer.pack(expand=True, fill="both")
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
        self.login_button.grid(row=6, column=0, sticky="ew", padx=24, pady=(20, 12))

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
        ).grid(row=7, column=0, pady=(0, 4))
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
        ).grid(row=8, column=0, pady=(0, 4))
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
        ).grid(row=9, column=0, pady=(0, 22))

        self.password_entry.bind("<Return>", lambda _event: self.submit_login())
        self.email_entry.bind("<Return>", lambda _event: self.submit_login())
        self.email_entry.focus_set()
        self._set_footer(t("app.name"), t("app.secure_access"), t("app.desktop_edition"), t("app.contact"), self.open_contact_dialog)
        if preserve_credentials:
            em = preserve_credentials.get("email") or ""
            pw = preserve_credentials.get("password") or ""
            if em:
                self.email_entry.insert(0, em)
            if pw:
                self.password_entry.insert(0, pw)

    def setup_ui(self):
        self._ui_phase = "main"
        self._clear_content()
        self.feature_buttons = {}
        self.refresh_status_button = None
        self.upgrade_button = None
        self.session_action_button = None
        self.guest_action_button = None
        if self._is_authenticated_session():
            self._schedule_periodic_validation()
        else:
            self._cancel_periodic_validation()

        self.header_frame = ctk.CTkFrame(
            self.content_container,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=24,
        )
        self.header_frame.pack(pady=(10, 18), padx=16, fill="x")

        top_row = ctk.CTkFrame(self.header_frame, fg_color="transparent")
        top_row.pack(fill="x", padx=22, pady=(14, 4))
        top_row.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(
            top_row,
            text=t("main.title"),
            font=("Segoe UI Semibold", 34, "bold"),
            text_color=self.ui.get("accent_soft", self.ui["accent"]),
            anchor="center",
        ).grid(row=0, column=0, sticky="ew")

        ctk.CTkLabel(self.header_frame,
                     text=t("main.subtitle"),
                     font=("Segoe UI Semibold", 14, "bold"),
                     text_color=self.ui["text"]).pack(pady=(0, 3))

        ctk.CTkLabel(
            self.header_frame,
            text=t("main.description"),
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
        ).pack(pady=(0, 14))

        self.account_badge = ctk.CTkLabel(
            self.header_frame,
            text="",
            font=self.ui["small_font"],
            text_color=self.ui["text"],
            fg_color=self.ui["panel_soft"],
            corner_radius=12,
            padx=12,
            pady=6,
        )
        self.account_badge.pack(pady=(0, 10))

        self.license_notice = ctk.CTkLabel(
            self.header_frame,
            text="",
            font=self.ui["small_font"],
            text_color=self.ui["warning"],
            wraplength=920,
            justify="center",
        )
        self.license_notice.pack(pady=(0, 12))

        self.header_actions = ctk.CTkFrame(self.header_frame, fg_color="transparent")
        self.header_actions.pack(pady=(0, 14))
        self.refresh_status_button = ctk.CTkButton(
            self.header_actions,
            text=t("main.refresh_subscription"),
            height=36,
            width=220,
            fg_color=self.ui["panel_soft"],
            hover_color=self.ui["border"],
            text_color=self.ui["text"],
            command=self.refresh_subscription_status,
        )
        self.refresh_status_button.pack(side="left", padx=6)
        self.upgrade_button = ctk.CTkButton(
            self.header_actions,
            text=t("main.upgrade"),
            height=36,
            width=180,
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            text_color=self.ui["button_text"],
            command=self.open_upgrade_page,
        )
        self.session_action_button = ctk.CTkButton(
            self.header_actions,
            text=t("main.logout"),
            height=36,
            width=150,
            fg_color=self.ui["panel_soft"],
            hover_color=self.ui["border"],
            text_color=self.ui["text"],
            command=self.logout,
        )
        self.session_action_button.pack(side="left", padx=6)
        self.guest_action_button = ctk.CTkButton(
            self.header_actions,
            text=t("main.create_account"),
            height=36,
            width=150,
            fg_color="transparent",
            border_width=1,
            border_color=self.ui["border"],
            text_color=self.ui["text"],
            hover_color=self.ui["panel_soft"],
            command=self.open_register_page,
        )
        self.guest_action_button.pack(side="left", padx=6)
        ctk.CTkButton(
            self.header_actions,
            text=t("main.settings"),
            height=36,
            width=120,
            fg_color="transparent",
            border_width=1,
            border_color=self.ui["border"],
            text_color=self.ui["text"],
            hover_color=self.ui["panel_soft"],
            command=self.open_settings_dialog,
        ).pack(side="left", padx=6)

        self.button_frame = ctk.CTkFrame(self.content_container, fg_color="transparent")
        self.button_frame.pack()
        for idx in range(3):
            self.button_frame.grid_columnconfigure(idx, weight=1)

        for i, spec in enumerate(self.feature_specs):
            isim = self._feature_label(spec)
            ikon = spec["icon"]
            btn = ctk.CTkButton(
                self.button_frame,
                text=f"{ikon}\n\n{isim}",
                width=230,
                height=168,
                corner_radius=24,
                font=("Segoe UI Semibold", 17, "bold"),
                fg_color=self.ui["panel"],
                hover_color=self.ui["accent"],
                text_color=self.ui["text"],
                border_width=1,
                border_color=self.ui["border"],
                command=lambda key=spec["key"], label=isim: self.handle_click(key, label),
            )
            btn.grid(row=i // 3, column=i % 3, padx=18, pady=18)
            self.feature_buttons[spec["key"]] = btn

        self._apply_license_visuals()
        self._set_footer(
            t("app.name"),
            t("app.footer_byline"),
            t("app.desktop_edition"),
            t("app.contact"),
            self.open_contact_dialog,
        )

    def _apply_license_visuals(self):
        if not self.license_info:
            return
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
            if self.refresh_status_button:
                self.refresh_status_button.configure(
                    state="normal",
                    text=t("main.login"),
                    command=lambda: self.show_login_screen(),
                )
            if self.upgrade_button:
                self.upgrade_button.pack_forget()
            if self.session_action_button:
                self.session_action_button.pack_forget()
            if self.guest_action_button:
                self.guest_action_button.pack(side="left", padx=6)
            for spec in self.feature_specs:
                button = self.feature_buttons.get(spec["key"])
                if button:
                    button.configure(
                        fg_color=self.ui["panel"],
                        hover_color=self.ui["accent"],
                        border_color=self.ui["border"],
                        text=f"{spec['icon']}\n\n{self._feature_label(spec)}",
                    )
            return
        user = self.current_session.get("user", {}) if self.current_session else {}
        plan = self.license_info.get("plan", user.get("plan", "-"))
        usage = self.license_info.get("usage", {})
        entitlements = self.license_info.get("entitlements", {})
        used_today = usage.get("usedToday", 0)
        daily_limit = usage.get("dailyLimit")
        usage_text = t("main.usage_unlimited") if daily_limit is None else t("main.usage_daily", used=used_today, limit=daily_limit)
        device_text = t(
            "app.device_usage",
            active=(self.license_info.get("devices", {}) or {}).get("activeCount", 0),
            limit=(self.license_info.get("devices", {}) or {}).get("limit", 3),
        )
        self.account_badge.configure(text=f"{user.get('email', t('app.name'))} | {plan} | {usage_text}")

        upgrade_message = self.license_info.get("upgradeMessage") or ""
        if plan == "FREE":
            limit_text = entitlements.get("maxFileSizeMb")
            self.license_notice.configure(
                text=t(
                    "main.free_notice",
                    limit_text=limit_text,
                    device_text=device_text,
                    upgrade_message=upgrade_message,
                ).strip()
            )
            if self.upgrade_button:
                self.upgrade_button.pack(side="left", padx=6)
        else:
            self.license_notice.configure(
                text=t("main.active_notice", device_text=device_text)
            )
            if self.upgrade_button:
                self.upgrade_button.pack_forget()
        if self.refresh_status_button:
            self.refresh_status_button.configure(
                state="disabled" if self.is_refreshing_license else "normal",
                text=t("main.refresh_loading") if self.is_refreshing_license else t("main.refresh_subscription"),
                command=self.refresh_subscription_status,
            )
        if self.session_action_button:
            self.session_action_button.pack(side="left", padx=6)
        if self.guest_action_button:
            self.guest_action_button.pack(side="left", padx=6)

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
                    text=f"{spec['icon']}\n\n{self._feature_label(spec)}\n\nPRO",
                )
            else:
                button.configure(
                    fg_color=self.ui["panel"],
                    hover_color=self.ui["accent"],
                    border_color=self.ui["border"],
                    text=f"{spec['icon']}\n\n{self._feature_label(spec)}",
                )

    def bootstrap_session(self):
        def worker():
            session = self.session_store.load()
            if not session or not session.get("accessToken"):
                self.auth_queue.put(("restore_missing",))
                return
            try:
                self.auth_queue.put(("status", t("main.loading_title"), t("main.loading_verify")))
                user = self.auth_client.fetch_profile(session["accessToken"])
                self.auth_queue.put(("status", t("main.profile_loading"), t("main.loading_profile")))
                license_info = self.auth_client.validate_license(session["accessToken"])
                self.auth_queue.put(("restore_ok", build_session_payload(session["accessToken"], user, license_info), license_info))
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
        try:
            while True:
                item = self.auth_queue.get_nowait()
                self._handle_auth_queue_item(item)
        except Empty:
            pass
        self.after(120, self._process_auth_queue)

    def _handle_auth_queue_item(self, item):
        kind = item[0]
        if kind == "status":
            _, title, detail = item
            self.update_loading_screen(title, detail)
        elif kind == "restore_missing":
            self._enter_guest_mode()
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
            self.license_info = license_info
            self.session_store.save(build_session_payload(session["accessToken"], session["user"], license_info))
            self.setup_ui()
        elif kind == "login_error":
            _, message = item
            if hasattr(self, "login_button"):
                self.login_button.configure(state="normal", text=t("main.login"))
            if hasattr(self, "login_error_label"):
                self.login_error_label.configure(text=message)
            if hasattr(self, "login_status_label"):
                self.login_status_label.configure(text="")
        elif kind == "license_refresh_ok":
            _, user, license_info, success_message = item
            self.current_session = build_session_payload(self.current_session["accessToken"], user, license_info)
            self.license_info = license_info
            if license_info.get("plan") != "FREE":
                self.awaiting_upgrade_return = False
            self._save_current_session()
            self._apply_license_visuals()
            self._set_refresh_button_state(False)
            self._schedule_periodic_validation()
            if success_message:
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

    def submit_login(self):
        email = (self.email_entry.get() or "").strip()
        password = (self.password_entry.get() or "").strip()
        if not email or not password:
            self.login_error_label.configure(text=t("main.login_required"))
            return

        self.login_error_label.configure(text="")
        self.login_status_label.configure(text=t("main.connecting"))
        self.login_button.configure(state="disabled", text=t("main.login_loading"))

        def worker():
            try:
                session = self.auth_client.login(email, password)
                self.auth_queue.put(("login_status", t("main.profile_loading")))
                user = self.auth_client.fetch_profile(session["accessToken"])
                self.auth_queue.put(("login_status", t("main.license_loading")))
                license_info = self.auth_client.validate_license(session["accessToken"])
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
        self.session_store.clear()
        self.current_session = None
        self.license_info = None
        self.awaiting_upgrade_return = False
        self.show_login_screen(t("main.signed_out"))

    def force_logout(self, reason):
        self._cancel_periodic_validation()
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

    def _set_refresh_button_state(self, loading):
        self.is_refreshing_license = loading
        if self.refresh_status_button:
            self.refresh_status_button.configure(
                state="disabled" if loading else "normal",
                text=t("main.refresh_loading") if loading else t("main.refresh_subscription"),
            )

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
            self.periodic_validation_after_id = self.after(5 * 60 * 1000, self._run_periodic_validation)

    def _run_periodic_validation(self):
        self.periodic_validation_after_id = None
        if self._is_authenticated_session():
            self._refresh_license_in_background()

    def _handle_window_focus(self, _event=None):
        if self.awaiting_upgrade_return and not self.is_refreshing_license and self._is_authenticated_session():
            self._refresh_license_in_background(t("main.subscription_returned"))

    def _refresh_license_in_background(self, success_message=None):
        if not self.current_session or not self.current_session.get("accessToken"):
            self.show_login_screen(t("main.session_retry"))
            return
        if self.is_refreshing_license:
            return

        self._set_refresh_button_state(True)
        if self.license_notice:
            self.license_notice.configure(text=t("main.subscription_refreshing"))

        def worker():
            try:
                user = self.auth_client.fetch_profile(self.current_session["accessToken"])
                license_info = self.auth_client.validate_license(self.current_session["accessToken"])
                self.auth_queue.put(("license_refresh_ok", user, license_info, success_message))
            except DesktopAccessBlockedError as error:
                self.auth_queue.put(("license_refresh_blocked", str(error)))
            except DesktopAuthExpiredError as error:
                self.auth_queue.put(("license_refresh_expired", str(error)))
            except DesktopAuthError as error:
                self.auth_queue.put(("license_refresh_error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def refresh_subscription_status(self):
        self._refresh_license_in_background(t("main.subscription_updated"))

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
            result = self.auth_client.authorize_operation(self.current_session["accessToken"], feature_key, file_paths)
        except DesktopAuthExpiredError as error:
            self.force_logout(t("main.session_expired"))
            raise DesktopAuthError(str(error)) from error
        except DesktopAccessBlockedError as error:
            self.force_logout(t("main.device_blocked"))
            raise DesktopAuthError(str(error)) from error
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
        if not self.license_info:
            messagebox.showwarning(t("app.warning"), t("main.license_missing"))
            return

        if self.license_info.get("status") != "active":
            self._show_upgrade_required()
            return

        blocked = set(self.license_info.get("entitlements", {}).get("blockedFeatures", []))
        if feature_key in blocked:
            if messagebox.askyesno(t("main.pro_feature_title"), t("main.pro_feature_body")):
                self.open_upgrade_page()
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
        try:
            open_upgrade_page(self.auth_config.get("upgrade_url", ""))
        except DesktopAuthError as error:
            messagebox.showerror(t("main.upgrade"), str(error))
            self.awaiting_upgrade_return = False
            return
        self.awaiting_upgrade_return = True
        if self.license_notice:
            self.license_notice.configure(text=t("main.payment_return_hint"))

    def _configure_windows_identity(self):
        """Windows görev çubuğunda özel uygulama kimliğini görünür hale getirir."""
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("nbglobalstudio.nbpdftools.desktop")
        except Exception:
            pass

    def _configure_window_icon(self):
        """Pencere ve görev çubuğu için uygulama ikonunu yüklemeyi dener."""
        try:
            icon_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "nb_pdf_tools_icon.png"))
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
    app = NBPDFApp()
    app.mainloop()