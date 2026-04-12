# GitHub Release Metni

## Release Title

`NB PDF TOOLS v1.0.0`

## Suggested Tag

`v1.0.0`

## Release Body

```md
## Overview

NB PDF TOOLS is a Windows desktop application designed to simplify common PDF workflows from a single interface. It brings together PDF conversion, page extraction, compression, password protection, and Office document conversion features in one place.

## Highlights

- Merge multiple PDF files into a single document
- Extract selected pages from a PDF
- Convert PDF to Word
- Convert Word to PDF
- Convert Excel to PDF
- Convert PDF to Excel
- Preserve table layout when possible during PDF to Excel conversion
- Compress PDF files
- Protect PDF files with passwords

## PDF to Excel Modes

- **Table Preservation Mode**: tries to keep table cells and layout by using table-aware extraction
- **Plain Text Mode**: exports selectable text line by line into Excel

## Best For

- Office teams working with recurring PDF and document conversion tasks
- Users who need a practical desktop utility instead of multiple online TOOLS
- Workflows that require quick PDF handling on Windows

## Requirements

- Windows environment
- Python 3.13+
- Tesseract OCR
- Poppler
- Microsoft Word for Word to PDF conversion

## Notes

- Table preservation quality depends on the structure of the source PDF
- Scanned PDFs and visually complex tables may require OCR or manual review
- Some conversion features rely on external applications or system TOOLS

## Included Project Improvements

- Added professional release documentation
- Added package entry point support with `python -m src`
- Improved output dialog labels based on generated file type
- Expanded project ignore rules for cleaner releases

## Screenshots

Recommended screenshot files:

- `release/screenshots/main-menu.png`
- `release/screenshots/merge-window-empty.png`
- `release/screenshots/merge-window-list.png`
- `release/screenshots/merge-progress.png`
- `release/screenshots/extract-pages.png`
- `release/screenshots/encrypt-pdf.png`
- `release/screenshots/success-dialog.png`
```

## Release Assets Recommendation

Release yayınlarken aşağıdaki dosyaları eklemeniz önerilir:

- Kaynak kod paketleri
- Hazir exe veya kurulum paketi varsa o cikti
- `README.md`
- Gerekirse kullanim kilavuzu veya kurulum notu

## Screenshot Notes

Ekran görüntüsü planlaması için `release/SCREENSHOTS.md` dosyasını kullanın.
