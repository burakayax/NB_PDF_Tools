import { getSetting, registerPackagesMergedInvalidator, setSetting } from "./site-config.service.js";
import { SITE_SETTING_KEYS } from "./site-setting-keys.js";

export const DEFAULT_PAYMENT_PRICES_TRY: Record<"PRO" | "BUSINESS" | "PRO_ANNUAL", string> = {
  BUSINESS: "79.00",
  PRO: "129.00",
  PRO_ANNUAL: "799.00",
};

type UnifiedPackagesShape = {
  plansOverride?: unknown;
  marketing?: unknown;
  prices?: Partial<Record<"PRO" | "BUSINESS" | "PRO_ANNUAL", string>>;
};

let mergedCache: { at: number; v: ResolvedPackagesConfig } | null = null;
const MERGED_TTL_MS = 15_000;

function invalidateMerged() {
  mergedCache = null;
}

/** Clears merged packages view (call after direct DB writes outside setSetting). */
export function invalidateResolvedPackagesConfig() {
  invalidateMerged();
}

registerPackagesMergedInvalidator(invalidateMerged);

function hasOwn(obj: object, k: string) {
  return Object.prototype.hasOwnProperty.call(obj, k);
}

function parsePriceToFixed2(raw: string): string {
  const n = Number.parseFloat(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 999_999.99) {
    throw new Error("Invalid price.");
  }
  return n.toFixed(2);
}

function mergePricesFromUnknown(raw: unknown): Record<"PRO" | "BUSINESS" | "PRO_ANNUAL", string> {
  const out = { ...DEFAULT_PAYMENT_PRICES_TRY };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return out;
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.PRO === "string") {
    try {
      out.PRO = parsePriceToFixed2(p.PRO);
    } catch {
      /* keep default */
    }
  }
  if (typeof p.BUSINESS === "string") {
    try {
      out.BUSINESS = parsePriceToFixed2(p.BUSINESS);
    } catch {
      /* keep default */
    }
  }
  if (typeof p.PRO_ANNUAL === "string") {
    try {
      out.PRO_ANNUAL = parsePriceToFixed2(p.PRO_ANNUAL);
    } catch {
      /* keep default */
    }
  }
  return out;
}

export type ResolvedPackagesConfig = {
  plansOverride: Record<string, unknown>;
  marketing: unknown;
  prices: Record<"PRO" | "BUSINESS" | "PRO_ANNUAL", string>;
};

async function computeResolvedPackagesConfig(): Promise<ResolvedPackagesConfig> {
  const unifiedRaw = await getSetting(SITE_SETTING_KEYS.PACKAGES_CONFIG);
  const unified =
    unifiedRaw != null && typeof unifiedRaw === "object" && !Array.isArray(unifiedRaw)
      ? (unifiedRaw as UnifiedPackagesShape)
      : {};

  let plansOverride: Record<string, unknown>;
  if (hasOwn(unified as object, "plansOverride")) {
    const po = unified.plansOverride;
    plansOverride =
      po != null && typeof po === "object" && !Array.isArray(po) ? { ...(po as Record<string, unknown>) } : {};
  } else {
    const leg = await getSetting(SITE_SETTING_KEYS.PLANS_OVERRIDE_LEGACY);
    plansOverride =
      leg != null && typeof leg === "object" && !Array.isArray(leg) ? { ...(leg as Record<string, unknown>) } : {};
  }

  let marketing: unknown;
  if (hasOwn(unified as object, "marketing")) {
    marketing = unified.marketing ?? {};
  } else {
    marketing = (await getSetting(SITE_SETTING_KEYS.PACKAGES_MARKETING_LEGACY)) ?? {};
  }

  let prices: Record<"PRO" | "BUSINESS" | "PRO_ANNUAL", string>;
  if (hasOwn(unified as object, "prices")) {
    prices = mergePricesFromUnknown(unified.prices);
  } else {
    const leg = await getSetting(SITE_SETTING_KEYS.PAYMENT_PRICES_LEGACY);
    prices = mergePricesFromUnknown(leg);
  }

  return { plansOverride, marketing, prices };
}

/**
 * Single merged view: `packages.config` wins per-field; legacy keys fill gaps.
 */
export async function getResolvedPackagesConfig(): Promise<ResolvedPackagesConfig> {
  const now = Date.now();
  if (mergedCache && now - mergedCache.at < MERGED_TTL_MS) {
    return mergedCache.v;
  }
  const v = await computeResolvedPackagesConfig();
  mergedCache = { at: now, v };
  return v;
}

async function readUnifiedRowForWrite(): Promise<Record<string, unknown>> {
  const raw = await getSetting(SITE_SETTING_KEYS.PACKAGES_CONFIG);
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

/**
 * Persists into `packages.config` only (canonical write path).
 */
export async function upsertPackagesConfigPartial(patch: {
  plansOverride?: unknown;
  marketing?: unknown;
  prices?: Partial<Record<"PRO" | "BUSINESS" | "PRO_ANNUAL", string>>;
}): Promise<void> {
  const base = await readUnifiedRowForWrite();
  const next: Record<string, unknown> = { ...base };
  if (patch.plansOverride !== undefined) {
    next.plansOverride = patch.plansOverride;
  }
  if (patch.marketing !== undefined) {
    next.marketing = patch.marketing;
  }
  if (patch.prices !== undefined) {
    const prevPrices =
      next.prices != null && typeof next.prices === "object" && !Array.isArray(next.prices)
        ? (next.prices as Record<string, unknown>)
        : {};
    const merged: Record<string, unknown> = { ...prevPrices };
    if (patch.prices.PRO !== undefined) {
      merged.PRO = parsePriceToFixed2(patch.prices.PRO);
    }
    if (patch.prices.BUSINESS !== undefined) {
      merged.BUSINESS = parsePriceToFixed2(patch.prices.BUSINESS);
    }
    if (patch.prices.PRO_ANNUAL !== undefined) {
      merged.PRO_ANNUAL = parsePriceToFixed2(patch.prices.PRO_ANNUAL);
    }
    next.prices = merged;
  }
  await setSetting(SITE_SETTING_KEYS.PACKAGES_CONFIG, next);
}

export async function putPaymentPricesTry(prices: Record<"PRO" | "BUSINESS", string>) {
  const cur = await computeResolvedPackagesConfig();
  await upsertPackagesConfigPartial({
    prices: {
      PRO: parsePriceToFixed2(prices.PRO),
      BUSINESS: parsePriceToFixed2(prices.BUSINESS),
      PRO_ANNUAL: cur.prices.PRO_ANNUAL,
    },
  });
}

export function invalidatePaymentPricesCache() {
  invalidateMerged();
}
