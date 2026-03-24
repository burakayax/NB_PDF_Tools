"""
Uygulama içi destek sohbeti. Backend (Meta WhatsApp Cloud API ön yüzü) ile HTTP üzerinden konuşur.
"""

from __future__ import annotations

import platform
import threading
import uuid
from queue import Empty, Queue
from tkinter import messagebox

import customtkinter as ctk

from modules.i18n import t
from modules.support_api_client import SupportApiClient, SupportApiError
from modules.support_config import load_support_config
from modules.ui_theme import theme


def _normalize_role(raw: object) -> str:
    r = str(raw or "").lower().strip()
    if r in ("user", "customer", "client"):
        return "user"
    if r in ("assistant", "bot", "agent", "operator"):
        return "assistant"
    if r in ("system",):
        return "system"
    return "assistant"


def _message_key(m: dict) -> str:
    mid = m.get("id") or m.get("message_id")
    if mid is not None:
        return str(mid)
    return str(
        hash(
            (
                m.get("role"),
                m.get("text") or m.get("body") or m.get("content"),
                m.get("created_at") or m.get("ts") or m.get("timestamp"),
            )
        )
    )


def _message_text(m: dict) -> str:
    return str(m.get("text") or m.get("body") or m.get("content") or "").strip()


class FeedbackDialog(ctk.CTkToplevel):
    """Destek sohbeti penceresi (sınıf adı geriye dönük uyumluluk için korunur)."""

    def __init__(self, master, ortalama_func):
        super().__init__(master)
        self.ui = theme()
        self.ortalama_func = ortalama_func

        self._queue: Queue = Queue()
        self._closed = False
        self._session_id: str | None = None
        self._cfg: dict = {}
        self._seen_keys: set[str] = set()
        self._since: str | None = None
        self._handoff_done = False
        self._poll_after_id = None
        self._poll_ms = 2500

        self.title(t("feedback.window_title"))
        self.ortalama_func(self, 660, 620)
        self.grab_set()
        self.configure(fg_color=self.ui["bg"])
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        header = ctk.CTkFrame(self, fg_color=self.ui["accent"], height=58, corner_radius=0)
        header.pack(fill="x", side="top")
        ctk.CTkLabel(
            header,
            text=t("feedback.header"),
            font=self.ui["title_font"],
            text_color="white",
        ).pack(side="left", padx=18, pady=12)

        self.status_label = ctk.CTkLabel(
            header,
            text="",
            font=self.ui["small_font"],
            text_color="white",
        )
        self.status_label.pack(side="right", padx=18)

        self.body = ctk.CTkFrame(
            self,
            fg_color=self.ui["panel"],
            border_width=1,
            border_color=self.ui["border"],
            corner_radius=18,
        )
        self.body.pack(fill="both", expand=True, padx=22, pady=16)

        self.info_frame = ctk.CTkFrame(self.body, fg_color="transparent")
        self.chat_frame = ctk.CTkFrame(self.body, fg_color="transparent")

        self._build_info_placeholder()
        self._build_chat_ui()

        self.info_frame.pack(fill="both", expand=True)
        self.chat_frame.pack_forget()

        self.after(100, self._process_queue_loop)
        self.after(50, self._bootstrap_session)

    def _build_info_placeholder(self):
        for w in self.info_frame.winfo_children():
            w.destroy()
        ctk.CTkLabel(
            self.info_frame,
            text=t("feedback.connecting"),
            font=self.ui["body_font"],
            text_color=self.ui["muted"],
            wraplength=560,
        ).pack(pady=40, padx=24)

    def _show_config_help(self):
        for w in self.info_frame.winfo_children():
            w.destroy()
        root_hint = (
            "1) Proje köküne veya uygulamanın çalışma dizinine `support_config.json` koyun.\n"
            "2) `support_config.example.json` dosyasını kopyalayıp doldurun.\n"
            "3) İsteğe bağlı: NB_SUPPORT_API_BASE_URL ve NB_SUPPORT_API_KEY ortam değişkenleri.\n\n"
            "Backend uçları: POST /sessions, POST /sessions/{id}/messages,\n"
            "GET /sessions/{id}/messages, POST /sessions/{id}/handoff"
        )
        ctk.CTkLabel(
            self.info_frame,
            text=t("feedback.config_missing"),
            font=self.ui["subtitle_font"],
            text_color=self.ui["text"],
        ).pack(anchor="w", padx=22, pady=(24, 8))
        ctk.CTkLabel(
            self.info_frame,
            text=root_hint,
            font=self.ui["body_font"],
            text_color=self.ui["muted"],
            wraplength=560,
            justify="left",
        ).pack(anchor="w", padx=22, pady=(0, 16))
        ctk.CTkButton(
            self.info_frame,
            text=t("feedback.close"),
            width=120,
            fg_color=self.ui["panel_alt"],
            hover_color=self.ui["border"],
            command=self._on_close,
        ).pack(pady=(0, 24))

    def _show_connection_error(self, msg: str):
        for w in self.info_frame.winfo_children():
            w.destroy()
        ctk.CTkLabel(
            self.info_frame,
            text=t("feedback.connection_failed"),
            font=self.ui["subtitle_font"],
            text_color=self.ui["danger"],
        ).pack(anchor="w", padx=22, pady=(24, 8))
        ctk.CTkLabel(
            self.info_frame,
            text=str(msg),
            font=self.ui["body_font"],
            text_color=self.ui["muted"],
            wraplength=560,
            justify="left",
        ).pack(anchor="w", padx=22, pady=(0, 16))
        ctk.CTkButton(
            self.info_frame,
            text=t("feedback.retry"),
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            command=self._retry_bootstrap,
        ).pack(pady=(0, 8))
        ctk.CTkButton(
            self.info_frame,
            text=t("feedback.close"),
            width=120,
            fg_color=self.ui["panel_alt"],
            hover_color=self.ui["border"],
            command=self._on_close,
        ).pack(pady=(0, 24))

    def _retry_bootstrap(self):
        self.info_frame.pack(fill="both", expand=True)
        self.chat_frame.pack_forget()
        self._build_info_placeholder()
        self._session_id = None
        self._seen_keys.clear()
        self._since = None
        self._handoff_done = False
        self.after(50, self._bootstrap_session)

    def _build_chat_ui(self):
        self.scroll = ctk.CTkScrollableFrame(
            self.chat_frame,
            fg_color=self.ui["panel_alt"],
            corner_radius=12,
            border_width=1,
            border_color=self.ui["border"],
        )
        self.scroll.pack(fill="both", expand=True, padx=16, pady=(16, 8))

        self.handoff_banner = ctk.CTkLabel(
            self.chat_frame,
            text="",
            font=self.ui["small_font"],
            text_color=self.ui["warning"],
            fg_color=self.ui["panel"],
            corner_radius=8,
        )

        input_row = ctk.CTkFrame(self.chat_frame, fg_color="transparent")
        input_row.pack(fill="x", padx=16, pady=(0, 12))
        input_row.grid_columnconfigure(0, weight=1)

        self.entry = ctk.CTkEntry(
            input_row,
            placeholder_text=t("feedback.message_placeholder"),
            fg_color=self.ui["panel_alt"],
            border_color=self.ui["border"],
            text_color=self.ui["text"],
        )
        self.entry.grid(row=0, column=0, sticky="ew", padx=(0, 8))
        self.entry.bind("<Return>", lambda _e: self._send_clicked())

        self.btn_send = ctk.CTkButton(
            input_row,
            text=t("feedback.send"),
            width=88,
            fg_color=self.ui["accent"],
            hover_color=self.ui["accent_hover"],
            command=self._send_clicked,
        )
        self.btn_send.grid(row=0, column=1)

        btn_row = ctk.CTkFrame(self.chat_frame, fg_color="transparent")
        btn_row.pack(fill="x", padx=16, pady=(0, 16))
        btn_row.grid_columnconfigure((0, 1, 2), weight=1)

        self.btn_handoff = ctk.CTkButton(
            btn_row,
            text=t("feedback.handoff"),
            fg_color=self.ui["warning"],
            hover_color="#d69531",
            command=self._handoff_clicked,
        )
        self.btn_handoff.grid(row=0, column=0, padx=(0, 6), sticky="ew")

        ctk.CTkButton(
            btn_row,
            text=t("feedback.close"),
            fg_color=self.ui["panel_alt"],
            hover_color=self.ui["border"],
            command=self._on_close,
        ).grid(row=0, column=1, padx=6, sticky="ew")

    def _set_status(self, text: str):
        self.status_label.configure(text=text or "")

    def _on_close(self):
        self._closed = True
        if self._poll_after_id is not None:
            try:
                self.after_cancel(self._poll_after_id)
            except Exception:
                pass
            self._poll_after_id = None
        self.destroy()

    def _bootstrap_session(self):
        def worker():
            cfg = load_support_config()
            base = (cfg.get("api_base_url") or "").strip()
            if not base:
                self._queue.put(("config_missing",))
                return
            client = SupportApiClient(
                base,
                api_key=cfg.get("api_key"),
                path_prefix=str(cfg.get("api_path_prefix") or ""),
            )
            meta = {
                "client": "nb_pdf_tools_desktop",
                "platform": platform.platform(),
                "machine_id": str(uuid.getnode()),
            }
            try:
                sid = client.create_session(metadata=meta)
                self._queue.put(("session_ok", cfg, sid))
            except SupportApiError as e:
                self._queue.put(("session_err", str(e)))
            except Exception as e:
                self._queue.put(("session_err", str(e)))

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
        if kind == "config_missing":
            self._show_config_help()
            self._set_status("")
        elif kind == "session_err":
            self._show_connection_error(item[1])
            self._set_status("")
        elif kind == "session_ok":
            _, cfg, sid = item
            self._cfg = cfg
            self._session_id = sid
            self._poll_ms = float(cfg.get("poll_interval_seconds") or 2.5) * 1000
            self.info_frame.pack_forget()
            self.chat_frame.pack(fill="both", expand=True)
            self._set_status("Online")
            self._append_local_notice("Session started. You can type your question." if t("feedback.send") == "Send" else "Oturum açıldı. Sorunuzu yazabilirsiniz.")
            self._schedule_poll()
        elif kind == "messages":
            for m in item[1]:
                self._ingest_server_message(m)
        elif kind == "send_err":
            messagebox.showerror(t("feedback.send_error"), item[1])
        elif kind == "handoff_err":
            messagebox.showerror(t("feedback.support_error"), item[1])
        elif kind == "handoff_ok":
            self._handoff_done = True
            self.btn_handoff.configure(state="disabled")
            self.handoff_banner.configure(
                text=t("feedback.handoff_done")
            )
            self.handoff_banner.pack(fill="x", padx=16, pady=(0, 8))
            self._append_local_notice("Support request created." if t("feedback.send") == "Send" else "Destek talebi oluşturuldu.")
        elif kind == "poll_done":
            self._handle_poll_done()

    def _append_local_notice(self, text: str):
        self._add_bubble("system", text)

    def _add_bubble(self, role: str, text: str):
        row = ctk.CTkFrame(self.scroll, fg_color="transparent")
        row.pack(fill="x", pady=4, padx=4)

        align = "e" if role == "user" else "w"
        wrap = 340
        if role == "user":
            fg = self.ui["accent"]
            tc = self.ui["button_text"]
        elif role == "system":
            fg = self.ui["panel"]
            tc = self.ui["muted"]
        else:
            fg = self.ui["panel_alt"]
            tc = self.ui["text"]

        inner = ctk.CTkFrame(row, fg_color=fg, corner_radius=12, border_width=1, border_color=self.ui["border"])
        inner.pack(anchor=align, padx=8)

        ctk.CTkLabel(
            inner,
            text=f" {text.strip()} ",
            font=self.ui["body_font"],
            text_color=tc,
            wraplength=wrap,
            justify="left",
        ).pack(padx=10, pady=8)

        self.after(50, self._scroll_to_end)

    def _ingest_server_message(self, m: dict):
        key = _message_key(m)
        if key in self._seen_keys:
            return
        self._seen_keys.add(key)
        role = _normalize_role(m.get("role") or m.get("from"))
        text = _message_text(m)
        if not text:
            return
        ts = m.get("created_at") or m.get("ts") or m.get("timestamp")
        if isinstance(ts, str) and ts > (self._since or ""):
            self._since = ts
        self._add_bubble(role, text)

    def _schedule_poll(self):
        if self._closed or not self._session_id:
            return
        delay = int(self._poll_ms)
        self._poll_after_id = self.after(delay, self._poll_tick)

    def _poll_tick(self):
        self._poll_after_id = None
        if self._closed or not self._session_id:
            return
        sid = self._session_id
        cfg = self._cfg

        def worker():
            try:
                client = SupportApiClient(
                    str(cfg.get("api_base_url")),
                    api_key=cfg.get("api_key"),
                    path_prefix=str(cfg.get("api_path_prefix") or ""),
                )
                msgs = client.fetch_messages(sid, since=self._since)
                self._queue.put(("messages", msgs))
            except Exception:
                pass
            finally:
                if not self._closed:
                    self._queue.put(("poll_done",))

        threading.Thread(target=worker, daemon=True).start()

    def _handle_poll_done(self):
        self._schedule_poll()

    def _scroll_to_end(self):
        try:
            canvas = getattr(self.scroll, "_parent_canvas", None)
            if canvas is not None:
                canvas.yview_moveto(1.0)
        except Exception:
            pass

    def _send_clicked(self):
        text = (self.entry.get() or "").strip()
        if not text:
            return
        if not self._session_id:
            messagebox.showwarning(t("feedback.support_error"), t("feedback.session_not_ready"))
            return
        self.entry.delete(0, "end")
        self._add_bubble("user", text)
        sid = self._session_id
        cfg = self._cfg

        def worker():
            try:
                client = SupportApiClient(
                    str(cfg.get("api_base_url")),
                    api_key=cfg.get("api_key"),
                    path_prefix=str(cfg.get("api_path_prefix") or ""),
                )
                client.send_message(sid, text)
            except SupportApiError as e:
                self._queue.put(("send_err", str(e)))
            except Exception as e:
                self._queue.put(("send_err", str(e)))

        threading.Thread(target=worker, daemon=True).start()

    def _handoff_clicked(self):
        if not self._session_id:
            return
        if self._handoff_done:
            return
        sid = self._session_id
        cfg = self._cfg

        def worker():
            try:
                client = SupportApiClient(
                    str(cfg.get("api_base_url")),
                    api_key=cfg.get("api_key"),
                    path_prefix=str(cfg.get("api_path_prefix") or ""),
                )
                client.request_handoff(sid, reason="user_requested")
                self._queue.put(("handoff_ok",))
            except SupportApiError as e:
                self._queue.put(("handoff_err", str(e)))
            except Exception as e:
                self._queue.put(("handoff_err", str(e)))

        threading.Thread(target=worker, daemon=True).start()
