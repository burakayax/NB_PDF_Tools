import type { Plan, User } from "@prisma/client";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { isAdminUser } from "../../lib/user-role.js";
import {
  computePostLimitThrottle,
  formatFreeUsageLine,
  type PostLimitThrottle,
} from "./post-limit-throttle.js";
import { buildRecordPastLimitCopy, buildSummaryUpgradeHint } from "./conversion-upgrade.js";
import { getToolsConversionOverrides } from "./tools-config-runtime.js";
import { computeUsageSoftWarnings, mergeUsageSoftWarnings } from "./usage-soft-warnings.js";
import type { FeatureKey } from "./subscription.config.js";
import { getPaymentPricesTry } from "../payment/payment-pricing.js";
import { getPlanDefinitionsResolved } from "./plan-runtime.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sunucu saatiyle abonelik süresi dolmuşsa planı FREE yapar (JWT eski kalsa bile DB doğru olur).
 * Geri sayım ve yetkilendirme bu fonksiyonla tutarlı kalır; istemci tarihi kullanılmaz.
 */
export async function ensurePaidSubscriptionActiveOrDowngrade(userId: string): Promise<{ user: User; downgraded: boolean }> {
  const now = new Date();
  const userBefore = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!userBefore) {
    throw new HttpError(404, "User account could not be found.");
  }

  if (isAdminUser(userBefore)) {
    return { user: userBefore, downgraded: false };
  }

  const paid = userBefore.plan === "PRO" || userBefore.plan === "BUSINESS";
  if (paid && userBefore.subscriptionExpiry != null && userBefore.subscriptionExpiry.getTime() <= now.getTime()) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { plan: "FREE", subscriptionExpiry: null },
    });
    return { user, downgraded: true };
  }

  return { user: userBefore, downgraded: false };
}

export type SubscriptionStatusPayload = {
  plan: Plan;
  remaining_days: number | null;
  plan_downgraded?: boolean;
};

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatusPayload> {
  const now = new Date();
  const { user, downgraded } = await ensurePaidSubscriptionActiveOrDowngrade(userId);
  const base = downgraded ? { plan_downgraded: true as const } : {};

  if (isAdminUser(user)) {
    return { plan: "PRO", remaining_days: null, ...base };
  }

  if (user.plan === "FREE") {
    return { plan: "FREE", remaining_days: null, ...base };
  }

  if (!user.subscriptionExpiry) {
    return { plan: user.plan, remaining_days: null };
  }

  const remaining_days = Math.max(
    0,
    Math.ceil((user.subscriptionExpiry.getTime() - now.getTime()) / MS_PER_DAY),
  );

  return { plan: user.plan, remaining_days };
}

async function serializePlanCatalog() {
  const defs = await getPlanDefinitionsResolved();
  const prices = await getPaymentPricesTry();
  return Object.values(defs).map((plan) => ({
    ...plan,
    monthlyPriceTry:
      plan.name === "FREE" ? null : (prices[plan.name as "PRO" | "BUSINESS"] ?? null),
  }));
}

