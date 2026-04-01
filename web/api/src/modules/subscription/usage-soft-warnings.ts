/**
 * Soft conversion prompts for free-tier daily limits (dashboard + record-usage).
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

function atOrPastEightyPercent(usedToday: number, dailyLimit: number): boolean {
  const threshold = Math.max(1, Math.ceil(dailyLimit * 0.8));
  return usedToday >= threshold && usedToday < dailyLimit;
}

/**
 * @param usedToday — operations already recorded today (same as subscription summary).
 */
export function computeUsageSoftWarnings(input: {
  dailyLimit: number | null;
  usedToday: number;
  postLimitExtraOps: number;
}): UsageSoftWarnings {
  const { dailyLimit, usedToday, postLimitExtraOps } = input;

  if (dailyLimit === null) {
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
      strongUsageWarning: `You've passed today's free allowance (${usedToday}/${dailyLimit} operations). Extra runs are slower with reduced quality on some tools. ${PREMIUM_SPEED_QUALITY_LINE}`,
      premiumBenefitsLine,
    };
  }

  if (atCapExactly) {
    return {
      usageWarningCode: "at_free_cap",
      softUsageWarning: null,
      strongUsageWarning: `You've used all ${dailyLimit} free operations for today. Further runs are slower with reduced quality on some tools. ${PREMIUM_SPEED_QUALITY_LINE}`,
      premiumBenefitsLine,
    };
  }

  if (atOrPastEightyPercent(usedToday, dailyLimit)) {
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

/** Attach soft/strong warning fields to a usage object (no-op when `dailyLimit` is null). */
export function mergeUsageSoftWarnings<
  T extends { usedToday: number; dailyLimit: number | null; postLimitExtraOps?: number },
>(usage: T): T & UsageSoftWarnings {
  return {
    ...usage,
    ...computeUsageSoftWarnings({
      dailyLimit: usage.dailyLimit,
      usedToday: usage.usedToday,
      postLimitExtraOps: usage.postLimitExtraOps ?? 0,
    }),
  };
}
