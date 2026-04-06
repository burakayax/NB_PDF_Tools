import type { FeatureKey, SubscriptionSummary } from "../api/subscription";

/** Minimum minutes between auto (or any) modal presentations — frequency cap. */
export const CONV_MODAL_MIN_MINUTES_BETWEEN = 45;

/** Hard cap on how many times the conversion modal may appear per local calendar day. */
export const CONV_MODAL_MAX_SHOWS_PER_DAY = 3;

/** Fresh friction signal window for “heavy operation delay” (ms). */
export const CONV_MODAL_FRICTION_SIGNAL_TTL_MS = 3 * 60 * 1000;

/** Server-reported delay at or above this counts as a strong delay signal. */
export const CONV_MODAL_HEAVY_DELAY_MS = 1500;

/** Avoid treating brand-new users as conversion targets. */
export const CONV_MODAL_MIN_LIFETIME_OPS = 2;

export const CONV_MODAL_MIN_USED_TODAY = 2;

/** “Repeated tool usage” — operations completed today. */
export const CONV_MODAL_REPEATED_USAGE_TODAY = 5;

const STATS_KEY = "nb_conv_modal_stats_v2";
const LEGACY_STATS_KEY = "nb_conv_modal_stats_v1";

export const CONV_MODAL_SNOOZE_UNTIL_KEY = "nb_conv_upgrade_snooze_until";

/** “Maybe later” — additional backoff beyond minute/daily caps. */
export const CONV_MODAL_SNOOZE_MS = 24 * 60 * 60 * 1000;

export const HEAVY_CONVERSION_FEATURES = new Set<FeatureKey>(["merge", "compress", "pdf-to-word", "pdf-to-excel"]);

function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type ConversionModalStatsV1 = {
  v: 2;
  shownTotal: number;
  primaryClicksTotal: number;
  dismissTotal: number;
  /** Last time the modal was shown (any trigger). */
  lastShownAt: number;
  /** Last auto-triggered show — drives min gap between auto opens. */
  lastAutoShownAt: number;
  dayKey: string;
  /** Auto opens today only (manual CTAs are not capped by this). */
  autoShowsToday: number;
};

function emptyStats(dk: string): ConversionModalStatsV1 {
  return {
    v: 2,
    shownTotal: 0,
    primaryClicksTotal: 0,
    dismissTotal: 0,
    lastShownAt: 0,
    lastAutoShownAt: 0,
    dayKey: dk,
    autoShowsToday: 0,
  };
}

type LegacyStatsV1 = {
  v?: number;
  shownTotal?: number;
  primaryClicksTotal?: number;
  dismissTotal?: number;
  lastShownAt?: number;
  dayKey?: string;
  showsToday?: number;
};

function migrateLegacyV1(raw: string, dk: string): ConversionModalStatsV1 | null {
  try {
    const p = JSON.parse(raw) as LegacyStatsV1;
    if (p.v !== 1) {
      return null;
    }
    const storedDay = typeof p.dayKey === "string" ? p.dayKey : dk;
    const autoShowsToday = storedDay === dk ? (p.showsToday ?? 0) : 0;
    const last = p.lastShownAt ?? 0;
    return {
      v: 2,
      shownTotal: p.shownTotal ?? 0,
      primaryClicksTotal: p.primaryClicksTotal ?? 0,
      dismissTotal: p.dismissTotal ?? 0,
      lastShownAt: last,
      lastAutoShownAt: last,
      dayKey: dk,
      autoShowsToday,
    };
  } catch {
    return null;
  }
}

export function readConversionModalStats(nowMs: number = Date.now()): ConversionModalStatsV1 {
  const dk = localDateKey(new Date(nowMs));
  try {
    let raw = localStorage.getItem(STATS_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STATS_KEY);
      if (raw) {
        const migrated = migrateLegacyV1(raw, dk);
        if (migrated) {
          writeConversionModalStats(migrated);
          try {
            localStorage.removeItem(LEGACY_STATS_KEY);
          } catch {
            /* ignore */
          }
          return migrated;
        }
      }
      return emptyStats(dk);
    }
    const p = JSON.parse(raw) as Partial<ConversionModalStatsV1>;
    if (p.v !== 2) {
      return emptyStats(dk);
    }
    const storedDay = typeof p.dayKey === "string" ? p.dayKey : dk;
    const autoShowsToday = storedDay === dk ? (p.autoShowsToday ?? 0) : 0;
    return {
      v: 2,
      shownTotal: p.shownTotal ?? 0,
      primaryClicksTotal: p.primaryClicksTotal ?? 0,
      dismissTotal: p.dismissTotal ?? 0,
      lastShownAt: p.lastShownAt ?? 0,
      lastAutoShownAt: p.lastAutoShownAt ?? 0,
      dayKey: dk,
      autoShowsToday,
    };
  } catch {
    return emptyStats(dk);
  }
}

export function writeConversionModalStats(s: ConversionModalStatsV1) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

