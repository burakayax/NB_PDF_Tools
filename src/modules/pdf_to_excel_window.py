import customtkinter as ctk
from tkinter import filedialog, messagebox
import os
import threading
from queue import Queue, Empty

from modules.i18n import t
from modules.pdf_password_dialog import PdfPasswordDialog
from modules.pdf_tool_ui import build_drop_zone, build_file_card, build_tool_header
from modules.progress_dialog import ProgressDialog
from modules.ui_theme import theme


class PdfToExcelWindow(ctk.CTkToplevel):
    """PDF -> Excel: tablo koruma modu her zaman aktiftir."""

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

        self.title(t("pdf_to_excel.window_title"))
        self.ortalama_func(self, 640, 640)
        self.grab_set()
        self.configure(fg_color=self.ui["bg"])

        build_tool_header(self, t("pdf_to_excel.header"), t("pdf_to_excel.mode_always"))

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
            text=t("pdf_to_excel.mode_detail"),
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
            justify="left",
            wraplength=520,
        ).pack(pady=(8, 4), padx=20)

        self.content_frame = ctk.CTkFrame(self.main_card, fg_color="transparent")
        self.content_frame.pack(pady=10, padx=20, fill="both", expand=True)

        self.show_empty_state()

        self.btn_convert = ctk.CTkButton(
            self,
            text=t("pdf_to_excel.run"),
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

        drop = build_drop_zone(
            self.content_frame,
            on_paths=lambda paths: self.ingest_paths(paths),
            on_browse=self.select_file,
            extensions={".pdf"},
        )
        drop.pack(fill="both", expand=True)

    def ingest_paths(self, paths: list[str]) -> None:
        if not paths:
            return
        path = paths[0]
        try:
            password = None
            is_encrypted = False
            if hasattr(self.pdf_engine, "is_pdf_encrypted"):
                is_encrypted = self.pdf_engine.is_pdf_encrypted(path)
            if is_encrypted:

                def validate_password(value):
                    try:
                        if hasattr(self.pdf_engine, "validate_pdf_password") and self.pdf_engine.validate_pdf_password(path, value):
                            return True
                        return t("pdf_password.invalid_password")
                    except Exception as e:
                        return str(e)

                dialog = PdfPasswordDialog(
                    self,
                    self.ortalama_func,
                    os.path.basename(path),
                    password_validator=validate_password,
                )
                self.wait_window(dialog)
                if dialog.action == "skip" or not dialog.result:
                    self.lift()
                    return
                password = dialog.result
            self.selected_file = path
            self.selected_password = password
            self.selected_is_encrypted = is_encrypted
            self.update_ui()
        except Exception as e:
            messagebox.showerror(t("app.error"), str(e))
        self.lift()

    def select_file(self):
        file = filedialog.askopenfilename(parent=self, filetypes=[("PDF", "*.pdf")])
        if file:
            self.ingest_paths([file])
        else:
            self.lift()

    def update_ui(self):
        for widget in self.content_frame.winfo_children():
            widget.destroy()

        badge = t("app.encrypted_badge") if self.selected_is_encrypted else None
        build_file_card(
            self.content_frame,
            self.selected_file,
            badge_text=badge,
            badge_warning=bool(self.selected_is_encrypted),
            on_change=self.select_file,
        )

        self.btn_convert.configure(state="normal")

    def run_conversion(self):
        save_path = filedialog.asksaveasfilename(
            parent=self,
            title=t("pdf_to_excel.save_title"),
            defaultextension=".xlsx",
            filetypes=[("Excel", "*.xlsx")],
        )
        if not save_path:
            return

        self.btn_convert.configure(state="disabled", fg_color=self.ui["panel_alt"])
        q = Queue()
        finished = {"value": False}

        progress_dialog = ProgressDialog(self, self.ortalama_func, total_count=3, title=t("pdf_to_excel.progress_title"))
        progress_dialog.update_progress(0, 3, t("progress.starting"))

        def progress_cb(current: int, total: int, where_text: str):
            q.put(("progress", current, total, where_text))
            return True

        def worker():
            try:
                if self.access_controller:
                    self.access_controller.authorize_operation("pdf-to-excel", [self.selected_file])
                self.pdf_engine.pdf_text_to_excel(
                    self.selected_file,
                    save_path,
                    progress_callback=progress_cb,
                    preserve_tables=True,
                    password=self.selected_password,
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
                        self.btn_convert.configure(state="normal", fg_color=self.ui["accent"])
                        return
            except Empty:
                pass

            if not finished["value"]:
                self.after(100, poll)

        self.after(100, poll)
