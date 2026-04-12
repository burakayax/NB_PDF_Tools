import type { Plan } from "@prisma/client";
import type { FeatureKey } from "./subscription.config.js";
import type { ConversionCtaOverrides, ConversionMessagingThresholds, UpgradeCta } from "./conversion-upgrade.js";
import { buildThrottleConversionCopy, DEFAULT_CONVERSION_MESSAGING_THRESHOLDS } from "./conversion-upgrade.js";

/** Legacy short line; prefer `buildRecordPastLimitCopy` / throttle `message` on new responses. */
export const FREE_THROTTLE_MESSAGE =
  "Free limit reached. Premium users get instant and high-quality processing.";

const MB = 1024 * 1024;

export type PostLimitDelayTier = { minNextOp: number; maxNextOp: number; minMs: number; maxMs: number };

export type PostLimitFileTier = { minMb: number; factor: number };

/**
 * Free-tier gecikme davranışı — varsayılanlar `PLARTFORM.config` ile aynı şekilde override edilebilir.
 */
export type PostLimitThrottleRuntime = {
  /** SiteSetting `PLARTFORM.config.postLimitThrottle`; false iken FREE gecikme sistemi kapalı. */
  delaysEnabled: boolean;
  /** Bu işlem numarasına kadar (dahil) ek gecikme yok; sonrası `delayTiers`. */
  freeOpsBeforeThrottle: number;
  delayCapMs: number;
  delayFloorMs: number;
  /** İşlem yükü: hafif < 1, ağır dönüşümler > 1 (ör. pdf-to-word). */
  featureWeights: Partial<Record<FeatureKey, number>>;
  /** Azalan `minMb` sırası; ilk eşleşen faktör kullanılır. */
  fileTiers: PostLimitFileTier[];
  delayTiers: PostLimitDelayTier[];
};

export const DEFAULT_POST_LIMIT_THROTTLE_RUNTIME: PostLimitThrottleRuntime = {
  delaysEnabled: true,
  freeOpsBeforeThrottle: 5,
  delayCapMs: 30_000,
  delayFloorMs: 900,
  featureWeights: {
    split: 0.82,
    merge: 1.02,
    compress: 0.88,
    "pdf-to-word": 1.52,
    "word-to-pdf": 1.1,
    "excel-to-pdf": 1.12,
    "pdf-to-excel": 1.34,
    encrypt: 0.93,
  },
  fileTiers: [
    { minMb: 12, factor: 1.22 },
    { minMb: 6, factor: 1.14 },
    { minMb: 2, factor: 1.08 },
  ],
  delayTiers: [
    { minNextOp: 6, maxNextOp: 6, minMs: 2000, maxMs: 4000 },
    { minNextOp: 7, maxNextOp: 7, minMs: 4000, maxMs: 7000 },
    { minNextOp: 8, maxNextOp: 999_999, minMs: 8000, maxMs: 15000 },
  ],
};

function randomInclusiveMs(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.floor(Math.random() * (max - min + 1));
}

function fileSizeDelayFactor(totalSizeBytes: number | null | undefined, rt: PostLimitThrottleRuntime): number {
  if (totalSizeBytes == null || totalSizeBytes <= 0 || !Number.isFinite(totalSizeBytes)) {
    return 1;
  }
  const sizeMb = totalSizeBytes / MB;
  for (const t of rt.fileTiers) {
    if (sizeMb >= t.minMb) {
      return t.factor;
    }
  }
  return 1;
}

function tierBaseRangeMs(nextOperationNumber: number, rt: PostLimitThrottleRuntime): { min: number; max: number } {
  if (nextOperationNumber <= rt.freeOpsBeforeThrottle) {
    return { min: 0, max: 0 };
  }
  for (const t of rt.delayTiers) {
    if (nextOperationNumber >= t.minNextOp && nextOperationNumber <= t.maxNextOp) {
      return { min: t.minMs, max: t.maxMs };
    }
  }
  return { min: 0, max: 0 };
}

/** Ops 6–8 (when freeBefore=5) follow `delayTiers` only; 9+ adds gradual stress. */
function usageDepthMultiplier(nextOperationNumber: number, rt: PostLimitThrottleRuntime): number {
  const firstThrottled = rt.freeOpsBeforeThrottle + 1;
  const plateauEnd = firstThrottled + 2;
  if (nextOperationNumber <= plateauEnd) {
    return 1;
  }
  const steps = nextOperationNumber - plateauEnd;
  return 1 + Math.min(0.44, steps * 0.048);
}

