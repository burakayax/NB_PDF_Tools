import customtkinter as ctk
import os

from modules.i18n import t
from modules.ui_theme import theme


class SuccessDialog(ctk.CTkToplevel):
    def __init__(self, master, path, ortalama_func):
        super().__init__(master)
        self.ui = theme()
        # Gelen yolu normalize edelim (Windows/Linux uyumu ve hatalı bölüntüler için)
        self.target_path = os.path.abspath(path)
        self.ortalama_func = ortalama_func

        self.title(t("success.title"))
        self.ortalama_func(self, 480, 320)
        self.grab_set()
        self.after(100, self.lift)
        self.configure(fg_color=self.ui["bg"])

        header = ctk.CTkFrame(self, fg_color=self.ui["accent"], height=58, corner_radius=0)
        header.pack(fill="x", side="top")
        ctk.CTkLabel(header, text=t("success.header"), font=self.ui["title_font"], text_color="white").pack(pady=12)

        card = ctk.CTkFrame(
            self,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=18,
        )
        card.pack(fill="both", expand=True, padx=22, pady=18)

        ctk.CTkLabel(card, text=t("success.ready"), font=("Segoe UI Semibold", 20, "bold"), text_color=self.ui["text"]).pack(pady=(18, 4))

        # Kullanıcıya hangi konumun işlem gördüğünü gösterelim
        display_path = os.path.basename(self.target_path) if os.path.isfile(self.target_path) else self.target_path
        ctk.CTkLabel(card, text=display_path, font=self.ui["body_font"], text_color=self.ui["muted"], wraplength=410).pack(pady=(0, 14))

        btn_frame = ctk.CTkFrame(card, fg_color="transparent")
        btn_frame.pack(pady=(8, 14), padx=14, fill="x")

        # Dosya üretildiyse hem dosya hem klasör açılabilir; klasör üretildiyse tek aksiyon klasörü açmaktır.
        btn_text = self._get_open_button_text()
        ctk.CTkButton(
            btn_frame,
            text=btn_text,
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            command=self.open_target,
        ).grid(row=0, column=0, padx=5, sticky="ew")

        if os.path.isfile(self.target_path):
            ctk.CTkButton(
                btn_frame,
                text=t("success.open_folder"),
                fg_color=self.ui["panel_soft"],
                hover_color=self.ui["border"],
                text_color=self.ui["text"],
                command=self.open_folder,
            ).grid(row=0, column=1, padx=5, sticky="ew")

        # 3. BİTTİ
        ctk.CTkButton(card, text=t("app.done"), fg_color=self.ui["panel_alt"], hover_color=self.ui["border"], width=120,
                      command=self.destroy).pack(pady=(4, 18))

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
        return t("success.open_file")

    def open_target(self):
        """Dosyaysa ilişkili uygulamayı, klasörse gezgini açar."""
        try:
            os.startfile(self.target_path)
            self.destroy()
        except Exception as e:
            print(f"Açma hatası: {e}")

    def open_folder(self):
        """Hangi modda olursan ol, ilgili klasörü Windows Gezgini'nde açar."""
        try:
            if os.path.isfile(self.target_path):
                # Dosya ise bulunduğu klasörü al
                folder = os.path.dirname(self.target_path)
            else:
                # Zaten klasör yoluysa direkt kullan
                folder = self.target_path

            # Windows'ta klasörü seçili dahi getirebiliriz (Explorer'ı tetikler)
            os.startfile(folder)
            self.destroy()
        except Exception as e:
            print(f"Klasör açma hatası: {e}")