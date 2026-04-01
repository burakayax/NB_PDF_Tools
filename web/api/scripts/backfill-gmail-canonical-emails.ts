/**
 * Tek seferlik: User.email alanını Gmail kanonik formuna çeker (a.bc@gmail.com -> abc@gmail.com).
 * İki farklı satır aynı kanonik adrese düşerse konsola DUPLICATE yazar; kayıtları elle birleştirmeniz gerekir.
 *
 * Çalıştırma (web/api dizininde): npm run backfill:gmail-emails
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { normalizeEmailForStorage } from "../src/lib/email-identity-normalize.js";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  let updated = 0;
  for (const u of users) {
    let next: string;
    try {
      next = normalizeEmailForStorage(u.email);
    } catch {
      continue;
    }
    if (next === u.email) {
      continue;
    }
    const clash = await prisma.user.findUnique({ where: { email: next } });
    if (clash && clash.id !== u.id) {
      console.error("[backfill] DUPLICATE canonical", { from: u.email, to: next, keepId: clash.id, dropId: u.id });
      continue;
    }
    await prisma.user.update({ where: { id: u.id }, data: { email: next } });
    console.log("[backfill] OK", u.email, "->", next);
    updated += 1;
  }
  console.log("[backfill] done, updated:", updated);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
