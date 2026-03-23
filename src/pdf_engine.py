import pytesseract
from pdf2image import convert_from_path
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from PIL import Image, ImageOps
import PyPDF2
import os
import re
import statistics
from typing import List, Dict, Any, Tuple, Optional

# --- YOLLAR ---
# Tesseract'in yolu: sisteminizde farklıysa burayı güncelleyin
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
base_dir = os.path.dirname(os.path.abspath(__file__))
# Poppler klasörünün proje ana dizinindeki Library/bin içinde olduğu varsayılır
poppler_bin_path = os.path.join(base_dir, "..", "Library", "bin")

# Taranmış form / ekran görüntüsü PDF'ler için sayfa bölümleme (PSM 3: otomatik)
_TESSERACT_CONFIG = r"--oem 3 --psm 3"


def get_num_pages(pdf_path: str) -> int:
    """Return number of pages in the given PDF."""
    try:
        reader = PyPDF2.PdfReader(pdf_path)
        return len(reader.pages)
    except Exception as e:
        raise Exception(f"PDF sayfa sayısı okunamadı: {e}")


def pdf_to_word(pdf_path: str, docx_path: str, progress_callback=None) -> bool:
    """
    OCR tabanlı PDF -> DOCX dönüşümü.
    Görüntü PDF'leri önce resme çevirir, sonra Tesseract ile metin ve pozisyon bilgisi alarak
    satır ve tablo benzeri yapıları korumaya çalışır.
    """
    try:
        pages = convert_from_path(pdf_path, 300, poppler_path=poppler_bin_path)
        total_pages = max(1, len(pages))

        doc = Document()

        # Sayfa kenar boşluklarını daralt
        for section in doc.sections:
            section.left_margin = Pt(30)
            section.right_margin = Pt(30)
            section.top_margin = Pt(30)
            section.bottom_margin = Pt(30)

        for i, page in enumerate(pages):
            # Taranmis (scan) PDF'lerde OCR kalitesini arttirmak icin basit on isleme:
            # - griye cevir
            # - otomatik kontrast
            # - cok kucuk sayfalarda kucuk ölçek büyütme
            if page.mode != "L":
                page_proc = page.convert("L")
            else:
                page_proc = page.copy()

            page_proc = ImageOps.autocontrast(page_proc)
            if page_proc.width < 1600:
                scale = 1.25
                new_w = int(page_proc.width * scale)
                new_h = int(page_proc.height * scale)
                page_proc = page_proc.resize((new_w, new_h), resample=Image.Resampling.LANCZOS)

            data = _run_tesseract_image_to_data(page_proc)

            for block in _ocr_data_to_layout_blocks(data, page_proc.width):
                _append_layout_block_to_document(doc, block)

            if progress_callback:
                progress_callback(i + 1, total_pages, where_text=f"OCR: Sayfa {i + 1}/{total_pages}")

            if i < len(pages) - 1:
                doc.add_page_break()

        doc.save(docx_path)
        if progress_callback:
            progress_callback(total_pages, total_pages, where_text="Word kaydediliyor...")
        return True

    except Exception as e:
        raise Exception(f"Gelişmiş OCR Hatası: {e}")


def _safe_int(v, default=0) -> int:
    try:
        return int(v)
    except Exception:
        return default


def _safe_float(v, default=-1.0) -> float:
    try:
        return float(v)
    except Exception:
        return default


def _run_tesseract_image_to_data(page_proc: Image.Image) -> Dict[str, Any]:
    """
    Önce sadece Türkçe (Ü, Ğ vb. için daha iyi); yoksa tur+eng ile dener.
    """
    kwargs = dict(output_type=pytesseract.Output.DICT, config=_TESSERACT_CONFIG)
    try:
        return pytesseract.image_to_data(page_proc, lang="tur", **kwargs)
    except Exception:
        return pytesseract.image_to_data(page_proc, lang="tur+eng", **kwargs)


