import customtkinter as ctk
from tkinter import filedialog, messagebox
import os
import time
import threading
from queue import Queue, Empty

from modules.progress_dialog import ProgressDialog
from modules.pdf_password_dialog import PdfPasswordDialog
from modules.ui_theme import badge_colors, theme


def reorder_list(lst, from_idx, to_idx):
    """Return a new list with element moved from from_idx to to_idx."""
    if from_idx < 0 or from_idx >= len(lst) or to_idx < 0 or to_idx > len(lst):
        raise IndexError("Invalid indices for reorder_list")
    item = lst.pop(from_idx)
    lst.insert(to_idx, item)
    return lst


class MergeWindow(ctk.CTkToplevel):
    def __init__(self, master, ortalama_func, engine, success_dialog_class):
        super().__init__(master)
        self.ortalama_func = ortalama_func
        self.pdf_engine = engine
        self.success_dialog = success_dialog_class
        self.ui = theme()
        self.file_list = []
        self.file_passwords = {}
        self.file_encrypted = {}
        self.card_widgets = []  # list of widgets in current order
        self.widget_map = {}    # path -> widget
        self._dragging = None
        self.dragging_path = None
        self._last_move = 0
        self._anim_after_id = None
        # Drag sırasında animasyon hissini yumuşatmak için hız ayarları
        self._anim_steps = 6
        self._anim_duration_ms = 90
        self._anim_min_interval_ms = 45
        self._last_anim_start = 0.0

        self.title("PaperFlow - PDF Birleştirme")
        # Pencere boyutunu her şeyin sığacağı klasik ölçüye çektik
        self.ortalama_func(self, 800, 750)
        self.grab_set()
        self.configure(fg_color=self.ui["bg"])

        # 1. ÜST BAŞLIK (Klasik Mavi)
        header_frame = ctk.CTkFrame(self, fg_color=self.ui["accent"], height=60, corner_radius=0)
        header_frame.pack(fill="x", side="top")
        ctk.CTkLabel(header_frame, text="⧉ PDF BİRLEŞTİRME MERKEZİ",
                     font=self.ui["title_font"], text_color="white").pack(pady=8)

        # Kullanıcıya küçük not
        note = ctk.CTkLabel(header_frame,
                            text="Dosyaları sürükleyip bırakarak sıralayabilirsiniz. Birleştirme bu sıraya göre yapılacaktır.",
                            font=self.ui["small_font"], text_color="#eef4ff")
        note.pack(pady=(0, 8))

        # 2. ANA LİSTE KARTI (Klasik Koyu Gri)
        self.main_card = ctk.CTkFrame(
            self,
            fg_color=self.ui["panel"],
            corner_radius=16,
            border_width=1,
            border_color=self.ui["border"],
        )
        self.main_card.pack(pady=15, padx=30, fill="both", expand=True)

        # Boş Görünüm
        self.empty_view = ctk.CTkFrame(self.main_card, fg_color="transparent")
        self.empty_view.pack(pady=80, padx=20, fill="both", expand=True)
        ctk.CTkLabel(self.empty_view, text="📚", font=("Segoe UI", 50)).pack()
        ctk.CTkLabel(self.empty_view, text="Henüz dosya eklenmedi",
                     font=("Segoe UI Semibold", 14, "bold"), text_color=self.ui["muted"]).pack(pady=10)

        # Kaydırılabilir Izgara Alanı
        self.scroll_frame = ctk.CTkScrollableFrame(self.main_card, fg_color="transparent")
        # Sürükle-bırak animasyonunu düzgün yapmak için kartları scroll_frame içinde tek bir container'e "place" ile diziyoruz.
        self.items_container = ctk.CTkFrame(self.scroll_frame, fg_color="transparent")
        self.items_container.pack(fill="both", expand=True)
        self.card_height = 82
        self.card_pad_x = 8
        self.card_pad_y = 6
        self.card_step = self.card_height + (2 * self.card_pad_y)

        # 3. KONTROL BUTONLARI (Alt Bölüm)
        self.controls_container = ctk.CTkFrame(self, fg_color="transparent")
        self.controls_container.pack(fill="x", padx=30, pady=(0, 20))

        self.btn_add = ctk.CTkButton(self.controls_container, text="DOSYA EKLE",
                                     font=self.ui["subtitle_font"],
                                     fg_color=self.ui["accent"], hover_color=self.ui["accent_hover"],
                                     text_color=self.ui["button_text"], height=45, command=self.add_files)
        self.btn_add.pack(fill="x", pady=5)

        # Temizle Butonu
        self.btn_clear = ctk.CTkButton(self.controls_container, text="🗑️ LİSTEYİ TEMİZLE",
                                       fg_color=self.ui["danger"], hover_color="#d85c51", height=35, command=self.clear_list)

        self.btn_run = ctk.CTkButton(self.controls_container, text="PDF'LERİ BİRLEŞTİR VE KAYDET",
                                     font=("Segoe UI Semibold", 18, "bold"),
                                     height=60, fg_color=self.ui["panel_alt"],
                                     state="disabled", command=self.run_merge)
        self.btn_run.pack(fill="x", pady=(10, 0))

    def _get_card_width(self) -> int:
        """Return the width to use for place-based cards."""
        self.items_container.update_idletasks()
        container_w = self.items_container.winfo_width()
        if container_w <= 1:
            # Initial/fallback width; will be corrected after first layout.
            return 520
        return max(200, container_w - (2 * self.card_pad_x))

    def _cancel_animation(self):
        if self._anim_after_id is not None:
            try:
                self.after_cancel(self._anim_after_id)
            except Exception:
                pass
            self._anim_after_id = None

    def _layout_items(self, animated: bool = True):
        """Place all cards according to file_list order (optionally animated)."""
        if not animated:
            # Drag anında/ani güncellemede bir önceki after animasyonunu iptal edelim.
            self._cancel_animation()

        # Keep card_widgets in the same order as file_list
        self.card_widgets = [self.widget_map[p] for p in self.file_list if p in self.widget_map]

        # Update container height so scroll region is correct
        total_h = max(1, len(self.card_widgets) * self.card_step)
        self.items_container.configure(height=total_h)

        card_w = self._get_card_width()

        # Calculate target y positions
        target = {}
        for idx, path in enumerate(self.file_list):
            w = self.widget_map.get(path)
            if not w:
                continue
            y = self.card_pad_y + idx * self.card_step
            target[w] = y

        # Update colors immediately (dragging highlight)
        for path, w in self.widget_map.items():
            try:
                if path == self.dragging_path:
                    w.configure(fg_color="#375aeb", border_color="#ffd166")
                else:
                    w.configure(fg_color="#2a2a2a", border_color="#444")
            except Exception:
                pass

        # Drag sırasında çok sık reorder olursa animasyonu tamamen baştan başlatmak takılma gibi hissedebilir.
        # Bu yüzden animasyon eşiğini geçmiyorsa anlık yerleştiriyoruz.
        should_animate = bool(animated and target)
        if should_animate and self.dragging_path is not None:
            import time as _time
            now = _time.time()
            should_animate = (now - self._last_anim_start) * 1000.0 >= self._anim_min_interval_ms
            if should_animate:
                self._last_anim_start = now

        if not should_animate:
            for w, y in target.items():
                w.place_configure(x=self.card_pad_x, y=y, width=card_w, height=self.card_height)
            self.update_idletasks()
            return

        # Smooth animation between current and target y
        self._cancel_animation()
        start_y = {w: w.winfo_y() for w in target.keys()}
        steps = max(2, int(self._anim_steps))
        duration_ms = max(30, int(self._anim_duration_ms))
        step_ms = max(1, duration_ms // steps)
        tick = {"i": 0}

        def animate_step():
            tick["i"] += 1
            i = tick["i"]
            t = min(1.0, i / steps)
            for w, y_target in target.items():
                y0 = start_y.get(w, y_target)
                y = int(y0 + (y_target - y0) * t)
                w.place_configure(x=self.card_pad_x, y=y, width=card_w, height=self.card_height)

            if i >= steps:
                # Ensure final exact positions
                for w, y_target in target.items():
                    w.place_configure(x=self.card_pad_x, y=y_target, width=card_w, height=self.card_height)
                self._anim_after_id = None
                return

            self._anim_after_id = self.after(step_ms, animate_step)

        self._anim_after_id = self.after(step_ms, animate_step)

    def add_files(self):
        files = filedialog.askopenfilenames(parent=self, filetypes=[("PDF", "*.pdf")])
        if files:
            skipped_files = []
            for f in files:
                try:
                    encrypted = False
                    if hasattr(self.pdf_engine, "is_pdf_encrypted"):
                        encrypted = self.pdf_engine.is_pdf_encrypted(f)

                    if encrypted:
                        password_result = self._request_password_for_file(f, show_success=False)
                        if password_result == "skip":
                            skipped_files.append(os.path.basename(f))
                            continue
                        if not password_result:
                            continue

                    self.file_encrypted[f] = encrypted
                    self.file_passwords.setdefault(f, None)
                    if f not in self.file_list:
                        self.file_list.append(f)
                except Exception as e:
                    messagebox.showerror("Hata", f"{os.path.basename(f)} dosyası okunamadı:\n{e}")
            self.update_ui()
            if skipped_files:
                messagebox.showinfo(
                    "Bilgi",
                    "⚠️ Aşağıdaki dosyalar kullanıcı isteğiyle atlandı:\n\n" + "\n".join(skipped_files),
                )
        self.lift()

    def _request_password_for_file(self, path, show_success=True):
        def validate_password(password):
            try:
                if hasattr(self.pdf_engine, "validate_pdf_password") and self.pdf_engine.validate_pdf_password(path, password):
                    return True
                return "Girilen PDF şifresi hatalı."
            except Exception as e:
                return str(e)

        dialog = PdfPasswordDialog(
            self,
            self.ortalama_func,
            os.path.basename(path),
            password_validator=validate_password,
        )
        self.wait_window(dialog)
        if dialog.action == "skip":
            return "skip"
        if dialog.action == "cancel":
            return False

        password = dialog.result
        if not password:
            return False

        self.file_passwords[path] = password
        if show_success:
                    messagebox.showinfo("PaperFlow", f"{os.path.basename(path)} için şifre doğrulandı.")
        self.update_ui()
        return True

    def _get_status_text(self, path):
        if self.file_encrypted.get(path):
            if self.file_passwords.get(path):
                return "🔐 ✓", "#f39c12"
            return "🔐", "#e74c3c"
        return "", "#888888"

    def clear_list(self):
        self.file_list = []
        self.update_ui()

    def refresh_order(self):
        """Compatibility shim: place-based layout handles order changes."""
        self.card_widgets = [self.widget_map[p] for p in self.file_list if p in self.widget_map]

    def update_ui(self):
        # Create or update widgets. For simplicity, rebuild widget_map when necessary.
        # If widget exists reuse it, otherwise create.
        existing = set(self.widget_map.keys())

        # Remove widgets that are no longer in file_list
        for removed in list(existing - set(self.file_list)):
            w = self.widget_map.pop(removed)
            self.file_passwords.pop(removed, None)
            self.file_encrypted.pop(removed, None)
            try:
                w.destroy()
            except Exception:
                pass

        if not self.file_list:
            # clear frame
            for widget in self.items_container.winfo_children():
                widget.destroy()
            self.card_widgets = []
            self.widget_map = {}
            self.scroll_frame.pack_forget()
            self.btn_clear.pack_forget()
            self.empty_view.pack(fill="both", expand=True)
            self.btn_run.configure(state="disabled", fg_color="#34495e")
            return

        # Make sure scroll frame visible
        self.empty_view.pack_forget()
        self.scroll_frame.pack(pady=10, padx=10, fill="both", expand=True)
        self.btn_clear.pack(after=self.btn_add, fill="x", pady=5)

        for widget in self.items_container.winfo_children():
            widget.destroy()
        self.widget_map = {}

        # Build widgets for new items
        for i, path in enumerate(self.file_list):
            fname = os.path.basename(path)
            display_name = (fname[:40] + '..') if len(fname) > 42 else fname
            status_text, _status_color = self._get_status_text(path)

            # Kartları items_container içine "place" ediyoruz; scroll_frame içinde tek container kullanalım.
            f_box = ctk.CTkFrame(self.items_container, fg_color=self.ui["panel_alt"], corner_radius=8,
                                 height=self.card_height, border_width=1, border_color=self.ui["border"])
            f_box.pack_propagate(False)

            text_frame = ctk.CTkFrame(f_box, fg_color="transparent")
            text_frame.pack(side="left", fill="both", expand=True, padx=12, pady=8)

            label = ctk.CTkLabel(text_frame, text=display_name, font=("Segoe UI", 12, "bold"), anchor="w")
            label.pack(anchor="w")
            if status_text:
                badge = badge_colors("success" if "✓" in status_text else "warning")
                status_label = ctk.CTkLabel(
                    text_frame,
                    text=f"  {status_text}  ",
                    font=("Segoe UI", 10, "bold"),
                    text_color=badge["text"],
                    fg_color=badge["fg"],
                    corner_radius=8,
                    anchor="w",
                )
                status_label.pack(anchor="w", pady=(4, 0))
            else:
                status_label = ctk.CTkLabel(text_frame, text="", font=("Segoe UI", 10, "bold"), anchor="w")
                status_label.pack(anchor="w", pady=(4, 0))

            # Yukarı / Aşağı butonları
            btn_up = ctk.CTkButton(f_box, text="↑", width=30, height=30, fg_color=self.ui["panel_alt"],
                                   command=lambda idx=i: self.move_up(idx))
            btn_up.pack(side="right", padx=(6, 12))

            btn_down = ctk.CTkButton(f_box, text="↓", width=30, height=30, fg_color=self.ui["panel_alt"],
                                     command=lambda idx=i: self.move_down(idx))
            btn_down.pack(side="right", padx=(6, 0))

            # Kaldır butonu
            btn_remove = ctk.CTkButton(f_box, text="Kaldır", width=80, height=30, fg_color=self.ui["danger"],
                                       command=lambda p=path: self.remove_single_file(p))
            btn_remove.pack(side="right", padx=(6, 0), pady=10)

            # Bind drag events to both frame and label to ensure any area is draggable
            f_box.bind("<Button-1>", lambda e, p=path: self._drag_start(e, p))
            f_box.bind("<B1-Motion>", self._drag_motion)
            f_box.bind("<ButtonRelease-1>", self._drag_release)
            label.bind("<Button-1>", lambda e, p=path: self._drag_start(e, p))
            label.bind("<B1-Motion>", self._drag_motion)
            label.bind("<ButtonRelease-1>", self._drag_release)
            status_label.bind("<Button-1>", lambda e, p=path: self._drag_start(e, p))
            status_label.bind("<B1-Motion>", self._drag_motion)
            status_label.bind("<ButtonRelease-1>", self._drag_release)

            self.widget_map[path] = f_box

        # Place-based layout: order + highlight + scroll height update (animated for a nicer feel)
        self.refresh_order()
        self._layout_items(animated=True)

        self.btn_run.configure(state="normal", fg_color="#2ecc71", text_color="#1a1a1a")

    def remove_single_file(self, path):
        if path in self.file_list:
            self.file_list.remove(path)
            self.file_passwords.pop(path, None)
            self.file_encrypted.pop(path, None)
            self.update_ui()

    def move_up(self, idx):
        if idx <= 0 or idx >= len(self.file_list):
            return
        reorder_list(self.file_list, idx, idx - 1)
        self._layout_items(animated=True)

    def move_down(self, idx):
        if idx < 0 or idx >= len(self.file_list) - 1:
            return
        reorder_list(self.file_list, idx, idx + 1)
        self._layout_items(animated=True)

    # --- Drag and drop handlers (immediate swap, throttled) ---
    def _drag_start(self, event, path):
        # Start dragging: remember which path and its index
        self.dragging_path = path
        try:
            self._dragging = self.file_list.index(path)
        except ValueError:
            self._dragging = None
        # visually update
        self._layout_items(animated=False)

    def _drag_motion(self, event):
        # Throttle frequent moves to improve responsiveness
        now = time.time()
        if now - self._last_move < 0.03:  # ~30ms
            return
        self._last_move = now

        if self._dragging is None or self.dragging_path is None:
            return
        try:
            # Determine target index by vertical position
            y = event.y_root
            target = None
            for idx, w in enumerate(self.card_widgets):
                wy = w.winfo_rooty()
                wh = w.winfo_height()
                center = wy + wh / 2
                if y < center:
                    target = idx
                    break
            if target is None:
                target = len(self.card_widgets) - 1

            current_idx = self.file_list.index(self.dragging_path)
            if target != current_idx:
                reorder_list(self.file_list, current_idx, target)
                # Update dragging index to new position
                self._dragging = target
                # Animate widgets to their new positions
                self._layout_items(animated=True)
        except Exception:
            pass

    def _drag_release(self, event):
        # End dragging
        self._dragging = None
        self.dragging_path = None
        self._layout_items(animated=True)

    def run_merge(self):
        if not self.file_list:
            return
        locked_files = [os.path.basename(p) for p in self.file_list if self.file_encrypted.get(p) and not self.file_passwords.get(p)]
        if locked_files:
            messagebox.showwarning(
                "Şifre Gerekli",
                "🔐 Aşağıdaki şifreli PDF dosyaları için önce şifre girin:\n\n" + "\n".join(locked_files),
            )
            return
        save_path = filedialog.asksaveasfilename(parent=self, title="PDF'i Kaydet",
                                                 defaultextension=".pdf",
                                                 filetypes=[("PDF", "*.pdf")])
        if save_path:
            self.btn_run.configure(state="disabled", fg_color="#34495e")

            total = len(self.file_list)
            q = Queue()
            finished = {"value": False}

            progress_dialog = ProgressDialog(self, self.ortalama_func, total_count=total, title="PDF Birleştirme")
            progress_dialog.update_idletasks()
            progress_dialog.update_progress(0, max(1, total), "Hazırlanıyor...")
            progress_dialog.update()

            def progress_cb(current: int, total_count: int, where_text: str):
                # Thread -> UI: sadece queue ile haberleselim.
                q.put(("progress", current, total_count, where_text))
                return True

            def worker():
                try:
                    self.pdf_engine.merge_pdfs(
                        self.file_list,
                        save_path,
                        progress_callback=progress_cb,
                        passwords=self.file_passwords,
                    )
                    q.put(("done", save_path))
                except Exception as e:
                    q.put(("error", str(e)))

            t = threading.Thread(target=worker, daemon=True)
            t.start()

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
                            messagebox.showerror("Hata", msg[1])
                            self.btn_run.configure(state="normal", fg_color="#2ecc71", text_color="#1a1a1a")
                            return
                except Empty:
                    pass

                if not finished["value"]:
                    self.after(100, poll)

            self.after(100, poll)