/**
 * Shared upgrade CTA and conversion copy for throttled / post-limit API responses.
 */

export const UPGRADE_CTA_INTENT = "subscribe_premium" as const;

export type UpgradeCta = {
  intent: typeof UPGRADE_CTA_INTENT;
  /** Short button-style label for clients. */
  label: string;
  /** Supporting line (speed + quality + unlimited). */
  subtitle: string;
  /** Web/desktop shells map this to the in-app upgrade / checkout flow. */
  clientAction: "open_upgrade_modal";
};

/** Optional strings from SiteSetting `tools.config` → `conversion`. */
export type ConversionCtaOverrides = {
  upgradeCtaLabel?: string;
  upgradeCtaSubtitle?: string;
};

/** Nudge eşikleri — `tools.config` → `conversionMessaging` ile yönetilebilir. */
export type ConversionMessagingThresholds = {
  strongThrottleMessageMinEvents: number;
  strongRecordMessageMinThrottle: number;
  strongRecordMessageMinPostLimitExtra: number;
};

export const DEFAULT_CONVERSION_MESSAGING_THRESHOLDS: ConversionMessagingThresholds = {
  strongThrottleMessageMinEvents: 2,
  strongRecordMessageMinThrottle: 2,
  strongRecordMessageMinPostLimitExtra: 2,
};

export function buildUpgradeCta(overrides?: ConversionCtaOverrides): UpgradeCta {
  const base: UpgradeCta = {
    intent: UPGRADE_CTA_INTENT,
    label: "Continue without waiting",
    subtitle: "Upgrade to Pro for instant processing, full quality, and unlimited daily use.",
    clientAction: "open_upgrade_modal",
  };
  return {
    ...base,
    ...(overrides?.upgradeCtaLabel ? { label: overrides.upgradeCtaLabel } : {}),
    ...(overrides?.upgradeCtaSubtitle ? { subtitle: overrides.upgradeCtaSubtitle } : {}),
  };
}

/** Assert / desktop: user is waiting (hard daily cap or soft friction tier). */
export function buildThrottleConversionCopy(
  input: {
    usedToday: number;
    dailyLimit: number | null;
    /** When `dailyLimit` is null, first N ops are delay-free (`postLimitThrottle.freeOpsBeforeThrottle`). */
    freeOpsBeforeThrottle: number;
    postLimitExtraOps: number;
    /** 1-based: this delayed run index today (after DB increment). */
    throttleEventNumber: number;
    /** DB lifetime throttles before this event — stronger copy when high. */
    lifetimeThrottleEvents?: number;
    lifetimeTotalOps?: number;
  },
  ctaOverrides?: ConversionCtaOverrides,
  messaging: ConversionMessagingThresholds = DEFAULT_CONVERSION_MESSAGING_THRESHOLDS,
): { message: string; upgradeCta: UpgradeCta } {
  const {
    usedToday,
    dailyLimit,
    freeOpsBeforeThrottle,
    postLimitExtraOps,
    throttleEventNumber,
    lifetimeThrottleEvents = 0,
    lifetimeTotalOps = 0,
  } = input;
  const upgradeCta = buildUpgradeCta(ctaOverrides);
  const nextOp = usedToday + 1;
  const usageCore =
    dailyLimit !== null
      ? `${usedToday}/${dailyLimit} free ops used today; ${postLimitExtraOps} post-limit op(s) completed.`
      : `${usedToday} operations today (${freeOpsBeforeThrottle} fastest on Free); ${postLimitExtraOps} run(s) past that tier.`;

  const behaviorHint =
    lifetimeThrottleEvents >= 28
      ? ` You often hit short waits on Free (${lifetimeThrottleEvents} total); Pro removes queue time.`
      : lifetimeThrottleEvents >= 12
        ? " Regular Free use includes short waits — Pro stays instant."
        : lifetimeTotalOps >= 80
          ? " You have run many jobs on Free — Pro keeps turnaround predictable."
          : "";

  if (throttleEventNumber >= messaging.strongThrottleMessageMinEvents) {
    return {
      message: `Delayed run #${throttleEventNumber} today — ${usageCore} Starting operation #${nextOp} (queued, slower on Free).${behaviorHint} ${upgradeCta.subtitle} Tap "${upgradeCta.label}" to open upgrade and skip waits.`,
      upgradeCta,
    };
  }

  if (dailyLimit !== null) {
    return {
      message: `Free daily limit reached — ${usageCore} Operation #${nextOp} runs with a delay on Free.${behaviorHint} ${upgradeCta.subtitle} Tap "${upgradeCta.label}" to upgrade and remove throttling.`,
      upgradeCta,
    };
  }

  return {
    message: `Free tier friction — ${usageCore} Operation #${nextOp} starts after a short randomized wait.${behaviorHint} ${upgradeCta.subtitle} Tap "${upgradeCta.label}" to upgrade and remove the wait.`,
    upgradeCta,
  };
}

