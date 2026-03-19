import pytesseract
from pdf2image import convert_from_path
from docx import Document
from docx.shared import Pt
import PyPDF2
import os

# --- YOLLAR ---
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
base_dir = os.path.dirname(os.path.abspath(__file__))
# Poppler klasörünün proje ana dizinindeki Library/bin içinde olduğu varsayılır
poppler_bin_path = os.path.join(base_dir, "..", "Library", "bin")


def pdf_to_word(pdf_path, docx_path):
    """
    Resim PDF'lerdeki kelimelerin koordinatlarını hesaplar.
    Aynı hizada olanları yakalar ve aradaki boşluğa göre 'TAB' ekleyerek
    sütun düzenini korumaya çalışır.
    """
    try:
        # 1. PDF sayfalarını yüksek kaliteli resme çevir (300 DPI düzen için şart)
        pages = convert_from_path(pdf_path, 300, poppler_path=poppler_bin_path)

        doc = Document()

        # Sayfa kenar boşluklarını daralt (Lojistik formları geniş olur)
        for section in doc.sections:
            section.left_margin = Pt(30)
            section.right_margin = Pt(30)
            section.top_margin = Pt(30)
            section.bottom_margin = Pt(30)

        for i, page in enumerate(pages):
            # 2. Tesseract'tan detaylı koordinat verilerini al
            data = pytesseract.image_to_data(page, lang='tur+eng', output_type=pytesseract.Output.DICT)

            lines = {}
            # Kelimeleri satır bazlı (Y koordinatına göre) grupla
            for j in range(len(data['text'])):
                text = data['text'][j].strip()
                if text:
                    y_coord = data['top'][j]
                    # 15 piksellik tolerans ile aynı satırda olduklarını varsayıyoruz
                    line_key = y_coord // 15

                    if line_key not in lines:
                        lines[line_key] = []

                    # X koordinatı (left) ve genişlik (width) verisini sakla
                    lines[line_key].append({
                        'x': data['left'][j],
                        'w': data['width'][j],
                        'text': text
                    })

            # 3. Satırları yukarıdan aşağıya işle
            for key in sorted(lines.keys()):
                # Kelimeleri soldan sağa diz
                sorted_words = sorted(lines[key], key=lambda x: x['x'])

                line_text = ""
                last_x_end = 0

                for word in sorted_words:
                    # İki kelime arasındaki boşluğu ölç
                    gap = word['x'] - last_x_end

                    # Eğer boşluk büyükse (sütun farkı varsa) TAB veya çoklu boşluk ekle
                    if last_x_end != 0:
                        if gap > 60:  # 60 pikselden büyükse sütun muamelesi yap
                            line_text += "\t\t"
                        elif gap > 20:
                            line_text += "    "
                        else:
                            line_text += " "

                    line_text += word['text']
                    last_x_end = word['x'] + word['w']

                # Word'e ekle ve paragraf arası boşluğu sıfırla
                paragraph = doc.add_paragraph(line_text)
                paragraph.paragraph_format.space_after = Pt(0)

            if i < len(pages) - 1:
                doc.add_page_break()

        doc.save(docx_path)
        return True

    except Exception as e:
        raise Exception(f"Gelişmiş OCR Hatası: {str(e)}")


# --- 2. PDF BİRLEŞTİRME ---
def merge_pdfs(pdf_list, output_path):
    try:
        merger = PyPDF2.PdfMerger()
        for pdf in pdf_list:
            merger.append(pdf)
        merger.write(output_path)
        merger.close()
        return True
    except Exception as e:
        print(f"Birleştirme Hatası: {e}")
        return False


# --- 3. SAYFA AYIKLA ---
def extract_pages(pdf_path, pages, output_path):
    try:
        reader = PyPDF2.PdfReader(pdf_path)
        writer = PyPDF2.PdfWriter()
        for p in pages:
            if 0 <= p < len(reader.pages):
                writer.add_page(reader.pages[p])
        with open(output_path, "wb") as f:
            writer.write(f)
        return True
    except Exception as e:
        print(f"Ayıklama Hatası: {e}")
        return False