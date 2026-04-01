import customtkinter as ctk
import os

from modules.i18n import t
from modules.ui_theme import theme


class SuccessDialog(ctk.CTkToplevel):
    def __init__(self, master, path, ortalama_func):
        super().__init__(master)
        self.ui = theme()
        self.target_path = os.path.abspath(path)
        self.ortalama_func = ortalama_func

        self.title(t("success.title"))
        self.ortalama_func(self, 500, 380)
        self.grab_set()
        self.after(100, self.lift)
        self.configure(fg_color=self.ui["bg"])

        header = ctk.CTkFrame(self, fg_color=self.ui["panel"], height=64, corner_radius=0)
        header.pack(fill="x", side="top")
        ctk.CTkLabel(
            header,
            text=t("success.header"),
            font=("Segoe UI Semibold", 17, "bold"),
            text_color=self.ui.get("accent_soft", self.ui["accent"]),
        ).pack(side="left", padx=22, pady=18)

        card = ctk.CTkFrame(
            self,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=20,
        )
        card.pack(fill="both", expand=True, padx=22, pady=18)

        hero = ctk.CTkFrame(card, fg_color="transparent")
        hero.pack(fill="x", padx=20, pady=(22, 8))
        ctk.CTkLabel(hero, text="✓", font=("Segoe UI", 44), text_color=self.ui["success"]).pack(side="left", padx=(0, 14))
        title_col = ctk.CTkFrame(hero, fg_color="transparent")
        title_col.pack(side="left", fill="x", expand=True)
        ctk.CTkLabel(
            title_col,
            text=t("success.ready"),
            font=("Segoe UI Semibold", 20, "bold"),
            text_color=self.ui["text"],
            anchor="w",
        ).pack(anchor="w")
        ctk.CTkLabel(
            title_col,
            text=t("tool_ui.success_done"),
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
            anchor="w",
        ).pack(anchor="w", pady=(4, 0))

        display_path = os.path.basename(self.target_path) if os.path.isfile(self.target_path) else self.target_path
        ctk.CTkLabel(card, text=display_path, font=self.ui["body_font"], text_color=self.ui["muted"], wraplength=420).pack(
            pady=(0, 16), padx=24
        )

        btn_frame = ctk.CTkFrame(card, fg_color="transparent")
        btn_frame.pack(pady=(4, 18), padx=20, fill="x")

        btn_text = self._get_open_button_text()
        ctk.CTkButton(
            btn_frame,
            text=btn_text,
            height=44,
            corner_radius=12,
            font=("Segoe UI Semibold", 13, "bold"),
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            text_color=self.ui["button_text"],
            command=self.open_target,
        ).grid(row=0, column=0, padx=4, sticky="ew")

        if os.path.isfile(self.target_path):
            ctk.CTkButton(
                btn_frame,
                text=t("tool_ui.open_folder"),
                height=44,
                corner_radius=12,
                font=("Segoe UI Semibold", 13, "bold"),
                fg_color=self.ui["panel_soft"],
                hover_color=self.ui["border"],
                text_color=self.ui["text"],
                command=self.open_folder,
            ).grid(row=0, column=1, padx=4, sticky="ew")

        ctk.CTkButton(
            card,
            text=t("app.done"),
            width=140,
            height=40,
            corner_radius=12,
            fg_color=self.ui["panel_alt"],
            hover_color=self.ui["border"],
            command=self.destroy,
        ).pack(pady=(0, 22))

        btn_frame.grid_columnconfigure(0, weight=1)
        if os.path.isfile(self.target_path):
            btn_frame.grid_columnconfigure(1, weight=1)

    def _get_open_button_text(self):
        if not os.path.isfile(self.target_path):
            return t("success.open_folder")

        ext = os.path.splitext(self.target_path)[1].lower()
        if ext == ".pdf":
            return t("success.open_pdf")
        if ext in (".xlsx", ".xlsm", ".xltx", ".xltm", ".xls"):
            return t("success.open_excel")
        if ext in (".docx", ".doc"):
            return t("success.open_word")
        return t("tool_ui.open_result")

    def open_target(self):
        try:
            os.startfile(self.target_path)
            self.destroy()
        except Exception as e:
            print(f"Açma hatası: {e}")

    def open_folder(self):
        try:
            if os.path.isfile(self.target_path):
                folder = os.path.dirname(self.target_path)
            else:
                folder = self.target_path

            os.startfile(folder)
            self.destroy()
        except Exception as e:
            print(f"Klasör açma hatası: {e}")
