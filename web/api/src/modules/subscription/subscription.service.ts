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
import { getResolvedPLARTFORMBusinessConfig } from "./PLARTFORM-config-runtime.js";
import { computeUsageSoftWarnings, mergeUsageSoftWarnings } from "./usage-soft-warnings.js";
import type { FeatureKey } from "./subscription.config.js";
import { getPaymentPricesTry } from "../payment/payment-pricing.js";
import { isFeatureGloballyDisabled } from "../../lib/PLARTFORM-feature-policy.js";
import { getPlanDefinitionsResolved } from "./plan-runtime.js";
import {
  computeBehaviorStressMultiplier,
  getTopPLARTFORMFromCounts,
  incrementUserLifetimeOperation,
  parseToolUsageCountsJson,
} from "./user-behavior.service.js";

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
  /** PRO/Business (and admin-as-PRO): no server throttle lane. */
  processingTier: "premium" | "standard";
  priorityProcessing: boolean;
};

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatusPayload> {
  const now = new Date();
  const { user, downgraded } = await ensurePaidSubscriptionActiveOrDowngrade(userId);
  const base = downgraded ? { plan_downgraded: true as const } : {};

  const premium = isAdminUser(user) || user.plan === "PRO" || user.plan === "BUSINESS";
  const lane = {
    processingTier: premium ? ("premium" as const) : ("standard" as const),
    priorityProcessing: premium,
  };

  if (isAdminUser(user)) {
    return { plan: "PRO", remaining_days: null, ...base, ...lane };
  }

  if (user.plan === "FREE") {
    return { plan: "FREE", remaining_days: null, ...base, ...lane };
  }

  if (!user.subscriptionExpiry) {
    return { plan: user.plan, remaining_days: null, ...lane };
  }

  const remaining_days = Math.max(
    0,
    Math.ceil((user.subscriptionExpiry.getTime() - now.getTime()) / MS_PER_DAY),
  );

  return { plan: user.plan, remaining_days, ...lane };
}

async function serializePlanCatalog() {
  const defs = await getPlanDefinitionsResolved();
  const prices = await getPaymentPricesTry();
  return Object.values(defs).map((plan) => ({
    ...plan,
    monthlyPriceTry:
      plan.name === "FREE" ? null : (prices[plan.name as "PRO" | "BUSINESS"] ?? null),
    annualPriceTry: plan.name === "PRO" ? prices.PRO_ANNUAL : null,
  }));
}

