# NB PDF Tools — Kurulum Rehberi

Bu dosya projeyi ilk kez kuracaklar için sade adımları anlatır.

---

## 1) Proje nedir?

**NB PDF Tools**, PDF dosyaları üzerinde birleştirme, sayfa ayırma, dönüştürme, sıkıştırma ve şifreleme gibi işlemler yapmanızı sağlayan bir projedir.

- **Web sürümü:** Tarayıcıda çalışan arayüz; üç servisten oluşur (PDF API, kimlik doğrulama API’si, React arayüzü).
- **Masaüstü sürümü:** Windows’ta Python ve grafik arayüz ile çalışan uygulama.

---

## 2) Gereksinimler

| Araç | Not |
|------|-----|
| **Node.js** | **20 veya üzeri** (LTS sürüm önerilir). [nodejs.org](https://nodejs.org) adresinden indirebilirsiniz. |
| **npm** | Node.js ile birlikte gelir. Kurulumdan sonra terminalde `node -v` ve `npm -v` yazarak kontrol edin. |

**Web PDF servisi** için ayrıca:

- **Python 3.11 veya üzeri** (önerilir)
- `pip` (Python ile gelir)

**Masaüstü uygulaması** için ek olarak Word, Excel, Tesseract, Poppler vb. gerekebilir; ayrıntılar için depodaki `SETUP_NOTES.txt` dosyasına bakın.

---

## 3) Projeyi klonlama

Terminal veya Git istemcisinde depo adresinizi kullanın. Örnek:

```bash
git clone https://github.com/KULLANICI_ADI/NB_PDF_Tools.git
cd NB_PDF_Tools
```

> `KULLANICI_ADI` ve depo yolunu kendi Git sunucunuza göre değiştirin.

---

## 4) Kurulum adımları

### Hızlı yol (önerilen)

**Minimal (taze makine):** Proje kökünde:

```bash
npm install
npm run dev
```

`npm install` sırasında `postinstall` alt paketleri kurar. `npm run dev` öncesi `predev` eksik `web/api/.env` ve `web/frontend/.env` dosyalarını örneklerden oluşturur, gerekirse Python sanal ortamı ve SQLite veritabanını hazırlar. Üretimde `.env` içindeki örnek değerleri mutlaka değiştirin.

**Tam kurulum (Python + Prisma tek seferde):** Kökten `npm run install-all` — ayrıntı [CALISTIRMA.md](CALISTIRMA.md).

İlk veritabanı için `predev` genelde `prisma db push` yapar; şema değişince kökten `npm run prisma:push` kullanabilirsiniz.

### Elle kurulum (üç parça)

Projede **üç ayrı Node/Python parçası** vardır. Her biri kendi klasöründe `npm install` veya `pip` ister.

### A) Kimlik doğrulama API’si (`web/api`)

```bash
cd web/api
npm install
npm run prisma:generate
npm run prisma:push
```

- `prisma:generate`: Veritabanı istemci kodunu üretir.
- `prisma:push`: Şemayı SQLite dosyasına uygular (`.env` içindeki `DATABASE_URL`).

### B) PDF işleme servisi (`web/backend`)

Komutları **`web` klasörünün içinden** çalıştırın (bir üst klasör `backend` olsun diye).

```bash
cd web
python -m venv .venv
```

**Windows (PowerShell):**

```powershell
.\.venv\Scripts\activate
python -m pip install -r backend/requirements.txt
```

**macOS / Linux:**

```bash
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
```

> Bu servis, proje kökündeki `src/pdf_engine.py` motorunu kullanır. Python ve PDF kütüphaneleri için kökteki `requirements.txt` da gerekebilir; PDF işlemleri çalışmazsa kökten `pip install -r requirements.txt` deneyin.

### C) Web arayüzü (`web/frontend`)

```bash
cd web/frontend
npm install
```

---

## 5) `.env` dosyası nasıl oluşturulur?

### Kimlik API’si — `web/api/.env`

1. `web/api` klasöründe `.env.example` dosyasını kopyalayın ve adını **`.env`** yapın.
2. Önemli alanların anlamı:

| Alan | Açıklama |
|------|-----------|
| `PORT` | API’nin dinleyeceği port (varsayılan genelde `4000`). |
| `NODE_ENV` | `development` veya `production`. |
| `FRONTEND_ORIGIN` | Tarayıcı adresi (geliştirmede çoğunlukla `http://localhost:5173`). |
| `DATABASE_URL` | SQLite için örnek: `file:./dev.db` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | En az 32 karakter, rastgele ve gizli tutun. |
| `APP_BASE_URL` | API’nin dışarıdan erişilen adresi (yerelde `http://localhost:4000`). |
| `EMAIL_USER` / `EMAIL_PASS` veya `SMTP_*` | E-posta gönderimi (doğrulama, iletişim formu). Gmail için genelde **Uygulama Şifresi** kullanılır. |
| `ADMIN_EMAIL` | Kayıt ve iletişim bildirimlerinin gideceği yönetici postası. |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | İsteğe bağlı: ikisi birden doluysa ilk açılışta bir kez ADMIN kullanıcı oluşturulur. Boş bırakılırsa otomatik yönetici oluşturulmaz. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | İsteğe bağlı: “Google ile devam et”. Boş bırakılırsa özellik kapalıdır. |
| `LOG_FILE_PATH` / `LOG_FILE_ENABLED` | Dosyaya günlük yazma (üretimde hata ayıklama için). |

### Web arayüzü — `web/frontend/.env`

1. `web/frontend` içinde `.env.example` dosyasını **`.env`** olarak kopyalayın.
2. Tipik değerler:

| Alan | Açıklama |
|------|-----------|
| `VITE_API_BASE` | PDF API adresi (varsayılan `http://localhost:8000`). |
| `VITE_SAAS_API_BASE` | Kimlik API’si adresi (varsayılan `http://localhost:4000`). |

---

## 6) Projeyi çalıştırma (`npm run dev`)

### Önerilen: proje kökünden tek komut

Kök klasörde (bu dosyanın bir üst dizininde) bağımlılıkları bir kez kurduktan sonra:

```bash
npm run install-all
npm run prisma:push
npm run dev
```

Bu komut **PDF API (8000)**, **kimlik API (4000)** ve **Vite arayüz (5173)** süreçlerini aynı anda başlatır. Ayrıntılı açıklamalar için kökteki **CALISTIRMA.md** dosyasına bakın.

Tarayıcı: **http://localhost:5173**

### Alternatif: üç ayrı terminal

Kök betiği kullanmak istemezseniz servisleri elle de başlatabilirsiniz; adımlar için **web/README.md** dosyasına bakın.

---

## 7) Masaüstü uygulaması nasıl çalıştırılır?

1. Proje **kök klasöründe** olduğunuzdan emin olun (`NB_PDF_Tools`).
2. Python sanal ortamı önerilir; bağımlılıklar:

```bash
python -m pip install -r requirements.txt
```

3. Uygulamayı başlatma:

```bash
python -m src
```

Ayrıntılı bağımlılıklar (Word, Excel, Tesseract, Poppler yolları) için **`SETUP_NOTES.txt`** dosyasına bakın.

---

## 8) Olası hatalar ve çözümleri

| Sorun | Ne yapmalı? |
|--------|-------------|
| `Port already in use` / adres kullanımda | 4000, 5173 veya 8000 başka programda açık olabilir. O programı kapatın veya `.env` / Vite ayarında portu değiştirin. |
| `npm: command not found` | Node.js kurulu değil veya PATH’e ekli değil. Node.js’i yeniden kurun, terminali kapatıp açın. |
| Prisma / veritabanı hataları | `web/api` içinde `npm run prisma:generate` ve `npm run prisma:push` çalıştırın. `.env` içinde `DATABASE_URL` doğru mu kontrol edin. |
| Arayüz PDF isteği başarısız | PDF servisinin 8000’de çalıştığından emin olun. `web/frontend/.env` içinde `VITE_API_BASE=http://localhost:8000` olduğunu kontrol edin. |
| Giriş / kayıt çalışmıyor | Kimlik API’sinin 4000’de çalıştığından emin olun. `VITE_SAAS_API_BASE` ve `web/api` içindeki `FRONTEND_ORIGIN` değerlerinin 5173 ile uyumlu olduğunu kontrol edin. |
| E-posta gitmiyor | SMTP veya Gmail Uygulama Şifresi bilgilerini kontrol edin. `EMAIL_*` veya `SMTP_*` alanları eksik/yanlışsa API başlangıçta hata verebilir. |
| Python `ModuleNotFoundError` | İlgili klasörde `pip install -r requirements.txt` (kök ve gerekirse `web/backend/requirements.txt`) çalıştırın. |
| PDF işlemleri web’de hata veriyor | Sunucuda Word/Excel yoksa bazı dönüşümler kısıtlı olabilir. `web/README.md` teknik notlarına bakın. |

Daha fazla ayrıntı için **`web/README.md`** (web mimarisi) ve **`SETUP_NOTES.txt`** (masaüstü ortamı) dosyalarını okuyun.
