/**
 * Soft conversion prompts for free tier (hard daily cap and/or soft friction after N fast runs).
 * Does not block operations; pairs with post-limit throttle messaging.
 */

export const PREMIUM_SPEED_QUALITY_LINE =
  "Premium gives you instant processing, full output quality, and unlimited daily use.";

export type UsageWarningCode = "approaching_80" | "at_free_cap" | "beyond_free";

export type UsageSoftWarnings = {
  /** Highest-severity code for clients that localize by key. */
  usageWarningCode: UsageWarningCode | null;
  /** ~80% of daily free quota used; one or more free runs may remain. */
  softUsageWarning: string | null;
  /** At or past free daily cap (stronger upgrade nudge). */
  strongUsageWarning: string | null;
  /** Always included for FREE plans with a daily cap (speed + quality pitch). */
  premiumBenefitsLine: string | null;
};

function atOrPastCapRatio(usedToday: number, dailyLimit: number, ratio: number): boolean {
  const threshold = Math.max(1, Math.ceil(dailyLimit * ratio));
  return usedToday >= threshold && usedToday < dailyLimit;
}

/**
 * @param usedToday — operations already recorded today (same as subscription summary).
 */
export function computeUsageSoftWarnings(input: {
  dailyLimit: number | null;
  usedToday: number;
  postLimitExtraOps: number;
  /** 0.05–0.99; ücretsiz kotanın bu oranında “yaklaşıyor” uyarısı (`TOOLS.config.usageSoftWarningRatio`). */
  approachingCapRatio?: number;
  /** FREE unlimited: first N ops without server delay; used with `dailyLimit === null`. */
  softFrictionAfterOps?: number | null;
}): UsageSoftWarnings {
  const { dailyLimit, usedToday, postLimitExtraOps } = input;
  const approachingCapRatio = input.approachingCapRatio ?? 0.8;
  const softN = input.softFrictionAfterOps;

  if (dailyLimit === null) {
    if (softN != null && softN > 0) {
      const premiumBenefitsLine = PREMIUM_SPEED_QUALITY_LINE;
      if (usedToday >= softN) {
        return {
          usageWarningCode: "beyond_free",
          softUsageWarning: null,
          strongUsageWarning: `You've used your ${softN} fastest free runs today. Additional runs may include delays. ${PREMIUM_SPEED_QUALITY_LINE}`,
          premiumBenefitsLine,
        };
      }
      const warnAt = Math.max(1, Math.ceil(softN * approachingCapRatio));
      if (usedToday >= warnAt && usedToday < softN) {
        const left = Math.max(0, softN - usedToday);
        return {
          usageWarningCode: "approaching_80",
          softUsageWarning: `You've used ${usedToday} of ${softN} delay-free operations today (${Math.round((usedToday / softN) * 100)}%). ${left === 1 ? "One fast run left. " : ""}${PREMIUM_SPEED_QUALITY_LINE}`,
          strongUsageWarning: null,
          premiumBenefitsLine,
        };
      }
    }
    return {
      usageWarningCode: null,
      softUsageWarning: null,
      strongUsageWarning: null,
      premiumBenefitsLine: null,
    };
  }

  const premiumBenefitsLine = PREMIUM_SPEED_QUALITY_LINE;

  const beyondFree = usedToday > dailyLimit || postLimitExtraOps > 0;
  const atCapExactly = usedToday === dailyLimit && postLimitExtraOps === 0;

  if (beyondFree) {
    return {
      usageWarningCode: "beyond_free",
      softUsageWarning: null,
      strongUsageWarning: `You've passed today's free allowance (${usedToday}/${dailyLimit} operations). Extra runs are slower with reduced quality on some TOOLS. ${PREMIUM_SPEED_QUALITY_LINE}`,
      premiumBenefitsLine,
    };
  }

  if (atCapExactly) {
    return {
      usageWarningCode: "at_free_cap",
      softUsageWarning: null,
      strongUsageWarning: `You've used all ${dailyLimit} free operations for today. Further runs are slower with reduced quality on some TOOLS. ${PREMIUM_SPEED_QUALITY_LINE}`,
      premiumBenefitsLine,
    };
  }

  if (atOrPastCapRatio(usedToday, dailyLimit, approachingCapRatio)) {
    const left = Math.max(0, dailyLimit - usedToday);
    return {
      usageWarningCode: "approaching_80",
      softUsageWarning: `You've used ${usedToday} of ${dailyLimit} free operations today (${Math.round((usedToday / dailyLimit) * 100)}% of your daily allowance). ${left === 1 ? "One free run left. " : ""}${PREMIUM_SPEED_QUALITY_LINE}`,
      strongUsageWarning: null,
      premiumBenefitsLine,
    };
  }

  return {
    usageWarningCode: null,
    softUsageWarning: null,
    strongUsageWarning: null,
    premiumBenefitsLine: null,
  };
}

/** Attach soft/strong warning fields to a usage object. */
export function mergeUsageSoftWarnings<
  T extends {
    usedToday: number;
    dailyLimit: number | null;
    postLimitExtraOps?: number;
    softFrictionAfterOps?: number | null;
  },
>(usage: T, options?: { approachingCapRatio?: number }): T & UsageSoftWarnings {
  return {
    ...usage,
    ...computeUsageSoftWarnings({
      dailyLimit: usage.dailyLimit,
      usedToday: usage.usedToday,
      postLimitExtraOps: usage.postLimitExtraOps ?? 0,
      approachingCapRatio: options?.approachingCapRatio,
      softFrictionAfterOps: usage.softFrictionAfterOps,
    }),
  };
}