export async function getSubscriptionSummary(userId: string) {
  const { user } = await ensurePaidSubscriptionActiveOrDowngrade(userId);
  const defs = await getPlanDefinitionsResolved();
  const PLARTFORMCfg = await getResolvedPLARTFORMBusinessConfig();

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
      usage: {
        ...mergeUsageSoftWarnings(
          {
            date: usageDate,
            usedToday,
            remainingToday: null,
            dailyLimit: null,
            lastFeatureKey: usage?.lastFeatureKey ?? null,
            postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
            postLimitThrottleEventsToday: usage?.postLimitThrottleCount ?? 0,
          },
          { approachingCapRatio: PLARTFORMCfg.usageSoftWarningRatio },
        ),
        processingTier: "premium" as const,
        priorityProcessing: true,
        serverThrottleApplies: false,
      },
      allowedFeatures: adminPlan.allowedFeatures,
    };
  }

  const plan = defs[user.plan];
  const remainingToday = plan.dailyLimit === null ? null : Math.max(plan.dailyLimit - usedToday, 0);
  const throttleEvents = usage?.postLimitThrottleCount ?? 0;
  const softFrictionAfterOps =
    user.plan === "FREE" && plan.dailyLimit === null ? PLARTFORMCfg.postLimitThrottle.freeOpsBeforeThrottle : null;
  const usagePayload = mergeUsageSoftWarnings(
    {
      date: usageDate,
      usedToday,
      remainingToday,
      dailyLimit: plan.dailyLimit,
      softFrictionAfterOps,
      lastFeatureKey: usage?.lastFeatureKey ?? null,
      postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
      postLimitThrottleEventsToday: throttleEvents,
    },
    { approachingCapRatio: PLARTFORMCfg.usageSoftWarningRatio },
  );
  const ctaOv = user.plan === "FREE" ? PLARTFORMCfg.conversion : undefined;
  const hint =
    user.plan === "FREE"
      ? buildSummaryUpgradeHint(
          {
            usedToday,
            dailyLimit: plan.dailyLimit,
            postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
            postLimitThrottleEventsToday: throttleEvents,
            freeOpsBeforeThrottle: plan.dailyLimit === null ? PLARTFORMCfg.postLimitThrottle.freeOpsBeforeThrottle : null,
          },
          ctaOv,
        )
      : null;

  const freeBefore = PLARTFORMCfg.postLimitThrottle.freeOpsBeforeThrottle;
  const conversionTrackingFree =
    user.plan === "FREE"
      ? plan.dailyLimit !== null
        ? {
            freeLimitExceeded: usedToday >= plan.dailyLimit || (usage?.postLimitExtraOps ?? 0) > 0,
            operationsToday: usedToday,
            dailyLimit: plan.dailyLimit,
            softFrictionAfterOps: freeBefore,
            postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
            postLimitThrottleEventsToday: throttleEvents,
            freeLimitFirstExceededAt: user.freeLimitFirstExceededAt?.toISOString() ?? null,
          }
        : {
            freeLimitExceeded:
              usedToday >= freeBefore || (usage?.postLimitExtraOps ?? 0) > 0 || throttleEvents > 0,
            operationsToday: usedToday,
            dailyLimit: null as number | null,
            softFrictionAfterOps: freeBefore,
            postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
            postLimitThrottleEventsToday: throttleEvents,
            freeLimitFirstExceededAt: user.freeLimitFirstExceededAt?.toISOString() ?? null,
          }
      : null;

  const behaviorMonetization =
    user.plan === "FREE"
      ? {
          totalOperationsLifetime: user.totalOperationsCount,
          totalThrottleEventsLifetime: user.totalThrottleEventsCount,
          totalUpgradeCtaImpressionsLifetime: user.totalUpgradeCtaImpressionsCount,
          toolUsageTop: getTopPLARTFORMFromCounts(parseToolUsageCountsJson(user.toolUsageCountsJson), 8),
        }
      : null;

  const premiumExperience = user.plan === "PRO" || user.plan === "BUSINESS";

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
      conversionTracking: conversionTrackingFree,
      behaviorMonetization,
      ...(premiumExperience
        ? {
            processingTier: "premium" as const,
            priorityProcessing: true,
            serverThrottleApplies: false,
          }
        : {
            processingTier: "standard" as const,
            priorityProcessing: false,
            serverThrottleApplies: PLARTFORMCfg.postLimitThrottle.delaysEnabled,
          }),
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

  if (await isFeatureGloballyDisabled(featureKey)) {
    throw new HttpError(503, "This tool is temporarily unavailable.");
  }

  const defs = await getPlanDefinitionsResolved();
  const plan = defs[user.plan];
  /* FREE: full catalog always (see plan-runtime); never 403 on tool choice — friction handles conversion. */
  if (user.plan !== "FREE" && !plan.allowedFeatures.includes(featureKey)) {
    throw new HttpError(403, "Your current plan does not include this feature.");
  }

  /* Daily quota: free users past the limit are not blocked; assert-feature applies a progressive delay. */
}