/** Two-layer multiplicative jitter so consecutive waits feel uncorrelated. */
function finalizeSmartDelayMs(combinedMs: number, rt: PostLimitThrottleRuntime): number {
  const spread = 0.86 + Math.random() * 0.28;
  const fine = 0.966 + Math.random() * 0.068;
  const v = Math.round(combinedMs * spread * fine);
  return Math.min(rt.delayCapMs, Math.max(rt.delayFloorMs, v));
}

/** displayCount = completed ops (record-usage) or next op index (assert-feature throttle). */
export function formatFreeUsageLine(displayCount: number, dailyLimit: number): string {
  return `You used ${displayCount}/${dailyLimit} free operations today`;
}

export type PostLimitThrottle = {
  delayMs: number;
  message: string;
  usageSummary: string;
  reducedOutputQuality: boolean;
  priorityProcessing: false;
  upgradeCta: UpgradeCta;
  conversionTracking: {
    freeLimitExceeded: true;
    softFrictionActive: boolean;
    operationsToday: number;
    dailyLimit: number | null;
    softFrictionAfterOps: number;
    postLimitExtraOps: number;
    /** Matches DB after this throttle increment. */
    postLimitThrottleEventsToday: number;
  };
};

/**
 * FREE plan: after `freeOpsBeforeThrottle` completed ops, the next request gets a smart delay:
 * usage tier (6 / 7 / 8+), operation load (`featureWeights`), upload size (`fileTiers`), extra ramp for op 9+,
 * and layered random jitter. PRO / BUSINESS return null (no server delay).
 */
export function computePostLimitThrottle(params: {
  userPlan: Plan;
  usedToday: number;
  dailyLimit: number | null;
  featureKey: FeatureKey;
  totalSizeBytes?: number | null;
  postLimitExtraOps?: number;
  /** 1-based index for this delayed run today (equals DB count after increment). */
  throttleOpNumber: number;
  /** Ömür boyu / günlük davranıştan gelen ek gecikme çarpanı (varsayılan 1). */
  behaviorStressMultiplier?: number;
  lifetimeThrottleEvents?: number;
  lifetimeTotalOps?: number;
  /** From `PLARTFORM.config` → `conversion` (admin). */
  conversionCtaOverrides?: ConversionCtaOverrides;
  /** From `PLARTFORM.config` → `postLimitThrottle` (admin). */
  throttleRuntime: PostLimitThrottleRuntime;
  conversionMessaging?: ConversionMessagingThresholds;
}): PostLimitThrottle | null {
  const {
    userPlan,
    usedToday,
    dailyLimit,
    featureKey,
    totalSizeBytes,
    postLimitExtraOps = 0,
    throttleOpNumber,
    behaviorStressMultiplier = 1,
    lifetimeThrottleEvents,
    lifetimeTotalOps,
    conversionCtaOverrides,
    throttleRuntime: rt,
    conversionMessaging = DEFAULT_CONVERSION_MESSAGING_THRESHOLDS,
  } = params;
  if (userPlan !== "FREE") {
    return null;
  }

  if (!rt.delaysEnabled) {
    return null;
  }

  const nextOp = usedToday + 1;
  const { min, max } = tierBaseRangeMs(nextOp, rt);
  if (max <= 0) {
    return null;
  }

  const base = randomInclusiveMs(min, max);
  const loadFactor = rt.featureWeights[featureKey] ?? 1;
  const sizeF = fileSizeDelayFactor(totalSizeBytes ?? undefined, rt);
  const depthF = usageDepthMultiplier(nextOp, rt);
  const behaviorF = Math.min(1.45, Math.max(1, behaviorStressMultiplier));
  const combined = base * loadFactor * sizeF * depthF * behaviorF;
  const delayMs = finalizeSmartDelayMs(combined, rt);

  const { message, upgradeCta } = buildThrottleConversionCopy(
    {
      usedToday,
      dailyLimit,
      freeOpsBeforeThrottle: rt.freeOpsBeforeThrottle,
      postLimitExtraOps,
      throttleEventNumber: throttleOpNumber,
      lifetimeThrottleEvents,
      lifetimeTotalOps,
    },
    conversionCtaOverrides,
    conversionMessaging,
  );

  return {
    delayMs,
    message,
    usageSummary:
      dailyLimit !== null
        ? formatFreeUsageLine(usedToday + 1, dailyLimit)
        : `Operation ${nextOp} today (Free tier may add wait time).`,
    reducedOutputQuality: true,
    priorityProcessing: false,
    upgradeCta,
    conversionTracking: {
      freeLimitExceeded: true,
      softFrictionActive: true,
      operationsToday: usedToday,
      dailyLimit,
      softFrictionAfterOps: rt.freeOpsBeforeThrottle,
      postLimitExtraOps,
      postLimitThrottleEventsToday: throttleOpNumber,
    },
  };
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
