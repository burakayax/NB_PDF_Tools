import type { Plan } from "@prisma/client";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { isAdminUser } from "../../lib/user-role.js";
import { ensureDesktopDeviceAccess } from "../device/device.service.js";
import { buildSummaryUpgradeHint, buildUpgradeCta } from "../subscription/conversion-upgrade.js";
import {
  getResolvedPLARTFORMBusinessConfig,
  type ResolvedPLARTFORMBusinessConfig,
} from "../subscription/PLARTFORM-config-runtime.js";
import {
  ensurePaidSubscriptionActiveOrDowngrade,
  incrementPostLimitThrottleCount,
} from "../subscription/subscription.service.js";
import { computePostLimitThrottle, formatFreeUsageLine, sleepMs } from "../subscription/post-limit-throttle.js";
import {
  computeBehaviorStressMultiplier,
  incrementUserLifetimeOperation,
  parseToolUsageCountsJson,
} from "../subscription/user-behavior.service.js";
import { mergeUsageSoftWarnings } from "../subscription/usage-soft-warnings.js";
import type { PlanDefinition } from "../subscription/subscription.config.js";
import type { FeatureKey } from "../subscription/subscription.config.js";
import { isFeatureGloballyDisabled } from "../../lib/PLARTFORM-feature-policy.js";
import { getPlanDefinitionsResolved } from "../subscription/plan-runtime.js";
import type { DesktopAuthorizeInput } from "./license.schema.js";

