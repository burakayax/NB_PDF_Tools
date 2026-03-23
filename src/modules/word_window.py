import customtkinter as ctk
from tkinter import filedialog, messagebox
import os
import threading
from queue import Queue, Empty

from modules.progress_dialog import ProgressDialog


class WordWindow(ctk.CTkToplevel):
    def __init__(self, master, ortalama_func, engine, success_dialog_class):
        super().__init__(master)
        self.ortalama_func = ortalama_func
        self.pdf_engine = engine
        self.success_dialog = success_dialog_class
        self.selected_file = None

        self.title("NB Studio - PDF'ten Word'e")
        self.ortalama_func(self, 600, 500)
        self.grab_set()

        # 1. ÜST BAŞLIK (PDF birleştirme ekranı ile aynı mavi tema)
        header_frame = ctk.CTkFrame(self, fg_color="#3a86ff", height=60, corner_radius=0)
        header_frame.pack(fill="x", side="top")
        ctk.CTkLabel(header_frame, text="📝 PDF -> WORD ÇEVİRİCİ",
                     font=("Segoe UI", 22, "bold"), text_color="white").pack(pady=15)

        # 2. ANA KART (birleştirme ekranı ile aynı kart stili)
        self.main_card = ctk.CTkFrame(self, fg_color="#1e1e1e", corner_radius=12, border_width=2, border_color="#333")
        self.main_card.pack(pady=15, padx=30, fill="both", expand=True)

        # Boş Görünüm / Seçili Dosya Görünümü
        self.content_frame = ctk.CTkFrame(self.main_card, fg_color="transparent")
        self.content_frame.pack(pady=40, padx=20, fill="both", expand=True)

        self.show_empty_state()

        # 3. BUTONLAR
        self.btn_convert = ctk.CTkButton(self, text="WORD'E DÖNÜŞTÜR",
                                         font=("Segoe UI", 16, "bold"),
                                         height=50, fg_color="#3a86ff", hover_color="#2a66cc",
                                         state="disabled", command=self.run_conversion)
        self.btn_convert.pack(pady=(0, 20), padx=30, fill="x")

    def show_empty_state(self):
        for widget in self.content_frame.winfo_children(): widget.destroy()

        ctk.CTkLabel(self.content_frame, text="📄", font=("Segoe UI", 60)).pack()
        ctk.CTkLabel(self.content_frame, text="Çevrilecek PDF'i Seçin",
                     font=("Segoe UI", 14, "bold"), text_color="#888").pack(pady=10)

        btn_select = ctk.CTkButton(self.content_frame, text="Dosya Seç", width=120,
                                   fg_color="#3a86ff", hover_color="#2a66cc",
                                   command=self.select_file)
        btn_select.pack(pady=10)

    def select_file(self):
        file = filedialog.askopenfilename(parent=self, filetypes=[("PDF Dosyaları", "*.pdf")])
        if file:
            self.selected_file = file
            self.update_ui()
        self.lift()

    def update_ui(self):
        for widget in self.content_frame.winfo_children(): widget.destroy()

        fname = os.path.basename(self.selected_file)

        # Seçili Dosya Kartı
        f_box = ctk.CTkFrame(self.content_frame, fg_color="#2a2a2a", corner_radius=8, border_width=2,
                             border_color="#444")
        f_box.pack(pady=20, padx=20, fill="x")

        ctk.CTkLabel(f_box, text="✅ Seçilen Dosya:", font=("Segoe UI", 11), text_color="#3a86ff").pack(pady=(10, 0))
        ctk.CTkLabel(f_box, text=fname, font=("Segoe UI", 13, "bold"), text_color="white").pack(pady=10)

        btn_change = ctk.CTkButton(f_box, text="Değiştir", width=80, height=25, fg_color="#444",
                                   command=self.select_file)
        btn_change.pack(pady=(0, 10))

        self.btn_convert.configure(state="normal")

    def run_conversion(self):
        save_path = filedialog.asksaveasfilename(parent=self, title="Word Dosyasını Kaydet",
                                                 defaultextension=".docx",
                                                 filetypes=[("Word Belgesi", "*.docx")])
        if save_path:
            self.btn_convert.configure(state="disabled", fg_color="#34495e")
            q = Queue()
            finished = {"value": False}

            progress_dialog = ProgressDialog(self, self.ortalama_func, total_count=1, title="PDF -> Word")
            progress_dialog.update_progress(0, 1, "Başlanıyor...")

            def progress_cb(current: int, total: int, where_text: str):
                q.put(("progress", current, total, where_text))
                return True

            def worker():
                try:
                    self.pdf_engine.pdf_to_word(self.selected_file, save_path, progress_callback=progress_cb)
                    q.put(("done", save_path))
                except Exception as e:
                    q.put(("error", str(e)))

            t = threading.Thread(target=worker, daemon=True)
            t.start()

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
                            messagebox.showerror("Hata", f"Dönüştürme başarısız: {msg[1]}")
                            self.btn_convert.configure(state="normal", fg_color="#3a86ff")
                            return
                except Empty:
                    pass

                if not finished["value"]:
                    self.after(100, poll)

            self.after(100, poll)