import customtkinter as ctk
import time


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

    def __init__(self, master, ortalama_func, total_count: int, title: str = "İşlem Yapiliyor"):
        super().__init__(master)

        self.ortalama_func = ortalama_func
        self.total_count = max(1, int(total_count))
        self.start_time = time.time()

        self.title(title)
        self.ortalama_func(self, 520, 320)
        self.grab_set()
        self.after(100, self.lift)

        header = ctk.CTkFrame(self, fg_color="#3a86ff", height=60, corner_radius=0)
        header.pack(fill="x", side="top")
        ctk.CTkLabel(header, text="⏳ İlerleme", font=("Segoe UI", 22, "bold"), text_color="white").pack(pady=10)

        self.card = ctk.CTkFrame(self, fg_color="#1e1e1e", corner_radius=14, border_width=2, border_color="#333")
        self.card.pack(fill="both", expand=True, padx=18, pady=18)

        self.status_label = ctk.CTkLabel(
            self.card, text="Başlanıyor...", font=("Segoe UI", 14, "bold"), text_color="white", wraplength=480
        )
        self.status_label.pack(pady=(18, 6), padx=16)

        self.progress_bar = ctk.CTkProgressBar(
            self.card, width=460, height=18, corner_radius=10, progress_color="#2ecc71"
        )
        self.progress_bar.pack(pady=(6, 10))
        self.progress_bar.set(0.0)

        row = ctk.CTkFrame(self.card, fg_color="transparent")
        row.pack(fill="x", padx=16)

        self.percent_label = ctk.CTkLabel(row, text="%0", font=("Segoe UI", 12, "bold"), text_color="#b7b7b7")
        self.percent_label.pack(side="left")

        self.eta_label = ctk.CTkLabel(row, text="Kalan: --", font=("Segoe UI", 12, "bold"), text_color="#b7b7b7")
        self.eta_label.pack(side="right")

        self.path_label = ctk.CTkLabel(
            self.card, text="", font=("Segoe UI", 12), text_color="#d0d0d0", wraplength=480
        )
        self.path_label.pack(pady=(6, 14), padx=16)

        self._last_eta = None
        # Pencere widget'lari basildiktan sonra ilk render'i garanti edelim.
        self.update_idletasks()
        self.deiconify()
        self.lift()
        try:
            self.focus_force()
        except Exception:
            pass

    def update_progress(self, current: int, total: int, where_text: str = ""):
        current = int(current)
        total = max(1, int(total))

        ratio = min(1.0, max(0.0, current / total))
        self.progress_bar.set(ratio)

        percent = int(ratio * 100)
        self.percent_label.configure(text=f"%{percent}")

        elapsed = time.time() - self.start_time
        if current <= 0 or elapsed < 0.5:
            eta_text = "Kalan: --"
        else:
            remaining = (total - current) * elapsed / current
            eta_text = f"Kalan: {_format_seconds(remaining)}"

        # UI flicker azaltmak icin ayni kalana tekrar yazmayalim
        if eta_text != self._last_eta:
            self.eta_label.configure(text=eta_text)
            self._last_eta = eta_text

        if where_text:
            self.path_label.configure(text=where_text)
            self.status_label.configure(text=f"İşlem: {current}/{total}")
        else:
            self.status_label.configure(text=f"İşlem: {current}/{total}")

