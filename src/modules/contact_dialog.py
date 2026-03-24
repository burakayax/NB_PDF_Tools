"""Masaüstü iletişim penceresi; gönderimi SaaS API POST /contact uç noktasına yönlendirir.
Yerel doğrulama ve ağ hatalarını kullanıcıya i18n metinleriyle göstermek için ayrı katmandır.
Uç nokta veya istek gövdesi değişirse backend sözleşmesiyle uyum için bu modül güncellenmelidir."""

from __future__ import annotations

import re
import threading
from queue import Empty, Queue
from tkinter import messagebox

import customtkinter as ctk

from modules.desktop_auth import DesktopAuthClient, DesktopAuthError, DesktopNetworkError
from modules.i18n import t
from modules.ui_theme import theme


class ContactDialog(ctk.CTkToplevel):
    def __init__(self, master, ortalama_func, auth_client: DesktopAuthClient):
        super().__init__(master)
        self.ui = theme()
        self.ortalama_func = ortalama_func
        self.auth_client = auth_client
        self._queue: Queue = Queue()
        self._closed = False

        self.title(t("contact.window_title"))
        self.ortalama_func(self, 480, 520)
        self.grab_set()
        self.configure(fg_color=self.ui["bg"])
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        header = ctk.CTkFrame(self, fg_color=self.ui["accent"], height=52, corner_radius=0)
        header.pack(fill="x", side="top")
        ctk.CTkLabel(
            header,
            text=t("contact.header"),
            font=self.ui["title_font"],
            text_color="white",
        ).pack(side="left", padx=18, pady=10)

        body = ctk.CTkFrame(
            self,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=18,
        )
        body.pack(fill="both", expand=True, padx=22, pady=16)

        ctk.CTkLabel(
            body,
            text=t("contact.description"),
            font=self.ui["body_font"],
            text_color=self.ui["muted"],
            wraplength=400,
            justify="left",
        ).pack(anchor="w", padx=18, pady=(16, 12))

        self.status_label = ctk.CTkLabel(body, text="", font=self.ui["small_font"], text_color=self.ui["danger"])
        self.status_label.pack(anchor="w", padx=18, pady=(0, 8))

        ctk.CTkLabel(body, text=t("contact.name"), font=self.ui["subtitle_font"], text_color=self.ui["text"]).pack(
            anchor="w", padx=18
        )
        self.entry_name = ctk.CTkEntry(
            body,
            fg_color=self.ui["panel_alt"],
            border_color=self.ui["border"],
            text_color=self.ui["text"],
        )
        self.entry_name.pack(fill="x", padx=18, pady=(4, 12))

        ctk.CTkLabel(body, text=t("contact.email"), font=self.ui["subtitle_font"], text_color=self.ui["text"]).pack(
            anchor="w", padx=18
        )
        self.entry_email = ctk.CTkEntry(
            body,
            fg_color=self.ui["panel_alt"],
            border_color=self.ui["border"],
            text_color=self.ui["text"],
        )
        self.entry_email.pack(fill="x", padx=18, pady=(4, 12))

        ctk.CTkLabel(body, text=t("contact.message"), font=self.ui["subtitle_font"], text_color=self.ui["text"]).pack(
            anchor="w", padx=18
        )
        self.entry_message = ctk.CTkTextbox(
            body,
            height=120,
            fg_color=self.ui["panel_alt"],
            border_color=self.ui["border"],
            border_width=1,
            text_color=self.ui["text"],
        )
        self.entry_message.pack(fill="both", expand=True, padx=18, pady=(4, 16))

        btn_row = ctk.CTkFrame(body, fg_color="transparent")
        btn_row.pack(fill="x", padx=18, pady=(0, 18))
        btn_row.grid_columnconfigure(0, weight=1)

        self.btn_submit = ctk.CTkButton(
            btn_row,
            text=t("contact.submit"),
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            command=self._submit_clicked,
        )
        self.btn_submit.grid(row=0, column=0, sticky="ew", padx=(0, 8))

        ctk.CTkButton(
            btn_row,
            text=t("contact.close"),
            width=100,
            fg_color=self.ui["panel_alt"],
            hover_color=self.ui["border"],
            command=self._on_close,
        ).grid(row=0, column=1)

        self.after(100, self._process_queue_loop)

    def _on_close(self):
        self._closed = True
        self.destroy()

    def _set_status(self, text: str):
        self.status_label.configure(text=text or "")

    def _validate(self) -> bool:
        name = (self.entry_name.get() or "").strip()
        email = (self.entry_email.get() or "").strip()
        message = (self.entry_message.get("1.0", "end") or "").strip()

        if len(name) < 2:
            self._set_status(t("contact.validation_name"))
            return False
        if not email:
            self._set_status(t("contact.validation_email_required"))
            return False
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
            self._set_status(t("contact.validation_email"))
            return False
        if len(message) < 10:
            self._set_status(t("contact.validation_message"))
            return False
        self._set_status("")
        return True

    def _submit_clicked(self):
        if not self._validate():
            return
        name = (self.entry_name.get() or "").strip()
        email = (self.entry_email.get() or "").strip()
        message = (self.entry_message.get("1.0", "end") or "").strip()

        self.btn_submit.configure(state="disabled", text=t("contact.submitting"))

        def worker():
            try:
                result = self.auth_client.submit_contact(name, email, message)
                self._queue.put(("ok", result))
            except DesktopNetworkError as e:
                self._queue.put(("err", str(e)))
            except DesktopAuthError as e:
                self._queue.put(("err", str(e)))
            except Exception as e:
                self._queue.put(("err", str(e)))

        threading.Thread(target=worker, daemon=True).start()

    def _process_queue_loop(self):
        if self._closed:
            return
        try:
            while True:
                item = self._queue.get_nowait()
                self._handle_queue_item(item)
        except Empty:
            pass
        self.after(120, self._process_queue_loop)

    def _handle_queue_item(self, item):
        kind = item[0]
        if kind == "ok":
            _, result = item
            msg = ""
            if isinstance(result, dict):
                msg = str(result.get("message") or "").strip()
            if not msg:
                msg = t("contact.success_body")
            self.btn_submit.configure(state="normal", text=t("contact.submit"))
            messagebox.showinfo(t("contact.success_title"), msg)
            self._on_close()
        elif kind == "err":
            self.btn_submit.configure(state="normal", text=t("contact.submit"))
            messagebox.showerror(t("contact.error_title"), item[1])
