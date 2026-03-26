# Deploy

## Build

```bash
npm run install-all
npm run build:production
```

Çıktılar:

- `web/api/dist` — Node kimlik API
- `web/frontend/dist` — statik Vite dosyaları

## Ortam değişkenleri

Üretimde `NODE_ENV=production` ve `web/api` için `.env` dosyası **zorunlu değildir**; değişkenler süreç ortamından veya platform gizli deposundan verilir.

Özet şablon: `config/production.env.example`  
`web/api/.env.example`, `web/frontend/.env.example`, `web/backend/.env.example` dosyalarına bakın.

## HTTPS

- **Önerilen:** Nginx veya Caddy ile TLS sonlandırma; Node/uvicorn HTTP’de dinler (`deploy/nginx-https.example.conf` örneği).
- **Kimlik API:** `TRUST_PROXY=1`, `FORCE_HTTPS=true` (isteğe bağlı; HTTP istemcilerini HTTPS’e yönlendirir).
- **Doğrudan Node TLS:** `HTTPS_KEY_PATH` ve `HTTPS_CERT_PATH` doluysa `server.ts` HTTPS ile dinler.

## Çalıştırma (örnek)

- Kimlik API: `cd web/api && node dist/server.js`
- PDF API: `uvicorn app.main:app --host 127.0.0.1 --port 8000`
- Ön yüz: `dist` içeriğini Nginx `root` ile sunun veya `vite preview` yalnızca test için.
