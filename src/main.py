import customtkinter as ctk
from tkinter import messagebox
import os
import sys
import ctypes
from ctypes import wintypes

# Senin orijinal import yapın ve klasör desteğin
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    import pdf_engine
    from modules.feedback_dialog import FeedbackDialog
    from modules.merge_window import MergeWindow
    from modules.extract_window import ExtractWindow
    from modules.success_dialog import SuccessDialog
    from modules.word_window import WordWindow
    from modules.word_to_pdf_window import WordToPdfWindow
    from modules.pdf_to_excel_window import PdfToExcelWindow
    from modules.excel_to_pdf_window import ExcelToPdfWindow
    from modules.compress_pdf_window import CompressPdfWindow
    from modules.encrypt_pdf_window import EncryptPdfWindow
    from modules.ui_theme import add_footer, theme
except ImportError as e:
    print(f"Modül Yükleme Hatası: {e}")

class NBPDFApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.ui = theme()

        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")
        self.title("PaperFlow PDF Suite")
        self.configure(fg_color=self.ui["bg"])

        # Orijinal tam ekran ayarın
        self.after(0, lambda: self.state('zoomed'))

        self.content_container = ctk.CTkFrame(self, fg_color="transparent")
        self.content_container.pack(expand=True, fill="both", padx=28, pady=(24, 10))

        self.setup_ui()

    def setup_ui(self):
        self.header_frame = ctk.CTkFrame(
            self.content_container,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=24,
        )
        self.header_frame.pack(pady=(20, 26), padx=16, fill="x")

        top_row = ctk.CTkFrame(self.header_frame, fg_color="transparent")
        top_row.pack(fill="x", padx=22, pady=(18, 4))
        top_row.grid_columnconfigure(0, weight=1)
        top_row.grid_columnconfigure(1, weight=3)
        top_row.grid_columnconfigure(2, weight=1)

        ctk.CTkFrame(top_row, fg_color="transparent").grid(row=0, column=0, sticky="ew")
        ctk.CTkLabel(
            top_row,
            text="PAPERFLOW",
            font=self.ui["app_title_font"],
            text_color=self.ui["accent"],
            anchor="center",
        ).grid(row=0, column=1)

        ctk.CTkButton(
            top_row,
            text="İLETİŞİM",
            font=self.ui["subtitle_font"],
            fg_color=self.ui["panel_alt"],
            hover_color=self.ui["border"],
            text_color=self.ui["text"],
            width=122,
            height=38,
            command=self.open_feedback_dialog,
        ).grid(row=0, column=2, sticky="e", pady=(6, 0))

        ctk.CTkLabel(self.header_frame,
                     text="PDF SUITE BY NB GLOBAL STUDIO",
                     font=("Segoe UI Semibold", 18, "bold"),
                     text_color=self.ui["text"]).pack(pady=(0, 4))

        ctk.CTkLabel(
            self.header_frame,
            text="PDF birleştirme, ayıklama, Office dönüşümleri, sıkıştırma ve şifreleme işlemleri tek ekranda.",
            font=self.ui["body_font"],
            text_color=self.ui["muted"],
        ).pack(pady=(0, 24))

        self.button_frame = ctk.CTkFrame(self.content_container, fg_color="transparent")
        self.button_frame.pack()
        for idx in range(3):
            self.button_frame.grid_columnconfigure(idx, weight=1)

        islem_listesi = [
            ("SAYFA\nAYIR", "📄"),
            ("PDF\nBİRLEŞTİR", "🗂"),
            ("PDF -> WORD", "📝"),
            ("WORD -> PDF", "🧾"),
            ("EXCEL -> PDF", "📊"),
            ("PDF -> EXCEL", "📈"),
            ("PDF SIKIŞTIR", "🗜"),
            ("PDF ŞİFRELE", "🔒"),
        ]

        for i, (isim, ikon) in enumerate(islem_listesi):
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
                command=lambda n=isim: self.handle_click(n),
            )
            btn.grid(row=i // 3, column=i % 3, padx=18, pady=18)

        add_footer(
            self,
            left_text="PaperFlow PDF Suite | by NB Global Studio",
            right_text="Windows Desktop Edition",
        )

    def handle_click(self, isim):
        compact = isim.replace("\n", "").replace(" ", "")
        if "BİRLEŞTİR" in isim:
            MergeWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog)
        elif "AYIR" in isim or "AYIKLA" in isim:
            ExtractWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog)
        elif "PDF->WORD" in compact:
            WordWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog)
        elif "WORD->PDF" in compact:
            WordToPdfWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog)
        elif "EXCEL->PDF" in compact:
            ExcelToPdfWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog)
        elif "PDF->EXCEL" in compact:
            PdfToExcelWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog)
        elif "SIKIŞTIR" in isim:
            CompressPdfWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog)
        elif "ŞİFRELE" in isim:
            EncryptPdfWindow(self, self.ekran_ortala, pdf_engine, SuccessDialog)
        else:
            messagebox.showinfo("PaperFlow", f"{isim.replace('\n', ' ')} modülü yakında aktif olacak!")

    def open_feedback_dialog(self):
        FeedbackDialog(self, self.ekran_ortala)

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