/**
 * Taze klon veya eksik ortamda `npm run dev` öncesi:
 * - web/api ve web/frontend için .env yoksa .env.example kopyalanır
 * - node_modules eksikse npm install çalıştırılır
 * - Prisma client üretilir; SQLite veritabanı dosyası yoksa db push yapılır
 * - web/.venv yoksa Python sanal ortamı kurulmaya çalışılır (PDF servisi için)
 * - web/.venv varken web/backend/requirements.txt pip ile eşitlenir (PyJWT vb. eksik kalmasın)
 *
 * Not: Windows'ta npm alt süreçleri execSync ile çalıştırılır (spawn EINVAL hatasından kaçınmak için).
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const apiDir = path.join(root, "web", "api");
const feDir = path.join(root, "web", "frontend");
const webDir = path.join(root, "web");
const isWin = process.platform === "win32";

function run(label, cwd, command) {
  try {
    execSync(command, { cwd, stdio: "inherit", env: process.env, windowsHide: true });
  } catch (e) {
    const code = typeof e.status === "number" ? e.status : 1;
    console.error(`[ensure-dev] Başarısız (${label}): ${command}`);
    process.exit(code);
  }
}

function copyEnvIfMissing(packageDir) {
  const dest = path.join(packageDir, ".env");
  const example = path.join(packageDir, ".env.example");
  if (fs.existsSync(dest) || !fs.existsSync(example)) {
    return;
  }
  fs.copyFileSync(example, dest);
  console.log(
    `[ensure-dev] ${path.relative(root, dest)} oluşturuldu (.env.example kopyası). Üretimde gerçek değerler kullanın.`,
  );
}

function ensureNodeDeps(packageDir, name) {
  const nm = path.join(packageDir, "node_modules");
  if (fs.existsSync(nm)) {
    return;
  }
  console.log(`[ensure-dev] ${name}: bağımlılıklar yükleniyor...`);
  run("npm install", packageDir, "npm install --no-fund --no-audit");
}

copyEnvIfMissing(apiDir);
copyEnvIfMissing(feDir);

ensureNodeDeps(apiDir, "web/api");
ensureNodeDeps(feDir, "web/frontend");

function hasWebVenv() {
  if (isWin) {
    return fs.existsSync(path.join(webDir, ".venv", "Scripts", "python.exe"));
  }
  const py3 = path.join(webDir, ".venv", "bin", "python3");
  const py = path.join(webDir, ".venv", "bin", "python");
  return fs.existsSync(py3) || fs.existsSync(py);
}

if (!hasWebVenv()) {
  const installPy = path.join(root, "scripts", "install-python-web.mjs");
  if (fs.existsSync(installPy)) {
    console.log("[ensure-dev] web/.venv bulunamadı; Python ortamı kuruluyor (PDF API için)...");
    const r = spawnSync(process.execPath, [installPy], { cwd: root, stdio: "inherit" });
    if (r.status !== 0) {
      console.warn(
        "[ensure-dev] Python/venv kurulamadı; PDF API (8000) çalışmayabilir. İsteğe bağlı: npm run install-all veya SETUP_NOTES.txt.",
      );
    }
  }
}

function webVenvPythonPath() {
  if (isWin) {
    return path.join(webDir, ".venv", "Scripts", "python.exe");
  }
  const py3 = path.join(webDir, ".venv", "bin", "python3");
  if (fs.existsSync(py3)) {
    return py3;
  }
  return path.join(webDir, ".venv", "bin", "python");
}

if (hasWebVenv()) {
  const py = webVenvPythonPath();
  const backendReqs = path.join(webDir, "backend", "requirements.txt");
  if (fs.existsSync(py) && fs.existsSync(backendReqs)) {
    const r = spawnSync(py, ["-m", "pip", "install", "-q", "-r", backendReqs], {
      cwd: webDir,
      stdio: "pipe",
      encoding: "utf8",
    });
    if (r.status !== 0) {
      console.warn(
        "[ensure-dev] web/backend/requirements.txt kurulamadı; PDF API (8000) ImportError ile düşebilir. Manuel: web\\.venv\\Scripts\\python.exe -m pip install -r web\\backend\\requirements.txt",
      );
    }
  }
}

const prismaClientMarker = path.join(apiDir, "node_modules", ".prisma", "client", "index.js");
if (!fs.existsSync(prismaClientMarker)) {
  run("prisma generate", apiDir, "npm run prisma:generate");
}

// Prisma resolves SQLite `file:./…` relative to prisma/schema.prisma’s directory.
const devDb = path.join(apiDir, "prisma", "dev.db");
if (!fs.existsSync(devDb)) {
  console.log("[ensure-dev] SQLite veritabanı yok; prisma db push çalıştırılıyor...");
  run("prisma db push", apiDir, "npm run prisma:push");
}

console.log("[ensure-dev] Hazır.");
