/**
 * FastAPI PDF servisini (uvicorn) başlatır; çalışma dizini `web/` olmalıdır.
 * Önce `web/.venv` içindeki Python kullanılır; yoksa sistem `python` / `python3` denenir.
 */
import { spawn } from "node:child_process";
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
const args = ["-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", "8000"];
if (!prod) {
  args.push("--reload");
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
