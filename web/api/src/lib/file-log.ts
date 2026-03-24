import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

let writeChain: Promise<void> = Promise.resolve();

// Dosya günlüğü açıksa hedef yolun üst dizinini oluşturur; ilk append öncesi çağrılır.
// Dizin yoksa yazma işlemi hata verir ve üretim izleri kaybolur.
// Bu adım atlanırsa veya yanlış path verilirse günlük dosyası hiç oluşmayabilir.
export async function prepareLogFile(): Promise<void> {
  if (!env.LOG_FILE_ENABLED) {
    return;
  }
  const abs = path.resolve(env.LOG_FILE_PATH);
  await fs.mkdir(path.dirname(abs), { recursive: true });
}

// Tek bir NDJSON satırını dosyanın sonuna ekler; yazımları Promise zinciriyle sıraya alır.
// Eşzamanlı isteklerde satırların birbirine karışmasını önlemek için gereklidir.
// Zincir kaldırılırsa veya paralel append kullanılırsa log satırları bozuk JSON üretebilir.
export function appendLogLine(line: string): void {
  if (!env.LOG_FILE_ENABLED) {
    return;
  }
  const abs = path.resolve(env.LOG_FILE_PATH);
  writeChain = writeChain
    .then(async () => {
      await fs.appendFile(abs, `${line}\n`, "utf8");
    })
    .catch((err: unknown) => {
      console.error("[file-log] append failed", err);
    });
}
