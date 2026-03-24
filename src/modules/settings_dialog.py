import customtkinter as ctk

from modules.i18n import t
from modules.ui_theme import theme


class SettingsDialog(ctk.CTkToplevel):
    def __init__(self, master, ortalama_func, on_saved=None):
        super().__init__(master)
        self.ui = theme()
        self.ortalama_func = ortalama_func
        self.on_saved = on_saved

        self.title(t("settings.title"))
        self.ortalama_func(self, 460, 220)
        self.grab_set()
        self.resizable(False, False)
        self.configure(fg_color=self.ui["bg"])

        header = ctk.CTkFrame(self, fg_color=self.ui["accent"], height=56, corner_radius=0)
        header.pack(fill="x", side="top")
        ctk.CTkLabel(
            header,
            text=t("settings.title"),
            font=self.ui["title_font"],
            text_color="white",
        ).pack(pady=12)

        body = ctk.CTkFrame(
            self,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=18,
        )
        body.pack(fill="both", expand=True, padx=24, pady=18)

        ctk.CTkLabel(
            body,
            text=t("settings.body"),
            font=self.ui["body_font"],
            text_color=self.ui["muted"],
            wraplength=380,
            justify="left",
        ).pack(anchor="w", padx=22, pady=(24, 28))

        ctk.CTkButton(
            body,
            text=t("app.close"),
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            command=self.destroy,
        ).pack(fill="x", padx=22, pady=(0, 22))
