import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

/**
 * Üretimde ve FORCE_HTTPS=true iken, TLS sonlandırıcı arkasındaki düz HTTP isteklerini HTTPS’e yönlendirir.
 * `trust proxy` ayarlı olmalıdır (X-Forwarded-Proto).
 */
export function enforceHttpsMiddleware(request: Request, response: Response, next: NextFunction) {
  if (!env.forceHttps || env.NODE_ENV !== "production") {
    next();
    return;
  }

  const forwarded = request.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const secure = request.secure || proto === "https";

  if (secure) {
    next();
    return;
  }

  const host = request.headers.host;
  if (!host) {
    next();
    return;
  }

  const target = `https://${host}${request.originalUrl}`;
  response.redirect(302, target);
}
