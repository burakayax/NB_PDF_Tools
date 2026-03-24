import customtkinter as ctk
from tkinter import filedialog, messagebox
import os
import threading
from queue import Queue, Empty

from modules.i18n import t
from modules.progress_dialog import ProgressDialog
from modules.ui_theme import badge_colors, theme


class ExcelToPdfWindow(ctk.CTkToplevel):
    """EXCEL -> PDF: .xlsx/.xlsm vb. (Windows'ta Excel ile, yoksa reportlab yedek)."""

    def __init__(self, master, ortalama_func, engine, success_dialog_class, access_controller=None):
        super().__init__(master)
        self.ui = theme()
        self.ortalama_func = ortalama_func
        self.pdf_engine = engine
        self.success_dialog = success_dialog_class
        self.access_controller = access_controller
        self.selected_file = None

        self.title(t("excel_to_pdf.window_title"))
        self.ortalama_func(self, 600, 540)
        self.grab_set()
        self.configure(fg_color=self.ui["bg"])

        header_frame = ctk.CTkFrame(self, fg_color=self.ui["accent"], height=60, corner_radius=0)
        header_frame.pack(fill="x", side="top")
        ctk.CTkLabel(
            header_frame,
            text=t("excel_to_pdf.header"),
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
            text=t("excel_to_pdf.supported"),
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
        ).pack(pady=(12, 4), padx=20)

        self.content_frame = ctk.CTkFrame(self.main_card, fg_color="transparent")
        self.content_frame.pack(pady=10, padx=20, fill="both", expand=True)

        self.show_empty_state()

        self.btn_convert = ctk.CTkButton(
            self,
            text=t("excel_to_pdf.run"),
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
            text=t("excel_to_pdf.empty"),
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
        file = filedialog.askopenfilename(
            parent=self,
            filetypes=[
                ("Excel", "*.xlsx *.xlsm *.xltx *.xltm"),
                ("Excel (.xlsx)", "*.xlsx"),
                ("Excel Macro (.xlsm)", "*.xlsm"),
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

        ctk.CTkLabel(f_box, text=t("app.selected_file"), font=("Segoe UI", 11), text_color=self.ui["accent"]).pack(pady=(10, 0))
        ctk.CTkLabel(f_box, text=fname, font=("Segoe UI Semibold", 13, "bold"), text_color=self.ui["text"]).pack(pady=10)

        badge = badge_colors("neutral")
        ctk.CTkLabel(
            f_box,
            text=t("excel_to_pdf.excel_file"),
            font=self.ui["badge_font"],
            text_color=badge["text"],
            fg_color=badge["fg"],
            corner_radius=8,
        ).pack(pady=(0, 8))

        ctk.CTkButton(
            f_box,
            text=t("app.change"),
            width=80,
            height=25,
            fg_color=self.ui["panel_soft"],
            hover_color=self.ui["border"],
            text_color=self.ui["text"],
            command=self.select_file,
        ).pack(pady=(0, 10))

        self.btn_convert.configure(state="normal")

    def run_conversion(self):
        save_path = filedialog.asksaveasfilename(
            parent=self,
            title=t("excel_to_pdf.save_title"),
            defaultextension=".pdf",
            filetypes=[("PDF", "*.pdf")],
        )
        if not save_path:
            return

        self.btn_convert.configure(state="disabled", fg_color=self.ui["panel_alt"])
        q = Queue()
        finished = {"value": False}

        progress_dialog = ProgressDialog(self, self.ortalama_func, total_count=2, title=t("excel_to_pdf.progress_title"))
        progress_dialog.update_progress(0, 2, t("progress.starting"))

        def progress_cb(current: int, total: int, where_text: str):
            q.put(("progress", current, total, where_text))
            return True

        def worker():
            try:
                if self.access_controller:
                    self.access_controller.authorize_operation("excel-to-pdf", [self.selected_file])
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
                        messagebox.showerror(t("app.error"), str(msg[1]))
                        self.btn_convert.configure(state="normal", fg_color=self.ui["accent"])
                        return
            except Empty:
                pass

            if not finished["value"]:
                self.after(100, poll)

        self.after(100, poll)