export type ConversionModalShowSource = "auto" | "manual";

export function recordConversionModalShown(
  source: ConversionModalShowSource,
  nowMs: number = Date.now(),
): ConversionModalStatsV1 {
  const cur = readConversionModalStats(nowMs);
  const dk = localDateKey(new Date(nowMs));
  const autoShowsToday = source === "auto" ? cur.autoShowsToday + 1 : cur.autoShowsToday;
  const next: ConversionModalStatsV1 = {
    v: 2,
    shownTotal: cur.shownTotal + 1,
    primaryClicksTotal: cur.primaryClicksTotal,
    dismissTotal: cur.dismissTotal,
    lastShownAt: nowMs,
    lastAutoShownAt: source === "auto" ? nowMs : cur.lastAutoShownAt,
    dayKey: dk,
    autoShowsToday,
  };
  writeConversionModalStats(next);
  return next;
}

export function recordConversionModalPrimaryClick(): ConversionModalStatsV1 {
  const cur = readConversionModalStats();
  const next: ConversionModalStatsV1 = { ...cur, primaryClicksTotal: cur.primaryClicksTotal + 1 };
  writeConversionModalStats(next);
  return next;
}

export function recordConversionModalDismiss(): ConversionModalStatsV1 {
  const cur = readConversionModalStats();
  const next: ConversionModalStatsV1 = { ...cur, dismissTotal: cur.dismissTotal + 1 };
  writeConversionModalStats(next);
  return next;
}

/** Primary CTA clicks / modal impressions (all-time), as percentage with two decimals. */
export function conversionModalClickThroughRate(stats: ConversionModalStatsV1): number {
  if (stats.shownTotal <= 0) {
    return 0;
  }
  return Math.round((10000 * stats.primaryClicksTotal) / stats.shownTotal) / 100;
}

export function canAutoShowConversionModal(nowMs: number = Date.now()): boolean {
  const stats = readConversionModalStats(nowMs);
  let snoozeUntil = 0;
  try {
    snoozeUntil = parseInt(localStorage.getItem(CONV_MODAL_SNOOZE_UNTIL_KEY) || "0", 10);
  } catch {
    /* ignore */
  }
  if (Number.isFinite(snoozeUntil) && nowMs < snoozeUntil) {
    return false;
  }
  if (stats.autoShowsToday >= CONV_MODAL_MAX_SHOWS_PER_DAY) {
    return false;
  }
  const gapMs = CONV_MODAL_MIN_MINUTES_BETWEEN * 60 * 1000;
  if (stats.lastAutoShownAt > 0 && nowMs - stats.lastAutoShownAt < gapMs) {
    return false;
  }
  return true;
}

export type ConversionFrictionSignal = {
  at: number;
  featureId: FeatureKey;
  delayMs: number;
};

export function isFrictionSignalFresh(signal: ConversionFrictionSignal | null, nowMs: number): boolean {
  if (!signal) {
    return false;
  }
  return nowMs - signal.at < CONV_MODAL_FRICTION_SIGNAL_TTL_MS;
}

/**
 * FREE-only. Requires past “first use” (lifetime or today).
 * - 2nd+ delayed request today (throttle count).
 * - Recent heavy-tool or long-delay friction (see signal).
 * - Repeated tool usage (ops today).
 */
export function conversionModalAutoQualifies(
  summary: SubscriptionSummary,
  frictionSignal: ConversionFrictionSignal | null,
  nowMs: number = Date.now(),
): boolean {
  if (summary.currentPlan.name !== "FREE") {
    return false;
  }
  const u = summary.usage;
  const lifetime = u.behaviorMonetization?.totalOperationsLifetime ?? 0;
  const used = u.usedToday;
  if (lifetime < CONV_MODAL_MIN_LIFETIME_OPS && used < CONV_MODAL_MIN_USED_TODAY) {
    return false;
  }

  const delays = u.postLimitThrottleEventsToday ?? u.conversionTracking?.postLimitThrottleEventsToday ?? 0;
  const secondOrLaterDelay = delays >= 2;

  const fresh = isFrictionSignalFresh(frictionSignal, nowMs);
  const heavyOpDelay =
    fresh &&
    frictionSignal != null &&
    (frictionSignal.delayMs >= CONV_MODAL_HEAVY_DELAY_MS || HEAVY_CONVERSION_FEATURES.has(frictionSignal.featureId));

  const repeatedUsage = used >= CONV_MODAL_REPEATED_USAGE_TODAY;

  return secondOrLaterDelay || heavyOpDelay || repeatedUsage;
}

export function pushConversionModalAnalytics(event: string, payload: Record<string, unknown>) {
  try {
    const w = window as unknown as { dataLayer?: Record<string, unknown>[] };
    if (w.dataLayer && Array.isArray(w.dataLayer)) {
      w.dataLayer.push({ event, ...payload });
    }
  } catch {
    /* ignore */
  }
}
