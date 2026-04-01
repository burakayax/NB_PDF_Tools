import type { Plan } from "@prisma/client";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { isAdminUser } from "../../lib/user-role.js";
import { ensureDesktopDeviceAccess } from "../device/device.service.js";
import { buildSummaryUpgradeHint, buildUpgradeCta } from "../subscription/conversion-upgrade.js";
import { getToolsConversionOverrides } from "../subscription/tools-config-runtime.js";
import {
  ensurePaidSubscriptionActiveOrDowngrade,
  incrementPostLimitThrottleCount,
} from "../subscription/subscription.service.js";
import { computePostLimitThrottle, formatFreeUsageLine, sleepMs } from "../subscription/post-limit-throttle.js";
import { mergeUsageSoftWarnings } from "../subscription/usage-soft-warnings.js";
import type { PlanDefinition } from "../subscription/subscription.config.js";
import { featureCatalog, type FeatureKey } from "../subscription/subscription.config.js";
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

function blockedFeaturesForPlan(plan: Plan, defs: Record<Plan, PlanDefinition>): FeatureKey[] {
  const allowed = new Set(defs[plan].allowedFeatures);
  return featureCatalog.filter((f) => !allowed.has(f));
}

function getDesktopPlanRules(plan: Plan, defs: Record<Plan, PlanDefinition>) {
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
        canUseEncryption: false,
        /** Web’de Free için birleştirme açık; çoklu dosya (ör. birleştirme) için gerekli. */
        canUseBatchProcessing: true,
        maxFileSizeMb: 15,
        blockedFeatures: blockedFeaturesForPlan("FREE", defs),
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

function buildEntitlements(plan: Plan, usedToday: number, defs: Record<Plan, PlanDefinition>): DesktopEntitlements {
  const rules = getDesktopPlanRules(plan, defs);
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
  const admin = isAdminUser(user);
  const deviceAccess = await ensureDesktopDeviceAccess(userId, deviceId ?? "", Boolean(deviceId), {
    bypassDeviceLimit: admin,
  });
  const effectivePlan: Plan = admin ? "PRO" : user.plan;
  const rules = getDesktopPlanRules(effectivePlan, defs);
  const entitlements = buildEntitlements(effectivePlan, usage?.operationsCount ?? 0, defs);
  const throttleEvents = usage?.postLimitThrottleCount ?? 0;
  const ctaOv = !admin && rules.dailyLimit !== null ? await getToolsConversionOverrides() : undefined;
  const hint =
    !admin && rules.dailyLimit !== null
      ? buildSummaryUpgradeHint(
          {
            usedToday: entitlements.usedToday,
            dailyLimit: rules.dailyLimit,
            postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
            postLimitThrottleEventsToday: throttleEvents,
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
    usage: mergeUsageSoftWarnings({
      date: usageDate,
      usedToday: entitlements.usedToday,
      remainingToday: entitlements.remainingToday,
      dailyLimit: entitlements.dailyLimit,
      lastFeatureKey: usage?.lastFeatureKey ?? null,
      postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
      postLimitThrottleEventsToday: throttleEvents,
    }),
    entitlements,
    devices: {
      activeCount: deviceAccess.activeDeviceCount,
      limit: deviceAccess.deviceLimit,
    },
    upgradeMessage: hint?.conversionSummary ?? null,
    upgradeCta: hint?.upgradeCta ?? null,
    conversionTracking:
      !admin && rules.dailyLimit !== null
        ? {
            freeLimitExceeded: entitlements.usedToday >= rules.dailyLimit || (usage?.postLimitExtraOps ?? 0) > 0,
            operationsToday: entitlements.usedToday,
            dailyLimit: rules.dailyLimit,
            postLimitExtraOps: usage?.postLimitExtraOps ?? 0,
            postLimitThrottleEventsToday: throttleEvents,
            freeLimitFirstExceededAt: user.freeLimitFirstExceededAt?.toISOString() ?? null,
          }
        : null,
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
    const entitlements = buildEntitlements("PRO", currentUsage?.operationsCount ?? 0, defs);
    return {
      allowed: true,
      plan: user.plan,
      status: getDesktopPlanRules("PRO", defs).status,
      usage: mergeUsageSoftWarnings({
        date: usageDate,
        usedToday: currentUsage?.operationsCount ?? 0,
        remainingToday: null,
        dailyLimit: null,
        lastFeatureKey: currentUsage?.lastFeatureKey ?? null,
        postLimitExtraOps: currentUsage?.postLimitExtraOps ?? 0,
        postLimitThrottleEventsToday: currentUsage?.postLimitThrottleCount ?? 0,
      }),
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
      postLimitExtraOpsToday: currentUsage?.postLimitExtraOps ?? 0,
      upgradeCta: null,
      conversionTracking: null,
    };
  }

  const entitlements = buildEntitlements(effectivePlan, currentUsage?.operationsCount ?? 0, defs);
  assertDesktopOperationAllowed(input, entitlements);

  const usedBefore = currentUsage?.operationsCount ?? 0;
  const priorThrottle = currentUsage?.postLimitThrottleCount ?? 0;
  const conversionCtaOverrides = await getToolsConversionOverrides();
  const throttle = computePostLimitThrottle({
    usedToday: usedBefore,
    dailyLimit: defs[user.plan].dailyLimit,
    featureKey: input.featureKey as FeatureKey,
    totalSizeBytes: input.totalSizeBytes,
    postLimitExtraOps: currentUsage?.postLimitExtraOps ?? 0,
    throttleOpNumber: priorThrottle + 1,
    conversionCtaOverrides,
  });
  if (throttle) {
    await incrementPostLimitThrottleCount(userId);
    await sleepMs(throttle.delayMs);
  }

  const planLimit = defs[user.plan].dailyLimit;
  const extraInc = planLimit !== null && usedBefore >= planLimit ? 1 : 0;

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

  const nextEntitlements = buildEntitlements(user.plan, nextUsage.operationsCount, defs);
  const usageLine =
    planLimit !== null ? formatFreeUsageLine(nextUsage.operationsCount, planLimit) : null;

  const userForConv = await prisma.user.findUnique({
    where: { id: userId },
    select: { freeLimitFirstExceededAt: true },
  });

  const upgradeCta =
    planLimit !== null &&
    (Boolean(throttle) || nextUsage.postLimitExtraOps > 0 || nextUsage.operationsCount > planLimit)
      ? (throttle?.upgradeCta ?? buildUpgradeCta(conversionCtaOverrides))
      : null;

  const conversionTracking =
    planLimit !== null
      ? {
          freeLimitExceeded: nextUsage.operationsCount > planLimit || nextUsage.postLimitExtraOps > 0,
          operationsToday: nextUsage.operationsCount,
          dailyLimit: planLimit,
          postLimitExtraOps: nextUsage.postLimitExtraOps,
          postLimitThrottleEventsToday: nextUsage.postLimitThrottleCount,
          freeLimitFirstExceededAt: userForConv?.freeLimitFirstExceededAt?.toISOString() ?? null,
        }
      : null;

  return {
    allowed: true,
    plan: user.plan,
    status: getDesktopPlanRules(user.plan, defs).status,
    usage: mergeUsageSoftWarnings({
      date: usageDate,
      usedToday: nextUsage.operationsCount,
      remainingToday: nextEntitlements.remainingToday,
      dailyLimit: nextEntitlements.dailyLimit,
      lastFeatureKey: input.featureKey,
      postLimitExtraOps: nextUsage.postLimitExtraOps,
      postLimitThrottleEventsToday: nextUsage.postLimitThrottleCount,
    }),
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
    priorityProcessing: defs[user.plan].dailyLimit === null,
    postLimitExtraOpsToday: nextUsage.postLimitExtraOps,
    upgradeCta,
    conversionTracking,
  };
}
