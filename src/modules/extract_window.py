import customtkinter as ctk
from tkinter import filedialog, messagebox
import os

from modules.i18n import t
from modules.pdf_password_dialog import PdfPasswordDialog
from modules.ui_theme import badge_colors, theme


def _parse_pages_selection(input_text: str):
    """Web API ile uyumlu sayfa listesi: virgülle ayrılmış sayılar ve tireli aralıklar (1 tabanlı)."""
    raw = input_text.replace(" ", "").strip()
    if not raw:
        return None, "empty"
    pages: set[int] = set()
    for token in raw.split(","):
        if not token:
            continue
        if "-" in token:
            start_raw, end_raw = token.split("-", 1)
            if not start_raw.isdigit() or not end_raw.isdigit():
                return None, "format"
            start, end = int(start_raw), int(end_raw)
            if start > end:
                return None, "format"
            pages.update(range(start, end + 1))
        else:
            if not token.isdigit():
                return None, "format"
            pages.add(int(token))
    if not pages:
        return None, "empty"
    return sorted(pages), None


class ExtractWindow(ctk.CTkToplevel):
    def __init__(self, master, ortalama_func, engine, success_dialog_class, access_controller=None):
        super().__init__(master)
        self.ortalama_func = ortalama_func
        self.pdf_engine = engine
        self.success_dialog = success_dialog_class
        self.access_controller = access_controller
        self.ui = theme()
        self.selected_file = None
        self.total_pages = 0
        self.selected_password = None

        self.title(t("extract.window_title"))
        self.ortalama_func(self, 620, 760)
        self.grab_set()
        self.configure(fg_color=self.ui["bg"])

        # 1. ÜST BAŞLIK
        header_frame = ctk.CTkFrame(self, fg_color=self.ui["accent"], height=60, corner_radius=0)
        header_frame.pack(fill="x", side="top")
        ctk.CTkLabel(header_frame, text=t("extract.header"), font=self.ui["title_font"],
                     text_color="white").pack(pady=15)

        # 2. PROFESYONEL DOSYA GÖRÜNÜM ALANI (BİRLEŞTİRME EKRANI STİLİ)
        self.file_card = ctk.CTkFrame(self, fg_color=self.ui["panel"], corner_radius=16, border_width=1, border_color=self.ui["border"])
        self.file_card.pack(pady=20, padx=40, fill="x")

        # İçerik konteynırı
        self.inner_content = ctk.CTkFrame(self.file_card, fg_color="transparent")
        self.inner_content.pack(pady=20, padx=20)

        # İkon ve Bilgi Metni
        self.lbl_file_icon = ctk.CTkLabel(self.inner_content, text="◫", font=("Segoe UI Symbol", 40), text_color=self.ui["muted"])
        self.lbl_file_icon.pack()

        self.lbl_file_name = ctk.CTkLabel(self.inner_content, text=t("extract.empty_file"),
                                          font=("Segoe UI Semibold", 13, "bold"), text_color=self.ui["muted"])
        self.lbl_file_name.pack(pady=(5, 0))

        self.lbl_file_details = ctk.CTkLabel(self.inner_content,
                                             text=t("extract.empty_detail"),
                                             font=self.ui["body_font"], text_color=self.ui["muted"])
        self.lbl_file_details.pack()

        # Dosya Seç Butonu (Kartın hemen altında veya içinde)
        self.btn_select = ctk.CTkButton(self.file_card, text=t("extract.select_file"), font=self.ui["subtitle_font"],
                                        fg_color=self.ui["accent"], hover_color=self.ui["accent_hover"], height=32, width=120,
                                        command=self.select_file)
        self.btn_select.pack(pady=(0, 15))

        # 3. AYARLAR VE GİRİŞ ALANI
        self.main_container = ctk.CTkFrame(self, fg_color="transparent")
        self.main_container.pack(fill="x", padx=40)

        # Kaydetme Modu
        ctk.CTkLabel(self.main_container, text=t("extract.save_mode"), font=self.ui["subtitle_font"], text_color=self.ui["warning"]).pack(
            anchor="w")
        self.segment_mode = ctk.CTkSegmentedButton(self.main_container,
                                                   values=[t("extract.mode_single"), t("extract.mode_separate")],
                                                   command=lambda _value: self.update_mode_info())
        self.segment_mode.set(t("extract.mode_single"))
        self.segment_mode.pack(fill="x", pady=(5, 15))
        self.mode_info = ctk.CTkLabel(
            self.main_container,
            text=t("extract.mode_single_info"),
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
            justify="left",
            wraplength=500,
        )
        self.mode_info.pack(anchor="w", pady=(0, 10))

        # Sayfa Girişi
        ctk.CTkLabel(self.main_container, text=t("extract.page_label"),
                     font=self.ui["subtitle_font"], text_color=self.ui["text"]).pack(fill="x")

        self.entry_var = ctk.StringVar()
        self.entry_var.trace_add("write", self.validate_inputs)

        self.ent_page = ctk.CTkEntry(self.main_container, height=45,
                                     placeholder_text=t("extract.page_placeholder_disabled"),
                                     font=("Segoe UI Semibold", 16, "bold"), justify="center",
                                     border_color=self.ui["border"], fg_color=self.ui["panel_alt"], text_color=self.ui["text"],
                                     textvariable=self.entry_var, state="disabled")
        self.ent_page.pack(fill="x", pady=(5, 10))

        self.lbl_warning = ctk.CTkLabel(self, text="", font=self.ui["body_font"], text_color=self.ui["danger"])
        self.lbl_warning.pack(pady=5)

        # 4. İŞLEM BUTONU (Profesyonel Mavi)
        self.btn_run = ctk.CTkButton(self, text=t("extract.run"), font=("Segoe UI Semibold", 18, "bold"), height=56,
                                     fg_color=self.ui["panel_alt"], hover_color=self.ui["border"], text_color=self.ui["button_text"],
                                     state="disabled", command=self.run_extract)
        self.btn_run.pack(pady=(10, 20), padx=40, fill="x")

    def update_mode_info(self):
        if self.segment_mode.get() == t("extract.mode_single"):
            self.mode_info.configure(text=t("extract.mode_single_info"))
        else:
            self.mode_info.configure(text=t("extract.mode_separate_info"))

    def select_file(self):
        file = filedialog.askopenfilename(parent=self, filetypes=[("PDF Files", "*.pdf")])
        if file:
            try:
                password = None
                is_encrypted = False
                if hasattr(self.pdf_engine, "is_pdf_encrypted"):
                    is_encrypted = self.pdf_engine.is_pdf_encrypted(file)
                if is_encrypted:
                    def validate_password(value):
                        try:
                            if hasattr(self.pdf_engine, "validate_pdf_password") and self.pdf_engine.validate_pdf_password(file, value):
                                return True
                            return t("pdf_password.invalid_password")
                        except Exception as e:
                            return str(e)

                    dialog = PdfPasswordDialog(
                        self,
                        self.ortalama_func,
                        os.path.basename(file),
                        password_validator=validate_password,
                        allow_skip=False,
                    )
                    self.wait_window(dialog)
                    if not dialog.result:
                        self.lift()
                        return
                    password = dialog.result

                self.selected_file = file
                self.selected_password = password
                # Öncelikle engine'in get_num_pages fonksiyonunu kullanmaya çalış
                if hasattr(self.pdf_engine, 'get_num_pages'):
                    self.total_pages = self.pdf_engine.get_num_pages(file, password=password)
                else:
                    import pikepdf
                    with pikepdf.open(file, password=password) as pdf:
                        self.total_pages = len(pdf.pages)

                filename = os.path.basename(file)
                # KART GÖRÜNÜMÜNÜ GÜNCELLE
                self.file_card.configure(border_color=self.ui["success"])
                self.lbl_file_icon.configure(text="◫", text_color=self.ui["success"])
                self.lbl_file_name.configure(text=filename, text_color=self.ui["text"])
                status_text = t("extract.ready_status_encrypted") if is_encrypted else t("extract.ready_status")
                badge = badge_colors("warning" if is_encrypted else "success")
                self.lbl_file_details.configure(
                    text=f"  Toplam: {self.total_pages} Sayfa | {status_text}  ",
                    text_color=badge["text"],
                    fg_color=badge["fg"],
                    corner_radius=10,
                )
                self.btn_select.configure(text=t("extract.change_file"), fg_color=self.ui["panel_alt"], hover_color=self.ui["border"])

                # Giriş alanını aktif et
                self.ent_page.configure(state="normal", placeholder_text=t("extract.page_placeholder_active"),
                                        border_color=self.ui["accent"], fg_color=self.ui["panel_alt"], text_color=self.ui["text"])
                self.validate_inputs()
            except Exception as e:
                self.selected_password = None
                if "şifreli" in str(e).lower() or "şifre" in str(e).lower():
                    messagebox.showwarning(t("extract.encrypted_title"), str(e))
                else:
                    messagebox.showerror(t("app.error"), t("extract.file_read_error", error=e))
        self.lift()

    def validate_inputs(self, *args):
        raw_text = self.entry_var.get()
        allowed = "0123456789,- "
        filtered_text = "".join(c for c in raw_text if c in allowed)
        if raw_text != filtered_text:
            self.entry_var.set(filtered_text)
            return

        input_text = filtered_text.replace(" ", "").strip()
        self.lbl_warning.configure(text="")

        if not self.selected_file or not input_text:
            self.btn_run.configure(state="disabled", fg_color=self.ui["panel_alt"])
            return

        pages, err = _parse_pages_selection(input_text)
        if err == "format":
            self.lbl_warning.configure(text=t("extract.invalid_format"))
            self.btn_run.configure(state="disabled", fg_color=self.ui["panel_alt"])
            self.ent_page.configure(border_color=self.ui["danger"])
            return
        if err == "empty" or not pages:
            self.btn_run.configure(state="disabled", fg_color=self.ui["panel_alt"])
            return

        for p_num in pages:
            if p_num < 1 or p_num > self.total_pages:
                self.lbl_warning.configure(text=t("extract.invalid_page", total=self.total_pages))
                self.btn_run.configure(state="disabled", fg_color=self.ui["panel_alt"])
                self.ent_page.configure(border_color=self.ui["danger"])
                return

        self.btn_run.configure(state="normal", fg_color=self.ui["accent"], text_color=self.ui["button_text"])
        self.ent_page.configure(border_color=self.ui["success"])

    def run_extract(self):
        try:
            pages_text = self.ent_page.get().replace(" ", "").strip()
            pages_list, err = _parse_pages_selection(pages_text)
            if err or not pages_list:
                messagebox.showwarning(t("app.warning"), t("extract.invalid_format"))
                return
            for p in pages_list:
                if p < 1 or p > self.total_pages:
                    messagebox.showwarning(t("app.warning"), t("extract.invalid_page", total=self.total_pages))
                    return
            save_mode = self.segment_mode.get()

            if save_mode == t("extract.mode_single"):
                save_path = filedialog.asksaveasfilename(parent=self, title=t("extract.save_title"), defaultextension=".pdf",
                                                         filetypes=[("PDF", "*.pdf")])
                if save_path:
                    if self.access_controller:
                        self.access_controller.authorize_operation("split", [self.selected_file])
                    # Eğer engine'de extract_and_merge_pages varsa onu çağır, yoksa extract_pages kullan
                    if hasattr(self.pdf_engine, 'extract_and_merge_pages'):
                        self.pdf_engine.extract_and_merge_pages(self.selected_file, save_path, pages_list)
                    else:
                        # extract_pages, verilen sayfaları tek bir PDF olarak kaydeder
                        self.pdf_engine.extract_pages(
                            self.selected_file,
                            pages_list,
                            save_path,
                            password=self.selected_password,
                        )
                    self.destroy()
                    self.success_dialog(self.master, save_path, self.ortalama_func)
            else:
                folder_path = filedialog.askdirectory(parent=self, title=t("extract.folder_title"))
                if folder_path:
                    if self.access_controller:
                        self.access_controller.authorize_operation("split", [self.selected_file])
                    if hasattr(self.pdf_engine, 'extract_and_save_separate_pages'):
                        self.pdf_engine.extract_and_save_separate_pages(self.selected_file, folder_path, pages_list)
                    else:
                        # extract_pages_separate döndürülen dosya yollarını verir
                        self.pdf_engine.extract_pages_separate(
                            self.selected_file,
                            pages_list,
                            folder_path,
                            password=self.selected_password,
                        )
                    self.destroy()
                    self.success_dialog(self.master, os.path.abspath(folder_path), self.ortalama_func)
        except Exception as e:
            messagebox.showerror(t("app.error"), str(e))
