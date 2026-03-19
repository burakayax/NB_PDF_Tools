import customtkinter as ctk
from tkinter import filedialog, messagebox
import os


class MergeWindow(ctk.CTkToplevel):
    def __init__(self, master, ortalama_func, engine, success_dialog_class):
        super().__init__(master)
        self.ortalama_func = ortalama_func
        self.pdf_engine = engine
        self.success_dialog = success_dialog_class
        self.file_list = []

        self.title("NB Studio - PDF Birleştirme")
        # Pencere boyutunu her şeyin sığacağı klasik ölçüye çektik
        self.ortalama_func(self, 800, 750)
        self.grab_set()

        # 1. ÜST BAŞLIK (Klasik Mavi)
        header_frame = ctk.CTkFrame(self, fg_color="#3a86ff", height=60, corner_radius=0)
        header_frame.pack(fill="x", side="top")
        ctk.CTkLabel(header_frame, text="🔗 PDF BİRLEŞTİRME MERKEZİ",
                     font=("Segoe UI", 22, "bold"), text_color="white").pack(pady=15)

        # 2. ANA LİSTE KARTI (Klasik Koyu Gri)
        self.main_card = ctk.CTkFrame(self, fg_color="#1e1e1e", corner_radius=12, border_width=2, border_color="#333")
        self.main_card.pack(pady=15, padx=30, fill="both", expand=True)

        # Boş Görünüm
        self.empty_view = ctk.CTkFrame(self.main_card, fg_color="transparent")
        self.empty_view.pack(pady=80, padx=20, fill="both", expand=True)
        ctk.CTkLabel(self.empty_view, text="📚", font=("Segoe UI", 50)).pack()
        ctk.CTkLabel(self.empty_view, text="Henüz dosya eklenmedi",
                     font=("Segoe UI", 14, "bold"), text_color="#888").pack(pady=10)

        # Kaydırılabilir Izgara Alanı
        self.scroll_frame = ctk.CTkScrollableFrame(self.main_card, fg_color="transparent")

        # 3. KONTROL BUTONLARI (Alt Bölüm)
        self.controls_container = ctk.CTkFrame(self, fg_color="transparent")
        self.controls_container.pack(fill="x", padx=30, pady=(0, 20))

        self.btn_add = ctk.CTkButton(self.controls_container, text="➕ DOSYA EKLE",
                                     font=("Segoe UI", 14, "bold"),
                                     fg_color="#3a86ff", height=45, command=self.add_files)
        self.btn_add.pack(fill="x", pady=5)

        # Temizle Butonu (Artık soluk değil, belirgin bir buton)
        self.btn_clear = ctk.CTkButton(self.controls_container, text="🗑️ LİSTEYİ TEMİZLE",
                                       fg_color="#e74c3c", height=35, command=self.clear_list)

        self.btn_run = ctk.CTkButton(self.controls_container, text="PDF'LERİ BİRLEŞTİR VE KAYDET",
                                     font=("Segoe UI", 18, "bold"),
                                     height=60, fg_color="#34495e",
                                     state="disabled", command=self.run_merge)
        self.btn_run.pack(fill="x", pady=(10, 0))

    def add_files(self):
        files = filedialog.askopenfilenames(parent=self, filetypes=[("PDF", "*.pdf")])
        if files:
            for f in files:
                if f not in self.file_list: self.file_list.append(f)
            self.update_ui()
        self.lift()

    def clear_list(self):
        self.file_list = []
        self.update_ui()

    def update_ui(self):
        for widget in self.scroll_frame.winfo_children(): widget.destroy()

        if not self.file_list:
            self.scroll_frame.pack_forget()
            self.btn_clear.pack_forget()
            self.empty_view.pack(fill="both", expand=True)
            self.btn_run.configure(state="disabled", fg_color="#34495e")
        else:
            self.empty_view.pack_forget()
            self.scroll_frame.pack(pady=10, padx=10, fill="both", expand=True)
            self.btn_clear.pack(after=self.btn_add, fill="x", pady=5)

            cols = 3
            for i, path in enumerate(self.file_list):
                fname = os.path.basename(path)
                display_name = (fname[:18] + '..') if len(fname) > 20 else fname

                # Klasik Kart Tasarımı
                f_box = ctk.CTkFrame(self.scroll_frame, fg_color="#2a2a2a", corner_radius=10,
                                     width=220, height=140, border_width=1, border_color="#444")
                f_box.grid(row=i // cols, column=i % cols, padx=10, pady=10)
                f_box.grid_propagate(False)

                ctk.CTkLabel(f_box, text="📄", font=("Segoe UI", 32)).pack(pady=(10, 0))
                ctk.CTkLabel(f_box, text=display_name, font=("Segoe UI", 11, "bold"),
                             text_color="#eee").pack(padx=10, pady=(0, 5))

                # Basit ve Net Silme Butonu (Alt bölümde)
                btn_remove = ctk.CTkButton(f_box, text="Dosyayı Kaldır",
                                           font=("Segoe UI", 11),
                                           height=30,
                                           fg_color="#333",
                                           hover_color="#e74c3c",
                                           text_color="#ff7675",
                                           command=lambda p=path: self.remove_single_file(p))
                btn_remove.pack(side="bottom", fill="x", padx=10, pady=10)

            self.btn_run.configure(state="normal", fg_color="#2ecc71", text_color="#1a1a1a")

    def remove_single_file(self, path):
        if path in self.file_list:
            self.file_list.remove(path)
            self.update_ui()

    def run_merge(self):
        if not self.file_list: return
        save_path = filedialog.asksaveasfilename(parent=self, title="PDF'i Kaydet",
                                                 defaultextension=".pdf",
                                                 filetypes=[("PDF", "*.pdf")])
        if save_path:
            try:
                self.pdf_engine.merge_pdfs(self.file_list, save_path)
                self.destroy()
                self.success_dialog(self.master, save_path, self.ortalama_func)
            except Exception as e:
                messagebox.showerror("Hata", str(e))