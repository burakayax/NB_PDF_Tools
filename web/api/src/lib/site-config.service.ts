import { prisma } from "./prisma.js";
import { PACKAGES_RELATED_KEYS } from "./site-setting-keys.js";

const TTL_MS = 15_000;

type CacheEntry = { at: number; value: unknown };

const cache = new Map<string, CacheEntry>();

let invalidatePackagesMerged: (() => void) | null = null;

/** Allows packages-config module to clear its merged cache when any package key changes. */
export function registerPackagesMergedInvalidator(fn: () => void) {
  invalidatePackagesMerged = fn;
}

function bumpCache(key: string, value: unknown) {
  cache.set(key, { at: Date.now(), value });
}

/**
 * Read a JSON SiteSetting value with in-memory cache.
 * Returns `null` if the row is missing or empty.
 */
/** Read current DB value without in-memory cache (for admin audit / revision capture). */
export async function getSettingDirect(key: string): Promise<unknown | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  if (!row?.value?.trim()) {
    return null;
  }
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    return row.value;
  }
}

export async function getSetting(key: string): Promise<unknown | null> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) {
    return hit.value;
  }

  const row = await prisma.siteSetting.findUnique({ where: { key } });
  if (!row?.value?.trim()) {
    bumpCache(key, null);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value) as unknown;
  } catch {
    parsed = row.value;
  }
  bumpCache(key, parsed);
  return parsed;
}

/**
 * Same as getSetting but returns `fallback` when missing or null.
 */
export async function getSettingWithFallback<T>(key: string, fallback: T): Promise<T> {
  const v = await getSetting(key);
  if (v == null) {
    return fallback;
  }
  return v as T;
}

/**
 * Upsert a value (objects are JSON-stringified). Clears cache for that key.
 */
export async function setSetting(key: string, value: unknown): Promise<void> {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, value: str },
    update: { value: str },
  });
  cache.delete(key);
  if (PACKAGES_RELATED_KEYS.has(key)) {
    invalidatePackagesMerged?.();
  }
}

/**
 * Admin bulk patch: preserves legacy behavior where string values are stored verbatim (non-JSON-wrapped).
 */
export async function setSettingFromAdminPatch(key: string, value: unknown): Promise<void> {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, value: str },
    update: { value: str },
  });
  cache.delete(key);
  if (PACKAGES_RELATED_KEYS.has(key)) {
    invalidatePackagesMerged?.();
  }
}

export function invalidateSettingCache(key: string) {
  cache.delete(key);
  if (PACKAGES_RELATED_KEYS.has(key)) {
    invalidatePackagesMerged?.();
  }
}

export function clearAllSettingCache() {
  cache.clear();
  invalidatePackagesMerged?.();
}

/** @internal */
export function seedSettingCacheForTests(key: string, value: unknown) {
  bumpCache(key, value);
}

export { SITE_SETTING_KEYS, type SiteSettingKey } from "./site-setting-keys.js";
