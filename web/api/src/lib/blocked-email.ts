import { prisma } from "./prisma.js";

export async function isEmailBlocked(normalizedEmail: string): Promise<boolean> {
  const row = await prisma.blockedEmail.findUnique({
    where: { email: normalizedEmail },
    select: { email: true },
  });
  return Boolean(row);
}

export async function upsertBlockedEmail(email: string, reason?: string | null) {
  return prisma.blockedEmail.upsert({
    where: { email },
    create: { email, reason: reason ?? null },
    update: { ...(reason !== undefined ? { reason } : {}) },
  });
}

export async function removeBlockedEmail(email: string): Promise<boolean> {
  const r = await prisma.blockedEmail.deleteMany({ where: { email } });
  return r.count > 0;
}

export async function listBlockedEmails() {
  return prisma.blockedEmail.findMany({
    orderBy: { createdAt: "desc" },
    select: { email: true, reason: true, createdAt: true },
  });
}
