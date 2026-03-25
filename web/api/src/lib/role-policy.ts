import type { UserRole } from "@prisma/client";

/** Tek hesap yönetici olabilir; tam e-posta eşleşmesi (küçük harf). */
export const ADMIN_EMAIL = "nbglobalstudio@gmail.com";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Yeni kullanıcılar ve oturum senkronu için: yalnızca ADMIN_EMAIL → ADMIN. */
export function resolveRoleFromEmail(email: string): UserRole {
  return normalizeEmail(email) === ADMIN_EMAIL ? "ADMIN" : "USER";
}

export function isAdminEmail(email: string): boolean {
  return resolveRoleFromEmail(email) === "ADMIN";
}
