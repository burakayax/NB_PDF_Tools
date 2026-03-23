import customtkinter as ctk
from tkinter import filedialog, messagebox
import os
import threading
from queue import Queue, Empty

from modules.progress_dialog import ProgressDialog
from modules.ui_theme import badge_colors, theme


class ExcelToPdfWindow(ctk.CTkToplevel):
    """EXCEL -> PDF: .xlsx/.xlsm vb. (Windows'ta Excel ile, yoksa reportlab yedek)."""

    def __init__(self, master, ortalama_func, engine, success_dialog_class):
        super().__init__(master)
        self.ui = theme()
        self.ortalama_func = ortalama_func
        self.pdf_engine = engine
        self.success_dialog = success_dialog_class
        self.selected_file = None

        self.title("PaperFlow - Excel'den PDF'e")
        self.ortalama_func(self, 600, 540)
        self.grab_set()
        self.configure(fg_color=self.ui["bg"])

        header_frame = ctk.CTkFrame(self, fg_color=self.ui["accent"], height=60, corner_radius=0)
        header_frame.pack(fill="x", side="top")
        ctk.CTkLabel(
            header_frame,
            text="▤ EXCEL -> PDF",
            font=self.ui["title_font"],
            text_color="white",
        ).pack(pady=15)

        self.main_card = ctk.CTkFrame(
            self,
            fg_color=self.ui["panel"],
            corner_radius=16,
            border_width=1,
            border_color=self.ui["border"],
        )
        self.main_card.pack(pady=15, padx=30, fill="both", expand=True)

        ctk.CTkLabel(
            self.main_card,
            text="Desteklenen biçimler: .xlsx ve .xlsm",
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
        ).pack(pady=(12, 4), padx=20)

        self.content_frame = ctk.CTkFrame(self.main_card, fg_color="transparent")
        self.content_frame.pack(pady=10, padx=20, fill="both", expand=True)

        self.show_empty_state()

        self.btn_convert = ctk.CTkButton(
            self,
            text="PDF OLARAK KAYDET",
            font=("Segoe UI Semibold", 16, "bold"),
            height=50,
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            text_color=self.ui["button_text"],
            state="disabled",
            command=self.run_conversion,
        )
        self.btn_convert.pack(pady=(0, 20), padx=30, fill="x")

    def show_empty_state(self):
        for widget in self.content_frame.winfo_children():
            widget.destroy()

        ctk.CTkLabel(self.content_frame, text="▤", font=("Segoe UI Symbol", 56)).pack()
        ctk.CTkLabel(
            self.content_frame,
            text="İşleme başlamak için Excel dosyasını seçin.",
            font=("Segoe UI Semibold", 14, "bold"),
            text_color=self.ui["muted"],
        ).pack(pady=10)

        ctk.CTkButton(
            self.content_frame,
            text="Dosya Seç",
            width=120,
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            command=self.select_file,
        ).pack(pady=10)

    def select_file(self):
        file = filedialog.askopenfilename(
            parent=self,
            filetypes=[
                ("Excel", "*.xlsx *.xlsm *.xltx *.xltm"),
                ("Excel (.xlsx)", "*.xlsx"),
                ("Excel makro (.xlsm)", "*.xlsm"),
            ],
        )
        if file:
            self.selected_file = file
            self.update_ui()
        self.lift()

    def update_ui(self):
        for widget in self.content_frame.winfo_children():
            widget.destroy()

        fname = os.path.basename(self.selected_file)
        f_box = ctk.CTkFrame(
            self.content_frame,
            fg_color=self.ui["panel_alt"],
            corner_radius=8,
            border_width=1,
            border_color=self.ui["border"],
        )
        f_box.pack(pady=20, padx=20, fill="x")

        ctk.CTkLabel(f_box, text="Seçilen Dosya", font=("Segoe UI", 11), text_color=self.ui["accent"]).pack(pady=(10, 0))
        ctk.CTkLabel(f_box, text=fname, font=("Segoe UI Semibold", 13, "bold"), text_color=self.ui["text"]).pack(pady=10)

        badge = badge_colors("neutral")
        ctk.CTkLabel(
            f_box,
            text="  Excel Belgesi  ",
            font=self.ui["badge_font"],
            text_color=badge["text"],
            fg_color=badge["fg"],
            corner_radius=8,
        ).pack(pady=(0, 8))

        ctk.CTkButton(
            f_box,
            text="Değiştir",
            width=80,
            height=25,
            fg_color=self.ui["panel"],
            hover_color=self.ui["border"],
            command=self.select_file,
        ).pack(pady=(0, 10))

        self.btn_convert.configure(state="normal")

    def run_conversion(self):
        save_path = filedialog.asksaveasfilename(
            parent=self,
            title="PDF olarak kaydet",
            defaultextension=".pdf",
            filetypes=[("PDF", "*.pdf")],
        )
        if not save_path:
            return

        self.btn_convert.configure(state="disabled", fg_color=self.ui["panel_alt"])
        q = Queue()
        finished = {"value": False}

        progress_dialog = ProgressDialog(self, self.ortalama_func, total_count=2, title="Excel -> PDF")
        progress_dialog.update_progress(0, 2, "Başlanıyor...")

        def progress_cb(current: int, total: int, where_text: str):
            q.put(("progress", current, total, where_text))
            return True

        def worker():
            try:
                self.pdf_engine.excel_to_pdf(self.selected_file, save_path, progress_callback=progress_cb)
                q.put(("done", save_path))
            except Exception as e:
                q.put(("error", str(e)))

        threading.Thread(target=worker, daemon=True).start()

        def poll():
            try:
                while True:
                    msg = q.get_nowait()
                    kind = msg[0]
                    if kind == "progress":
                        _, cur, tot, where_text = msg
                        progress_dialog.update_progress(cur, tot, where_text=where_text)
                    elif kind == "done":
                        finished["value"] = True
                        progress_dialog.destroy()
                        self.destroy()
                        self.success_dialog(self.master, save_path, self.ortalama_func)
                        return
                    elif kind == "error":
                        finished["value"] = True
                        progress_dialog.destroy()
                        messagebox.showerror("Hata", f"❌ {msg[1]}")
                        self.btn_convert.configure(state="normal", fg_color=self.ui["accent"])
                        return
            except Empty:
                pass

            if not finished["value"]:
                self.after(100, poll)

        self.after(100, poll)
