import pytesseract
from pdf2image import convert_from_path
from docx import Document
from docx.shared import Pt
import PyPDF2
import os
from typing import List

# --- YOLLAR ---
# Tesseract'in yolu: sisteminizde farklıysa burayı güncelleyin
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
base_dir = os.path.dirname(os.path.abspath(__file__))
# Poppler klasörünün proje ana dizinindeki Library/bin içinde olduğu varsayılır
poppler_bin_path = os.path.join(base_dir, "..", "Library", "bin")


def get_num_pages(pdf_path: str) -> int:
    """Return number of pages in the given PDF."""
    try:
        reader = PyPDF2.PdfReader(pdf_path)
        return len(reader.pages)
    except Exception as e:
        raise Exception(f"PDF sayfa sayısı okunamadı: {e}")


def pdf_to_word(pdf_path: str, docx_path: str) -> bool:
    """
    OCR tabanlı PDF -> DOCX dönüşümü.
    Görüntü PDF'leri önce resme çevirir, sonra Tesseract ile metin ve pozisyon bilgisi alarak
    satır ve tablo benzeri yapıları korumaya çalışır.
    """
    try:
        pages = convert_from_path(pdf_path, 300, poppler_path=poppler_bin_path)

        doc = Document()

        # Sayfa kenar boşluklarını daralt
        for section in doc.sections:
            section.left_margin = Pt(30)
            section.right_margin = Pt(30)
            section.top_margin = Pt(30)
            section.bottom_margin = Pt(30)

        for i, page in enumerate(pages):
            data = pytesseract.image_to_data(page, lang='tur+eng', output_type=pytesseract.Output.DICT)

            lines = {}
            for j in range(len(data.get('text', []))):
                text = (data.get('text', [])[j] or "").strip()
                if text:
                    y_coord = data.get('top', [])[j]
                    line_key = y_coord // 15

                    if line_key not in lines:
                        lines[line_key] = []

                    lines[line_key].append({
                        'x': data.get('left', [])[j],
                        'w': data.get('width', [])[j],
                        'text': text
                    })

            for key in sorted(lines.keys()):
                sorted_words = sorted(lines[key], key=lambda x: x['x'])

                line_text = ""
                last_x_end = 0

                for word in sorted_words:
                    gap = word['x'] - last_x_end
                    if last_x_end != 0:
                        if gap > 60:
                            line_text += "\t\t"
                        elif gap > 20:
                            line_text += "    "
                        else:
                            line_text += " "

                    line_text += word['text']
                    last_x_end = word['x'] + word['w']

                paragraph = doc.add_paragraph(line_text)
                paragraph.paragraph_format.space_after = Pt(0)

            if i < len(pages) - 1:
                doc.add_page_break()

        doc.save(docx_path)
        return True

    except Exception as e:
        raise Exception(f"Gelişmiş OCR Hatası: {e}")


# --- 2. PDF BİRLEŞTİRME ---
def merge_pdfs(pdf_list: List[str], output_path: str) -> bool:
    """Merge multiple PDFs into a single output. Raises Exception on failure."""
    try:
        merger = PyPDF2.PdfMerger()
        for pdf in pdf_list:
            if not os.path.isfile(pdf):
                raise FileNotFoundError(f"Birleştirilecek dosya bulunamadı: {pdf}")
            merger.append(pdf)
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
