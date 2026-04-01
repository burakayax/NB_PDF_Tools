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

export function buildUpgradeCta(overrides?: ConversionCtaOverrides): UpgradeCta {
  const base: UpgradeCta = {
    intent: UPGRADE_CTA_INTENT,
    label: "Upgrade to Pro",
    subtitle: "Instant processing, full output quality, and unlimited daily use.",
    clientAction: "open_upgrade_modal",
  };
  return {
    ...base,
    ...(overrides?.upgradeCtaLabel ? { label: overrides.upgradeCtaLabel } : {}),
    ...(overrides?.upgradeCtaSubtitle ? { subtitle: overrides.upgradeCtaSubtitle } : {}),
  };
}

/** Assert / desktop: user is waiting because they exceeded the free daily cap. */
export function buildThrottleConversionCopy(
  input: {
    usedToday: number;
    dailyLimit: number;
    postLimitExtraOps: number;
    /** 1-based: this delayed run index today (after DB increment). */
    throttleEventNumber: number;
  },
  ctaOverrides?: ConversionCtaOverrides,
): { message: string; upgradeCta: UpgradeCta } {
  const { usedToday, dailyLimit, postLimitExtraOps, throttleEventNumber } = input;
  const upgradeCta = buildUpgradeCta(ctaOverrides);
  const nextOp = usedToday + 1;
  const usageCore = `${usedToday}/${dailyLimit} free ops used today; ${postLimitExtraOps} post-limit op(s) completed.`;

  if (throttleEventNumber >= 2) {
    return {
      message: `Delayed run #${throttleEventNumber} today — ${usageCore} Starting operation #${nextOp} (queued, slower on Free). ${upgradeCta.subtitle} Use "${upgradeCta.label}" in the app to skip waits.`,
      upgradeCta,
    };
  }

  return {
    message: `Free daily limit reached — ${usageCore} Operation #${nextOp} runs with a delay on Free. ${upgradeCta.subtitle} ${upgradeCta.label} removes throttling.`,
    upgradeCta,
  };
}

/** After record-usage when the completed op was past the free allowance. */
export function buildRecordPastLimitCopy(
  input: {
    operationsCount: number;
    dailyLimit: number;
    postLimitExtraOps: number;
    postLimitThrottleEventsToday: number;
  },
  ctaOverrides?: ConversionCtaOverrides,
): { conversionMessage: string; postLimitMessage: string; upgradeCta: UpgradeCta } {
  const { operationsCount, dailyLimit, postLimitExtraOps, postLimitThrottleEventsToday } = input;
  const upgradeCta = buildUpgradeCta(ctaOverrides);
  const usageLine = `Recorded op #${operationsCount} today (${dailyLimit}/day free; ${postLimitExtraOps} post-limit).`;

  if (postLimitThrottleEventsToday >= 2 || postLimitExtraOps >= 2) {
    const msg = `${usageLine} You've hit multiple delayed or post-limit runs — ${upgradeCta.subtitle} Tap "${upgradeCta.label}" to upgrade.`;
    return { conversionMessage: msg, postLimitMessage: msg, upgradeCta };
  }

  const msg = `${usageLine} ${upgradeCta.subtitle} ${upgradeCta.label} for instant, full-quality processing.`;
  return { conversionMessage: msg, postLimitMessage: msg, upgradeCta };
}

export function buildSummaryUpgradeHint(
  input: {
    usedToday: number;
    dailyLimit: number;
    postLimitExtraOps: number;
    postLimitThrottleEventsToday: number;
  },
  ctaOverrides?: ConversionCtaOverrides,
): { upgradeCta: UpgradeCta; conversionSummary: string } | null {
  const { usedToday, dailyLimit, postLimitExtraOps, postLimitThrottleEventsToday } = input;
  if (usedToday < dailyLimit && postLimitExtraOps === 0) {
    return null;
  }
  const upgradeCta = buildUpgradeCta(ctaOverrides);
  const conversionSummary = `Usage today: ${usedToday}/${dailyLimit} free, ${postLimitExtraOps} post-limit, ${postLimitThrottleEventsToday} delayed queue event(s). ${upgradeCta.label} — ${upgradeCta.subtitle}`;
  return { upgradeCta, conversionSummary };
}
