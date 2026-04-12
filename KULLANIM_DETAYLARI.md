# NB PDF PLARTFORM — Kullanım Detayları

Bu dosya, projeyi **kod bilgisi olmayan** biri için de anlaşılır şekilde özetler: klasörler ne işe yarar, metni nereden değiştirirsiniz, ödeme ve e-posta ayarları nerededir, masaüstü uygulaması nasıl derlenir.

---

## 1) Proje yapısı (klasörler)

Projede kökte tek bir `backend` veya `desktop` klasörü **yoktur**; işlevler **alt klasörlere** ayrılmıştır. Mantıksal karşılıklar şöyledir:

### `web/backend/` — PDF işlemleri sunucusu (Python)

- **Ne işe yarar:** PDF birleştirme, sıkıştırma, dönüştürme gibi **ağır işleri** yapan **FastAPI** (Python) servisi.
- **Ne zaman çalışır:** Web uygulaması veya geliştirme ortamında `npm run dev` ile birlikte ayağa kalkar (varsayılan adres: `http://127.0.0.1:8000` civarı).
- **Kısaca:** “Eski anlamdaki PDF motoru sunucusu” buradadır.

### `web/frontend/` — Web arayüzü (tarayıcı)

- **Ne işe yarar:** Kullanıcının **tarayıcıda** gördüğü sayfalar, butonlar, giriş ekranı, çalışma alanı.
- **Teknoloji:** React + Vite (modern web arayüzü).
- **Ne zaman çalışır:** Geliştirmede genelde `http://localhost:5173` adresinde açılır.

### `web/api/` — Kimlik, abonelik ve ödeme API’si (Node.js)

- **Ne işe yarar:** **Giriş / kayıt**, JWT oturumu, **iyzico ödemesi**, **abonelik durumu**, günlük kullanım limitleri, veritabanı (Prisma) işlemleri.
- **Teknoloji:** Node.js + TypeScript; asıl yapılandırma dosyası: **`web/api/.env`** (aşağıda anlatılıyor).
- **Ne zaman çalışır:** Geliştirmede genelde `http://localhost:4000` adresinde dinler.

### Masaüstü uygulaması — `src/` (Windows .exe)

- **Ne işe yarar:** Bilgisayara kurulan **NB PDF PLARTFORM masaüstü programı** buradaki Python kodlarıdır (CustomTkinter arayüzü).
- **Ana giriş dosyası:** `src/main.py` veya çalıştırma için `src/__main__.py` (aşağıda “Masaüstü uygulaması” bölümünde).
- **Kısaca:** “Desktop” dediğimiz parça pratikte **`src/`** klasörüdür; kökte ayrı bir `desktop/` klasörü yoktur.

### Diğer önemli yerler

| Konum | Açıklama |
|--------|----------|
| `src/locales/` | Masaüstü uygulamasında Türkçe / İngilizce metinler (`en.json`, `tr.json`) |
| `assets/` | Masaüstü ikon vb. |
| `config/` | Örnek üretim ortamı ayarları |
| `docs/` | Ek teknik notlar (ör. exe derleme: `docs/MASAUSTU_BUILD.md`) |
| Kök `package.json` | Web + API’yi birlikte çalıştıran `npm run dev` gibi komutlar |

---

## 2) Metinleri nasıl değiştirirsiniz?

### Masaüstü uygulaması (Windows programı)

1. Klasörü açın: **`src/locales/`**
2. Dosyalar:
   - **`en.json`** — İngilizce metinler
   - **`tr.json`** — Türkçe metinler
3. Bir **buton yazısı** değiştirmek için: Bu dosyalarda tırnak içindeki metni bulun (örnek anahtar: `"login": "SIGN IN"`). İlgili anahtarın **sağındaki** metni düzenleyin.
4. **Dikkat:** JSON formatını bozmayın (virgül, tırnak, süslü parantezlere dikkat). Kaydettikten sonra uygulamayı yeniden çalıştırın.

