import customtkinter as ctk
from tkinter import filedialog, messagebox
import os
import threading
from queue import Queue, Empty

from modules.progress_dialog import ProgressDialog
from modules.ui_theme import badge_colors, theme


class WordToPdfWindow(ctk.CTkToplevel):
    """WORD -> PDF: .docx/.doc seçilir, PDF kaydedilir (Microsoft Word + docx2pdf)."""

    def __init__(self, master, ortalama_func, engine, success_dialog_class):
        super().__init__(master)
        self.ui = theme()
        self.ortalama_func = ortalama_func
        self.pdf_engine = engine
        self.success_dialog = success_dialog_class
        self.selected_file = None

        self.title("PaperFlow - Word'den PDF'e")
        self.ortalama_func(self, 600, 500)
        self.grab_set()
        self.configure(fg_color=self.ui["bg"])

        header_frame = ctk.CTkFrame(self, fg_color=self.ui["accent"], height=60, corner_radius=0)
        header_frame.pack(fill="x", side="top")
        ctk.CTkLabel(
            header_frame,
            text="⇠ WORD -> PDF ÇEVİRİCİ",
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

        self.content_frame = ctk.CTkFrame(self.main_card, fg_color="transparent")
        self.content_frame.pack(pady=40, padx=20, fill="both", expand=True)

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

        ctk.CTkLabel(self.content_frame, text="⇠", font=("Segoe UI Symbol", 56)).pack()
        ctk.CTkLabel(
            self.content_frame,
            text="İşleme başlamak için Word dosyasını seçin.",
            font=("Segoe UI Semibold", 14, "bold"),
            text_color=self.ui["muted"],
        ).pack(pady=10)

        btn_select = ctk.CTkButton(
            self.content_frame,
            text="Dosya Seç",
            width=120,
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            command=self.select_file,
        )
        btn_select.pack(pady=10)

    def select_file(self):
        file = filedialog.askopenfilename(
            parent=self,
            filetypes=[
                ("Word belgeleri", "*.docx *.doc"),
                ("Word (.docx)", "*.docx"),
                ("Word (.doc)", "*.doc"),
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
            text="  Word Belgesi  ",
            font=self.ui["badge_font"],
            text_color=badge["text"],
            fg_color=badge["fg"],
            corner_radius=8,
        ).pack(pady=(0, 8))

        btn_change = ctk.CTkButton(
            f_box,
            text="Değiştir",
            width=80,
            height=25,
            fg_color=self.ui["panel"],
            hover_color=self.ui["border"],
            command=self.select_file,
        )
        btn_change.pack(pady=(0, 10))

        self.btn_convert.configure(state="normal")

    def run_conversion(self):
        save_path = filedialog.asksaveasfilename(
            parent=self,
            title="PDF olarak kaydet",
            defaultextension=".pdf",
            filetypes=[("PDF", "*.pdf")],
        )
        if save_path:
            self.btn_convert.configure(state="disabled", fg_color=self.ui["panel_alt"])
            q = Queue()
            finished = {"value": False}

            progress_dialog = ProgressDialog(self, self.ortalama_func, total_count=2, title="Word -> PDF")
            progress_dialog.update_progress(0, 2, "Başlanıyor...")

            def progress_cb(current: int, total: int, where_text: str):
                q.put(("progress", current, total, where_text))
                return True

            def worker():
                try:
                    self.pdf_engine.word_to_pdf(self.selected_file, save_path, progress_callback=progress_cb)
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
