"""Build assets/nb_pdf_PLARTFORM_icon.ico from assets/nb_pdf_PLARTFORM_icon.png (Windows exe icon)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PNG = ROOT / "assets" / "nb_pdf_PLARTFORM_icon.png"
ICO = ROOT / "assets" / "nb_pdf_PLARTFORM_icon.ico"


def main() -> None:
    if not PNG.is_file():
        print(f"Missing {PNG}", file=sys.stderr)
        sys.exit(1)
    from PIL import Image

    try:
        resample = Image.Resampling.LANCZOS
    except AttributeError:
        resample = Image.LANCZOS  # type: ignore[attr-defined]

    img = Image.open(PNG).convert("RGBA")
    ICO.parent.mkdir(parents=True, exist_ok=True)
    sizes = (256, 128, 64, 48, 32, 16)
    layers = [img.resize((s, s), resample) for s in sizes]
    layers[0].save(ICO, format="ICO", append_images=layers[1:])
    print(f"Wrote {ICO}")


if __name__ == "__main__":
    main()
