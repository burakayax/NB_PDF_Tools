# NB PDF TOOLS — Birlikte çalıştırma (kök `npm` betikleri)

Bu dosya **proje kökündeki** `package.json` içindeki komutların ne işe yaradığını Türkçe açıklar.

## Ön koşullar

- **Node.js** 20+ ve **npm**
- **Python** 3.11+ (PDF web servisi için; yoksa `npm run dev` sırasında uyarı verilir, kimlik API ve Vite yine çalışabilir)

**Taze klon:** Proje kökünde `npm install` çalıştırdığınızda `postinstall` betiği `web/api` ve `web/frontend` bağımlılıklarını da kurar. `npm run dev` öncesinde `predev` betiği eksik `.env` dosyalarını `.env.example` üzerinden oluşturur, gerekirse `web/.venv` ve SQLite veritabanını hazırlar.

---

## Betikler (`npm run …`)

### `postinstall` (otomatik)

**Ne yapar?** Kök `npm install` bittikten sonra `web/api` ve `web/frontend` içinde birer `npm install` çalıştırır.

**Neden?** Tek `npm install` ile tüm Node parçalarının kurulması içindir.

---

### `predev` / `prestart` (otomatik)

**Ne yapar?** `npm run dev` veya `npm run start` öncesi `scripts/ensure-dev-prereqs.mjs` çalışır: gerekirse `.env` kopyaları, eksik `node_modules`, `web/.venv`, Prisma istemcisi ve ilk kez `dev.db` (`prisma db push`).

---

### `npm run install-all`

**Ne yapar?**

1. Kök klasörde `concurrently` dahil kök bağımlılıkları yükler.
2. `web/api` içinde `npm install` çalıştırır.
3. `web/frontend` içinde `npm install` çalıştırır.
4. `scripts/install-python-web.mjs` ile `web/.venv` yoksa oluşturur; ardından  
   `web/backend/requirements.txt` ve kök `requirements.txt` için `pip install` yapar (PDF motoru için).
5. `web/api` içinde `prisma generate` çalıştırır (Prisma istemcisi).

**Neden gerekli?**

Üç web parçası (PDF API, kimlik API, arayüz) ve Python tarafını tek komutla hazırlamak içindir.

**Not:** Veritabanı şemasını veritabanına uygulamak için ayrıca `npm run prisma:push` (veya kökten aynı işi yapan betik) ve geçerli bir `web/api/.env` gerekir.

---

### `npm run dev` (ana komut)

**Ne yapar?**

Önce `predev` ile ortam doğrulanır, ardından aynı anda üç süreci başlatır (`concurrently` ile):

| Etiket | Süreç | Varsayılan adres |
|--------|--------|-------------------|
| `pdf` | FastAPI + uvicorn (`scripts/run-pdf-api.mjs`, `--reload`) | http://127.0.0.1:8000 |
| `api` | Node kimlik / abonelik API (`web/api`, `tsx watch`) | http://localhost:4000 |
| `ui` | Vite geliştirme sunucusu (`web/frontend`) | http://localhost:5173 |

**Neden gerekli?**

Tarayıcıdaki uygulama hem PDF işlemleri hem oturum için bu üç servise birden ihtiyaç duyar; tek terminalde hepsini ayağa kaldırır.

**Durdurma:** Terminalde `Ctrl+C` — `concurrently` genelde tüm alt süreçleri sonlandırır.

---

### `npm run start`

**Ne yapar?**

Yine üç süreç, **üretime daha yakın** modlarla:

| Etiket | Süreç |
|--------|--------|
| `pdf` | uvicorn **reload olmadan** (`--prod` bayrağı) |
| `api` | `web/api` içinde `npm run start` → derlenmiş `dist/server.js` |
| `ui` | `vite preview` (önce `build:all` ile derlenmiş `dist` olmalı) |

**Neden ayrı?**

Geliştirmede `dev` kullanılır; `start` önce derleme sonrası hızlı doğrulama içindir.

**Önemli:** `start` öncesi kökten `npm run build:all` çalıştırın; aksi halde `api` veya `ui` eksik derleme yüzünden hata verebilir.

---

### `npm run build:all`

**Ne yapar?**

- `web/api`: TypeScript derlemesi (`tsc`)
- `web/frontend`: `tsc` + Vite production build

**Ne zaman?**

`npm run start` veya dağıtım öncesi.

---

### `npm run prisma:push`

**Ne yapar?**

`web/api` içinde Prisma şemasını veritabanına uygular (`prisma db push`).

**Ne zaman?**

İlk kurulumda veya şema değişince; `web/api/.env` içinde geçerli `DATABASE_URL` olmalıdır.

---

## Özet akış (yeni geliştirici)

```bash
git clone <repo>
cd NB_PDF_TOOLS
cp web/api/.env.example web/api/.env
cp web/frontend/.env.example web/frontend/.env
# .env dosyalarını düzenleyin (JWT, e-posta, ADMIN_EMAIL vb.)

npm run install-all
npm run prisma:push
npm run dev
```

Tarayıcı: **http://localhost:5173**

---

## Olası sorunlar

| Durum | Çözüm |
|--------|--------|
| `pdf` hemen düşüyor | `web/.venv` ve `npm run install-all` ile Python bağımlılıklarını yükleyin; Tesseract/Poppler yolları için `SETUP_NOTES.txt`. |
| `api` başlamıyor | `web/api/.env` eksik veya hatalı; `JWT_*` en az 32 karakter, `ADMIN_EMAIL` dolu olsun. |
| Port meşgul | 8000, 4000 veya 5173 kullanan uygulamayı kapatın veya ilgili projede portu değiştirin. |

Daha genel kurulum için bkz. **SETUP.md** ve **web/README.md**.