/** After quota checks pass, returns throttle info for FREE users past the delay-free op count (caller applies delay). */
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
  const PLARTFORMCfg = await getResolvedPLARTFORMBusinessConfig();
  const plan = defs[user.plan];
  const usageDate = todayKey();
  const [currentUsage, behUser] = await Promise.all([
    prisma.dailyUsage.findUnique({
      where: {
        userId_usageDate: {
          userId,
          usageDate,
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        totalOperationsCount: true,
        totalThrottleEventsCount: true,
        toolUsageCountsJson: true,
      },
    }),
  ]);

  const usedToday = currentUsage?.operationsCount ?? 0;
  const priorThrottle = currentUsage?.postLimitThrottleCount ?? 0;
  const toolCounts = parseToolUsageCountsJson(behUser?.toolUsageCountsJson);
  const lifetimeThrottle = behUser?.totalThrottleEventsCount ?? 0;
  const lifetimeOps = behUser?.totalOperationsCount ?? 0;
  const behaviorStressMultiplier = computeBehaviorStressMultiplier({
    lifetimeThrottleEvents: lifetimeThrottle,
    lifetimeTotalOps: lifetimeOps,
    toolCounts,
    featureKey,
  });

  return computePostLimitThrottle({
    userPlan: user.plan,
    usedToday,
    dailyLimit: plan.dailyLimit,
    featureKey,
    totalSizeBytes: options.totalSizeBytes,
    postLimitExtraOps: currentUsage?.postLimitExtraOps ?? 0,
    throttleOpNumber: priorThrottle + 1,
    behaviorStressMultiplier,
    lifetimeThrottleEvents: lifetimeThrottle,
    lifetimeTotalOps: lifetimeOps,
    conversionCtaOverrides: PLARTFORMCfg.conversion,
    throttleRuntime: PLARTFORMCfg.postLimitThrottle,
    conversionMessaging: PLARTFORMCfg.conversionMessaging,
  });
}

