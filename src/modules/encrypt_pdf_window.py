import customtkinter as ctk
from tkinter import filedialog, messagebox
import os
import threading
from queue import Queue, Empty

from modules.i18n import t
from modules.progress_dialog import ProgressDialog
from modules.pdf_password_dialog import PdfPasswordDialog
from modules.ui_theme import badge_colors, theme


class EncryptPdfWindow(ctk.CTkToplevel):
    """PDF şifreleme (açmak için kullanıcı parolası)."""

    def __init__(self, master, ortalama_func, engine, success_dialog_class, access_controller=None):
        super().__init__(master)
        self.ui = theme()
        self.ortalama_func = ortalama_func
        self.pdf_engine = engine
        self.success_dialog = success_dialog_class
        self.access_controller = access_controller
        self.selected_file = None
        self.selected_password = None
        self.selected_is_encrypted = False

        self.title(t("encrypt.window_title"))
        self.ortalama_func(self, 620, 700)
        self.grab_set()
        self.configure(fg_color=self.ui["bg"])

        header_frame = ctk.CTkFrame(self, fg_color=self.ui["accent"], height=60, corner_radius=0)
        header_frame.pack(fill="x", side="top")
        ctk.CTkLabel(
            header_frame,
            text=t("encrypt.header"),
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
        self.content_frame.pack(pady=20, padx=20, fill="both", expand=True)

        self.show_empty_state()

        pwd_frame = ctk.CTkFrame(self.main_card, fg_color="transparent")
        pwd_frame.pack(fill="x", padx=24, pady=(0, 8))

        ctk.CTkLabel(pwd_frame, text=t("encrypt.open_password"), font=self.ui["subtitle_font"], text_color=self.ui["text"]).pack(anchor="w")
        self.entry_user = ctk.CTkEntry(
            pwd_frame,
            placeholder_text=t("encrypt.password_placeholder"),
            show="*",
            width=400,
            fg_color=self.ui["panel_alt"],
            border_color=self.ui["border"],
            text_color=self.ui["text"],
        )
        self.entry_user.pack(fill="x", pady=(4, 12))
        ctk.CTkLabel(
            pwd_frame,
            text=t("encrypt.password_detail"),
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
            justify="left",
            wraplength=500,
        ).pack(anchor="w", pady=(0, 10))

        self.btn_run = ctk.CTkButton(
            self,
            text=t("encrypt.run"),
            font=("Segoe UI Semibold", 16, "bold"),
            height=50,
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            text_color=self.ui["button_text"],
            state="disabled",
            command=self.run_encrypt,
        )
        self.btn_run.pack(pady=(0, 20), padx=30, fill="x")

    def show_empty_state(self):
        for widget in self.content_frame.winfo_children():
            widget.destroy()

        ctk.CTkLabel(self.content_frame, text="◇", font=("Segoe UI Symbol", 48)).pack()
        ctk.CTkLabel(
            self.content_frame,
            text=t("encrypt.empty"),
            font=("Segoe UI Semibold", 14, "bold"),
            text_color=self.ui["muted"],
        ).pack(pady=10)

        ctk.CTkButton(
            self.content_frame,
            text=t("app.select_file"),
            width=120,
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            command=self.select_file,
        ).pack(pady=10)

    def select_file(self):
        file = filedialog.askopenfilename(parent=self, filetypes=[("PDF", "*.pdf")])
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
                    )
                    self.wait_window(dialog)
                    if dialog.action == "skip" or not dialog.result:
                        self.lift()
                        return
                    password = dialog.result
                self.selected_file = file
                self.selected_password = password
                self.selected_is_encrypted = is_encrypted
                self.update_ui()
            except Exception as e:
                messagebox.showerror(t("app.error"), str(e))
        self.lift()

    def update_ui(self):
        for widget in self.content_frame.winfo_children():
            widget.destroy()

        fname = os.path.basename(self.selected_file)
        f_box = ctk.CTkFrame(
            self.content_frame,
            fg_color=self.ui["panel_alt"],
            corner_radius=10,
            border_width=1,
            border_color=self.ui["border"],
        )
        f_box.pack(pady=12, padx=10, fill="x")

        ctk.CTkLabel(f_box, text=t("app.selected_file"), font=self.ui["small_font"], text_color=self.ui["accent"]).pack(pady=(12, 0))
        ctk.CTkLabel(f_box, text=fname, font=("Segoe UI Semibold", 13, "bold"), text_color=self.ui["text"]).pack(pady=10)
        if self.selected_is_encrypted:
            badge = badge_colors("warning")
            ctk.CTkLabel(
                f_box,
                text=t("encrypt.source_verified"),
                font=self.ui["badge_font"],
                text_color=badge["text"],
                fg_color=badge["fg"],
                corner_radius=8,
            ).pack(pady=(0, 8))

        ctk.CTkButton(
            f_box,
            text=t("app.change"),
            width=90,
            height=28,
            fg_color=self.ui["panel_soft"],
            hover_color=self.ui["border"],
            text_color=self.ui["text"],
            command=self.select_file,
        ).pack(pady=(0, 10))

        self.btn_run.configure(state="normal")

    def run_encrypt(self):
        user_pwd = (self.entry_user.get() or "").strip()
        if not user_pwd:
            messagebox.showwarning(t("app.warning"), t("encrypt.missing_password"))
            return

        owner_pwd = None

        save_path = filedialog.asksaveasfilename(
            parent=self,
            title=t("encrypt.save_title"),
            defaultextension=".pdf",
            filetypes=[("PDF", "*.pdf")],
        )
        if not save_path:
            return

        self.btn_run.configure(state="disabled", fg_color=self.ui["panel_alt"])
        q = Queue()
        finished = {"value": False}

        progress_dialog = ProgressDialog(self, self.ortalama_func, total_count=2, title=t("encrypt.progress_title"))
        progress_dialog.update_progress(0, 2, t("progress.starting"))

        def progress_cb(current: int, total: int, where_text: str):
            q.put(("progress", current, total, where_text))
            return True

        def worker():
            try:
                if self.access_controller:
                    self.access_controller.authorize_operation("encrypt", [self.selected_file])
                self.pdf_engine.encrypt_pdf(
                    self.selected_file,
                    save_path,
                    user_password=user_pwd,
                    owner_password=owner_pwd,
                    progress_callback=progress_cb,
                    input_password=self.selected_password,
                )
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
                        messagebox.showerror(t("app.error"), str(msg[1]))
                        self.btn_run.configure(state="normal", fg_color=self.ui["accent"])
                        return
            except Empty:
                pass

            if not finished["value"]:
                self.after(100, poll)

        self.after(100, poll)