**Örnek:** Ana penceredeki bir ifadeyi değiştirmek için `tr.json` içinde `"main"` bölümüne bakın; uygulama adı için `"app"` bölümüne bakın.

### Web sitesi (tarayıcı arayüzü)

- Çoğu görünür metin **`web/frontend/src`** altında, bileşen (`.tsx`) veya çeviri dosyalarında olur.
- Proje büyük olduğu için: önce tarayıcıda gördüğünüz **İngilizce kelimeyi** proje içinde arama (Ctrl+Shift+F) yaparak hangi dosyada geçtiğini bulmak pratik olur.

---

## 3) Ödeme (iyzico) yapılandırması

- **Anahtarların yazıldığı yer:** **`web/api/.env`** dosyası (repoda doğrudan yoktur; **`web/api/.env.example`** şablon olarak verilir).
- **Kopyalama:** İlk kurulumda genelde `.env.example` → `.env` olarak kopyalanır veya `npm run dev` öncesi betikler eksikse oluşturur.
- **Doldurulacak değişkenler (özet):**

```env
IYZICO_API_KEY=...
IYZICO_SECRET_KEY=...
IYZICO_URI=https://sandbox-api.iyzipay.com
```

- **Sandbox:** Test için `sandbox-api.iyzipay.com` kullanılır.
- **Canlı (üretim):** iyzico panelinden üretim anahtarları ve genelde `https://api.iyzipay.com` adresi kullanılır (`.env.example` içindeki yorumlara bakın).

**Önemli:** Bu anahtarları **asla** e-posta ile veya herkese açık yere yapıştırmayın; sadece sunucunuzdaki `.env` dosyasında tutun.

---

## 4) Giriş ve kayıt (kimlik) sistemi

### Sunucu tarafı (API)

| Ne | Dosya / klasör |
|----|----------------|
| Rotalar (URL yolları) | `web/api/src/modules/auth/auth.routes.ts` |
| İş mantığı (login, kayıt, profil) | `web/api/src/modules/auth/auth.service.ts` |
| İstek doğrulama şemaları | `web/api/src/modules/auth/auth.schema.ts` |
| Google ile giriş | `web/api/src/modules/auth/auth.google.ts` |

**E-posta ile doğrulama metinleri:** `web/api/src/modules/auth/` altında (ör. `auth.email.ts`, `verification-email-branded.ts`) ve e-posta gönderimiyle ilgili kısımlar.

### Web arayüzü (tarayıcı)

- API çağrıları: **`web/frontend/src/api/auth.ts`** (veya benzeri `api` dosyaları)
- Hangi ekranın gösterildiği: büyük ölçüde **`web/frontend/src/App.tsx`**

**Not:** Davranışı değiştirmeden sadece **buton yazısı** değiştirecekseniz önce `web/frontend` içinde metni arayın; bazen metinler ayrı çeviri dosyalarında olabilir.

---

## 5) E-posta sistemi (gönderici ayarları)

- **Yapılandırma yeri:** Yine **`web/api/.env`** dosyası.
- **Tipik değişkenler:**

```env
EMAIL_USER=...
EMAIL_PASS=...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_FROM_NAME=NB PDF PLARTFORM
```

- **Gmail kullanıyorsanız:** Normal hesap şifresi çoğu zaman çalışmaz. Google Hesabı → Güvenlik → **2 adımlı doğrulama** açıkken **uygulama şifresi** oluşturup `EMAIL_PASS` alanına yazmanız gerekir (`.env.example` içindeki Türkçe açıklamaya bakın).
- **Kod tarafında** e-posta gönderimine dair mantık: **`web/api/src/modules/auth/auth.email.ts`** ve ilgili auth dosyalarında toplanmıştır.

---

## 6) Masaüstü uygulaması

### Ana program dosyası

