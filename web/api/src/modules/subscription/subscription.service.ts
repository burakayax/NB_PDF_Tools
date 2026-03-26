import type { Plan, User } from "@prisma/client";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { isAdminUser } from "../../lib/user-role.js";
import { planDefinitions, type FeatureKey } from "./subscription.config.js";

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

function serializePlanCatalog() {
  return Object.values(planDefinitions).map((plan) => ({
    ...plan,
  }));
}

export async function getSubscriptionSummary(userId: string) {
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

  const usedToday = usage?.operationsCount ?? 0;

  if (isAdminUser(user)) {
    const adminPlan = planDefinitions.PRO;
    return {
      currentPlan: {
        ...adminPlan,
      },
      usage: {
        date: usageDate,
        usedToday,
        remainingToday: null,
        dailyLimit: null,
        lastFeatureKey: usage?.lastFeatureKey ?? null,
      },
      allowedFeatures: adminPlan.allowedFeatures,
    };
  }

  const plan = planDefinitions[user.plan];
  const remainingToday = plan.dailyLimit === null ? null : Math.max(plan.dailyLimit - usedToday, 0);

  return {
    currentPlan: {
      ...plan,
    },
    usage: {
      date: usageDate,
      usedToday,
      remainingToday,
      dailyLimit: plan.dailyLimit,
      lastFeatureKey: usage?.lastFeatureKey ?? null,
    },
    allowedFeatures: plan.allowedFeatures,
  };
}

export function listPlans() {
  return serializePlanCatalog();
}

/** Validates plan, feature entitlement, and daily quota without incrementing usage. Call before expensive work. */
export async function assertSubscriptionAllowsOperation(userId: string, featureKey: FeatureKey) {
  const { user } = await ensurePaidSubscriptionActiveOrDowngrade(userId);

  if (isAdminUser(user)) {
    return;
  }

  const plan = planDefinitions[user.plan];
  if (!plan.allowedFeatures.includes(featureKey)) {
    throw new HttpError(403, "Your current plan does not include this feature.");
  }

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
  if (plan.dailyLimit !== null && usedToday >= plan.dailyLimit) {
    throw new HttpError(403, "Your daily usage limit has been reached. Please upgrade your plan.");
  }
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
    return {
      usageDate,
      operationsCount: currentUsage?.operationsCount ?? 0,
      remainingToday: null,
    };
  }

  const plan = planDefinitions[user.plan];
  const usageDate = todayKey();

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
    },
    create: {
      userId,
      usageDate,
      operationsCount: 1,
      lastFeatureKey: featureKey,
    },
  });

  return {
    usageDate,
    operationsCount: nextUsage.operationsCount,
    remainingToday: plan.dailyLimit === null ? null : Math.max(plan.dailyLimit - nextUsage.operationsCount, 0),
  };
}
