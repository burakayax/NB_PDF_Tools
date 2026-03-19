import customtkinter as ctk
from tkinter import messagebox
import os
import sys

# Senin orijinal import yapın ve klasör desteğin
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    import pdf_engine
    from modules.merge_window import MergeWindow
    from modules.extract_window import ExtractWindow
    from modules.success_dialog import SuccessDialog
    from modules.word_window import WordWindow  # Word penceresini buraya ekledik
except ImportError as e:
    print(f"Modül Yükleme Hatası: {e}")

class NBPDFApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")
        self.title("NB Global Studio - Ultimate PDF & Data Kiosk")

        # Orijinal tam ekran ayarın
        self.after(0, lambda: self.state('zoomed'))

        self.main_container = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.main_container.pack(expand=True, fill="both", padx=40, pady=20)

        self.setup_ui()

    def setup_ui(self):
        self.header_frame = ctk.CTkFrame(self.main_container, fg_color="transparent")
        self.header_frame.pack(pady=(50, 40))

        ctk.CTkLabel(self.header_frame,
                     text="NB GLOBAL STUDIO",
                     font=("Segoe UI", 48, "bold"),
                     text_color="#3a86ff").pack()

        ctk.CTkLabel(self.header_frame,
                     text="PROFESYONEL PDF YÖNETİM SİSTEMİ",
                     font=("Segoe UI", 18, "bold"),
                     text_color="white").pack(pady=5)

        self.button_frame = ctk.CTkFrame(self.main_container, fg_color="transparent")
        self.button_frame.pack()

        # Orijinal listen
        islem_listesi = [
            ("SAYFA\nAYIKLA", "📄"), ("PDF\nBİRLEŞTİR", "➕"), ("PDF -> WORD", "📝"),
            ("WORD -> PDF", "💾"), ("EXCEL -> PDF", "📊"), ("PDF -> EXCEL", "📈"),
            ("PDF SIKIŞTIR", "🗜️"), ("PDF ŞİFRELE", "🔒")
        ]

        for i, (isim, ikon) in enumerate(islem_listesi):
            btn = ctk.CTkButton(self.button_frame,
                                text=f"{ikon}\n\n{isim}",
                                width=280, height=220, corner_radius=35,
                                font=("Segoe UI", 20, "bold"),
                                fg_color="#1e1e1e", hover_color="#3a86ff",
                                border_width=2, border_color="#333333",
                                command=lambda n=isim: self.handle_click(n))
            btn.grid(row=i // 3, column=i % 3, padx=25, pady=25)

    def handle_click(self, isim):
        # Tıklama kontrolleri - Tasarımı bozmadan Word'ü ekledik
        if "BİRLEŞTİR" in isim:
            MergeWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog)
        elif "AYIKLA" in isim:
            ExtractWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog)
        elif "WORD" in isim and "->" in isim: # PDF -> WORD kısmı
            WordWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog)
        else:
            messagebox.showinfo("NB Studio", f"{isim.replace('\n', ' ')} modülü yakında aktif olacak!")

    def ekran_ortala(self, pencere, genislik, yukseklik):
        pencere.update_idletasks()
        x = int((pencere.winfo_screenwidth() / 2) - (genislik / 2))
        y = int((pencere.winfo_screenheight() / 2) - (yukseklik / 2))
        pencere.geometry(f"{genislik}x{yukseklik}+{x}+{y}")

if __name__ == "__main__":
    app = NBPDFApp()
    app.mainloop()