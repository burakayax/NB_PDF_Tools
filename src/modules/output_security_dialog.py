import customtkinter as ctk

from modules.ui_theme import badge_colors, theme


class OutputSecurityDialog(ctk.CTkToplevel):
    def __init__(self, master, ortalama_func):
        super().__init__(master)
        self.ui = theme()
        info_badge = badge_colors("info")
        self.ortalama_func = ortalama_func
        self.result = None
        self.choice_var = ctk.StringVar(value="plain")

        self.title("Çıktı Güvenliği")
        self.ortalama_func(self, 560, 360)
        self.grab_set()
        self.resizable(False, False)
        self.configure(fg_color=self.ui["bg"])

        header = ctk.CTkFrame(self, fg_color=self.ui["accent"], height=56, corner_radius=0)
        header.pack(fill="x", side="top")
        ctk.CTkLabel(
            header,
            text="Çıktı Güvenliği",
            font=self.ui["title_font"],
            text_color="white",
        ).pack(pady=12)

        body = ctk.CTkFrame(self, fg_color=self.ui["panel"], border_width=1, border_color=self.ui["border"], corner_radius=18)
        body.pack(fill="both", expand=True, padx=24, pady=18)

        ctk.CTkLabel(
            body,
            text="Ayıklanan PDF çıktısını nasıl kaydetmek istiyorsunuz?",
            font=("Segoe UI Semibold", 13, "bold"),
            text_color=self.ui["text"],
            justify="center",
            wraplength=420,
        ).pack(pady=(0, 12))

        ctk.CTkLabel(
            body,
            text="  İsterseniz çıktı şifresiz kaydedilir, isterseniz yeni bir parola ile korunur.  ",
            font=self.ui["body_font"],
            text_color=info_badge["text"],
            fg_color=info_badge["fg"],
            corner_radius=10,
        ).pack()

        self.segmented = ctk.CTkSegmentedButton(
            body,
            values=["Şifresiz Kaydet", "Şifreli Kaydet"],
            command=self._on_mode_change,
        )
        self.segmented.pack(fill="x", pady=(18, 12))
        self.segmented.set("Şifresiz Kaydet")

        self.password_entry = ctk.CTkEntry(
            body,
            placeholder_text="Yeni PDF şifresi",
            show="*",
            border_color=self.ui["border"],
            fg_color=self.ui["panel_alt"],
            text_color=self.ui["text"],
            state="disabled",
        )
        self.password_entry.pack(fill="x", pady=(0, 10))
        self.password_entry.bind("<KeyRelease>", self._clear_warning)

        self.warning_label = ctk.CTkLabel(
            body,
            text="",
            font=self.ui["small_font"],
            text_color=self.ui["danger"],
        )
        self.warning_label.pack(fill="x", pady=(0, 6))

        button_row = ctk.CTkFrame(body, fg_color="transparent")
        button_row.pack(fill="x", pady=(8, 0))

        ctk.CTkButton(
            button_row,
            text="İptal",
            fg_color=self.ui["panel_alt"],
            hover_color=self.ui["border"],
            command=self._cancel,
        ).pack(side="left", expand=True, fill="x", padx=(0, 6))
        ctk.CTkButton(
            button_row,
            text="Kaydet",
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            command=self._submit,
        ).pack(side="left", expand=True, fill="x", padx=(6, 0))

    def _on_mode_change(self, value):
        encrypted = value == "Şifreli Kaydet"
        self.password_entry.configure(state="normal" if encrypted else "disabled")
        if encrypted:
            self.after(50, self.password_entry.focus_set)
        else:
            self.password_entry.delete(0, "end")
        self._clear_warning()

    def _submit(self):
        encrypted = self.segmented.get() == "Şifreli Kaydet"
        password = (self.password_entry.get() or "").strip()
        if encrypted and not password:
            self.warning_label.configure(text="Şifreli kayıt için bir parola girin.")
            self.after(50, self.password_entry.focus_set)
            return
        self.result = {"encrypt": encrypted, "password": password if encrypted else None}
        self.destroy()

    def _cancel(self):
        self.result = None
        self.destroy()

    def _clear_warning(self, _event=None):
        self.warning_label.configure(text="")
