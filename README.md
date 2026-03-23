# NB PDF Tools

`NB PDF Tools`, Windows odaklı bir masaüstü PDF dönüştürme ve belge yönetim uygulamasıdır. Tek arayüz üzerinden PDF, Word ve Excel dosyalarıyla çalışmayı kolaylaştırır; özellikle ofis kullanım senaryoları için hızlı ve pratik akışlar sunar.

## Özellikler

- PDF birleştirme
- PDF sayfa ayıklama
- PDF -> Word dönüşümü
- Word -> PDF dönüşümü
- Excel -> PDF dönüşümü
- PDF -> Excel dönüşümü
- PDF sıkıştırma
- PDF şifreleme

## PDF -> Excel Modları

- `Tablo koruma modu`: `pdfplumber` ile tablo hücre yapısını korumaya çalışır.
- `Düz metin modu`: PDF içindeki seçilebilir metni sayfa ve satır bazlı Excel'e aktarır.

Not: Taranmış PDF'lerde, çok karmaşık düzenlerde veya çizgisel olmayan tablolarda tablo koruma modu birebir sonuç vermeyebilir.

## Sistem Gereksinimleri

- Windows 10 veya üzeri
- Python 3.13+
- `pip`
- Tesseract OCR
- Poppler
- Microsoft Word
  - `Word -> PDF` dönüşümü için gerekir

## Kurulum

1. Depoyu klonlayın veya indirin.
2. Bağımlılıkları kurun:

```bash
python -m pip install -r requirements.txt
```

3. Harici araçları doğrulayın:

- Tesseract kurulu olmalı
- Poppler dosyaları proje içindeki beklenen konumda olmalı
- Microsoft Word gerekiyorsa sistemde kurulu olmalı

## Çalıştırma

```bash
python -m src
```

Alternatif:

```bash
python src/main.py
```

## Kullanım Senaryoları

- Birden fazla PDF dosyasını tek dosyada birleştirme
- PDF içinden belirli sayfaları ayrı çıkarma
- Hazır PDF tablolarını Excel'e aktarma
- Word veya Excel belgelerini PDF'e dönüştürme
- PDF boyutunu azaltma
- PDF dosyalarını parola ile koruma

## Kurumsal destek (WhatsApp bot arka ucu)

Ana ekrandaki **İLETİŞİM** düğmesi, uygulama içi sohbet penceresi açar. Sohbet, sizin barındırdığınız **HTTP destek API** üzerinden çalışır; bu API genelde Meta WhatsApp Cloud API ile konuşur.

Yapılandırma:

1. `support_config.example.json` dosyasını `support_config.json` olarak kopyalayın ve `api_base_url` ile isteğe bağlı `api_key` alanlarını doldurun.
2. İsteğe bağlı ortam değişkenleri: `NB_SUPPORT_API_BASE_URL`, `NB_SUPPORT_API_KEY`, `NB_SUPPORT_API_PREFIX`.

Beklenen uçlar (kök yola göre):

- `POST /sessions`
- `POST /sessions/{id}/messages` (gövde: `{"text": "..."}`)
- `GET /sessions/{id}/messages` (isteğe bağlı `?since=...`)
- `POST /sessions/{id}/handoff`

## Proje Yapısı

```text
NB_PDF_Tools/
  README.md
  support_config.example.json
  requirements.txt
  pyproject.toml
  CHANGELOG.md
  LICENSE
  release/
    GITHUB_RELEASE.md
    RELEASE_CHECKLIST.md
    SCREENSHOTS.md
    screenshots/
  src/
    __main__.py
    main.py
    pdf_engine.py
    modules/
    tests/
```

## Teknik Yapı

- `src/main.py`: ana pencere ve menü yönetimi
- `src/pdf_engine.py`: dönüşüm ve PDF işleme mantığı
- `src/modules/`: her özellik için ayrı pencere ve ortak dialog bileşenleri
- `src/tests/test_pdf_engine.py`: temel `unittest` kapsamı

## Release Hazırlığı

GitHub release için hazır dosyalar:

- `release/GITHUB_RELEASE.md`
- `release/RELEASE_CHECKLIST.md`
- `release/SCREENSHOTS.md`

## Lisans

Bu proje `MIT License` ile lisanslanmıştır. Ayrıntı için `LICENSE` dosyasına bakın.
