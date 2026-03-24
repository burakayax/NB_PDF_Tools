import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MISSING_MSG =
  ".env dosyası bulunamadı. Lütfen SETUP.md dosyasını kontrol edin.";

/**
 * Yerel geliştirmede .env unutulduğunda Zod hatalarından önce net uyarı verir.
 * Üretimde yalnızca ortam değişkenleri kullanılıyorsa dosya zorunlu değildir.
 */
export function assertEnvFileExists(): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  const configDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(configDir, "..", "..");
  const envPath = path.join(packageRoot, ".env");
  if (!fs.existsSync(envPath)) {
    console.error(MISSING_MSG);
    process.exit(1);
  }
}
