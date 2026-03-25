import type { UserRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { resolveRoleFromEmail } from "../lib/role-policy.js";

/** JWT içindeki role alanına güvenilmez; yetki yalnızca e-posta politikasından türetilir. */
function tokenRole(payload: { email: string }): UserRole {
  return resolveRoleFromEmail(payload.email);
}

function readBearerToken(request: Request) {
  const header = request.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

const BEARER_CHALLENGE = 'Bearer realm="api"';

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const token = readBearerToken(request);
  if (!token) {
    response
      .status(401)
      .set("WWW-Authenticate", BEARER_CHALLENGE)
      .json({ message: "Authentication is required." });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    request.authUser = {
      id: payload.sub,
      email: payload.email,
      plan: payload.plan,
      role: tokenRole(payload),
    };
    next();
  } catch {
    response
      .status(401)
      .set("WWW-Authenticate", BEARER_CHALLENGE)
      .json({ message: "Authentication token is invalid or expired." });
  }
}

export function attachOptionalAuth(request: Request, _response: Response, next: NextFunction) {
  const token = readBearerToken(request);
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    request.authUser = {
      id: payload.sub,
      email: payload.email,
      plan: payload.plan,
      role: tokenRole(payload),
    };
  } catch {
    // Geçersiz Bearer token olsa bile isteği durdurmaz; anonim trafik gözlemlenebilir uçlara ulaşabilsin.
    // Analytics veya sağlık kontrolleri 401 ile tıkanmamalıdır.
    // Burada yanıt dönmeye başlanırsa isteğe bağlı kimlik gerektirmeyen rotalar hatalı 401 üretebilir.
  }

  next();
}
