import customtkinter as ctk
from tkinter import filedialog, messagebox
import os
import time


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
        self.file_list = []
        self.card_widgets = []  # list of widgets in current order
        self.widget_map = {}    # path -> widget
        self._dragging = None
        self.dragging_path = None
        self._last_move = 0

        self.title("NB Studio - PDF Birleştirme")
        # Pencere boyutunu her şeyin sığacağı klasik ölçüye çektik
        self.ortalama_func(self, 800, 750)
        self.grab_set()

        # 1. ÜST BAŞLIK (Klasik Mavi)
        header_frame = ctk.CTkFrame(self, fg_color="#3a86ff", height=60, corner_radius=0)
        header_frame.pack(fill="x", side="top")
        ctk.CTkLabel(header_frame, text="🔗 PDF BİRLEŞTİRME MERKEZİ",
                     font=("Segoe UI", 22, "bold"), text_color="white").pack(pady=8)

        # Kullanıcıya küçük not
        note = ctk.CTkLabel(header_frame,
                            text="Dosyaları sürükleyip bırakarak sıralayabilirsiniz. Birleştirme bu sıraya göre yapılacaktır.",
                            font=("Segoe UI", 12, "bold"), text_color="#eaeaea")
        note.pack(pady=(0, 8))

        # 2. ANA LİSTE KARTI (Klasik Koyu Gri)
        self.main_card = ctk.CTkFrame(self, fg_color="#1e1e1e", corner_radius=12, border_width=2, border_color="#333")
        self.main_card.pack(pady=15, padx=30, fill="both", expand=True)

        # Boş Görünüm
        self.empty_view = ctk.CTkFrame(self.main_card, fg_color="transparent")
        self.empty_view.pack(pady=80, padx=20, fill="both", expand=True)
        ctk.CTkLabel(self.empty_view, text="📚", font=("Segoe UI", 50)).pack()
        ctk.CTkLabel(self.empty_view, text="Henüz dosya eklenmedi",
                     font=("Segoe UI", 14, "bold"), text_color="#888").pack(pady=10)

        # Kaydırılabilir Izgara Alanı
        self.scroll_frame = ctk.CTkScrollableFrame(self.main_card, fg_color="transparent")

        # 3. KONTROL BUTONLARI (Alt Bölüm)
        self.controls_container = ctk.CTkFrame(self, fg_color="transparent")
        self.controls_container.pack(fill="x", padx=30, pady=(0, 20))

        self.btn_add = ctk.CTkButton(self.controls_container, text="➕ DOSYA EKLE",
                                     font=("Segoe UI", 14, "bold"),
                                     fg_color="#3a86ff", height=45, command=self.add_files)
        self.btn_add.pack(fill="x", pady=5)

        # Temizle Butonu
        self.btn_clear = ctk.CTkButton(self.controls_container, text="🗑️ LİSTEYİ TEMİZLE",
                                       fg_color="#e74c3c", height=35, command=self.clear_list)

        self.btn_run = ctk.CTkButton(self.controls_container, text="PDF'LERİ BİRLEŞTİR VE KAYDET",
                                     font=("Segoe UI", 18, "bold"),
                                     height=60, fg_color="#34495e",
                                     state="disabled", command=self.run_merge)
        self.btn_run.pack(fill="x", pady=(10, 0))

    def add_files(self):
        files = filedialog.askopenfilenames(parent=self, filetypes=[("PDF", "*.pdf")])
        if files:
            for f in files:
                if f not in self.file_list:
                    self.file_list.append(f)
            self.update_ui()
        self.lift()

    def clear_list(self):
        self.file_list = []
        self.update_ui()

    def refresh_order(self):
        """Repack existing widgets according to self.file_list order without destroying them."""
        # Ensure widget_map contains the widgets
        new_widgets = []
        for path in self.file_list:
            w = self.widget_map.get(path)
            if w:
                w.pack_forget()
                w.pack(fill="x", padx=8, pady=6)
                new_widgets.append(w)
        self.card_widgets = new_widgets

    def update_ui(self):
        # Create or update widgets. For simplicity, rebuild widget_map when necessary.
        # If widget exists reuse it, otherwise create.
        existing = set(self.widget_map.keys())

        # Remove widgets that are no longer in file_list
        for removed in list(existing - set(self.file_list)):
            w = self.widget_map.pop(removed)
            try:
                w.destroy()
            except Exception:
                pass

        if not self.file_list:
            # clear frame
            for widget in self.scroll_frame.winfo_children():
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

        # Build widgets for new items
        for i, path in enumerate(self.file_list):
            if path in self.widget_map:
                continue
            fname = os.path.basename(path)
            display_name = (fname[:40] + '..') if len(fname) > 42 else fname

            f_box = ctk.CTkFrame(self.scroll_frame, fg_color="#2a2a2a", corner_radius=8,
                                 height=64, border_width=2, border_color="#444")
            f_box.pack(fill="x", padx=8, pady=6)
            f_box.pack_propagate(False)

            label = ctk.CTkLabel(f_box, text=display_name, font=("Segoe UI", 12, "bold"), anchor="w")
            label.pack(side="left", padx=12)

            # Yukarı / Aşağı butonları
            btn_up = ctk.CTkButton(f_box, text="↑", width=30, height=30, fg_color="#333",
                                   command=lambda idx=i: self.move_up(idx))
            btn_up.pack(side="right", padx=(6, 12))

            btn_down = ctk.CTkButton(f_box, text="↓", width=30, height=30, fg_color="#333",
                                     command=lambda idx=i: self.move_down(idx))
            btn_down.pack(side="right", padx=(6, 0))

            # Kaldır butonu
            btn_remove = ctk.CTkButton(f_box, text="Kaldır", width=80, height=30, fg_color="#e74c3c",
                                       command=lambda p=path: self.remove_single_file(p))
            btn_remove.pack(side="right", padx=(6, 0), pady=10)

            # Bind drag events to both frame and label to ensure any area is draggable
            f_box.bind("<Button-1>", lambda e, p=path: self._drag_start(e, p))
            f_box.bind("<B1-Motion>", self._drag_motion)
            f_box.bind("<ButtonRelease-1>", self._drag_release)
            label.bind("<Button-1>", lambda e, p=path: self._drag_start(e, p))
            label.bind("<B1-Motion>", self._drag_motion)
            label.bind("<ButtonRelease-1>", self._drag_release)

            self.widget_map[path] = f_box

        # Now repack widgets in order
        self.refresh_order()
        # Update highlighting if dragging
        for path, w in self.widget_map.items():
            is_dragging = (self.dragging_path == path)
            try:
                if is_dragging:
                    w.configure(fg_color="#375aeb", border_color="#ffd166")
                else:
                    w.configure(fg_color="#2a2a2a", border_color="#444")
            except Exception:
                pass

        self.btn_run.configure(state="normal", fg_color="#2ecc71", text_color="#1a1a1a")

    def remove_single_file(self, path):
        if path in self.file_list:
            self.file_list.remove(path)
            self.update_ui()

    def move_up(self, idx):
        if idx <= 0 or idx >= len(self.file_list):
            return
        reorder_list(self.file_list, idx, idx - 1)
        self.update_ui()

    def move_down(self, idx):
        if idx < 0 or idx >= len(self.file_list) - 1:
            return
        reorder_list(self.file_list, idx, idx + 1)
        self.update_ui()

    # --- Drag and drop handlers (immediate swap, throttled) ---
    def _drag_start(self, event, path):
        # Start dragging: remember which path and its index
        self.dragging_path = path
        try:
            self._dragging = self.file_list.index(path)
        except ValueError:
            self._dragging = None
        # visually update
        self.update_ui()

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
                # Immediately reorder to create dynamic shifting effect
                reorder_list(self.file_list, current_idx, target)
                # Update dragging index to new position
                self._dragging = target
                # Repack existing widgets (lighter than full rebuild)
                self.refresh_order()
                # Update visual highlight
                self.update_ui()
        except Exception:
            pass

    def _drag_release(self, event):
        # End dragging
        self._dragging = None
        self.dragging_path = None
        self.update_ui()

    def run_merge(self):
        if not self.file_list:
            return
        save_path = filedialog.asksaveasfilename(parent=self, title="PDF'i Kaydet",
                                                 defaultextension=".pdf",
                                                 filetypes=[("PDF", "*.pdf")])
        if save_path:
            try:
                self.pdf_engine.merge_pdfs(self.file_list, save_path)
                self.destroy()
                self.success_dialog(self.master, save_path, self.ortalama_func)
            except Exception as e:
                messagebox.showerror("Hata", str(e))