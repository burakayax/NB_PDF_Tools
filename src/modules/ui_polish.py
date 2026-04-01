"""
Premium UI helpers: gradient surfaces, loading pulse, staggered entrance, hover polish.
CustomTkinter has no native CSS gradients; we use PIL-backed CTkImage strips and banners.
"""

from __future__ import annotations

import tkinter as tk

import customtkinter as ctk
from PIL import Image, ImageDraw, ImageTk


def _hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.strip().lstrip("#")
    if len(h) == 6:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (19, 28, 46)


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def draw_vertical_gradient(width: int, height: int, top_hex: str, bottom_hex: str) -> Image.Image:
    """Soft vertical gradient (RGB)."""
    top = _hex_to_rgb(top_hex)
    bottom = _hex_to_rgb(bottom_hex)
    img = Image.new("RGB", (max(2, width), max(2, height)))
    draw = ImageDraw.Draw(img)
    h = max(1, height - 1)
    for y in range(height):
        t = y / h
        r = int(_lerp(top[0], bottom[0], t))
        g = int(_lerp(top[1], bottom[1], t))
        b = int(_lerp(top[2], bottom[2], t))
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    return img


def draw_horizontal_gradient(width: int, height: int, left_hex: str, right_hex: str) -> Image.Image:
    left = _hex_to_rgb(left_hex)
    right = _hex_to_rgb(right_hex)
    img = Image.new("RGB", (max(2, width), max(2, height)))
    draw = ImageDraw.Draw(img)
    w = max(1, width - 1)
    for x in range(width):
        t = x / w
        r = int(_lerp(left[0], right[0], t))
        g = int(_lerp(left[1], right[1], t))
        b = int(_lerp(left[2], right[2], t))
        draw.line([(x, 0), (x, height)], fill=(r, g, b))
    return img


def vertical_gradient_strip(
    parent: tk.Misc,
    width: int,
    height: int,
    top_hex: str,
    bottom_hex: str,
    *,
    bg_hex: str | None = None,
) -> tk.Label | ctk.CTkFrame:
    """
    Vertical gradient using tk.Label + PhotoImage.

    PhotoImage must use ``master=parent`` (or the same toplevel) so Tcl registers the image
    in the same interpreter as CustomTkinter — otherwise ``image pyimageN doesn't exist``.
    """
    pil = draw_vertical_gradient(width, height, top_hex, bottom_hex)
    if pil.mode != "RGB":
        pil = pil.convert("RGB")
    bg = bg_hex or bottom_hex
    try:
        try:
            parent.update_idletasks()
        except tk.TclError:
            pass
        photo = ImageTk.PhotoImage(pil, master=parent)
        lbl = tk.Label(parent, image=photo, borderwidth=0, highlightthickness=0, bg=bg)
        lbl._photo_ref = photo  # noqa: SLF001 — keep PhotoImage alive
        return lbl
    except tk.TclError:
        # Last resort: no bitmap (some Tk 9 / CTk combinations)
        fb = ctk.CTkFrame(parent, fg_color=top_hex, width=width, height=height, corner_radius=0)
        fb.pack_propagate(False)
        return fb


class LoadingPulseDots(ctk.CTkFrame):
    """Three-dot breathing loader; call stop() when leaving the screen."""

    def __init__(self, master, ui: dict, app: ctk.CTk):
        super().__init__(master, fg_color="transparent")
        self._app = app
        self._ui = ui
        self._after_id: str | None = None
        self._phase = 0
        self._dots: list[ctk.CTkLabel] = []
        for i in range(3):
            lbl = ctk.CTkLabel(
                self,
                text="●",
                font=("Segoe UI", 14),
                text_color=ui["muted"],
                fg_color="transparent",
            )
            lbl.pack(side="left", padx=3)
            self._dots.append(lbl)
        self._tick()

    def _tick(self) -> None:
        if not self.winfo_exists():
            return
        accent = self._ui.get("accent_soft", self._ui["accent"])
        muted = self._ui["muted"]
        dim = self._ui.get("accent_mid", accent)
        for i, d in enumerate(self._dots):
            # Rolling highlight
            dist = (i - (self._phase % 3)) % 3
            if dist == 0:
                c = accent
            elif dist == 1:
                c = dim
            else:
                c = muted
            d.configure(text_color=c)
        self._phase += 1
        try:
            self._after_id = self._app.after(420, self._tick)
        except Exception:
            self._after_id = None

    def stop(self) -> None:
        if self._after_id is not None:
            try:
                self._app.after_cancel(self._after_id)
            except Exception:
                pass
            self._after_id = None


def attach_feature_button_polish(btn: ctk.CTkButton, ui: dict) -> None:
    """Stronger hover: accent border + width; complements CTk hover_color."""
    base_border = ui.get("border_subtle", ui["border"])
    glow = ui.get("accent_mid", ui["accent"])

    def on_enter(_e=None):
        btn.configure(border_width=2, border_color=glow)

    def on_leave(_e=None):
        btn.configure(border_width=1, border_color=base_border)

    btn.bind("<Enter>", on_enter, add="+")
    btn.bind("<Leave>", on_leave, add="+")


def stagger_raise_buttons(app: ctk.CTk, buttons: list[ctk.CTkButton], ui: dict, start_fg: str, end_fg: str, delay_ms: int = 42) -> None:
    """Sequential lighten-in for tool tiles."""
    for i, btn in enumerate(buttons):
        try:
            btn.configure(fg_color=start_fg, border_color=ui.get("border_subtle", ui["border"]))
        except Exception:
            continue

        def lift(b=btn, fg=end_fg, border=ui.get("border_subtle", ui["border"])):
            try:
                if b.winfo_exists():
                    b.configure(fg_color=fg, border_color=border)
            except Exception:
                pass

        app.after(delay_ms * i, lift)


def thin_accent_line(parent, ui: dict, width: int = 520, height: int = 3) -> tk.Label | ctk.CTkFrame:
    """Horizontal gradient hairline (tk.Label + PhotoImage; solid bar fallback on TclError)."""
    left = ui.get("accent", "#2563eb")
    right = ui.get("accent_soft", "#93c5fd")
    bg = ui.get("panel", "#131c2e")
    w = max(80, width)
    h = max(2, height)
    full = draw_horizontal_gradient(w, h, left, right)
    if full.mode != "RGB":
        full = full.convert("RGB")
    try:
        try:
            parent.update_idletasks()
        except tk.TclError:
            pass
        photo = ImageTk.PhotoImage(full, master=parent)
        lbl = tk.Label(parent, image=photo, borderwidth=0, highlightthickness=0, bg=bg)
        lbl._photo_ref = photo  # noqa: SLF001
        return lbl
    except tk.TclError:
        fb = ctk.CTkFrame(parent, fg_color=left, height=h, corner_radius=0)
        fb.pack_propagate(False)
        return fb
