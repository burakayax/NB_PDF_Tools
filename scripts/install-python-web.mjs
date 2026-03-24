/**
 * `web/.venv` sanal ortamını yoksa oluşturur ve PDF web + kök pdf_engine bağımlılıklarını yükler.
 * Sistemde Python kurulu olmalıdır (Windows: python veya py -3).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const webDir = path.join(root, "web");
const isWin = process.platform === "win32";

function venvPython() {
  if (isWin) {
    return path.join(webDir, ".venv", "Scripts", "python.exe");
  }
  const py3 = path.join(webDir, ".venv", "bin", "python3");
  const py = path.join(webDir, ".venv", "bin", "python");
  if (fs.existsSync(py3)) {
    return py3;
  }
  return py;
}

function findBootstrapPython() {
  const attempts = isWin
    ? [
        ["python", ["--version"]],
        ["py", ["-3", "--version"]],
      ]
    : [
        ["python3", ["--version"]],
        ["python", ["--version"]],
      ];
  for (const [cmd, args] of attempts) {
    const r = spawnSync(cmd, args, { encoding: "utf8", shell: isWin });
    if (r.status === 0) {
      return cmd;
    }
  }
  return null;
}

function run(cwd, cmd, args, label) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: isWin && (cmd === "py" || cmd === "python") });
  if (r.status !== 0) {
    console.error(`[install-python-web] Başarısız: ${label}`);
    process.exit(r.status ?? 1);
  }
}

const bootstrap = findBootstrapPython();
if (!bootstrap) {
  console.error("[install-python-web] Python bulunamadı. Python 3.11+ kurun ve PATH'e ekleyin.");
  process.exit(1);
}

const venvPath = path.join(webDir, ".venv");
if (!fs.existsSync(venvPath)) {
  console.log("[install-python-web] web/.venv oluşturuluyor...");
  const createArgs = isWin && bootstrap === "py" ? ["-3", "-m", "venv", ".venv"] : ["-m", "venv", ".venv"];
  const createCmd = isWin && bootstrap === "py" ? "py" : bootstrap;
  run(webDir, createCmd, createArgs, "venv oluşturma");
}

const py = venvPython();
if (!fs.existsSync(py)) {
  console.error("[install-python-web] venv içinde python bekleniyordu:", py);
  process.exit(1);
}

const reqs = [path.join(webDir, "backend", "requirements.txt"), path.join(root, "requirements.txt")];
for (const req of reqs) {
  if (!fs.existsSync(req)) {
    console.warn("[install-python-web] Atlanıyor (dosya yok):", req);
    continue;
  }
  console.log("[install-python-web] pip install -r", path.relative(root, req));
  run(webDir, py, ["-m", "pip", "install", "-r", req], `pip install ${path.basename(req)}`);
}

console.log("[install-python-web] Tamam.");
