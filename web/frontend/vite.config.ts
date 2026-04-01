import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JavaScriptObfuscator from "javascript-obfuscator";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const MISSING_ENV_MSG =
  ".env dosyası bulunamadı. Lütfen SETUP.md dosyasını kontrol edin.";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

/** Üretim çıktısında ek sıkıştırma (gerçek güvenlik değil; caydırıcı). */
function productionObfuscatePlugin(): Plugin {
  return {
    name: "nb-js-obfuscate",
    apply: "build",
    enforce: "post",
    renderChunk(code, chunk) {
      if (!chunk.fileName.endsWith(".js")) {
        return null;
      }
      try {
        const result = JavaScriptObfuscator.obfuscate(code, {
          compact: true,
          simplify: true,
          stringArray: true,
          stringArrayEncoding: ["base64"],
          stringArrayThreshold: 0.5,
          identifierNamesGenerator: "hexadecimal",
          renameGlobals: false,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          selfDefending: false,
          debugProtection: false,
        });
        return { code: result.getObfuscatedCode(), map: null };
      } catch (err) {
        console.warn("[nb-js-obfuscate] chunk skipped:", chunk.fileName, err);
        return null;
      }
    },
  };
}

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
  const saasProxyTarget = (env.VITE_SAAS_PROXY_TARGET || "http://127.0.0.1:4000").replace(/\/$/, "");
  /** Kimlik / abonelik Express API; `/api` PDF’e gitmeden önce eşleşmeli. */
  const saasProxy = {
    target: saasProxyTarget,
    changeOrigin: true,
  };
  const apiProxy = {
    target: pdfProxyTarget,
    changeOrigin: true,
    /** Büyük PDF indirmelerinde ve yavaş bağlantılarda proxy’nin erken kesmesini önler. */
    timeout: 900_000,
    proxyTimeout: 900_000,
  };
  const saasApiPrefixes = ["auth", "subscription", "payment", "contact", "analytics", "user", "device", "license", "errors"];

  const isProd = mode === "production";
  /** Vercel’de obfuscation sık OOM / zaman aşımı üretir; yerelde VITE_DISABLE_OBFUSCATION=true ile de kapatılabilir. */
  const disableObfuscation =
    env.VITE_DISABLE_OBFUSCATION === "true" || process.env.VERCEL === "1";

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(command === "serve" ? [warnIfPdfApiUnreachable(pdfProxyTarget)] : []),
      ...(isProd && !disableObfuscation ? [productionObfuscatePlugin()] : []),
    ],
    server: {
      port: 5173,
      proxy: {
        ...Object.fromEntries(saasApiPrefixes.map((p) => [`/api/${p}`, saasProxy])),
        "/api": apiProxy,
      },
    },
    preview: {
      port: 4173,
      proxy: {
        ...Object.fromEntries(saasApiPrefixes.map((p) => [`/api/${p}`, saasProxy])),
        "/api": apiProxy,
      },
    },
    build: {
      minify: "esbuild",
      target: "es2020",
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react-dom")) {
              return "react-dom";
            }
            if (id.includes("node_modules/react/")) {
              return "react";
            }
          },
        },
      },
      ...(isProd
        ? {
            esbuild: {
              drop: ["console", "debugger"],
              legalComments: "none",
            },
          }
        : {}),
    },
  };
});
