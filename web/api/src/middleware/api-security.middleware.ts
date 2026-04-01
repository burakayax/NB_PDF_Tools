import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { logSuspiciousActivity } from "../lib/app-logger.js";
import { requireAuth } from "./auth.middleware.js";

/** Express req.ip / socket; proxy güvenilirse X-Forwarded-For ile uyumludur. */
export function getClientIp(request: Request): string {
  const raw = request.ip || request.socket?.remoteAddress || "";
  return String(raw).replace(/^::ffff:/, "") || "unknown";
}

const ABUSE_VIOLATION_WINDOW_MS = 60 * 60 * 1000;

type AbuseState = {
  rateLimitHits: number;
  windowStart: number;
  blockedUntil: number;
};

const abuseByIp = new Map<string, AbuseState>();

function pruneAbuseMap() {
  if (abuseByIp.size < 5000) {
    return;
  }
  const now = Date.now();
  for (const [ip, s] of abuseByIp) {
    if (s.blockedUntil < now && now - s.windowStart > ABUSE_VIOLATION_WINDOW_MS) {
      abuseByIp.delete(ip);
    }
  }
}

function recordRateLimitViolation(ip: string) {
  pruneAbuseMap();
  const now = Date.now();
  let s = abuseByIp.get(ip);
  if (!s || now - s.windowStart > ABUSE_VIOLATION_WINDOW_MS) {
    s = { rateLimitHits: 0, windowStart: now, blockedUntil: 0 };
  }
  s.rateLimitHits += 1;
  if (s.rateLimitHits >= env.API_ABUSE_THRESHOLD) {
    s.blockedUntil = now + env.API_ABUSE_BLOCK_MINUTES * 60 * 1000;
    logSuspiciousActivity({
      type: "ip_blocked",
      ip,
      detail: `rate_limit_hits=${s.rateLimitHits} window_hours=1`,
    });
  }
  abuseByIp.set(ip, s);
}

/** Tekrarlı rate limit ihlallerinden sonra IP geçici blok (API_ABUSE_*). */
export function abuseBlockMiddleware(request: Request, response: Response, next: NextFunction) {
  const ip = getClientIp(request);
  const s = abuseByIp.get(ip);
  const now = Date.now();
  if (s && s.blockedUntil > now) {
    logSuspiciousActivity({
      type: "blocked_request",
      ip,
      path: request.originalUrl?.split("?")[0],
      method: request.method,
      detail: "abuse_block_active",
    });
    response.status(429).json({ message: "Too many requests. Try again later." });
    return;
  }
  next();
}

/** /api altındaki mantıksal yol: /api/health → /health */
function logicalApiPath(request: Request): string {
  const combined = ((request.baseUrl ?? "") + (request.path ?? "/")).replace(/\/+$/, "") || "/";
  if (combined.startsWith("/api/")) {
    return combined.slice(4) || "/";
  }
  return combined;
}

function apiRateLimitForPath(request: Request): number {
  const path = logicalApiPath(request);
  if (path === "/health") {
    return 120;
  }
  if (path.startsWith("/license")) {
    return 120;
  }
  /** Dil tercihi vb. hafif PATCH; genel varsayılan kotadan ayrı sayaç (SPA’da 10/dk tüm uçlara yetmezdi). */
  if (path.startsWith("/auth/preferences")) {
    return 120;
  }
  if (path.startsWith("/payment")) {
    return 120;
  }
  if (path.startsWith("/auth/forgot-password")) {
    return 15;
  }
  /** Giriş denemeleri genel API kotasından ayrı (yanlış şifreler workspace isteklerini tüketmesin). */
  if (path === "/auth/login" && request.method === "POST") {
    return 30;
  }
  /** Oturum açık şifre değiştirme; giriş kotasından bağımsız sayaç. */
  if (path === "/auth/change-password" && request.method === "POST") {
    return 90;
  }
  if (path === "/auth/set-password" && request.method === "POST") {
    return 90;
  }
  if (path === "/auth/password" && request.method === "PATCH") {
    return 90;
  }
  return env.API_RATE_LIMIT_PER_MINUTE;
}

