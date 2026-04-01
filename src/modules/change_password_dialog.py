"""Web ile aynı POST /api/auth/change-password akışı — masaüstü formu."""

from __future__ import annotations

import threading
import tkinter.messagebox as messagebox

import customtkinter as ctk

from modules.desktop_auth import DesktopAuthClient, DesktopAuthError, DesktopNetworkError
from modules.i18n import t
from modules.ui_theme import theme


class ChangePasswordDialog(ctk.CTkToplevel):
    def __init__(self, master, center_fn, auth_client: DesktopAuthClient, access_token: str):
        super().__init__(master)
        self.ui = theme()
        self.auth_client = auth_client
        self.access_token = access_token

        self.title(t("change_password.title"))
        self.configure(fg_color=self.ui["bg"])
        self.resizable(False, False)
        self.grab_set()
        center_fn(self, 440, 420)

        body = ctk.CTkFrame(
            self,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=16,
        )
        body.pack(fill="both", expand=True, padx=20, pady=20)

        ctk.CTkLabel(
            body,
            text=t("change_password.headline"),
            font=self.ui["title_font"],
            text_color=self.ui["text"],
        ).pack(anchor="w", padx=22, pady=(20, 8))
        ctk.CTkLabel(
            body,
            text=t("change_password.hint"),
            font=self.ui["small_font"],
            text_color=self.ui["muted"],
            wraplength=380,
            justify="left",
        ).pack(anchor="w", padx=22, pady=(0, 16))

        entry_bg = self.ui.get("input_bg", self.ui["panel"])
        entry_border = self.ui.get("input_border", self.ui["border"])

        def field(label_key: str, show: str | None = None):
            ctk.CTkLabel(body, text=t(label_key), font=self.ui["subtitle_font"], text_color=self.ui["text"]).pack(
                anchor="w", padx=22, pady=(8, 4)
            )
            e = ctk.CTkEntry(
                body,
                height=44,
                corner_radius=10,
                border_width=1,
                fg_color=entry_bg,
                border_color=entry_border,
                text_color=self.ui["text"],
                show=show,
            )
            e.pack(fill="x", padx=22)
            return e

        self._current = field("change_password.current")
        self._new = field("change_password.new", show="*")
        self._confirm = field("change_password.confirm", show="*")

        self._status = ctk.CTkLabel(body, text="", font=self.ui["small_font"], text_color=self.ui["danger"])
        self._status.pack(anchor="w", padx=22, pady=(12, 8))

        row = ctk.CTkFrame(body, fg_color="transparent")
        row.pack(fill="x", padx=22, pady=(8, 22))

        ctk.CTkButton(
            row,
            text=t("app.cancel"),
            fg_color=self.ui["panel_soft"],
            hover_color=self.ui["border"],
            text_color=self.ui["text"],
            width=120,
            command=self.destroy,
        ).pack(side="right", padx=(8, 0))

        self._save_btn = ctk.CTkButton(
            row,
            text=t("change_password.save"),
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            text_color=self.ui["button_text"],
            width=160,
            command=self._submit,
        )
        self._save_btn.pack(side="right")

    def _submit(self) -> None:
        cur = (self._current.get() or "").strip()
        new = (self._new.get() or "").strip()
        conf = (self._confirm.get() or "").strip()
        if not cur or not new:
            self._status.configure(text=t("change_password.fill_all"))
            return
        if new != conf:
            self._status.configure(text=t("change_password.mismatch"))
            return
        self._status.configure(text="")
        self._save_btn.configure(state="disabled")

        def worker():
            try:
                self.auth_client.change_password(self.access_token, cur, new)
                self.after(0, self._ok)
            except (DesktopAuthError, DesktopNetworkError) as e:
                self.after(0, lambda: self._fail(str(e)))
            except Exception as e:
                self.after(0, lambda: self._fail(str(e)))

        threading.Thread(target=worker, daemon=True).start()

    def _ok(self) -> None:
        messagebox.showinfo(t("change_password.title"), t("change_password.success"), parent=self)
        self.destroy()

    def _fail(self, msg: str) -> None:
        self._save_btn.configure(state="normal")
        self._status.configure(text=msg[:280])
