import customtkinter as ctk
from tkinter import filedialog, messagebox
import os
import threading
from queue import Queue, Empty

from modules.i18n import t
from modules.pdf_tool_ui import build_drop_zone, build_file_card, build_tool_header
from modules.progress_dialog import ProgressDialog
from modules.ui_theme import theme


class WordToPdfWindow(ctk.CTkToplevel):
    """WORD -> PDF: .docx/.doc seçilir, PDF kaydedilir (Microsoft Word + docx2pdf)."""

    _WORD_EXT = {".doc", ".docx"}

    def __init__(self, master, ortalama_func, engine, success_dialog_class, access_controller=None):
        super().__init__(master)
        self.ui = theme()
        self.ortalama_func = ortalama_func
        self.pdf_engine = engine
        self.success_dialog = success_dialog_class
        self.access_controller = access_controller
        self.selected_file = None

        self.title(t("word_to_pdf.window_title"))
        self.ortalama_func(self, 620, 580)
        self.grab_set()
        self.configure(fg_color=self.ui["bg"])

        build_tool_header(self, t("word_to_pdf.header"))

        self.main_card = ctk.CTkFrame(
            self,
            fg_color=self.ui["panel"],
            corner_radius=16,
            border_width=1,
            border_color=self.ui["border"],
        )
        self.main_card.pack(pady=15, padx=30, fill="both", expand=True)

        self.content_frame = ctk.CTkFrame(self.main_card, fg_color="transparent")
        self.content_frame.pack(pady=24, padx=20, fill="both", expand=True)

        self.show_empty_state()

        self.btn_convert = ctk.CTkButton(
            self,
            text=t("word_to_pdf.run"),
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
            extensions=self._WORD_EXT,
        )
        drop.pack(fill="both", expand=True)

    def ingest_paths(self, paths: list[str]) -> None:
        if not paths:
            return
        path = paths[0]
        self.selected_file = path
        self.update_ui()
        self.lift()

    def select_file(self):
        file = filedialog.askopenfilename(
            parent=self,
            filetypes=[
                ("Word Documents", "*.docx *.doc"),
                ("Word (.docx)", "*.docx"),
                ("Word (.doc)", "*.doc"),
            ],
        )
        if file:
            self.ingest_paths([file])
        else:
            self.lift()

    def update_ui(self):
        for widget in self.content_frame.winfo_children():
            widget.destroy()

        build_file_card(
            self.content_frame,
            self.selected_file,
            badge_text=t("word_to_pdf.word_file"),
            on_change=self.select_file,
        )

        self.btn_convert.configure(state="normal")

    def run_conversion(self):
        save_path = filedialog.asksaveasfilename(
            parent=self,
            title=t("word_to_pdf.save_title"),
            defaultextension=".pdf",
            filetypes=[("PDF", "*.pdf")],
        )
        if save_path:
            self.btn_convert.configure(state="disabled", fg_color=self.ui["panel_alt"])
            q = Queue()
            finished = {"value": False}

            progress_dialog = ProgressDialog(self, self.ortalama_func, total_count=2, title=t("word_to_pdf.progress_title"))
            progress_dialog.update_progress(0, 2, t("progress.starting"))

            def progress_cb(current: int, total: int, where_text: str):
                q.put(("progress", current, total, where_text))
                return True

            def worker():
                try:
                    if self.access_controller:
                        self.access_controller.authorize_operation("word-to-pdf", [self.selected_file])
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
                            messagebox.showerror(t("app.error"), str(msg[1]))
                            self.btn_convert.configure(state="normal", fg_color=self.ui["accent"])
                            return
                except Empty:
                    pass

                if not finished["value"]:
                    self.after(100, poll)

            self.after(100, poll)