def _polish_tesseract_output(s: str) -> str:
    """
    Tesseract'ın sık yaptığı Türkçe / rakam hatalarını metin düzeyinde düzeltir.
    """
    if not s:
        return s
    # Ürün (Ü harfi bazen Uriin / Urin olarak gelir)
    s = re.sub(r"Uriin", "Ürün", s, flags=re.IGNORECASE)
    s = re.sub(r"\bUrin\b", "Ürün", s, flags=re.IGNORECASE)
    s = re.sub(r"\bUrun\b", "Ürün", s, flags=re.IGNORECASE)
    # Bitişik başlık
    s = re.sub(r"Ürün\s*Takip\s*Sistemi", "Ürün Takip Sistemi", s, flags=re.IGNORECASE)
    s = re.sub(r"ÜrünTakipSistemi", "Ürün Takip Sistemi", s, flags=re.IGNORECASE)
    # Rakamlar arası þ (thorn) -> 0 (ör. 735þ658411)
    s = re.sub(r"(\d)[þÞ](\d)", r"\g<1>0\g<2>", s)
    # Sadece rakam benzeri parçalarda kalan þ
    def fix_token(tok: str) -> str:
        if re.search(r"\d", tok) and re.search(r"[þÞ]", tok):
            return tok.replace("þ", "0").replace("Þ", "0")
        return tok

    parts = re.split(r"(\s+)", s)
    s = "".join(fix_token(p) if p.strip() else p for p in parts)
    return re.sub(r" {2,}", " ", s).strip()


def _finalize_line_text(s: str) -> str:
    return _polish_tesseract_output(_fix_glued_turkish_text(s))


def _fix_glued_turkish_text(s: str) -> str:
    """OCR/Tesseract bazen kelimeleri bitişik yazar (ör. FirmaAdi). Metin düzenlenebilir kalsın diye ayırır."""
    if not s:
        return s
    # küçük harf + büyük harf ayrımı (camelCase benzeri)
    s = re.sub(r"([a-zığüşöç])([A-ZĞÜŞİÖÇİ])", r"\1 \2", s)
    # rakam <-> harf
    s = re.sub(r"(\d)([A-Za-zğüşıöçĞÜŞİÖÇİ])", r"\1 \2", s)
    s = re.sub(r"([A-Za-zğüşıöçĞÜŞİÖÇİ])(\d)", r"\1 \2", s)
    # yaygın form etiketleri (ÜTS / bayilik ekranları)
    replacements = (
        ("FirmaAdi", "Firma Adı"),
        ("FirmaVergi", "Firma Vergi"),
        ("BayilikVeren", "Bayilik Veren"),
        ("BayilikAlan", "Bayilik Alan"),
        ("BayilikBaşvuru", "Bayilik Başvuru"),
        ("BayilikBasvuru", "Bayilik Başvuru"),
        ("BaşvuruTarihi", "Başvuru Tarihi"),
        ("BasvuruTarihi", "Başvuru Tarihi"),
        ("BaşlangıçTarihi", "Başlangıç Tarihi"),
        ("BaslangicTarihi", "Başlangıç Tarihi"),
        ("PlanlananBitiş", "Planlanan Bitiş"),
        ("PlanlananBitis", "Planlanan Bitiş"),
        ("BitişTarihi", "Bitiş Tarihi"),
        ("BitisTarihi", "Bitiş Tarihi"),
        ("KararTarihi", "Karar Tarihi"),
        ("İthalatBildirimi", "İthalat Bildirimi"),
        ("IthalatBildirimi", "İthalat Bildirimi"),
    )
    for a, b in replacements:
        s = s.replace(a, b)
    return re.sub(r" {2,}", " ", s).strip()


def _parse_ocr_words(ocr: Dict[str, Any]) -> List[Dict[str, Any]]:
    texts = ocr.get("text", [])
    if not texts:
        return []

    lefts = ocr.get("left", [])
    tops = ocr.get("top", [])
    widths = ocr.get("width", [])
    heights = ocr.get("height", [])
    block_nums = ocr.get("block_num", [0] * len(texts))
    par_nums = ocr.get("par_num", [0] * len(texts))
    line_nums = ocr.get("line_num", [0] * len(texts))
    confs = ocr.get("conf", [-1] * len(texts))

    words: List[Dict[str, Any]] = []
    n = len(texts)
    for i in range(n):
        t = (texts[i] or "").strip()
        if not t:
            continue
        conf = _safe_float(confs[i], default=-1.0)
        if conf < 0:
            conf = 0.0
        words.append(
            {
                "text": t,
                "left": _safe_int(lefts[i] if i < len(lefts) else 0),
                "top": _safe_int(tops[i] if i < len(tops) else 0),
                "width": _safe_int(widths[i] if i < len(widths) else 0),
                "height": _safe_int(heights[i] if i < len(heights) else 0),
                "block": _safe_int(block_nums[i] if i < len(block_nums) else 0),
                "par": _safe_int(par_nums[i] if i < len(par_nums) else 0),
                "line": _safe_int(line_nums[i] if i < len(line_nums) else 0),
                "conf": conf,
            }
        )
    return words


