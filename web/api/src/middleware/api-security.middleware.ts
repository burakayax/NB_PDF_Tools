import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { logSuspiciousActivity } from "../lib/app-logger.js";
import {
  apiRateLimitForRequest,
  getApiSecurityResolved,
  logicalApiPath,
  rateLimitCountsTowardAbuseBlock,
  rateLimitTierForRequest,
} from "../lib/api-security-settings.js";
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

function recordRateLimitViolation(ip: string, abuseThreshold: number, abuseBlockMinutes: number) {
  pruneAbuseMap();
  const now = Date.now();
  let s = abuseByIp.get(ip);
  if (!s || now - s.windowStart > ABUSE_VIOLATION_WINDOW_MS) {
    s = { rateLimitHits: 0, windowStart: now, blockedUntil: 0 };
  }
  s.rateLimitHits += 1;
  if (s.rateLimitHits >= abuseThreshold) {
    s.blockedUntil = now + abuseBlockMinutes * 60 * 1000;
    logSuspiciousActivity({
      type: "ip_blocked",
      ip,
      detail: `rate_limit_hits=${s.rateLimitHits} window_hours=1`,
    });
  }
  abuseByIp.set(ip, s);
}

/** Tekrarlı rate limit ihlallerinden sonra IP geçici blok (süre, kayıt anındaki `site.settings.apiSecurity`). */
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

export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: async (req) => {
    const cfg = await getApiSecurityResolved();
    return apiRateLimitForRequest(req, cfg);
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${rateLimitTierForRequest(req)}`,
  message: { message: "Too many requests from this IP. Please try again shortly." },
  handler: async (request, response, _next, options) => {
    const cfg = await getApiSecurityResolved();
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
      recordRateLimitViolation(ip, cfg.abuseThreshold, cfg.abuseBlockMinutes);
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
