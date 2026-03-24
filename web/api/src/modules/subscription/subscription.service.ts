import type { Plan } from "@prisma/client";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { isAdminUser } from "../../lib/user-role.js";
import { planDefinitions, type FeatureKey } from "./subscription.config.js";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function serializePlanCatalog() {
  return Object.values(planDefinitions).map((plan) => ({
    ...plan,
  }));
}

export async function getSubscriptionSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new HttpError(404, "User account could not be found.");
  }

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

export async function changeUserPlan(userId: string, plan: Plan) {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { plan },
  });

  return {
    plan: planDefinitions[updatedUser.plan],
  };
}

export async function recordUsage(userId: string, featureKey: FeatureKey) {
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
