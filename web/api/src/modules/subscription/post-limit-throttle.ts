import type { FeatureKey } from "./subscription.config.js";
import type { ConversionCtaOverrides, UpgradeCta } from "./conversion-upgrade.js";
import { buildThrottleConversionCopy } from "./conversion-upgrade.js";

/** Legacy short line; prefer `buildRecordPastLimitCopy` / throttle `message` on new responses. */
export const FREE_THROTTLE_MESSAGE =
  "Free limit reached. Premium users get instant and high-quality processing.";

const ABS_DELAY_CAP_MS = 28_000;
const ABS_DELAY_FLOOR_MS = 1_000;

const MB = 1024 * 1024;

function randomInclusiveMs(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Multiplier > 1 lengthens delay for heavier PDF work. */
const FEATURE_THROTTLE_WEIGHT: Record<FeatureKey, number> = {
  split: 0.88,
  merge: 1.05,
  compress: 0.92,
  "pdf-to-word": 1.45,
  "word-to-pdf": 1.14,
  "excel-to-pdf": 1.12,
  "pdf-to-excel": 1.32,
  encrypt: 1.0,
};

/**
 * Extra delay factor for large inputs (desktop / web assert may send totalSizeBytes).
 */
function fileSizeDelayFactor(totalSizeBytes: number | null | undefined): number {
  if (totalSizeBytes == null || totalSizeBytes <= 0 || !Number.isFinite(totalSizeBytes)) {
    return 1;
  }
  if (totalSizeBytes >= 12 * MB) {
    return 1.22;
  }
  if (totalSizeBytes >= 6 * MB) {
    return 1.14;
  }
  if (totalSizeBytes >= 2 * MB) {
    return 1.08;
  }
  return 1;
}

/**
 * Base random delay ranges for the Nth operation of the day (N = usedToday + 1 before increment).
 * 6th: 2–4s, 7th: 4–7s, 8+: 8–15s
 */
function tierBaseRangeMs(nextOperationNumber: number): { min: number; max: number } {
  if (nextOperationNumber <= 5) {
    return { min: 0, max: 0 };
  }
  if (nextOperationNumber === 6) {
    return { min: 2000, max: 4000 };
  }
  if (nextOperationNumber === 7) {
    return { min: 4000, max: 7000 };
  }
  return { min: 8000, max: 15000 };
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
    operationsToday: number;
    dailyLimit: number;
    postLimitExtraOps: number;
    /** Matches DB after this throttle increment. */
    postLimitThrottleEventsToday: number;
  };
};

/**
 * When daily free quota is already consumed, returns a randomized weighted delay.
 * Premium plans (dailyLimit === null) and users still within quota return null.
 */
export function computePostLimitThrottle(params: {
  usedToday: number;
  dailyLimit: number | null;
  featureKey: FeatureKey;
  totalSizeBytes?: number | null;
  postLimitExtraOps?: number;
  /** 1-based index for this delayed run today (equals DB count after increment). */
  throttleOpNumber: number;
  /** From `tools.config` → `conversion` (admin). */
  conversionCtaOverrides?: ConversionCtaOverrides;
}): PostLimitThrottle | null {
  const {
    usedToday,
    dailyLimit,
    featureKey,
    totalSizeBytes,
    postLimitExtraOps = 0,
    throttleOpNumber,
    conversionCtaOverrides,
  } = params;
  if (dailyLimit === null || usedToday < dailyLimit) {
    return null;
  }

  const nextOp = usedToday + 1;
  const { min, max } = tierBaseRangeMs(nextOp);
  if (max <= 0) {
    return null;
  }

  const base = randomInclusiveMs(min, max);
  const w = FEATURE_THROTTLE_WEIGHT[featureKey] ?? 1;
  const sizeF = fileSizeDelayFactor(totalSizeBytes ?? undefined);
  const delayMs = Math.min(
    ABS_DELAY_CAP_MS,
    Math.max(ABS_DELAY_FLOOR_MS, Math.round(base * w * sizeF)),
  );

  const { message, upgradeCta } = buildThrottleConversionCopy(
    {
      usedToday,
      dailyLimit,
      postLimitExtraOps,
      throttleEventNumber: throttleOpNumber,
    },
    conversionCtaOverrides,
  );

  return {
    delayMs,
    message,
    usageSummary: formatFreeUsageLine(usedToday + 1, dailyLimit),
    reducedOutputQuality: true,
    priorityProcessing: false,
    upgradeCta,
    conversionTracking: {
      freeLimitExceeded: true,
      operationsToday: usedToday,
      dailyLimit,
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
