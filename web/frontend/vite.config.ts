import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const MISSING_ENV_MSG =
  ".env dosyası bulunamadı. Lütfen SETUP.md dosyasını kontrol edin.";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

/** Yalnızca `web/frontend` içinde `npm run dev` çalıştırıldığında PDF API kapalı olabilir; terminale net uyarı. */
function warnIfPdfApiUnreachable(pdfTarget: string): Plugin {
  return {
    name: "nb-warn-pdf-api",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        setTimeout(() => {
          const url = `${pdfTarget}/api/health`;
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), 2500);
          fetch(url, { signal: ac.signal })
            .then((res) => {
              clearTimeout(timer);
              if (!res.ok) {
                console.warn(`[vite] PDF API beklenmiyor: ${url} → HTTP ${res.status}`);
              }
            })
            .catch(() => {
              clearTimeout(timer);
              console.warn(
                "\n[vite] ─────────────────────────────────────────────────────\n" +
                  "[vite] PDF API'ye ulaşılamıyor (" +
                  pdfTarget +
                  "). Bu pencerede yalnızca Vite çalışıyor olabilir.\n" +
                  "[vite] PDF araçları için: proje kökünde `npm run dev` veya `node scripts/run-pdf-api.mjs`\n" +
                  "[vite] ─────────────────────────────────────────────────────\n",
              );
            });
        }, 400);
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  if (command === "serve" && !fs.existsSync(path.join(frontendRoot, ".env"))) {
    console.error(MISSING_ENV_MSG);
    process.exit(1);
  }

  const env = loadEnv(mode, frontendRoot, "");
  const pdfProxyTarget = (env.VITE_PDF_PROXY_TARGET || "http://127.0.0.1:8000").replace(/\/$/, "");
  const apiProxy = {
    target: pdfProxyTarget,
    changeOrigin: true,
    /** Büyük PDF indirmelerinde ve yavaş bağlantılarda proxy’nin erken kesmesini önler. */
    timeout: 900_000,
    proxyTimeout: 900_000,
  };

  return {
    plugins: [react(), tailwindcss(), ...(command === "serve" ? [warnIfPdfApiUnreachable(pdfProxyTarget)] : [])],
    server: {
      port: 5173,
      proxy: {
        "/api": apiProxy,
      },
    },
    preview: {
      port: 4173,
      proxy: {
        "/api": apiProxy,
      },
    },
  };
});
