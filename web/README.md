# NB PDF PLARTFORM Web

> **Geliştirme:** Üç servisi birlikte başlatmak için çoğu zaman proje **kökünde** `npm run install-all` ve `npm run dev` yeterlidir. Ayrıntılar: kökteki **CALISTIRMA.md**.

Bu klasör, masaüstü uygulamasını temel alan web sürümünü içerir. Yapı artık üç parçadan oluşur:

- `frontend/`: React + TypeScript + Vite arayüzü
- `backend/`: FastAPI tabanlı PDF işleme servisi
- `api/`: Node.js + Express + Prisma tabanlı kimlik doğrulama servisi

## Mimari

- `frontend` kullanıcı arayüzünü ve oturum akışını yönetir.
- `backend` mevcut `src/pdf_engine.py` motorunu kullanarak PDF işlemlerini yürütür.
- `api` kayıt olma, giriş yapma, oturum yenileme ve kullanıcı kimliği doğrulama işlemlerini sağlar.

## 1. PDF işleme servisini çalıştırma

1. Sanal ortam oluştur:
   `python -m venv .venv`
2. Aktif et:
   `.\.venv\Scripts\activate`
3. Gerekli paketleri yükle:
   `python -m pip install -r backend/requirements.txt`
4. PDF API'yi başlat:
   `uvicorn app.main:app --reload --app-dir backend`

Bu servis varsayılan olarak `http://localhost:8000` adresinde açılır.

## 2. Kimlik doğrulama API'sini çalıştırma

1. `api/` klasörüne gir:
   `cd api`
2. Paketleri yükle:
   `npm install`
3. Ortam dosyasını oluştur:
   `.env.example` dosyasını `.env` olarak kopyala
4. Gerekirse `.env` içindeki değerleri düzenle:
   - `PORT=4000`
   - `FRONTEND_ORIGIN=http://localhost:5173`
   - `DATABASE_URL="file:./dev.db"`
   - `JWT_ACCESS_SECRET=...`
   - `JWT_REFRESH_SECRET=...`
   - `EMAIL_VERIFICATION_TTL_HOURS=24`
   - `APP_BASE_URL=http://localhost:4000`
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=587`
   - `SMTP_SECURE=false`
   - `SMTP_USER=...`
   - `SMTP_PASS=...`
   - `SMTP_FROM_EMAIL=...`
   - `SMTP_FROM_NAME=NB PDF PLARTFORM`
   - `ADMIN_EMAIL=admin@example.com` (kendi yönetici gelen kutunuz)
5. Prisma istemcisini üret:
   `npm run prisma:generate`
6. Veritabanını hazırla:
   `npm run prisma:push`
7. API'yi başlat:
   `npm run dev`

Kimlik doğrulama servisi varsayılan olarak `http://localhost:4000` adresinde açılır.

### Mevcut auth endpoint'leri

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/verify-email?token=...`
- `GET /verify-email?token=...`
- `PATCH /api/auth/preferences/language`

### Mevcut contact endpoint'i

- `POST /api/contact`

## 3. Frontend çalıştırma

1. `frontend/` klasörüne gir:
   `cd frontend`
2. Paketleri yükle:
   `npm install`
3. Ortam dosyasını oluştur:
   `.env.example` dosyasını `.env` olarak kopyala
4. Geliştirme sunucusunu başlat:
   `npm run dev`

Arayüz varsayılan olarak `http://localhost:5173` adresinde açılır.

## Frontend ortam değişkenleri

- `VITE_API_BASE=http://localhost:8000`
- `VITE_SAAS_API_BASE=http://localhost:4000`

## Auth sistemi özeti

- E-posta + şifre ile kayıt ve giriş
- Hesap doğrulama e-postası gönderimi
- JWT access token
- HttpOnly refresh cookie
- Prisma tabanlı kullanıcı, refresh token ve e-posta doğrulama token kayıtları
- Oturum yenileme ve güvenli çıkış
- Frontend tarafında korumalı çalışma alanı erişimi

### Doğrulama akışı

- Kullanıcı kayıt olduğunda doğrulama e-postası gönderilir
- Hesap doğrulanmadan giriş yapılamaz
- Doğrulama bağlantısı tek kullanımlık ve süreli token içerir
- Geçersiz veya süresi dolmuş token için hata sayfası döner

## Abonelik sistemi özeti

- `FREE`, `PRO`, `BUSINESS` plan yapısı
- Günlük kullanım takibi
- Plan bazlı modül erişimi
- Frontend içinde plan yükseltme / değiştirme paneli
- İşlem sonrası kullanım kaydı

## İletişim formu özeti

- Landing page üzerinde `name`, `email`, `message` alanları
- Frontend tarafında zorunlu alan ve e-posta format doğrulaması
- Backend tarafında `POST /api/contact`
- SMTP ile admin adresine e-posta gönderimi
- Temel spam koruması
- Rate limiting: 15 dakikada 5 istek

### Mevcut subscription endpoint'leri

- `GET /api/subscription/plans`
- `GET /api/subscription/current`
- `POST /api/subscription/change-plan`
- `POST /api/subscription/record-usage`

### Mevcut davranış

- `FREE`: günlük 5 işlem, sınırlı araç erişimi
- `PRO`: sınırsız kullanım, tüm araçlar
- `BUSINESS`: sınırsız kullanım, tüm araçlar, çok kullanıcılı yapı için hazır temel

Not:
- Şu anki plan değiştirme akışı ödeme entegrasyonu olmadan çalışır ve geliştirme amaçlıdır.
- Stripe / PayTR / iyzico bağlandığında bu endpoint yapısı satın alma akışına bağlanacaktır.

## Şu anki kapsam

- Premium çok dilli landing page
- Kayıt ol / giriş yap akışı
- Oturum doğrulama ve kullanıcı oturumu geri yükleme
- Abonelik özeti, kullanım takibi ve plan değiştirme
- PDF araç ekranına oturum sonrası erişim
- Mevcut PDF araçları:
  - PDF birleştirme
  - Sayfa ayırma
  - PDF -> Word
  - Word -> PDF
  - Excel -> PDF
  - PDF -> Excel
  - PDF sıkıştırma
  - PDF şifreleme

## Teknik notlar

- `backend` servisi mevcut `src/pdf_engine.py` dosyasını yeniden kullanır.
- `Word -> PDF` ve `Excel -> PDF` web sunucusunda en iyi sonucu Windows + Office kurulu ortamda verir.
- `PDF -> Word` tarafında yalnızca düzenlenebilir yapıyı korumaya çalışan dönüşüm aktif tutuldu.
- `api` servisi şu anda yerel geliştirme için SQLite kullanır. Üretim ortamında PostgreSQL'e geçilmesi önerilir.
