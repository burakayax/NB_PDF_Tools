import type { Plan } from "@prisma/client";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { isAdminUser } from "../../lib/user-role.js";
import { MAX_DESKTOP_DEVICES, ensureDesktopDeviceAccess } from "../device/device.service.js";
import { ensurePaidSubscriptionActiveOrDowngrade } from "../subscription/subscription.service.js";
import type { FeatureKey } from "../subscription/subscription.config.js";
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

function getDesktopPlanRules(plan: Plan) {
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
        dailyLimit: 5,
        canUseEncryption: false,
        canUseBatchProcessing: false,
        maxFileSizeMb: 15,
        blockedFeatures: ["merge", "encrypt"] as FeatureKey[],
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

function buildEntitlements(plan: Plan, usedToday: number): DesktopEntitlements {
  const rules = getDesktopPlanRules(plan);
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
  const admin = isAdminUser(user);
  const deviceAccess = await ensureDesktopDeviceAccess(userId, deviceId ?? "", Boolean(deviceId), {
    bypassDeviceLimit: admin,
  });
  const effectivePlan: Plan = admin ? "PRO" : user.plan;
  const rules = getDesktopPlanRules(effectivePlan);
  const entitlements = buildEntitlements(effectivePlan, usage?.operationsCount ?? 0);

  return {
    plan: user.plan,
    status: rules.status,
    user: {
      id: user.id,
      email: user.email,
      plan: user.plan,
    },
    usage: {
      date: usageDate,
      usedToday: entitlements.usedToday,
      remainingToday: entitlements.remainingToday,
      dailyLimit: entitlements.dailyLimit,
      lastFeatureKey: usage?.lastFeatureKey ?? null,
    },
    entitlements,
    devices: {
      activeCount: deviceAccess.activeDeviceCount,
      limit: MAX_DESKTOP_DEVICES,
    },
    upgradeMessage:
      admin
        ? null
        : user.plan === "FREE"
          ? "Upgrade to Pro to unlock encryption, batch processing, and larger files."
          : null,
  };
}

function assertDesktopOperationAllowed(input: DesktopAuthorizeInput, entitlements: DesktopEntitlements) {
  if (input.featureKey === "encrypt" && !entitlements.canUseEncryption) {
    throw new HttpError(403, "Encryption is available on Pro and Business plans. Upgrade to Pro to continue.");
  }

  if ((input.featureKey === "merge" || input.fileCount > 1) && !entitlements.canUseBatchProcessing) {
    throw new HttpError(403, "Batch processing is available on Pro and Business plans. Upgrade to Pro to continue.");
  }

  if (entitlements.maxFileSizeMb !== null) {
    const maxBytes = entitlements.maxFileSizeMb * 1024 * 1024;
    if (input.totalSizeBytes > maxBytes) {
      throw new HttpError(403, `Large files are not included in your current plan. Maximum allowed size is ${entitlements.maxFileSizeMb} MB.`);
    }
  }

  if (entitlements.dailyLimit !== null && entitlements.usedToday >= entitlements.dailyLimit) {
    throw new HttpError(403, "Your daily desktop usage limit has been reached. Upgrade to Pro for unlimited access.");
  }
}

export async function authorizeDesktopOperation(userId: string, input: DesktopAuthorizeInput, deviceId?: string) {
  const { user, usageDate } = await getUserWithUsage(userId);
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
    const entitlements = buildEntitlements("PRO", currentUsage?.operationsCount ?? 0);
    return {
      allowed: true,
      plan: user.plan,
      status: getDesktopPlanRules("PRO").status,
      usage: {
        date: usageDate,
        usedToday: currentUsage?.operationsCount ?? 0,
        remainingToday: null,
        dailyLimit: null,
        lastFeatureKey: currentUsage?.lastFeatureKey ?? null,
      },
      entitlements,
      devices: {
        activeCount: deviceAccess.activeDeviceCount,
        limit: MAX_DESKTOP_DEVICES,
      },
    };
  }

  const entitlements = buildEntitlements(effectivePlan, currentUsage?.operationsCount ?? 0);
  assertDesktopOperationAllowed(input, entitlements);

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
    },
    create: {
      userId,
      usageDate,
      operationsCount: 1,
      lastFeatureKey: input.featureKey,
    },
  });

  const nextEntitlements = buildEntitlements(user.plan, nextUsage.operationsCount);

  return {
    allowed: true,
    plan: user.plan,
    status: getDesktopPlanRules(user.plan).status,
    usage: {
      date: usageDate,
      usedToday: nextUsage.operationsCount,
      remainingToday: nextEntitlements.remainingToday,
      dailyLimit: nextEntitlements.dailyLimit,
      lastFeatureKey: input.featureKey,
    },
    entitlements: nextEntitlements,
    devices: {
      activeCount: deviceAccess.activeDeviceCount,
      limit: MAX_DESKTOP_DEVICES,
    },
  };
}
