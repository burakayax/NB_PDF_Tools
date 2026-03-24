import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const MISSING_ENV_MSG =
  ".env dosyası bulunamadı. Lütfen SETUP.md dosyasını kontrol edin.";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => {
  if (command === "serve" && !fs.existsSync(path.join(frontendRoot, ".env"))) {
    console.error(MISSING_ENV_MSG);
    process.exit(1);
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": "http://localhost:8000",
      },
    },
  };
});
