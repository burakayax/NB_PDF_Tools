# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Ana ekran iç destek sohbeti: HTTP destek API üzerinden oturum, mesaj ve `handoff` (`support_config.json` / ortam değişkenleri)
- PDF -> Excel tablo koruma modu
- Excel -> PDF donusum penceresi
- PDF sikistirma penceresi
- PDF sifreleme penceresi
- `python -m src` icin `src/__main__.py`
- GitHub release icin `release/` dokumantasyon yapisi
- Kapsamli `README.md`, `LICENSE` ve paket metadata dosyalari

### Changed

- Basari dialogundaki dosya acma metni dosya turune gore dinamik hale getirildi
- `.gitignore` release ve gelistirme artiklarini daha iyi dislayacak sekilde genisletildi

### Fixed

- PDF -> Excel sonrasi sonuc dialogunda Excel dosyasi icin yanlis "PDF'i Ac" metni duzeltildi
