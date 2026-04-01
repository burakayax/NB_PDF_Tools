import type { Plan, UserRole } from "@prisma/client";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

type UserTokenPayload = {
  sub: string;
  email: string;
  plan: Plan;
  /** Rol alanı eklendikten sonra üretilen tokenlarda bulunur; eski tokenlarda yok olabilir. */
  role?: UserRole;
  type: "access" | "refresh";
};

/** Yeni üretilen erişim/yenileme JWT'lerine gömülen yük; her zaman role içerir. */
export type AuthUserPayload = {
  sub: string;
  email: string;
  plan: Plan;
  role: UserRole;
};

function createPayload(payload: AuthUserPayload, type: "access" | "refresh"): UserTokenPayload {
  return {
    ...payload,
    type,
  };
}

export function signAccessToken(payload: AuthUserPayload) {
  return jwt.sign(createPayload(payload, "access"), env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

export function signRefreshToken(payload: AuthUserPayload) {
  return jwt.sign(createPayload(payload, "refresh"), env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

export function verifyAccessToken(token: string) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as UserTokenPayload;
  if (payload.type !== "access") {
    throw new Error("Invalid access token.");
  }
  return payload;
}

export function verifyRefreshToken(token: string) {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as UserTokenPayload;
  if (payload.type !== "refresh") {
    throw new Error("Invalid refresh token.");
  }
  return payload;
}

type PasswordResetJwtPayload = {
  sub: string;
  typ: "pwd_reset";
};

/** Kod doğrulandıktan sonra yeni şifre adımı; erişim JWT’sinden ayrı tür. */
export function signPasswordResetJwt(userId: string) {
  const payload: PasswordResetJwtPayload = { sub: userId, typ: "pwd_reset" };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "25m" });
}

export function verifyPasswordResetJwt(token: string): string {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded === "string" || !decoded || typeof decoded !== "object") {
    throw new Error("Invalid password reset token.");
  }
  const payload = decoded as PasswordResetJwtPayload;
  if (payload.typ !== "pwd_reset" || typeof payload.sub !== "string") {
    throw new Error("Invalid password reset token.");
  }
  return payload.sub;
}