export async function getSubscriptionSummary(userId: string) {
  const { user } = await ensurePaidSubscriptionActiveOrDowngrade(userId);
  const defs = await getPlanDefinitionsResolved();

  const usageDate = todayKey();
  const usage = await prisma.dailyUsage.findUnique({
    where: {
      userId_usageDate: {
        userId,
        usageDate,
      },
    },
  });

  const usedToday = usage?.operationsCount ?? 0;

  if (isAdminUser(user)) {
    const adminPlan = defs.PRO;
    return {
      currentPlan: {
        ...adminPlan,
      },
      usage: mergeUsageSoftWarnings({
        date: usageDate,
        usedToday,
        remainingToday: null,
        dailyLimit: null,
        lastFeatureKey: usage?.lastFeatureKey ?? null,
        postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
        postLimitThrottleEventsToday: usage?.postLimitThrottleCount ?? 0,
      }),
      allowedFeatures: adminPlan.allowedFeatures,
    };
  }

  const plan = defs[user.plan];
  const remainingToday = plan.dailyLimit === null ? null : Math.max(plan.dailyLimit - usedToday, 0);
  const throttleEvents = usage?.postLimitThrottleCount ?? 0;
  const usagePayload = mergeUsageSoftWarnings({
    date: usageDate,
    usedToday,
    remainingToday,
    dailyLimit: plan.dailyLimit,
    lastFeatureKey: usage?.lastFeatureKey ?? null,
    postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
    postLimitThrottleEventsToday: throttleEvents,
  });
  const ctaOv = plan.dailyLimit !== null ? await getToolsConversionOverrides() : undefined;
  const hint =
    plan.dailyLimit !== null
      ? buildSummaryUpgradeHint(
          {
            usedToday,
            dailyLimit: plan.dailyLimit,
            postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
            postLimitThrottleEventsToday: throttleEvents,
          },
          ctaOv,
        )
      : null;

  return {
    currentPlan: {
      ...plan,
    },
    usage: {
      ...usagePayload,
      ...(hint
        ? {
            upgradeCta: hint.upgradeCta,
            conversionSummary: hint.conversionSummary,
          }
        : {}),
      conversionTracking:
        plan.dailyLimit !== null
          ? {
              freeLimitExceeded: usedToday >= plan.dailyLimit || (usage?.postLimitExtraOps ?? 0) > 0,
              operationsToday: usedToday,
              dailyLimit: plan.dailyLimit,
              postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
              postLimitThrottleEventsToday: throttleEvents,
              freeLimitFirstExceededAt: user.freeLimitFirstExceededAt?.toISOString() ?? null,
            }
          : null,
    },
    allowedFeatures: plan.allowedFeatures,
  };
}

export async function listPlans() {
  return serializePlanCatalog();
}

/** Validates plan, feature entitlement, and daily quota without incrementing usage. Call before expensive work. */
export async function assertSubscriptionAllowsOperation(userId: string, featureKey: FeatureKey) {
  const { user } = await ensurePaidSubscriptionActiveOrDowngrade(userId);

  if (isAdminUser(user)) {
    return;
  }

  const defs = await getPlanDefinitionsResolved();
  const plan = defs[user.plan];
  if (!plan.allowedFeatures.includes(featureKey)) {
    throw new HttpError(403, "Your current plan does not include this feature.");
  }

  /* Daily quota: free users past the limit are not blocked; assert-feature applies a progressive delay. */
}

/** After quota checks pass, returns throttle info when free user is past daily limit (caller applies delay). */
export async function getPostLimitThrottleForUser(
  userId: string,
  featureKey: FeatureKey,
  options: { totalSizeBytes?: number } = {},
): Promise<PostLimitThrottle | null> {
  const { user } = await ensurePaidSubscriptionActiveOrDowngrade(userId);

  if (isAdminUser(user)) {
    return null;
  }

  const defs = await getPlanDefinitionsResolved();
  const plan = defs[user.plan];
  const usageDate = todayKey();
  const currentUsage = await prisma.dailyUsage.findUnique({
    where: {
      userId_usageDate: {
        userId,
        usageDate,
      },
    },
  });

  const usedToday = currentUsage?.operationsCount ?? 0;
  const priorThrottle = currentUsage?.postLimitThrottleCount ?? 0;
  const conversionCtaOverrides = await getToolsConversionOverrides();
  return computePostLimitThrottle({
    usedToday,
    dailyLimit: plan.dailyLimit,
    featureKey,
    totalSizeBytes: options.totalSizeBytes,
    postLimitExtraOps: currentUsage?.postLimitExtraOps ?? 0,
    throttleOpNumber: priorThrottle + 1,
    conversionCtaOverrides,
  });
}

/** Counts each post-limit delayed assert/authorize for conversion analytics. */
export async function incrementPostLimitThrottleCount(userId: string): Promise<number> {
  const usageDate = todayKey();
  const row = await prisma.dailyUsage.upsert({
    where: {
      userId_usageDate: {
        userId,
        usageDate,
      },
    },
    update: {
      postLimitThrottleCount: { increment: 1 },
    },
    create: {
      userId,
      usageDate,
      operationsCount: 0,
      postLimitExtraOps: 0,
      postLimitThrottleCount: 1,
    },
    select: { postLimitThrottleCount: true },
  });
  return row.postLimitThrottleCount;
}

