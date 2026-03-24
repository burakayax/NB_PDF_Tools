import customtkinter as ctk

from modules.i18n import t
from modules.ui_theme import badge_colors, theme


class PdfPasswordDialog(ctk.CTkToplevel):
    def __init__(self, master, ortalama_func, file_name: str, password_validator=None, allow_skip: bool = True):
        super().__init__(master)
        ui = theme()
        info_badge = badge_colors("warning")
        self.ortalama_func = ortalama_func
        self.password_validator = password_validator
        self.allow_skip = allow_skip
        self.result = None
        self.action = "cancel"

        self.title(t("pdf_password.title"))
        self.ortalama_func(self, 660, 330)
        self.grab_set()
        self.resizable(False, False)
        self.configure(fg_color=ui["bg"])

        header = ctk.CTkFrame(self, fg_color=ui["accent"], height=56, corner_radius=0)
        header.pack(fill="x", side="top")
        ctk.CTkLabel(
            header,
            text=t("pdf_password.header"),
            font=ui["title_font"],
            text_color="white",
        ).pack(pady=12)

        body = ctk.CTkFrame(self, fg_color=ui["panel"], border_width=1, border_color=ui["border"], corner_radius=18)
        body.pack(fill="both", expand=True, padx=24, pady=18)

        ctk.CTkLabel(
            body,
            text=f"{t('pdf_password.header')}:\n{file_name}",
            font=("Segoe UI Semibold", 13, "bold"),
            text_color=ui["text"],
            justify="center",
            wraplength=380,
        ).pack(pady=(0, 12))

        ctk.CTkLabel(
            body,
            text=t("pdf_password.detail"),
            font=ui["body_font"],
            text_color=info_badge["text"],
            fg_color=info_badge["fg"],
            corner_radius=10,
        ).pack()

        ctk.CTkLabel(
            body,
            text=t("pdf_password.require_password") if not allow_skip else t("pdf_password.allow_skip"),
            font=ui["small_font"],
            text_color=ui["muted"],
        ).pack(pady=(8, 0))

        self.password_entry = ctk.CTkEntry(
            body,
            placeholder_text=t("pdf_password.placeholder"),
            show="*",
            border_color=ui["border"],
            fg_color=ui["panel_alt"],
            text_color=ui["text"],
        )
        self.password_entry.pack(fill="x", pady=16)
        self.password_entry.bind("<KeyRelease>", self._clear_warning)
        self.password_entry.bind("<Return>", self._submit)

        self.warning_label = ctk.CTkLabel(
            body,
            text="",
            font=ui["small_font"],
            text_color=ui["danger"],
        )
        self.warning_label.pack(fill="x", pady=(0, 6))

        button_row = ctk.CTkFrame(body, fg_color="transparent")
        button_row.pack(fill="x", pady=(8, 0))

        ctk.CTkButton(
            button_row,
            text=t("app.cancel"),
            fg_color=ui["panel_alt"],
            hover_color=ui["border"],
            command=self._cancel,
        ).pack(side="left", expand=True, fill="x", padx=(0, 6))
        if allow_skip:
            ctk.CTkButton(
                button_row,
                text=t("pdf_password.skip"),
                fg_color=ui["panel_alt"],
                hover_color=ui["border"],
                text_color=ui["warning"],
                command=self._skip,
            ).pack(side="left", expand=True, fill="x", padx=6)
        ctk.CTkButton(
            button_row,
            text=t("app.continue"),
            fg_color=ui["accent"],
            hover_color=ui["accent_hover"],
            command=self._submit,
        ).pack(side="left", expand=True, fill="x", padx=(6 if allow_skip else 6, 0))

        self.after(100, self.password_entry.focus_set)

    def _submit(self, _event=None):
        password = (self.password_entry.get() or "").strip()
        if not password:
            self.set_warning(t("pdf_password.missing_password"))
            self.after(50, self.password_entry.focus_set)
            return

        self._clear_warning()
        if self.password_validator is not None:
            validation_result = self.password_validator(password)
            if validation_result is not True:
                if isinstance(validation_result, str) and validation_result.strip():
                    self.set_warning(validation_result)
                else:
                    self.set_warning(t("pdf_password.invalid_password"))
                self.after(50, self.password_entry.focus_set)
                return

        self.result = password
        self.action = "submit"
        self.destroy()

    def _cancel(self):
        self.result = None
        self.action = "cancel"
        self.destroy()

    def _skip(self):
        self.result = None
        self.action = "skip"
        self.destroy()

    def set_warning(self, text: str):
        self.warning_label.configure(text=text)

    def _clear_warning(self, _event=None):
        self.warning_label.configure(text="")