function rateLimitTier(request: Request): string {
  const path = logicalApiPath(request);
  if (path === "/health") {
    return "health";
  }
  if (path.startsWith("/license")) {
    return "license";
  }
  if (path.startsWith("/auth/preferences")) {
    return "preferences";
  }
  if (path === "/auth/login" && request.method === "POST") {
    return "auth-login";
  }
  if (path === "/auth/change-password" && request.method === "POST") {
    return "auth-password";
  }
  if (path === "/auth/set-password" && request.method === "POST") {
    return "auth-password";
  }
  if (path === "/auth/password" && request.method === "PATCH") {
    return "auth-password";
  }
  return "default";
}

/** Bu yollarda 429 kötüye kullanım sayacına yazılmaz (dil kaydı yeniden denemeleri IP blokuna yol açmasın). */
function rateLimitCountsTowardAbuseBlock(request: Request): boolean {
  const p = logicalApiPath(request);
  const m = request.method;
  if (p.startsWith("/auth/preferences")) {
    return false;
  }
  if (p === "/payment/callback") {
    return false;
  }
  /** Mevcut şifre yanlış denemeleri giriş kotasından ayrı; tekrarlı 429 ile IP blokuna gitmesin. */
  if (p === "/auth/change-password" && m === "POST") {
    return false;
  }
  if (p === "/auth/set-password" && m === "POST") {
    return false;
  }
  if (p === "/auth/password" && m === "PATCH") {
    return false;
  }
  return true;
}

export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: (req) => apiRateLimitForPath(req),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${rateLimitTier(req)}`,
  message: { message: "Too many requests from this IP. Please try again shortly." },
  handler: (request, response, _next, options) => {
    const ip = getClientIp(request);
    logSuspiciousActivity({
      type: "rate_limit_exceeded",
      ip,
      path: request.originalUrl?.split("?")[0],
      method: request.method,
      userAgent: request.headers["user-agent"] as string | undefined,
      detail: `limit=${options.limit}`,
    });
    if (rateLimitCountsTowardAbuseBlock(request)) {
      recordRateLimitViolation(ip);
    }
    response.status(options.statusCode ?? 429).json(options.message ?? { message: "Too many requests." });
  },
});

/** Kimlik gerektirmeyen uçlar (auth akışı, sağlık, plan listesi, iletişim). */
export function isPublicApiPath(method: string, path: string): boolean {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/health") {
    return true;
  }
  if (p === "/subscription/plans" && method === "GET") {
    return true;
  }
  if (p.startsWith("/public/") && method === "GET") {
    return true;
  }
  /** Sayfa görüntüleme: oturum açmadan da (çerez onayı + istemci) gönderilebilir; userId için isteğe bağlı Bearer. */
  if (p === "/analytics/page-view" && method === "POST") {
    return true;
  }
  if (p === "/contact" && method === "POST") {
    return true;
  }
  if (p.startsWith("/auth/")) {
    if (p === "/auth/register" && method === "POST") {
      return true;
    }
    if (p === "/auth/login" && method === "POST") {
      return true;
    }
    if (p === "/auth/refresh" && method === "POST") {
      return true;
    }
    if (p === "/auth/logout" && method === "POST") {
      return true;
    }
    if (p === "/auth/google" && method === "GET") {
      return true;
    }
    if (p === "/auth/google/callback" && method === "GET") {
      return true;
    }
    if (p === "/auth/verify-email" && method === "GET") {
      return true;
    }
    if (p.startsWith("/auth/forgot-password/") && method === "POST") {
      return true;
    }
  }
  /** iyzico ödeme dönüşü (JWT yok; token ile retrieve doğrulanır). */
  if (p === "/payment/callback" && method === "POST") {
    return true;
  }
  return false;
}

/**
 * /api altında JWT zorunluluğu; istisnalar `isPublicApiPath` ile.
 * Sıra: abuseBlock → globalApiLimiter → requireJwtUnlessPublic → rotalar.
 */
export function requireJwtUnlessPublic(request: Request, response: Response, next: NextFunction) {
  const path = logicalApiPath(request);
  if (isPublicApiPath(request.method, path)) {
    next();
    return;
  }
  requireAuth(request, response, next);
}