export async function recordUsage(userId: string, featureKey: FeatureKey) {
  await assertSubscriptionAllowsOperation(userId, featureKey);

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new HttpError(404, "User account could not be found.");
  }

  if (isAdminUser(user)) {
    const usageDate = todayKey();
    const currentUsage = await prisma.dailyUsage.findUnique({
      where: {
        userId_usageDate: {
          userId,
          usageDate,
        },
      },
    });
    const ops = currentUsage?.operationsCount ?? 0;
    const extra = currentUsage?.postLimitExtraOps ?? 0;
    return {
      usageDate,
      operationsCount: ops,
      remainingToday: null,
      postLimitExtraOps: extra,
      ...computeUsageSoftWarnings({ dailyLimit: null, usedToday: ops, postLimitExtraOps: extra }),
      usageSummary: null,
      conversionMessage: null,
      reducedOutputQuality: false,
      priorityProcessing: true,
      postLimitMessage: null,
      upgradeCta: null,
      conversionTracking: null,
    };
  }

  const defs = await getPlanDefinitionsResolved();
  const plan = defs[user.plan];
  const usageDate = todayKey();

  const existingRow = await prisma.dailyUsage.findUnique({
    where: {
      userId_usageDate: {
        userId,
        usageDate,
      },
    },
  });
  const usedBefore = existingRow?.operationsCount ?? 0;
  const extraInc = plan.dailyLimit !== null && usedBefore >= plan.dailyLimit ? 1 : 0;

  const nextUsage = await prisma.dailyUsage.upsert({
    where: {
      userId_usageDate: {
        userId,
        usageDate,
      },
    },
    update: {
      operationsCount: { increment: 1 },
      lastFeatureKey: featureKey,
      ...(extraInc ? { postLimitExtraOps: { increment: extraInc } } : {}),
    },
    create: {
      userId,
      usageDate,
      operationsCount: 1,
      lastFeatureKey: featureKey,
      postLimitExtraOps: 0,
    },
  });

  const dailyLimit = plan.dailyLimit;
  const isFreeTier = dailyLimit !== null;
  const pastFreeAllowance = isFreeTier && nextUsage.operationsCount > dailyLimit;

  if (extraInc) {
    await prisma.user.updateMany({
      where: { id: userId, freeLimitFirstExceededAt: null },
      data: { freeLimitFirstExceededAt: new Date() },
    });
  }

  const refreshedUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { freeLimitFirstExceededAt: true },
  });

  const softWarnings = computeUsageSoftWarnings({
    dailyLimit,
    usedToday: nextUsage.operationsCount,
    postLimitExtraOps: nextUsage.postLimitExtraOps,
  });

  let conversionMessage: string | null = null;
  let postLimitMessage: string | null = null;
  let upgradeCta: ReturnType<typeof buildRecordPastLimitCopy>["upgradeCta"] | null = null;

  if (pastFreeAllowance && dailyLimit !== null) {
    const ctaOv = await getToolsConversionOverrides();
    const built = buildRecordPastLimitCopy(
      {
        operationsCount: nextUsage.operationsCount,
        dailyLimit,
        postLimitExtraOps: nextUsage.postLimitExtraOps,
        postLimitThrottleEventsToday: nextUsage.postLimitThrottleCount,
      },
      ctaOv,
    );
    conversionMessage = built.conversionMessage;
    postLimitMessage = built.postLimitMessage;
    upgradeCta = built.upgradeCta;
  }

  return {
    usageDate,
    operationsCount: nextUsage.operationsCount,
    remainingToday: dailyLimit === null ? null : Math.max(dailyLimit - nextUsage.operationsCount, 0),
    postLimitExtraOps: nextUsage.postLimitExtraOps,
    ...softWarnings,
    usageSummary: dailyLimit !== null ? formatFreeUsageLine(nextUsage.operationsCount, dailyLimit) : null,
    conversionMessage,
    reducedOutputQuality: pastFreeAllowance,
    priorityProcessing: dailyLimit === null,
    postLimitMessage,
    upgradeCta,
    conversionTracking:
      dailyLimit !== null
        ? {
            freeLimitExceeded: nextUsage.operationsCount > dailyLimit || nextUsage.postLimitExtraOps > 0,
            operationsToday: nextUsage.operationsCount,
            dailyLimit,
            postLimitExtraOps: nextUsage.postLimitExtraOps,
            postLimitThrottleEventsToday: nextUsage.postLimitThrottleCount,
            freeLimitFirstExceededAt: refreshedUser?.freeLimitFirstExceededAt?.toISOString() ?? null,
          }
        : null,
  };
}
