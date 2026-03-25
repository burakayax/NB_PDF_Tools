/**
 * FastAPI PDF servisini (uvicorn) başlatır; çalışma dizini `web/` olmalıdır.
 * Önce `web/.venv` içindeki Python kullanılır; yoksa sistem `python` / `python3` denenir.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const webDir = path.join(root, "web");
const isWin = process.platform === "win32";

function resolvePython() {
  const venvCandidates = isWin
    ? [path.join(webDir, ".venv", "Scripts", "python.exe")]
    : [
        path.join(webDir, ".venv", "bin", "python3"),
        path.join(webDir, ".venv", "bin", "python"),
      ];
  for (const p of venvCandidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return isWin ? "python" : "python3";
}

const prod = process.argv.includes("--prod");
const python = resolvePython();
const backendDir = path.join(webDir, "backend");

const importCheck = spawnSync(python, ["-c", "from app.main import app"], {
  cwd: backendDir,
  encoding: "utf8",
  env: process.env,
});
if (importCheck.status !== 0) {
  console.error("[run-pdf-api] app.main yüklenemedi (PDF API başlatılamaz).");
  console.error(importCheck.stderr || importCheck.stdout || "");
  console.error(
    "[run-pdf-api] Proje kökünde çalıştırın: web\\.venv\\Scripts\\python.exe -m pip install -r web\\backend\\requirements.txt",
  );
  console.error("[run-pdf-api] veya: npm run install-all");
  process.exit(1);
}

const noReload =
  process.env.PDF_API_NO_RELOAD === "1" || process.env.PDF_API_NO_RELOAD === "true";
const port = (process.env.PDF_API_PORT || "8000").trim() || "8000";
const args = ["-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", port];
if (!prod && !noReload) {
  args.push("--reload");
}

console.log(`[run-pdf-api] ${python}`);
console.log(
  `[run-pdf-api] http://127.0.0.1:${port}/api/health — bu adres yalnızca bu pencere açıkken çalışır; kapatırsanız PDF API durur.`,
);
if (port !== "8000") {
  console.log(
    "[run-pdf-api] Farklı port kullanılıyor; web/frontend/.env içinde VITE_PDF_PROXY_TARGET=http://127.0.0.1:" +
      port +
      " ayarlayın.",
  );
}

const child = spawn(python, args, {
  cwd: webDir,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});
