# Masaüstü uygulaması — derleme (.exe)

Bu depoda **hazır bir `build.bat` / `.spec` dosyası bulunmayabilir.** Windows’ta tek dosya `.exe` üretmek için yaygın yöntem **PyInstaller** kullanmaktır.

## Ön koşullar

- Windows ve Python (projede önerilen sürüm: `SETUP_NOTES.txt` / `pyproject.toml`)
- Proje kökünde: `python -m pip install -r requirements.txt`
- Tesseract, Poppler (`Library\bin`), Word/Excel gibi **çalışma zamanı** bağımlılıkları — dağıtım paketine ayrıca eklemeniz veya kullanıcıya kurulum talimatı vermeniz gerekir

## Nasıl build edilir?

1. **PyInstaller’ı kurun** (sanal ortam kullanıyorsanız ortamın içinde):

   ```bash
   python -m pip install pyinstaller
   ```

2. **Giriş betiği:** PyInstaller doğrudan `python -m src` ile her zaman uyumlu çalışmayabilir. Proje **kökünde** geçici bir dosya oluşturun, örneğin `build_entry.py`:

   ```python
   from src.__main__ import main

   if __name__ == "__main__":
       main()
   ```

3. **Derlemeyi çalıştırın** (yine proje kökünde):

   ```bash
   pyinstaller --noconfirm --onefile --windowed --name "NB_PDF_PLARTFORM" build_entry.py
   ```

   - `--onefile`: tek `.exe` dosyası  
   - `--windowed`: konsol penceresi açılmaz (GUI uygulaması için uygun)

## Hangi komut çalıştırılır?

Özet olarak kök dizinde:

```text
python -m pip install pyinstaller
pyinstaller --noconfirm --onefile --windowed --name "NB_PDF_PLARTFORM" build_entry.py
```

(`build_entry.py` yukarıdaki içerikle sizin oluşturduğunuz dosyadır.)

## .exe dosyası nerede oluşur?

| Çıktı | Konum |
|--------|--------|
| Yürütülebilir dosya | `dist\NB_PDF_PLARTFORM.exe` (veya `--name` ile verdiğiniz isim + `.exe`) |
| Ara dosyalar | `build\` klasörü (gerekirse silebilirsiniz) |

Tam yol örneği: `NB_PDF_PLARTFORM\dist\NB_PDF_PLARTFORM.exe`

## Kısa notlar

- İlk denemede eksik modül hatası alırsanız PyInstaller çıktısına göre `--hidden-import=...` ekleyebilir veya `--collect-all customtkinter` gibi bayrakları kullanabilirsiniz.  
- `src/locales`, ikonlar veya `Library` içeriğini `.exe` ile birlikte dağıtmak için `--add-data` veya bir `.spec` dosyası gerekir; tam paketleme için `PyInstaller` belgelerine bakın.  
- `build_entry.py` dosyasını repoya eklemek zorunda değilsiniz; yalnızca derleme sırasında kullanabilirsiniz.

Genel kurulum ve çalıştırma: **SETUP_NOTES.txt**, **SETUP.md**.
