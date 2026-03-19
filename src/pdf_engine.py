import pikepdf


def extract_single_page(input_path, output_path, page_num):
    """Bozuk PDF yapılarını tamir ederek sayfa ayıklar."""
    # pikepdf dosyayı açarken hataları otomatik tamir eder
    with pikepdf.open(input_path) as pdf:
        # Yeni bir PDF oluştur
        new_pdf = pikepdf.new()

        # Seçilen sayfayı kopyala (Sayfa sayıları pikepdf'te 0'dan başlar)
        new_pdf.pages.append(pdf.pages[page_num - 1])

        # Dosyayı kaydet
        new_pdf.save(output_path)