/** After record-usage when the completed op was past the free allowance or soft-friction tier. */
export function buildRecordPastLimitCopy(
  input: {
    operationsCount: number;
    dailyLimit: number | null;
    /** When `dailyLimit` is null, soft tier size for copy. */
    freeOpsBeforeThrottle?: number;
    postLimitExtraOps: number;
    postLimitThrottleEventsToday: number;
    lifetimeThrottleEvents?: number;
    lifetimeTotalOps?: number;
  },
  ctaOverrides?: ConversionCtaOverrides,
  messaging: ConversionMessagingThresholds = DEFAULT_CONVERSION_MESSAGING_THRESHOLDS,
): { conversionMessage: string; postLimitMessage: string; upgradeCta: UpgradeCta } {
  const {
    operationsCount,
    dailyLimit,
    freeOpsBeforeThrottle = 5,
    postLimitExtraOps,
    postLimitThrottleEventsToday,
    lifetimeThrottleEvents = 0,
    lifetimeTotalOps = 0,
  } = input;
  const upgradeCta = buildUpgradeCta(ctaOverrides);
  const usageLine =
    dailyLimit !== null
      ? `Recorded op #${operationsCount} today (${dailyLimit}/day free; ${postLimitExtraOps} post-limit).`
      : `Recorded op #${operationsCount} today (${postLimitExtraOps} past the ${freeOpsBeforeThrottle} fastest Free runs).`;

  const recordBehaviorHint =
    lifetimeThrottleEvents >= 25
      ? ` Across your account, short waits have stacked up (${lifetimeThrottleEvents} times) — Pro clears the queue.`
      : lifetimeTotalOps >= 100
        ? " You've completed many jobs on Free — Pro keeps each run fast."
        : "";

  if (
    postLimitThrottleEventsToday >= messaging.strongRecordMessageMinThrottle ||
    postLimitExtraOps >= messaging.strongRecordMessageMinPostLimitExtra
  ) {
    const msg = `${usageLine} You've hit multiple delayed or post-limit runs — ${upgradeCta.subtitle} Tap "${upgradeCta.label}" to upgrade.${recordBehaviorHint}`;
    return { conversionMessage: msg, postLimitMessage: msg, upgradeCta };
  }

  const msg = `${usageLine} ${upgradeCta.subtitle} ${upgradeCta.label} for instant, full-quality processing.${recordBehaviorHint}`;
  return { conversionMessage: msg, postLimitMessage: msg, upgradeCta };
}

export function buildSummaryUpgradeHint(
  input: {
    usedToday: number;
    dailyLimit: number | null;
    postLimitExtraOps: number;
    postLimitThrottleEventsToday: number;
    /** Soft free tier: first N ops without server-side delay. */
    freeOpsBeforeThrottle?: number | null;
  },
  ctaOverrides?: ConversionCtaOverrides,
): { upgradeCta: UpgradeCta; conversionSummary: string } | null {
  const { usedToday, dailyLimit, postLimitExtraOps, postLimitThrottleEventsToday, freeOpsBeforeThrottle } = input;

  if (dailyLimit !== null) {
    if (usedToday < dailyLimit && postLimitExtraOps === 0) {
      return null;
    }
    const upgradeCta = buildUpgradeCta(ctaOverrides);
    const conversionSummary = `Usage today: ${usedToday}/${dailyLimit} free, ${postLimitExtraOps} post-limit, ${postLimitThrottleEventsToday} delayed queue event(s). ${upgradeCta.label} — ${upgradeCta.subtitle}`;
    return { upgradeCta, conversionSummary };
  }

  const thr = freeOpsBeforeThrottle ?? 0;
  if (thr > 0 && usedToday < thr && postLimitExtraOps === 0 && postLimitThrottleEventsToday === 0) {
    return null;
  }
  const upgradeCta = buildUpgradeCta(ctaOverrides);
  const conversionSummary = `Usage today: ${usedToday} operations (${thr} delay-free on Free), ${postLimitExtraOps} past that tier, ${postLimitThrottleEventsToday} delayed queue event(s). ${upgradeCta.label} — ${upgradeCta.subtitle}`;
  return { upgradeCta, conversionSummary };
}
