import { env } from "../config/env.js";
import { hashPassword } from "./password.js";
import { prisma } from "./prisma.js";

// İlk kurulumda .env ile verilen tek yönetici hesabını oluşturur; HTTP ile dışa açılmaz.
// BOOTSTRAP_ADMIN_EMAIL ve BOOTSTRAP_ADMIN_PASSWORD ikisi de dolu değilse hiçbir şey yapmaz (sırlar repoda tutulmaz).
// Yanlış veya eksik .env ile üretimde bilinen varsayılan hesap oluşmaz; yönetici elle veya migration ile eklenmelidir.
export async function ensureDefaultAdminUser(): Promise<void> {
  const email = env.BOOTSTRAP_ADMIN_EMAIL.trim();
  const plainPassword = env.BOOTSTRAP_ADMIN_PASSWORD.trim();
  if (!email || !plainPassword) {
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    return;
  }

  const passwordHash = await hashPassword(plainPassword);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      authProvider: "local",
      role: "ADMIN",
      isVerified: true,
      verifiedAt: new Date(),
      plan: "PRO",
    },
  });

  console.log(`Bootstrap admin user created (${email}).`);
}
