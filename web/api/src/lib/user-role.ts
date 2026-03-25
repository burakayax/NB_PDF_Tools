import type { User, UserRole } from "@prisma/client";
import { isAdminEmail } from "./role-policy.js";

export type { UserRole };

/** Yetki: e-posta politikasına göre (DB’deki role alanı yanlış olsa bile). */
export function isAdminUser(user: Pick<User, "email">): boolean {
  return isAdminEmail(user.email);
}
