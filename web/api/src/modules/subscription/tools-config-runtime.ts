import { getSetting, invalidateSettingCache } from "../../lib/site-config.service.js";
import { SITE_SETTING_KEYS } from "../../lib/site-setting-keys.js";
import { env } from "../../config/env.js";
import {
  DEFAULT_CONVERSION_MESSAGING_THRESHOLDS,
  type ConversionMessagingThresholds,
} from "./conversion-upgrade.js";
import {
  DEFAULT_POST_LIMIT_THROTTLE_RUNTIME,
  type PostLimitDelayTier,
  type PostLimitFileTier,
  type PostLimitThrottleRuntime,
} from "./post-limit-throttle.js";
import { featureCatalog, isFeatureKey, type FeatureKey } from "./subscription.config.js";

export type TOOLSConversionOverrides = {
  upgradeCtaLabel?: string;
  upgradeCtaSubtitle?: string;
};

export type ResolvedTOOLSBusinessConfig = {
  conversion: TOOLSConversionOverrides;
  globallyDisabledFeatures: Set<FeatureKey>;
  postLimitThrottle: PostLimitThrottleRuntime;
  conversionMessaging: ConversionMessagingThresholds;
  /** 0–1: ücretsiz kotaya yaklaşırken yumuşak uyarı (ör. 0.8 = %80). */
  usageSoftWarningRatio: number;
  /** Masaüstü FREE katmanı tek dosya üst sınırı (MB). */
  freeDesktopMaxFileSizeMb: number;
};

function parseConversionFromTOOLSConfig(raw: unknown): TOOLSConversionOverrides {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const parsed = raw as Record<string, unknown>;
  const conv = parsed.conversion;
  if (conv == null || typeof conv !== "object" || Array.isArray(conv)) {
    return {};
  }
  const c = conv as Record<string, unknown>;
  const out: TOOLSConversionOverrides = {};
  if (typeof c.upgradeCtaLabel === "string" && c.upgradeCtaLabel.trim()) {
    out.upgradeCtaLabel = c.upgradeCtaLabel.trim();
  }
  if (typeof c.upgradeCtaSubtitle === "string" && c.upgradeCtaSubtitle.trim()) {
    out.upgradeCtaSubtitle = c.upgradeCtaSubtitle.trim();
  }
  return out;
}

function parseDisabledFeatures(raw: unknown): Set<FeatureKey> {
  const out = new Set<FeatureKey>();
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return out;
  }
  const dis = (raw as Record<string, unknown>).disabledFeatures;
  if (!Array.isArray(dis)) {
    return out;
  }
  for (const x of dis) {
    if (typeof x === "string" && x.trim() && isFeatureKey(x.trim())) {
      out.add(x.trim() as FeatureKey);
    }
  }
  return out;
}

function clampRatio(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return fallback;
  }
  return Math.min(0.99, Math.max(0.05, v));
}

function parseDelayTiers(raw: unknown, fallback: PostLimitDelayTier[]): PostLimitDelayTier[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return fallback;
  }
  const out: PostLimitDelayTier[] = [];
  for (const row of raw) {
    if (row == null || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const t = row as Record<string, unknown>;
    const minNextOp = typeof t.minNextOp === "number" && Number.isFinite(t.minNextOp) ? Math.floor(t.minNextOp) : null;
    const maxNextOp = typeof t.maxNextOp === "number" && Number.isFinite(t.maxNextOp) ? Math.floor(t.maxNextOp) : null;
    const minMs = typeof t.minMs === "number" && Number.isFinite(t.minMs) ? Math.max(0, Math.floor(t.minMs)) : null;
    const maxMs = typeof t.maxMs === "number" && Number.isFinite(t.maxMs) ? Math.max(0, Math.floor(t.maxMs)) : null;
    if (minNextOp == null || maxNextOp == null || minMs == null || maxMs == null) {
      continue;
    }
    out.push({ minNextOp, maxNextOp, minMs, maxMs });
  }
  return out.length ? out : fallback;
}

function parseFileTiers(raw: unknown, fallback: PostLimitFileTier[]): PostLimitFileTier[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return fallback;
  }
  const out: PostLimitFileTier[] = [];
  for (const row of raw) {
    if (row == null || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const t = row as Record<string, unknown>;
    const minMb = typeof t.minMb === "number" && Number.isFinite(t.minMb) ? Math.max(0, t.minMb) : null;
    const factor = typeof t.factor === "number" && Number.isFinite(t.factor) ? Math.max(0.1, t.factor) : null;
    if (minMb == null || factor == null) {
      continue;
    }
    out.push({ minMb, factor });
  }
  out.sort((a, b) => b.minMb - a.minMb);
  return out.length ? out : fallback;
}