def _cluster_words_into_visual_lines(words: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """Tüm blokları birleştirip y koordinatına göre görsel satırlara ayırır."""
    if not words:
        return []
    heights = sorted(w["height"] for w in words if w["height"] > 0)
    median_h = heights[len(heights) // 2] if heights else 14
    y_tol = max(10, int(median_h * 0.52))

    sorted_w = sorted(words, key=lambda w: (w["top"], w["left"]))
    lines: List[List[Dict[str, Any]]] = []
    current: List[Dict[str, Any]] = []
    anchor_y: float = 0.0

    for w in sorted_w:
        cy = float(w["top"] + max(1, w["height"]) / 2.0)
        if not current:
            current = [w]
            anchor_y = cy
            continue
        if abs(cy - anchor_y) <= y_tol:
            current.append(w)
            anchor_y = (anchor_y * (len(current) - 1) + cy) / len(current)
        else:
            current.sort(key=lambda x: x["left"])
            lines.append(current)
            current = [w]
            anchor_y = cy

    if current:
        current.sort(key=lambda x: x["left"])
        lines.append(current)
    return lines


def _join_words_in_segment(words: List[Dict[str, Any]]) -> str:
    if not words:
        return ""
    words = sorted(words, key=lambda x: x["left"])
    hlist = [w["height"] for w in words if w["height"] > 0]
    med_h = statistics.median(hlist) if hlist else 12.0
    space_threshold = max(2.0, med_h * 0.11)

    parts: List[str] = []
    for i, w in enumerate(words):
        if i == 0:
            parts.append(w["text"])
            continue
        prev = words[i - 1]
        gap = float(w["left"] - (prev["left"] + prev["width"]))
        sep = " " if gap > space_threshold else ""
        parts.append(sep + w["text"])
    raw = "".join(parts)
    return _finalize_line_text(raw.replace("  ", " ").strip())


def _split_line_into_word_segments(words: List[Dict[str, Any]], page_w: int) -> List[List[Dict[str, Any]]]:
    """Satır içinde etiket / değer gibi geniş boşluklardan kelime grupları üretir."""
    words = sorted(words, key=lambda x: x["left"])
    if len(words) <= 1:
        return [words]

    gaps: List[float] = []
    for i in range(1, len(words)):
        g = float(words[i]["left"] - (words[i - 1]["left"] + words[i - 1]["width"]))
        gaps.append(max(0.0, g))

    med_g = statistics.median(gaps) if gaps else 0.0
    # Form satırlarında etiket-değer arası genelde çok geniş; küçük iç boşluklara dokunma
    threshold = max(42.0, page_w * 0.052, med_g * 2.6 if med_g > 4.0 else 42.0)

    segments: List[List[Dict[str, Any]]] = []
    start = 0
    for i, g in enumerate(gaps):
        if g >= threshold:
            segments.append(words[start : i + 1])
            start = i + 1
    segments.append(words[start:])
    return [s for s in segments if s]


def _line_bbox(words: List[Dict[str, Any]]) -> Tuple[int, int]:
    left = min(w["left"] for w in words)
    right = max(w["left"] + w["width"] for w in words)
    return left, right


def _line_looks_centered(words: List[Dict[str, Any]], page_w: int) -> bool:
    if len(words) < 1 or page_w <= 0:
        return False
    left, right = _line_bbox(words)
    span = right - left
    mid = (left + right) / 2.0
    return abs(mid - page_w / 2.0) < page_w * 0.10 and span < page_w * 0.78


def _try_split_label_value_text(t: str) -> Optional[Tuple[str, str]]:
    """
    'Telefon: 0(212)...' veya 'Firma Adı: ...' gibi tek parçada kalan satırları [etiket, değer] ayırır.
    """
    t = (t or "").strip()
    if not t or t.lower().startswith("http"):
        return None
    first = t.split("\n", 1)[0].strip()
    if ":" not in first:
        return None
    idx = first.index(":")
    label = first[:idx].strip()
    rest = t[idx + 1 :].strip()
    if len(label) < 2 or len(label) > 58:
        return None
    # Çok geniş eşleşmeleri engelle (cümle içi iki nokta üst üste)
    if "\n" in label:
        return None
    return (label + ":", rest)


def _try_paragraph_to_two_column_row(text: str) -> Optional[Dict[str, Any]]:
    pair = _try_split_label_value_text(text)
    if not pair:
        return None
    label, value = pair
    return {"kind": "table_row", "cells": [label, value]}


def _looks_like_new_field_paragraph(text: str) -> bool:
    """Yeni bir form alanı satırı mı (sol tarafta etiket + iki nokta)?"""
    first = text.strip().split("\n", 1)[0].strip()
    if ":" not in first:
        return False
    idx = first.index(":")
    if idx > 58 or idx < 2:
        return False
    before = first[:idx].strip()
    if len(before) > 55:
        return False
    return True


def _looks_like_firma_adi_continuation(text: str) -> bool:
    """Firma adı değerinin ikinci satırı (SAN. TİC. LTD. ŞTİ. vb.)"""
    t = text.strip()
    if not t:
        return False
    if _looks_like_new_field_paragraph(t):
        return False
    if re.search(
        r"SAN\.\s*TİC\.|TİC\.\s*LTD|LTD\.?\s*ŞTİ\.?|ŞTİ\.?\s*\(|Üretici\s*/\s*İthalatçı",
        t,
        re.IGNORECASE,
    ):
        return True
    if t.startswith("(") and "Üretici" in t:
        return True
    return False


def _looks_like_phone_line(text: str) -> bool:
    """Telefon numarasına benzeyen kısa satır (OCR bazen etiketten ayırır)."""
    t = text.strip()
    if len(t) < 8:
        return False
    compact = re.sub(r"\s+", "", t)
    digits = sum(c.isdigit() for c in compact)
    if digits >= 10 and digits / max(1, len(compact)) > 0.5:
        return True
    if re.match(r"^0[\d\s\(\)\-]{8,}$", t.strip()):
        return True
    return False


def _should_merge_value_continuation(prev_row: Dict[str, Any], para_text: str) -> bool:
    """Önceki 2 sütunlu satırın sağ hücresine bu paragrafı eklemeli miyiz?"""
    if prev_row.get("kind") != "table_row":
        return False
    cells = prev_row.get("cells") or []
    if len(cells) != 2:
        return False
    left_l = cells[0].strip().lower()
    right = cells[1].strip()
    t = para_text.strip()
    if not t:
        return False
    if "bilgileri" in t.lower() and len(t) < 100 and "firma" not in t.lower():
        return False
    # Firma adı: uzun isim iki satıra bölünmüş
    if "firma adı" in left_l or "firma adi" in left_l:
        if _looks_like_firma_adi_continuation(t):
            return True
        if ":" not in t.split("\n")[0] and len(t) < 200:
            if right and not right.endswith(")"):
                if re.search(r"ŞTİ|TİC\.|LTD|SAN\.", t, re.IGNORECASE):
                    return True
    return False


def _normalize_single_cell_table_row(block: Dict[str, Any]) -> Dict[str, Any]:
    """Tek hücrede kalmış 'Etiket: değer' satırlarını ikiye böler."""
    if block.get("kind") != "table_row":
        return block
    cells = block.get("cells") or []
    if len(cells) != 1:
        return block
    pair = _try_split_label_value_text(cells[0])
    if not pair:
        return block
    return {"kind": "table_row", "cells": [pair[0], pair[1]]}


def _postprocess_form_layout_blocks(blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    - Paragraf olarak kalan 'Etiket: değer' satırlarını tablo satırına çevirir (Telefon hizası için).
    - Firma adı gibi alanlarda ikinci görsel satırı önceki satırın sağ hücresine birleştirir.
    """
    # A: paragrafları etiket/değer tablosuna çevir + tek hücreli tabloları böl
    pass1: List[Dict[str, Any]] = []
    for b in blocks:
        b = _normalize_single_cell_table_row(b)
        if b.get("kind") == "paragraph":
            conv = _try_paragraph_to_two_column_row(b.get("text", ""))
            if conv:
                pass1.append(conv)
                continue
        pass1.append(b)

    # B: devam satırlarını önceki satırın sağ hücresine yapıştır
    pass2: List[Dict[str, Any]] = []
    for b in pass1:
        if b.get("kind") == "paragraph" and pass2:
            prev = pass2[-1]
            if prev.get("kind") == "table_row" and len(prev.get("cells", [])) == 2:
                cells = prev["cells"]
                c0, c1 = cells[0].strip(), cells[1].strip()
                # Telefon etiketi tek satırda kaldıysa ve numara sonraki satırda geldiyse
                if (
                    c0.lower().startswith("telefon")
                    and ":" in c0
                    and _looks_like_phone_line(b.get("text", ""))
                    and len(c1) < 4
                ):
                    prev["cells"] = [cells[0], (c1 + " " + b["text"].strip()).strip()]
                    continue
            if _should_merge_value_continuation(prev, b.get("text", "")):
                cells = prev["cells"]
                prev["cells"] = [cells[0], (cells[1] + " " + b["text"].strip()).strip()]
                continue
        pass2.append(b)
    return pass2


def _is_section_heading_text(text: str) -> bool:
    t = text.strip()
    if len(t) > 90:
        return False
    if "Bilgileri" in t and len(t.split()) <= 8:
        return True
    if t.endswith(":") and len(t) < 50:
        return True
    return False


def _ocr_data_to_layout_blocks(ocr: Dict[str, Any], page_w: int) -> List[Dict[str, Any]]:
    """
    OCR çıktısını üstten alta sıralı blok listesine çevirir.
    - Etiket / değer: geniş boşlukla ayrılmış satırlar -> kenarlıksız tablo satırı
    - Tek sütun, ortada dar blok -> ortalanmış paragraf (başlık)
    """
    words = _parse_ocr_words(ocr)
    if not words:
        return []

    lines = _cluster_words_into_visual_lines(words)
    blocks: List[Dict[str, Any]] = []

    for line_words in lines:
        segs = _split_line_into_word_segments(line_words, page_w)
        texts = [_join_words_in_segment(s) for s in segs]
        texts = [t for t in texts if t.strip()]
        if not texts:
            continue

        if len(texts) == 1:
            text = texts[0]
            centered = _line_looks_centered(line_words, page_w)
            bold = _is_section_heading_text(text)
            blocks.append(
                {
                    "kind": "paragraph",
                    "text": text,
                    "centered": centered,
                    "bold": bold,
                }
            )
        else:
            # Çok sütun: üst bilgi (tarih | başlık | kullanıcı) veya yan yana alanlar
            blocks.append({"kind": "table_row", "cells": texts})

    return _postprocess_form_layout_blocks(blocks)


def _set_run_language_turkish(run) -> None:
    """Word yazım denetiminin Türkçe ile daha iyi çalışması için parça dilini ayarlar."""
    try:
        rpr = run._element.get_or_add_rPr()
        lang_el = OxmlElement("w:lang")
        lang_el.set(qn("w:val"), "tr-TR")
        lang_el.set(qn("w:eastAsia"), "tr-TR")
        rpr.append(lang_el)
    except Exception:
        pass


def _set_table_no_border(table) -> None:
    """Word tablosunda çizgileri kaldırır (düzen form görünümü)."""
    tbl = table._tbl
    tbl_pr = tbl.tblPr
    if tbl_pr is None:
        tbl_pr = OxmlElement("w:tblPr")
        tbl.insert(0, tbl_pr)
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "nil")
        el.set(qn("w:sz"), "0")
        el.set(qn("w:space"), "0")
        borders.append(el)
    tbl_pr.append(borders)


def _append_layout_block_to_document(doc: Document, block: Dict[str, Any]) -> None:
    if block.get("kind") == "paragraph":
        text = (block.get("text") or "").strip()
        if not text:
            return
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(5)
        run = p.add_run(text)
        run.bold = bool(block.get("bold"))
        _set_run_language_turkish(run)
        if block.get("centered"):
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        return

    if block.get("kind") == "table_row":
        cells = [c.strip() for c in block.get("cells") or [] if str(c).strip()]
        if not cells:
            return
        n = len(cells)
        tbl = doc.add_table(rows=1, cols=n)
        _set_table_no_border(tbl)
        row = tbl.rows[0]
        for j, ctext in enumerate(cells):
            cell = row.cells[j]
            cell.text = ""
            cp = cell.paragraphs[0]
            cp.paragraph_format.space_after = Pt(2)
            cp.paragraph_format.left_indent = Pt(0)
            r = cp.add_run(ctext)
            r.bold = False
            _set_run_language_turkish(r)
        if n == 3:
            row.cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.LEFT
            row.cells[1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            row.cells[2].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
        # İki sütun: sol etiket, sağ değer (tipik form)
        if n == 2:
            try:
                row.cells[0].width = Inches(2.25)
                row.cells[1].width = Inches(4.35)
            except Exception:
                pass
        return


# --- 2. PDF BİRLEŞTİRME ---
def merge_pdfs(pdf_list: List[str], output_path: str, progress_callback=None) -> bool:
    """
    Merge multiple PDFs into a single output.

    progress_callback signature (optional):
        progress_callback(current: int, total: int, where_text: str) -> bool|None
    If it returns False, the operation is cancelled.
    """
    try:
        merger = PyPDF2.PdfMerger()
        total = len(pdf_list)
        for idx, pdf in enumerate(pdf_list, start=1):
            if not os.path.isfile(pdf):
                raise FileNotFoundError(f"Birleştirilecek dosya bulunamadı: {pdf}")

            where = os.path.basename(pdf)
            if progress_callback:
                res = progress_callback(idx, max(1, total), where)
                if res is False:
                    raise Exception("İşlem iptal edildi.")

            merger.append(pdf)

        if progress_callback:
            # Yazı aşamasını göstermek için son aşama (output yazılıyor)
            progress_callback(max(1, total), max(1, total), "PDF yazılıyor...")
        merger.write(output_path)
        merger.close()
        return True
    except Exception as e:
        raise Exception(f"Birleştirme Hatası: {e}")


# --- 3. SAYFA AYIKLA (tek PDF olarak) ---
def extract_pages(pdf_path: str, pages: List[int], output_path: str) -> bool:
    """
    Extract given pages (1-indexed list) from pdf_path and write to output_path as a single PDF.
    Raises ValueError for invalid page numbers and Exception for other failures.
    """
    try:
        reader = PyPDF2.PdfReader(pdf_path)
        num_pages = len(reader.pages)

        # Validate pages (1-indexed expected)
        normalized = []
        for p in pages:
            if not isinstance(p, int):
                raise ValueError(f"Sayfa numarası tam sayı olmalıdır: {p}")
            if p < 1 or p > num_pages:
                raise ValueError(f"Geçersiz sayfa numarası: {p} (Dosya {num_pages} sayfa)")
            normalized.append(p)

        writer = PyPDF2.PdfWriter()
        for p in normalized:
            writer.add_page(reader.pages[p - 1])

        with open(output_path, "wb") as f:
            writer.write(f)

        return True
    except Exception as e:
        raise Exception(f"Ayıklama Hatası: {e}")


# --- 4. SAYFA AYIKLA (her sayfa ayrı dosya olarak) ---
def extract_pages_separate(pdf_path: str, pages: List[int], output_folder: str) -> List[str]:
    """
    Extract given pages (1-indexed) and save each as a separate PDF in output_folder.
    Returns list of output file paths. Raises exceptions on error.
    """
    try:
        if not os.path.isdir(output_folder):
            raise FileNotFoundError(f"Hedef klasör bulunamadı: {output_folder}")

        reader = PyPDF2.PdfReader(pdf_path)
        num_pages = len(reader.pages)

        normalized = []
        for p in pages:
            if not isinstance(p, int):
                raise ValueError(f"Sayfa numarası tam sayı olmalıdır: {p}")
            if p < 1 or p > num_pages:
                raise ValueError(f"Geçersiz sayfa numarası: {p} (Dosya {num_pages} sayfa)")
            normalized.append(p)

        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        output_paths = []

        for p in normalized:
            writer = PyPDF2.PdfWriter()
            writer.add_page(reader.pages[p - 1])
            out_name = f"{base_name}_page_{p}.pdf"
            out_path = os.path.join(output_folder, out_name)
            with open(out_path, "wb") as f:
                writer.write(f)
            output_paths.append(out_path)

        return output_paths

    except Exception as e:
        raise Exception(f"Ayrı Ayırma Hatası: {e}")