- **Giriş noktası:** **`src/main.py`** — pencereyi oluşturan ana sınıf burada başlar.
- Komut satırından çalıştırma: proje kökünde `python -m src` veya projenin dokümantasyonundaki gibi **`python -m src`** / `src/__main__.py` üzerinden.

### `.exe` (Windows yürütülebilir) nasıl üretilir?

Projede hazır tek tıkla `build.bat` her zaman olmayabilir. Önerilen yöntem **PyInstaller**; **ayrıntılı adımlar** için şu dosyayı okuyun:

- **`docs/MASAUSTU_BUILD.md`**

**Kısa özet:**

1. Python kurulu olsun; proje kökünde `pip install -r requirements.txt`
2. `pip install pyinstaller`
3. Kökte küçük bir `build_entry.py` ile `src.__main__` çağrılır (örnek `MASAUSTU_BUILD.md` içinde)
4. `pyinstaller --onefile --windowed --name "NB_PDF_PLARTFORM" build_entry.py`
5. Çıktı genelde **`dist/NB_PDF_PLARTFORM.exe`** olur.

**Not:** Tesseract, Poppler, ikon dosyaları gibi ek dosyalar tam dağıtım için ayrıca paketlenmelidir; detay yine `MASAUSTU_BUILD.md` ve `SETUP_NOTES.txt` içindedir.

### Masaüstü sunucu adresi

- Masaüstü uygulaması API’ye bağlanmak için **`desktop_auth_config.json`** (proje kökünde veya `%APPDATA%\NB PDF PLARTFORM` altında) kullanabilir; içinde **`api_base_url`** (örn. `http://127.0.0.1:4000/api`) tanımlanır.

---

## 7) Ortam değişkenleri (.env) — net kullanım

**`.env` nedir?** Sunucunun **şifre, anahtar ve adres** gibi ayarları tuttuğu metin dosyasıdır. Kodun içine yazılmaz; böylece güvenlik ve farklı ortamlar (geliştirme / sunucu) kolayca ayrılır.

| Dosya | Kim kullanır |
|--------|----------------|
| **`web/api/.env`** | Kimlik API, veritabanı, JWT, Gmail/ SMTP, **iyzico**, log yolları |
| **`web/frontend/.env`** | Tarayıcı uygulamasının hangi adrese bağlanacağı gibi **ön yüz** ayarları (örnekler `.env.example` içinde) |

**İlk kurulum:**

1. `web/api/.env.example` dosyasını kopyalayın → adını **`.env`** yapın (aynı klasörde).
2. İçindeki örnek değerleri kendi ortamınıza göre doldurun.
3. `web/frontend` için de aynı mantık: `.env.example` → `.env`.

**Kural:** `.env` dosyalarını **Git’e göndermeyin** (gizli anahtarlar içerir). Repoda sadece `.env.example` kalır.

---

## 8) Sık yapılan işler

### Logo değiştirmek

- **Masaüstü penceresi ikonu:** Kökte veya `assets/` altında **`nb_pdf_PLARTFORM_icon.png`** gibi dosyalara kod içinde referans vardır (`src/main.py` içinde ikon yolu kontrol edilir).
- **Web sitesi:** `web/frontend` içinde `public/` veya bileşenlerde kullanılan görsel dosyaları değiştirin; dosya adı değiştiyse ilgili `.tsx` dosyasında yolu güncellemeniz gerekir.

### Fiyatlandırma (paket fiyatları)

- **Ödeme oturumu (iyzico):** Sunucu tarafında **`web/api/src/modules/payment/`** (ör. `payment.service.ts`) ve ilgili şema dosyaları.
- **Web’de gösterilen plan metinleri:** `web/frontend` içinde abonelik / ödeme sayfalarına bakın (dosya adları projeye göre değişebilir; “pricing”, “subscription” gibi kelimelerle arama yapın).

### Limitleri değiştirmek (günlük ücretsiz kullanım vb.)