/** Counts each post-limit delayed assert/authorize for conversion analytics. */
export async function incrementPostLimitThrottleCount(userId: string): Promise<number> {
  const usageDate = todayKey();
  const row = await prisma.$transaction(async (tx) => {
    const u = await tx.dailyUsage.upsert({
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
    await tx.user.updateMany({
      where: { id: userId },
      data: {
        totalThrottleEventsCount: { increment: 1 },
        totalUpgradeCtaImpressionsCount: { increment: 1 },
      },
    });
    return u;
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
    const PLARTFORMCfg = await getResolvedPLARTFORMBusinessConfig();
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
      ...computeUsageSoftWarnings({
        dailyLimit: null,
        usedToday: ops,
        postLimitExtraOps: extra,
        approachingCapRatio: PLARTFORMCfg.usageSoftWarningRatio,
      }),
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
  const PLARTFORMCfg = await getResolvedPLARTFORMBusinessConfig();
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
  const freeBefore = PLARTFORMCfg.postLimitThrottle.freeOpsBeforeThrottle;
  const extraInc =
    plan.dailyLimit !== null && usedBefore >= plan.dailyLimit
      ? 1
      : user.plan === "FREE" && plan.dailyLimit === null && usedBefore >= freeBefore
        ? 1
        : 0;

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

  if (extraInc) {
    await prisma.user.updateMany({
      where: { id: userId, freeLimitFirstExceededAt: null },
      data: { freeLimitFirstExceededAt: new Date() },
    });
  }

  await incrementUserLifetimeOperation(userId, featureKey);

  const refreshedUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      freeLimitFirstExceededAt: true,
      totalOperationsCount: true,
      totalThrottleEventsCount: true,
      totalUpgradeCtaImpressionsCount: true,
    },
  });

  const dailyLimit = plan.dailyLimit;
  const pastFreeAllowance =
    (dailyLimit !== null && nextUsage.operationsCount > dailyLimit) ||
    (user.plan === "FREE" && dailyLimit === null && nextUsage.operationsCount > freeBefore);

  const softWarnings = computeUsageSoftWarnings({
    dailyLimit,
    usedToday: nextUsage.operationsCount,
    postLimitExtraOps: nextUsage.postLimitExtraOps,
    approachingCapRatio: PLARTFORMCfg.usageSoftWarningRatio,
    softFrictionAfterOps: user.plan === "FREE" && dailyLimit === null ? freeBefore : null,
  });

  let conversionMessage: string | null = null;
  let postLimitMessage: string | null = null;
  let upgradeCta: ReturnType<typeof buildRecordPastLimitCopy>["upgradeCta"] | null = null;

  if (pastFreeAllowance && user.plan === "FREE") {
    const built = buildRecordPastLimitCopy(
      {
        operationsCount: nextUsage.operationsCount,
        dailyLimit,
        freeOpsBeforeThrottle: freeBefore,
        postLimitExtraOps: nextUsage.postLimitExtraOps,
        postLimitThrottleEventsToday: nextUsage.postLimitThrottleCount,
        lifetimeThrottleEvents: refreshedUser?.totalThrottleEventsCount ?? 0,
        lifetimeTotalOps: refreshedUser?.totalOperationsCount ?? 0,
      },
      PLARTFORMCfg.conversion,
      PLARTFORMCfg.conversionMessaging,
    );
    conversionMessage = built.conversionMessage;
    postLimitMessage = built.postLimitMessage;
    upgradeCta = built.upgradeCta;
    await prisma.user.updateMany({
      where: { id: userId },
      data: { totalUpgradeCtaImpressionsCount: { increment: 1 } },
    });
  }

  const priorityProcessing = user.plan === "PRO" || user.plan === "BUSINESS";
  const delaysLifetime = refreshedUser?.totalThrottleEventsCount ?? 0;
  const ctaImpressionsLifetime =
    (refreshedUser?.totalUpgradeCtaImpressionsCount ?? 0) + (upgradeCta ? 1 : 0);

  return {
    usageDate,
    operationsCount: nextUsage.operationsCount,
    remainingToday: dailyLimit === null ? null : Math.max(dailyLimit - nextUsage.operationsCount, 0),
    postLimitExtraOps: nextUsage.postLimitExtraOps,
    ...softWarnings,
    usageSummary:
      dailyLimit !== null
        ? formatFreeUsageLine(nextUsage.operationsCount, dailyLimit)
        : `${nextUsage.operationsCount} operations today`,
    conversionMessage,
    reducedOutputQuality: pastFreeAllowance,
    priorityProcessing,
    postLimitMessage,
    upgradeCta,
    conversionTracking:
      user.plan === "FREE"
        ? dailyLimit !== null
          ? {
              freeLimitExceeded: nextUsage.operationsCount > dailyLimit || nextUsage.postLimitExtraOps > 0,
              operationsToday: nextUsage.operationsCount,
              dailyLimit,
              softFrictionAfterOps: freeBefore,
              postLimitExtraOps: nextUsage.postLimitExtraOps,
              postLimitThrottleEventsToday: nextUsage.postLimitThrottleCount,
              freeLimitFirstExceededAt: refreshedUser?.freeLimitFirstExceededAt?.toISOString() ?? null,
              lifetimeDelaysExperienced: delaysLifetime,
              lifetimeUpgradeCtaImpressions: ctaImpressionsLifetime,
            }
          : {
              freeLimitExceeded:
                nextUsage.operationsCount > freeBefore || nextUsage.postLimitExtraOps > 0,
              operationsToday: nextUsage.operationsCount,
              dailyLimit: null,
              softFrictionAfterOps: freeBefore,
              postLimitExtraOps: nextUsage.postLimitExtraOps,
              postLimitThrottleEventsToday: nextUsage.postLimitThrottleCount,
              freeLimitFirstExceededAt: refreshedUser?.freeLimitFirstExceededAt?.toISOString() ?? null,
              lifetimeDelaysExperienced: delaysLifetime,
              lifetimeUpgradeCtaImpressions: ctaImpressionsLifetime,
            }
        : null,
  };
}
