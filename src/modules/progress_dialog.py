import customtkinter as ctk
import time

from modules.i18n import t
from modules.ui_theme import theme


def _format_seconds(seconds: float) -> str:
    seconds = max(0, int(seconds))
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h:d}:{m:02d}:{s:02d}"
    return f"{m:d}:{s:02d}"


class ProgressDialog(ctk.CTkToplevel):
    """
    Modern ilerleme ekranı:
    - yüzde ilerleme
    - mevcut dosya / sıra
    - tahmini kalan süre (ETA)

    Not: UI methodlari sadece ana thread'de cagrilmali.
    """

    def __init__(self, master, ortalama_func, total_count: int, title: str | None = None):
        super().__init__(master)
        ui = theme()

        self.ortalama_func = ortalama_func
        self.total_count = max(1, int(total_count))
        self.start_time = time.time()

        self.title(title or t("progress.default_title"))
        self.ortalama_func(self, 520, 320)
        self.grab_set()
        self.after(100, self.lift)
        self.configure(fg_color=ui["bg"])

        header = ctk.CTkFrame(self, fg_color=ui["panel"], height=58, corner_radius=0)
        header.pack(fill="x", side="top")
        ctk.CTkLabel(
            header,
            text=t("progress.header"),
            font=("Segoe UI Semibold", 17, "bold"),
            text_color=ui.get("accent_soft", ui["accent"]),
        ).pack(side="left", padx=20, pady=16)

        self.card = ctk.CTkFrame(self, fg_color=ui["panel"], corner_radius=18, border_width=1, border_color=ui["border"])
        self.card.pack(fill="both", expand=True, padx=18, pady=18)

        self.status_label = ctk.CTkLabel(
            self.card, text=t("progress.starting"), font=("Segoe UI Semibold", 16, "bold"), text_color=ui["text"], wraplength=480
        )
        self.status_label.pack(pady=(18, 6), padx=16)

        self.progress_bar = ctk.CTkProgressBar(
            self.card, width=460, height=18, corner_radius=10, progress_color=ui["success"], fg_color=ui["panel_alt"]
        )
        self.progress_bar.pack(pady=(6, 10))
        self.progress_bar.set(0.0)

        row = ctk.CTkFrame(self.card, fg_color="transparent")
        row.pack(fill="x", padx=16)

        self.percent_label = ctk.CTkLabel(row, text="%0", font=ui["subtitle_font"], text_color=ui["muted"])
        self.percent_label.pack(side="left")

        self.eta_label = ctk.CTkLabel(row, text=t("progress.remaining_unknown"), font=ui["subtitle_font"], text_color=ui["muted"])
        self.eta_label.pack(side="right")

        self.path_label = ctk.CTkLabel(
            self.card, text="", font=ui["body_font"], text_color=ui["muted"], wraplength=480
        )
        self.path_label.pack(pady=(6, 14), padx=16)

        self._last_eta = None
        self._current_total = self.total_count
        self._current_value = 0
        self._target_ratio = 0.0
        self._display_ratio = 0.0
        self._last_where_text = ""
        self._tick_after_id = None
        # Pencere widget'lari basildiktan sonra ilk render'i garanti edelim.
        self.update_idletasks()
        self.deiconify()
        self.lift()
        try:
            self.focus_force()
        except Exception:
            pass
        self._start_progress_loop()

    def update_progress(self, current: int, total: int, where_text: str = ""):
        current = int(current)
        total = max(1, int(total))

        self._current_value = current
        self._current_total = total
        self._target_ratio = min(1.0, max(0.0, current / total))
        if where_text:
            self._last_where_text = where_text
            self.path_label.configure(text=where_text)
        self.status_label.configure(text=t("progress.status", current=current, total=total))

    def _start_progress_loop(self):
        self._tick_animation()

    def _tick_animation(self):
        # Daha sık küçük adımlarla akıtınca çubuk takılmadan ilerliyormuş hissi verir.
        self._display_ratio += (self._target_ratio - self._display_ratio) * 0.28
        if abs(self._target_ratio - self._display_ratio) < 0.002:
            self._display_ratio = self._target_ratio

        self.progress_bar.set(self._display_ratio)
        percent = int(self._display_ratio * 100)
        self.percent_label.configure(text=f"%{percent}")

        elapsed = time.time() - self.start_time
        if self._display_ratio <= 0.001 or elapsed < 0.5:
            eta_text = t("progress.remaining_unknown")
        else:
            remaining = max(0, (1.0 - self._display_ratio) * elapsed / self._display_ratio)
            eta_text = t("progress.remaining", time=_format_seconds(remaining))

        if eta_text != self._last_eta:
            self.eta_label.configure(text=eta_text)
            self._last_eta = eta_text

        phase = int(elapsed * 2.4) % 4
        dots = "." * phase
        status_core = t("progress.status", current=self._current_value, total=self._current_total)
        self.status_label.configure(text=f"{status_core}  ·  {t('tool_ui.processing')}{dots}")

        self._tick_after_id = self.after(75, self._tick_animation)

    def destroy(self):
        if self._tick_after_id is not None:
            try:
                self.after_cancel(self._tick_after_id)
            except Exception:
                pass
            self._tick_after_id = None
        super().destroy()