- **Sunucu kuralları (hangi özellik hangi planda, günlük kaç işlem):**  
  **`web/api/src/modules/subscription/subscription.config.ts`**  
  Burada planlar (`FREE`, `PRO`, …) ve **`dailyLimit`** gibi değerler tanımlıdır.
- **Değişiklikten sonra:** API’yi yeniden derleyip sunucuyu yeniden başlatmanız gerekir. Veritabanı şeması değişmediyse sadece yeniden başlatmak yeterli olabilir.

---

## 9) Sıfırdan projeyi çalıştırma (adım adım)

Aşağıdaki adımlar **geliştirme bilgisayarı** içindir. Her adımda bir öncekinin tamamlanmış olması gerekir.

### Adım 1: Programları kurun

- **Node.js** (mümkünse LTS, örn. 20+) — [nodejs.org](https://nodejs.org)
- **Python** 3.11 veya uyumlu sürüm — [python.org](https://www.python.org)
- **Git** (projeyi indirdiyseniz atlanabilir)

### Adım 2: Projeyi bilgisayara alın

- ZIP ile indirdiyseniz klasörü açın veya `git clone` ile kopyalayın.

### Adım 3: Terminali proje kökünde açın

- Windows’ta klasörde **“PowerShell”** veya **“Komut İstemi”** burada aç seçeneğini kullanın.

### Adım 4: Bağımlılıkları yükleyin

Kök klasörde (içinde `package.json` olan yerde):

```bash
npm install
npm run install-all
```

`install-all`; Node paketleri, Python sanal ortamı, Prisma vb. için kullanılır (detay: `CALISTIRMA.md`).

### Adım 5: Ortam dosyalarını hazırlayın

- `web/api/.env.example` → **`web/api/.env`** kopyalayın, en azından `DATABASE_URL`, `JWT_*` ve geliştirme için makul varsayılanları doldurun.
- `web/frontend/.env.example` varsa → **`web/frontend/.env`** yapın.

Geliştirme betiği eksik dosyaları bazen otomatik oluşturur; yine de `.env` içeriğini kontrol edin.

### Adım 6: Veritabanını oluşturun

Kökten (veya `web/api` içinden projenin dokümantasyonuna uygun şekilde):

```bash
npm run prisma:push
```

(Bu komut kök `package.json` üzerinden `web/api` içindeki Prisma’yı çalıştırır.)

### Adım 7: Geliştirme sunucusunu başlatın

Kök klasörde:

```bash
npm run dev
```

Bu komut genelde **üç şeyi birden** başlatır:

1. PDF API (Python, `web/backend`)
2. Kimlik / ödeme API (`web/api`, port **4000**)
3. Web arayüzü (Vite, port **5173**)

Tarayıcıda **`http://localhost:5173`** adresine gidin.

### Adım 8: Durdurmak

- Terminal penceresinde **Ctrl+C** ile süreçleri durdurun.

---

### Ek: Sadece masaüstü uygulamasını çalıştırmak

1. Python bağımlılıkları: `pip install -r requirements.txt` (kökte)
2. Kimlik API’nin çalışıyor olması gerekir (örn. `http://127.0.0.1:4000/api`)
3. `desktop_auth_config.json` içinde `api_base_url` doğru ayarlanmış olsun
4. Kökte: `python -m src`

---

## Yardımcı dosyalar (İngilizce / teknik)

- **`CALISTIRMA.md`** — Kök `npm` komutlarının Türkçe açıklaması  
- **`README.md`** — Genel proje özeti  
- **`docs/MASAUSTU_BUILD.md`** — `.exe` derleme  
- **`SETUP_NOTES.txt` / `SETUP.md`** — Kurulum notları  

---

*Bu belge proje yapısına göre özetlenmiştir; dosya yolları gelecekteki sürümlerde değişebilir. Şüphede önce `README.md` ve `CALISTIRMA.md` dosyalarını kontrol edin.*
