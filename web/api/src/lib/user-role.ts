import type { User, UserRole } from "@prisma/client";

export type { UserRole };

export function isAdminUser(user: Pick<User, "role">): boolean {
  return user.role === "ADMIN";
}
