# Release Checklist

## Code and Structure

- `README.md`, `CHANGELOG.md`, `LICENSE` ve `pyproject.toml` dosyaları güncel mi kontrol et
- `requirements.txt` son durumu yansıtıyor mu kontrol et
- Geçici çıktı, `__pycache__`, `.pyc` ve test artıkları release paketine girmiyor mu kontrol et

## Functional Verification

- `python -m src` ile uygulama açılıyor mu kontrol et
- Ana menüdeki tüm butonlar tıklanabiliyor mu kontrol et
- PDF birleştirme testi yap
- Sayfa ayıklama testi yap
- PDF -> Word testi yap
- Word -> PDF testi yap
- Excel -> PDF testi yap
- PDF -> Excel düz metin modu testi yap
- PDF -> Excel tablo koruma modu testi yap
- PDF sıkıştırma testi yap
- PDF şifreleme testi yap

## Release Content

- `release/GITHUB_RELEASE.md` içindeki metni son kez gözden geçir
- Ekran görüntülerini `release/screenshots/` altına ekle
- Gerekliyse sürüm numarasını güncelle
- Release başlığı ve tag değerini belirle

## Final Check

- Uygulama temiz bir ortamda açılabiliyor mu kontrol et
- Gerekiyorsa exe veya zip paketi oluştur
- Yayınlanacak dosyaları son kez doğrula
