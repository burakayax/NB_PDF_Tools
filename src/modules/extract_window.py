import customtkinter as ctk
from tkinter import filedialog, messagebox
import os


class ExtractWindow(ctk.CTkToplevel):
    def __init__(self, master, ortalama_func, engine, success_dialog_class):
        super().__init__(master)
        self.ortalama_func = ortalama_func
        self.pdf_engine = engine
        self.success_dialog = success_dialog_class
        self.selected_file = None
        self.total_pages = 0

        self.title("NB Studio - Sayfa Ayıklama")
        self.ortalama_func(self, 600, 750)  # Boyutu dikeyde biraz daha artırdık
        self.grab_set()

        # 1. ÜST BAŞLIK
        header_frame = ctk.CTkFrame(self, fg_color="#3a86ff", height=60, corner_radius=0)
        header_frame.pack(fill="x", side="top")
        ctk.CTkLabel(header_frame, text="✂️ SAYFA AYIKLAMA İSTASYONU", font=("Segoe UI", 22, "bold"),
                     text_color="white").pack(pady=15)

        # 2. PROFESYONEL DOSYA GÖRÜNÜM ALANI (BİRLEŞTİRME EKRANI STİLİ)
        self.file_card = ctk.CTkFrame(self, fg_color="#1e1e1e", corner_radius=12, border_width=2, border_color="#333")
        self.file_card.pack(pady=20, padx=40, fill="x")

        # İçerik konteynırı
        self.inner_content = ctk.CTkFrame(self.file_card, fg_color="transparent")
        self.inner_content.pack(pady=20, padx=20)

        # İkon ve Bilgi Metni
        self.lbl_file_icon = ctk.CTkLabel(self.inner_content, text="📂", font=("Segoe UI", 40))
        self.lbl_file_icon.pack()

        self.lbl_file_name = ctk.CTkLabel(self.inner_content, text="Henüz bir dosya seçilmedi",
                                          font=("Segoe UI", 13, "bold"), text_color="#888")
        self.lbl_file_name.pack(pady=(5, 0))

        self.lbl_file_details = ctk.CTkLabel(self.inner_content,
                                             text="İşlem yapmak için lütfen bir PDF dosyası yükleyin",
                                             font=("Segoe UI", 11), text_color="#555")
        self.lbl_file_details.pack()

        # Dosya Seç Butonu (Kartın hemen altında veya içinde)
        self.btn_select = ctk.CTkButton(self.file_card, text="DOSYA SEÇ", font=("Segoe UI", 12, "bold"),
                                        fg_color="#3a86ff", hover_color="#2a66cc", height=32, width=120,
                                        command=self.select_file)
        self.btn_select.pack(pady=(0, 15))

        # 3. AYARLAR VE GİRİŞ ALANI
        self.main_container = ctk.CTkFrame(self, fg_color="transparent")
        self.main_container.pack(fill="x", padx=40)

        # Kaydetme Modu
        ctk.CTkLabel(self.main_container, text="Kayıt Modu:", font=("Segoe UI", 13, "bold"), text_color="#f39c12").pack(
            anchor="w")
        self.segment_mode = ctk.CTkSegmentedButton(self.main_container,
                                                   values=["Tek PDF'de Birleştir", "Ayrı Ayrı Kaydet"])
        self.segment_mode.set("Tek PDF'de Birleştir")
        self.segment_mode.pack(fill="x", pady=(5, 15))

        # Sayfa Girişi
        ctk.CTkLabel(self.main_container, text="Sayfa numaralarını girin (Örn: 1, 3, 5):",
                     font=("Segoe UI", 13, "bold")).pack(anchor="w")

        self.entry_var = ctk.StringVar()
        self.entry_var.trace_add("write", self.validate_inputs)

        self.ent_page = ctk.CTkEntry(self.main_container, height=45,
                                     placeholder_text="Önce dosya seçmelisiniz...",
                                     font=("Segoe UI", 16, "bold"), justify="center",
                                     border_color="#1a1a1a", fg_color="#111",
                                     textvariable=self.entry_var, state="disabled")
        self.ent_page.pack(fill="x", pady=(5, 10))

        self.lbl_warning = ctk.CTkLabel(self, text="", font=("Segoe UI", 12, "bold"), text_color="#e74c3c")
        self.lbl_warning.pack(pady=5)

        # 4. İŞLEM BUTONU (Profesyonel Mavi)
        self.btn_run = ctk.CTkButton(self, text="İŞLEMİ BAŞLAT", font=("Segoe UI", 18, "bold"), height=60,
                                     fg_color="#34495e", hover_color="#2c3e50", text_color="white",
                                     state="disabled", command=self.run_extract)
        self.btn_run.pack(pady=(10, 20), padx=40, fill="x")

    def select_file(self):
        file = filedialog.askopenfilename(parent=self, filetypes=[("PDF Dosyaları", "*.pdf")])
        if file:
            self.selected_file = file
            try:
                import pikepdf
                with pikepdf.open(file) as pdf:
                    self.total_pages = len(pdf.pages)

                filename = os.path.basename(file)
                # KART GÖRÜNÜMÜNÜ GÜNCELLE
                self.file_card.configure(border_color="#2ecc71")  # Başarılı seçim rengi
                self.lbl_file_icon.configure(text="📄", text_color="#2ecc71")
                self.lbl_file_name.configure(text=filename, text_color="white")
                self.lbl_file_details.configure(text=f"Toplam: {self.total_pages} Sayfa | Durum: Hazır",
                                                text_color="#2ecc71")
                self.btn_select.configure(text="DOSYAYI DEĞİŞTİR", fg_color="#444")

                # Giriş alanını aktif et
                self.ent_page.configure(state="normal", placeholder_text="Numaraları buraya yazın...",
                                        border_color="#3a86ff", fg_color="#2a2a2a", text_color="white")
                self.validate_inputs()
            except:
                messagebox.showerror("Hata", "Dosya okunurken bir hata oluştu.")
        self.lift()

    def validate_inputs(self, *args):
        raw_text = self.entry_var.get()
        filtered_text = "".join([c for c in raw_text if c.isdigit() or c in ", "])
        if raw_text != filtered_text:
            self.entry_var.set(filtered_text)
            return

        input_text = filtered_text.replace(' ', '')
        self.lbl_warning.configure(text="")

        if not self.selected_file or not input_text:
            self.btn_run.configure(state="disabled", fg_color="#34495e")
            return

        try:
            parts = [p for p in input_text.split(',') if p]
            for p in parts:
                if p.isdigit():
                    p_num = int(p)
                    if p_num == 0 or p_num > self.total_pages:
                        self.lbl_warning.configure(text=f"⚠️ HATA: Geçersiz sayfa (Dosya {self.total_pages} sayfa)")
                        self.btn_run.configure(state="disabled", fg_color="#34495e")
                        self.ent_page.configure(border_color="#e74c3c")
                        return

            self.btn_run.configure(state="normal", fg_color="#2ecc71",
                                   text_color="#1a1a1a")  # Aktifken yeşil olabilir veya mavi kalabilir
            self.ent_page.configure(border_color="#2ecc71")

        except Exception:
            self.btn_run.configure(state="disabled")

    def run_extract(self):
        try:
            pages_text = self.ent_page.get()
            pages_list = sorted(list(set([int(p.strip()) for p in pages_text.split(',') if p.strip().isdigit()])))
            save_mode = self.segment_mode.get()

            if save_mode == "Tek PDF'de Birleştir":
                save_path = filedialog.asksaveasfilename(parent=self, title="PDF'i Kaydet", defaultextension=".pdf",
                                                         filetypes=[("PDF", "*.pdf")])
                if save_path:
                    self.pdf_engine.extract_and_merge_pages(self.selected_file, save_path, pages_list)
                    self.destroy()
                    self.success_dialog(self.master, save_path, self.ortalama_func)
            else:
                folder_path = filedialog.askdirectory(parent=self, title="Kaydedilecek Klasörü Seçin")
                if folder_path:
                    self.pdf_engine.extract_and_save_separate_pages(self.selected_file, folder_path, pages_list)
                    self.destroy()
                    self.success_dialog(self.master, os.path.abspath(folder_path), self.ortalama_func)
        except Exception as e:
            messagebox.showerror("Hata", str(e))