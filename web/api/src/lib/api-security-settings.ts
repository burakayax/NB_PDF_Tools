import type { Request } from "express";
import { env } from "../config/env.js";
import { getSetting } from "./site-config.service.js";
import { SITE_SETTING_KEYS } from "./site-setting-keys.js";

/** /api altındaki mantıksal yol: /api/health → /health */
export function logicalApiPath(request: Request): string {
  const combined = ((request.baseUrl ?? "") + (request.path ?? "/")).replace(/\/+$/, "") || "/";
  if (combined.startsWith("/api/")) {
    return combined.slice(4) || "/";
  }
  return combined;
}

export type ApiSecurityResolved = {
  defaultPerMinute: number;
  abuseThreshold: number;
  abuseBlockMinutes: number;
  healthPerMinute: number;
  licensePerMinute: number;
  preferencesPerMinute: number;
  paymentPerMinute: number;
  forgotPasswordPerMinute: number;
  authLoginPerMinute: number;
  authPasswordPerMinute: number;
};

function pickPositiveInt(v: unknown, fallback: number, max = 100_000): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 1) {
    return fallback;
  }
  return Math.min(max, Math.floor(v));
}

function defaultsFromEnv(): ApiSecurityResolved {
  return {
    defaultPerMinute: env.API_RATE_LIMIT_PER_MINUTE,
    abuseThreshold: env.API_ABUSE_THRESHOLD,
    abuseBlockMinutes: env.API_ABUSE_BLOCK_MINUTES,
    healthPerMinute: 120,
    licensePerMinute: 120,
    preferencesPerMinute: 120,
    paymentPerMinute: 120,
    forgotPasswordPerMinute: 15,
    authLoginPerMinute: 30,
    authPasswordPerMinute: 90,
  };
}

/**
 * Per-minute limits and abuse policy from `site.settings.apiSecurity` (admin),
 * merged over env defaults. Cached via `getSetting` (~15s TTL, cleared on save).
 */
export async function getApiSecurityResolved(): Promise<ApiSecurityResolved> {
  const base = defaultsFromEnv();
  const siteRaw = await getSetting(SITE_SETTING_KEYS.SITE_SETTINGS);
  if (siteRaw == null || typeof siteRaw !== "object" || Array.isArray(siteRaw)) {
    return base;
  }
  const sec = (siteRaw as Record<string, unknown>).apiSecurity;
  if (sec == null || typeof sec !== "object" || Array.isArray(sec)) {
    return base;
  }
  const a = sec as Record<string, unknown>;
  return {
    defaultPerMinute: pickPositiveInt(a.defaultPerMinute, base.defaultPerMinute),
    abuseThreshold: pickPositiveInt(a.abuseThreshold, base.abuseThreshold),
    abuseBlockMinutes: pickPositiveInt(a.abuseBlockMinutes, base.abuseBlockMinutes),
    healthPerMinute: pickPositiveInt(a.healthPerMinute, base.healthPerMinute),
    licensePerMinute: pickPositiveInt(a.licensePerMinute, base.licensePerMinute),
    preferencesPerMinute: pickPositiveInt(a.preferencesPerMinute, base.preferencesPerMinute),
    paymentPerMinute: pickPositiveInt(a.paymentPerMinute, base.paymentPerMinute),
    forgotPasswordPerMinute: pickPositiveInt(a.forgotPasswordPerMinute, base.forgotPasswordPerMinute),
    authLoginPerMinute: pickPositiveInt(a.authLoginPerMinute, base.authLoginPerMinute),
    authPasswordPerMinute: pickPositiveInt(a.authPasswordPerMinute, base.authPasswordPerMinute),
  };
}

export function apiRateLimitForRequest(request: Request, cfg: ApiSecurityResolved): number {
  const path = logicalApiPath(request);
  if (path === "/health") {
    return cfg.healthPerMinute;
  }
  if (path.startsWith("/license")) {
    return cfg.licensePerMinute;
  }
  if (path.startsWith("/auth/preferences")) {
    return cfg.preferencesPerMinute;
  }
  if (path.startsWith("/payment")) {
    return cfg.paymentPerMinute;
  }
  if (path.startsWith("/auth/forgot-password")) {
    return cfg.forgotPasswordPerMinute;
  }
  if (path === "/auth/login" && request.method === "POST") {
    return cfg.authLoginPerMinute;
  }
  if (path === "/auth/change-password" && request.method === "POST") {
    return cfg.authPasswordPerMinute;
  }
  if (path === "/auth/set-password" && request.method === "POST") {
    return cfg.authPasswordPerMinute;
  }
  if (path === "/auth/password" && request.method === "PATCH") {
    return cfg.authPasswordPerMinute;
  }
  return cfg.defaultPerMinute;
}

export function rateLimitTierForRequest(request: Request): string {
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

export function rateLimitCountsTowardAbuseBlock(request: Request): boolean {
  const p = logicalApiPath(request);
  const m = request.method;
  if (p.startsWith("/auth/preferences")) {
    return false;
  }
  if (p === "/payment/callback") {
    return false;
  }
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