type DesktopEntitlements = {
  dailyLimit: number | null;
  remainingToday: number | null;
  usedToday: number;
  canUseEncryption: boolean;
  canUseBatchProcessing: boolean;
  maxFileSizeMb: number | null;
  blockedFeatures: FeatureKey[];
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDesktopPlanRules(plan: Plan, defs: Record<Plan, PlanDefinition>, PLARTFORM: ResolvedPLARTFORMBusinessConfig) {
  switch (plan) {
    case "PRO":
      return {
        status: "active" as const,
        dailyLimit: null,
        canUseEncryption: true,
        canUseBatchProcessing: true,
        maxFileSizeMb: null,
        blockedFeatures: [] as FeatureKey[],
      };
    case "BUSINESS":
      return {
        status: "active" as const,
        dailyLimit: null,
        canUseEncryption: true,
        canUseBatchProcessing: true,
        maxFileSizeMb: null,
        blockedFeatures: [] as FeatureKey[],
      };
    case "FREE":
    default:
      return {
        status: "active" as const,
        dailyLimit: defs.FREE.dailyLimit,
        canUseEncryption: true,
        /** Web’de Free için birleştirme açık; çoklu dosya (ör. birleştirme) için gerekli. */
        canUseBatchProcessing: true,
        maxFileSizeMb: PLARTFORM.freeDesktopMaxFileSizeMb,
        blockedFeatures: [] as FeatureKey[],
      };
  }
}

async function getUserWithUsage(userId: string) {
  const { user } = await ensurePaidSubscriptionActiveOrDowngrade(userId);

  const usageDate = todayKey();
  const usage = await prisma.dailyUsage.findUnique({
    where: {
      userId_usageDate: {
        userId,
        usageDate,
      },
    },
  });

  return {
    user,
    usageDate,
    usage,
  };
}

function buildEntitlements(
  plan: Plan,
  usedToday: number,
  defs: Record<Plan, PlanDefinition>,
  PLARTFORM: ResolvedPLARTFORMBusinessConfig,
): DesktopEntitlements {
  const rules = getDesktopPlanRules(plan, defs, PLARTFORM);
  return {
    dailyLimit: rules.dailyLimit,
    usedToday,
    remainingToday: rules.dailyLimit === null ? null : Math.max(rules.dailyLimit - usedToday, 0),
    canUseEncryption: rules.canUseEncryption,
    canUseBatchProcessing: rules.canUseBatchProcessing,
    maxFileSizeMb: rules.maxFileSizeMb,
    blockedFeatures: rules.blockedFeatures,
  };
}

export async function validateDesktopLicense(userId: string, deviceId?: string) {
  const { user, usageDate, usage } = await getUserWithUsage(userId);
  const defs = await getPlanDefinitionsResolved();
  const PLARTFORMCfg = await getResolvedPLARTFORMBusinessConfig();
  const admin = isAdminUser(user);
  const deviceAccess = await ensureDesktopDeviceAccess(userId, deviceId ?? "", Boolean(deviceId), {
    bypassDeviceLimit: admin,
  });
  const effectivePlan: Plan = admin ? "PRO" : user.plan;
  const rules = getDesktopPlanRules(effectivePlan, defs, PLARTFORMCfg);
  const entitlements = buildEntitlements(effectivePlan, usage?.operationsCount ?? 0, defs, PLARTFORMCfg);
  const throttleEvents = usage?.postLimitThrottleCount ?? 0;
  const freeBefore = PLARTFORMCfg.postLimitThrottle.freeOpsBeforeThrottle;
  const isFreeEffective = !admin && effectivePlan === "FREE";
  const ctaOv = isFreeEffective ? PLARTFORMCfg.conversion : undefined;
  const hint = isFreeEffective
    ? buildSummaryUpgradeHint(
        {
          usedToday: entitlements.usedToday,
          dailyLimit: rules.dailyLimit,
          postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
          postLimitThrottleEventsToday: throttleEvents,
          freeOpsBeforeThrottle: rules.dailyLimit === null ? freeBefore : null,
        },
        ctaOv,
      )
    : null;

  return {
    plan: user.plan,
    status: rules.status,
    user: {
      id: user.id,
      email: user.email,
      plan: user.plan,
    },
    usage: mergeUsageSoftWarnings(
      {
        date: usageDate,
        usedToday: entitlements.usedToday,
        remainingToday: entitlements.remainingToday,
        dailyLimit: entitlements.dailyLimit,
        softFrictionAfterOps:
          isFreeEffective && rules.dailyLimit === null ? freeBefore : null,
        lastFeatureKey: usage?.lastFeatureKey ?? null,
        postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
        postLimitThrottleEventsToday: throttleEvents,
      },
      { approachingCapRatio: PLARTFORMCfg.usageSoftWarningRatio },
    ),
    entitlements,
    devices: {
      activeCount: deviceAccess.activeDeviceCount,
      limit: deviceAccess.deviceLimit,
    },
    upgradeMessage: hint?.conversionSummary ?? null,
    upgradeCta: hint?.upgradeCta ?? null,
    conversionTracking:
      isFreeEffective
        ? rules.dailyLimit !== null
          ? {
              freeLimitExceeded:
                entitlements.usedToday >= rules.dailyLimit || (usage?.postLimitExtraOps ?? 0) > 0,
              operationsToday: entitlements.usedToday,
              dailyLimit: rules.dailyLimit,
              softFrictionAfterOps: freeBefore,
              postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
              postLimitThrottleEventsToday: throttleEvents,
              freeLimitFirstExceededAt: user.freeLimitFirstExceededAt?.toISOString() ?? null,
            }
          : {
              freeLimitExceeded:
                entitlements.usedToday >= freeBefore ||
                (usage?.postLimitExtraOps ?? 0) > 0 ||
                throttleEvents > 0,
              operationsToday: entitlements.usedToday,
              dailyLimit: null,
              softFrictionAfterOps: freeBefore,
              postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
              postLimitThrottleEventsToday: throttleEvents,
              freeLimitFirstExceededAt: user.freeLimitFirstExceededAt?.toISOString() ?? null,
            }
        : null,
    processingTier:
      admin || user.plan === "PRO" || user.plan === "BUSINESS" ? ("premium" as const) : ("standard" as const),
    priorityProcessing: admin || user.plan === "PRO" || user.plan === "BUSINESS",
  };
}

function assertDesktopOperationAllowed(input: DesktopAuthorizeInput, entitlements: DesktopEntitlements) {
  const fk = input.featureKey as FeatureKey;
  if (entitlements.blockedFeatures.includes(fk)) {
    throw new HttpError(403, "This feature is not available on your current plan.");
  }

  if (input.featureKey === "encrypt" && !entitlements.canUseEncryption) {
    throw new HttpError(403, "Encryption is available on Pro and Business plans. Upgrade to Pro to continue.");
  }

  if (input.fileCount > 1 && !entitlements.canUseBatchProcessing) {
    throw new HttpError(403, "Batch processing is available on Pro and Business plans. Upgrade to Pro to continue.");
  }

  if (entitlements.maxFileSizeMb !== null) {
    const maxBytes = entitlements.maxFileSizeMb * 1024 * 1024;
    if (input.totalSizeBytes > maxBytes) {
      throw new HttpError(403, `Large files are not included in your current plan. Maximum allowed size is ${entitlements.maxFileSizeMb} MB.`);
    }
  }

  /* Past daily free limit: desktop is not blocked; progressive delay runs in authorizeDesktopOperation. */
}

export async function authorizeDesktopOperation(userId: string, input: DesktopAuthorizeInput, deviceId?: string) {
  const { user, usageDate } = await getUserWithUsage(userId);
  const defs = await getPlanDefinitionsResolved();
  const PLARTFORMCfg = await getResolvedPLARTFORMBusinessConfig();
  const admin = isAdminUser(user);
  const deviceAccess = await ensureDesktopDeviceAccess(userId, deviceId ?? "", Boolean(deviceId), {
    bypassDeviceLimit: admin,
  });
  const currentUsage = await prisma.dailyUsage.findUnique({
    where: {
      userId_usageDate: {
        userId,
        usageDate,
      },
    },
  });

  const effectivePlan: Plan = admin ? "PRO" : user.plan;

  if (admin) {
    const entitlements = buildEntitlements("PRO", currentUsage?.operationsCount ?? 0, defs, PLARTFORMCfg);
    return {
      allowed: true,
      plan: user.plan,
      status: getDesktopPlanRules("PRO", defs, PLARTFORMCfg).status,
      usage: mergeUsageSoftWarnings(
        {
          date: usageDate,
          usedToday: currentUsage?.operationsCount ?? 0,
          remainingToday: null,
          dailyLimit: null,
          lastFeatureKey: currentUsage?.lastFeatureKey ?? null,
          postLimitExtraOps: currentUsage?.postLimitExtraOps ?? 0,
          postLimitThrottleEventsToday: currentUsage?.postLimitThrottleCount ?? 0,
        },
        { approachingCapRatio: PLARTFORMCfg.usageSoftWarningRatio },
      ),
      entitlements,
      devices: {
        activeCount: deviceAccess.activeDeviceCount,
        limit: deviceAccess.deviceLimit,
      },
      throttleApplied: false,
      throttleMessage: null as string | null,
      usageSummary: null as string | null,
      conversionMessage: null as string | null,
      reducedOutputQuality: false,
      priorityProcessing: true,
      processingTier: "premium" as const,
      postLimitExtraOpsToday: currentUsage?.postLimitExtraOps ?? 0,
      upgradeCta: null,
      conversionTracking: null,
    };
  }

  const entitlements = buildEntitlements(effectivePlan, currentUsage?.operationsCount ?? 0, defs, PLARTFORMCfg);
  if (await isFeatureGloballyDisabled(input.featureKey as FeatureKey)) {
    throw new HttpError(503, "This tool is temporarily unavailable.");
  }
  assertDesktopOperationAllowed(input, entitlements);

  const usedBefore = currentUsage?.operationsCount ?? 0;
  const priorThrottle = currentUsage?.postLimitThrottleCount ?? 0;
  const freeBefore = PLARTFORMCfg.postLimitThrottle.freeOpsBeforeThrottle;
  const toolCounts = parseToolUsageCountsJson(user.toolUsageCountsJson);
  const lifetimeThrottle = user.totalThrottleEventsCount ?? 0;
  const lifetimeOps = user.totalOperationsCount ?? 0;
  const behaviorStressMultiplier = computeBehaviorStressMultiplier({
    lifetimeThrottleEvents: lifetimeThrottle,
    lifetimeTotalOps: lifetimeOps,
    toolCounts,
    featureKey: input.featureKey as FeatureKey,
  });
  const throttle = computePostLimitThrottle({
    userPlan: user.plan,
    usedToday: usedBefore,
    dailyLimit: defs[user.plan].dailyLimit,
    featureKey: input.featureKey as FeatureKey,
    totalSizeBytes: input.totalSizeBytes,
    postLimitExtraOps: currentUsage?.postLimitExtraOps ?? 0,
    throttleOpNumber: priorThrottle + 1,
    behaviorStressMultiplier,
    lifetimeThrottleEvents: lifetimeThrottle,
    lifetimeTotalOps: lifetimeOps,
    conversionCtaOverrides: PLARTFORMCfg.conversion,
    throttleRuntime: PLARTFORMCfg.postLimitThrottle,
    conversionMessaging: PLARTFORMCfg.conversionMessaging,
  });
  if (throttle) {
    await incrementPostLimitThrottleCount(userId);
    await sleepMs(throttle.delayMs);
  }

  const planLimit = defs[user.plan].dailyLimit;
  const extraInc =
    planLimit !== null && usedBefore >= planLimit
      ? 1
      : user.plan === "FREE" && planLimit === null && usedBefore >= freeBefore
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
      lastFeatureKey: input.featureKey,
      ...(extraInc ? { postLimitExtraOps: { increment: extraInc } } : {}),
    },
    create: {
      userId,
      usageDate,
      operationsCount: 1,
      lastFeatureKey: input.featureKey,
      postLimitExtraOps: 0,
    },
  });

  if (extraInc) {
    await prisma.user.updateMany({
      where: { id: userId, freeLimitFirstExceededAt: null },
      data: { freeLimitFirstExceededAt: new Date() },
    });
  }

  await incrementUserLifetimeOperation(userId, input.featureKey as FeatureKey);

  const nextEntitlements = buildEntitlements(user.plan, nextUsage.operationsCount, defs, PLARTFORMCfg);
  const usageLine =
    planLimit !== null
      ? formatFreeUsageLine(nextUsage.operationsCount, planLimit)
      : `${nextUsage.operationsCount} operations today`;

  const userForConv = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      freeLimitFirstExceededAt: true,
      totalThrottleEventsCount: true,
      totalUpgradeCtaImpressionsCount: true,
    },
  });

  const upgradeCta =
    user.plan === "FREE" &&
    (Boolean(throttle) ||
      nextUsage.postLimitExtraOps > 0 ||
      (planLimit !== null ? nextUsage.operationsCount > planLimit : nextUsage.operationsCount > freeBefore))
      ? (throttle?.upgradeCta ?? buildUpgradeCta(PLARTFORMCfg.conversion))
      : null;

  const conversionTracking =
    user.plan === "FREE"
      ? planLimit !== null
        ? {
            freeLimitExceeded: nextUsage.operationsCount > planLimit || nextUsage.postLimitExtraOps > 0,
            operationsToday: nextUsage.operationsCount,
            dailyLimit: planLimit,
            softFrictionAfterOps: freeBefore,
            postLimitExtraOps: nextUsage.postLimitExtraOps,
            postLimitThrottleEventsToday: nextUsage.postLimitThrottleCount,
            freeLimitFirstExceededAt: userForConv?.freeLimitFirstExceededAt?.toISOString() ?? null,
            lifetimeDelaysExperienced: userForConv?.totalThrottleEventsCount ?? 0,
            lifetimeUpgradeCtaImpressions: userForConv?.totalUpgradeCtaImpressionsCount ?? 0,
          }
        : {
            freeLimitExceeded:
              nextUsage.operationsCount > freeBefore || nextUsage.postLimitExtraOps > 0,
            operationsToday: nextUsage.operationsCount,
            dailyLimit: null,
            softFrictionAfterOps: freeBefore,
            postLimitExtraOps: nextUsage.postLimitExtraOps,
            postLimitThrottleEventsToday: nextUsage.postLimitThrottleCount,
            freeLimitFirstExceededAt: userForConv?.freeLimitFirstExceededAt?.toISOString() ?? null,
            lifetimeDelaysExperienced: userForConv?.totalThrottleEventsCount ?? 0,
            lifetimeUpgradeCtaImpressions: userForConv?.totalUpgradeCtaImpressionsCount ?? 0,
          }
      : null;

  return {
    allowed: true,
    plan: user.plan,
    status: getDesktopPlanRules(user.plan, defs, PLARTFORMCfg).status,
    usage: mergeUsageSoftWarnings(
      {
        date: usageDate,
        usedToday: nextUsage.operationsCount,
        remainingToday: nextEntitlements.remainingToday,
        dailyLimit: nextEntitlements.dailyLimit,
        softFrictionAfterOps:
          user.plan === "FREE" && nextEntitlements.dailyLimit === null ? freeBefore : null,
        lastFeatureKey: input.featureKey,
        postLimitExtraOps: nextUsage.postLimitExtraOps,
        postLimitThrottleEventsToday: nextUsage.postLimitThrottleCount,
      },
      { approachingCapRatio: PLARTFORMCfg.usageSoftWarningRatio },
    ),
    entitlements: nextEntitlements,
    devices: {
      activeCount: deviceAccess.activeDeviceCount,
      limit: deviceAccess.deviceLimit,
    },
    throttleApplied: Boolean(throttle),
    throttleMessage: throttle?.message ?? null,
    usageSummary: usageLine,
    conversionMessage: throttle?.message ?? null,
    reducedOutputQuality: Boolean(throttle?.reducedOutputQuality),
    priorityProcessing: user.plan === "PRO" || user.plan === "BUSINESS",
    processingTier: user.plan === "PRO" || user.plan === "BUSINESS" ? ("premium" as const) : ("standard" as const),
    postLimitExtraOpsToday: nextUsage.postLimitExtraOps,
    upgradeCta,
    conversionTracking,
  };
}
