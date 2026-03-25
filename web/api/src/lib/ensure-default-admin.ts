import { env } from "../config/env.js";
import { hashPassword } from "./password.js";
import { prisma } from "./prisma.js";
import { resolveRoleFromEmail } from "./role-policy.js";

// İlk kurulumda .env ile hesap oluşturur; rol yalnızca e-postaya göre (yalnızca nbglobalstudio@gmail.com → ADMIN).
// BOOTSTRAP_ADMIN_EMAIL ve BOOTSTRAP_ADMIN_PASSWORD ikisi de dolu değilse hiçbir şey yapmaz (sırlar repoda tutulmaz).
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
  const role = resolveRoleFromEmail(email);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      authProvider: "local",
      role,
      isVerified: true,
      verifiedAt: new Date(),
      plan: "PRO",
    },
  });

  console.log(`Bootstrap user created (${email}, role=${role}).`);
}