function parseFeatureWeights(raw: unknown, fallback: PostLimitThrottleRuntime["featureWeights"]): PostLimitThrottleRuntime["featureWeights"] {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...fallback };
  }
  const o = raw as Record<string, unknown>;
  const next: PostLimitThrottleRuntime["featureWeights"] = { ...fallback };
  for (const k of featureCatalog) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      next[k] = v;
    }
  }
  return next;
}

function parsePostLimitThrottleRuntime(raw: unknown): PostLimitThrottleRuntime {
  const base = DEFAULT_POST_LIMIT_THROTTLE_RUNTIME;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }
  const o = raw as Record<string, unknown>;
  const delaysEnabled = o.delaysEnabled === false ? false : base.delaysEnabled;
  const freeOpsBeforeThrottle =
    typeof o.freeOpsBeforeThrottle === "number" && Number.isFinite(o.freeOpsBeforeThrottle)
      ? Math.max(0, Math.floor(o.freeOpsBeforeThrottle))
      : base.freeOpsBeforeThrottle;
  const delayCapMs =
    typeof o.delayCapMs === "number" && Number.isFinite(o.delayCapMs)
      ? Math.max(100, Math.floor(o.delayCapMs))
      : base.delayCapMs;
  const delayFloorMs =
    typeof o.delayFloorMs === "number" && Number.isFinite(o.delayFloorMs)
      ? Math.max(0, Math.floor(o.delayFloorMs))
      : base.delayFloorMs;
  return {
    delaysEnabled,
    freeOpsBeforeThrottle,
    delayCapMs,
    delayFloorMs,
    featureWeights: parseFeatureWeights(o.featureWeights, base.featureWeights),
    fileTiers: parseFileTiers(o.fileTiers, base.fileTiers),
    delayTiers: parseDelayTiers(o.delayTiers, base.delayTiers),
  };
}

function parseConversionMessaging(raw: unknown): ConversionMessagingThresholds {
  const d = DEFAULT_CONVERSION_MESSAGING_THRESHOLDS;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...d };
  }
  const o = raw as Record<string, unknown>;
  const pick = (k: keyof ConversionMessagingThresholds): number => {
    const v = o[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 1) {
      return d[k];
    }
    return Math.min(1000, Math.floor(v));
  };
  return {
    strongThrottleMessageMinEvents: pick("strongThrottleMessageMinEvents"),
    strongRecordMessageMinThrottle: pick("strongRecordMessageMinThrottle"),
    strongRecordMessageMinPostLimitExtra: pick("strongRecordMessageMinPostLimitExtra"),
  };
}

function parseFreeDesktopMaxMb(raw: unknown): number {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return env.DEFAULT_FREE_DESKTOP_MAX_FILE_MB;
  }
  const caps = (raw as Record<string, unknown>).usageCaps;
  if (caps != null && typeof caps === "object" && !Array.isArray(caps)) {
    const v = (caps as Record<string, unknown>).freeDesktopMaxFileSizeMb;
    if (typeof v === "number" && Number.isFinite(v) && v >= 1) {
      return Math.min(5000, Math.floor(v));
    }
  }
  const top = (raw as Record<string, unknown>).freeDesktopMaxFileSizeMb;
  if (typeof top === "number" && Number.isFinite(top) && top >= 1) {
    return Math.min(5000, Math.floor(top));
  }
  return env.DEFAULT_FREE_DESKTOP_MAX_FILE_MB;
}

function parseResolvedFromRoot(raw: unknown): ResolvedTOOLSBusinessConfig {
  const postRaw =
    raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).postLimitThrottle
      : undefined;
  return {
    conversion: parseConversionFromTOOLSConfig(raw),
    globallyDisabledFeatures: parseDisabledFeatures(raw),
    postLimitThrottle: parsePostLimitThrottleRuntime(postRaw),
    conversionMessaging: parseConversionMessaging(
      raw != null && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>).conversionMessaging
        : undefined,
    ),
    usageSoftWarningRatio: clampRatio(
      raw != null && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>).usageSoftWarningRatio
        : undefined,
      0.8,
    ),
    freeDesktopMaxFileSizeMb: parseFreeDesktopMaxMb(raw),
  };
}

/**
 * Birleşik `TOOLS.config` görünümü: kota sonrası gecikme, devre dışı araçlar, masaüstü dosya sınırı, mesaj eşikleri.
 * `getSetting` önbelleği admin kaydında temizlenir; yeniden başlatma gerekmez.
 */
export async function getResolvedTOOLSBusinessConfig(): Promise<ResolvedTOOLSBusinessConfig> {
  const cfg = await getSetting(SITE_SETTING_KEYS.TOOLS_CONFIG);
  return parseResolvedFromRoot(cfg);
}

export async function getTOOLSConversionOverrides(): Promise<TOOLSConversionOverrides> {
  const r = await getResolvedTOOLSBusinessConfig();
  return r.conversion;
}

export function invalidateTOOLSConfigCache() {
  invalidateSettingCache(SITE_SETTING_KEYS.TOOLS_CONFIG);
}
