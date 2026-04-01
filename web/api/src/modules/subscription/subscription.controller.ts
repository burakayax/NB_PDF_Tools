import type { Request, Response } from "express";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { assertFeatureSchema, recordUsageSchema } from "./subscription.schema.js";
import { sleepMs } from "./post-limit-throttle.js";
import {
  assertSubscriptionAllowsOperation,
  getPostLimitThrottleForUser,
  getSubscriptionStatus,
  getSubscriptionSummary,
  incrementPostLimitThrottleCount,
  listPlans,
  recordUsage,
} from "./subscription.service.js";

function requireUserId(request: Request) {
  const userId = request.authUser?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication is required.");
  }
  return userId;
}

export async function listPlansController(_request: Request, response: Response) {
  response.json({
    plans: await listPlans(),
  });
}

export async function currentSubscriptionController(request: Request, response: Response) {
  const userId = requireUserId(request);
  const summary = await getSubscriptionSummary(userId);
  response.json(summary);
}

export async function subscriptionStatusController(request: Request, response: Response) {
  const userId = requireUserId(request);
  const status = await getSubscriptionStatus(userId);
  response.json(status);
}

export async function assertFeatureController(request: Request, response: Response) {
  const userId = requireUserId(request);
  const parsed = assertFeatureSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Feature check request is invalid.");
  }

  await assertSubscriptionAllowsOperation(userId, parsed.data.featureKey);
  const throttle = await getPostLimitThrottleForUser(userId, parsed.data.featureKey, {
    totalSizeBytes: parsed.data.totalSizeBytes,
  });
  if (throttle) {
    const postLimitThrottleEventsToday = await incrementPostLimitThrottleCount(userId);
    await sleepMs(throttle.delayMs);
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { freeLimitFirstExceededAt: true },
    });
    response.status(200).json({
      throttleApplied: true,
      delayMs: throttle.delayMs,
      message: throttle.message,
      usageSummary: throttle.usageSummary,
      reducedOutputQuality: throttle.reducedOutputQuality,
      priorityProcessing: throttle.priorityProcessing,
      upgradeCta: throttle.upgradeCta,
      conversionTracking: {
        ...throttle.conversionTracking,
        postLimitThrottleEventsToday,
        freeLimitFirstExceededAt: dbUser?.freeLimitFirstExceededAt?.toISOString() ?? null,
      },
    });
    return;
  }
  response.status(204).send();
}

export async function recordUsageController(request: Request, response: Response) {
  const userId = requireUserId(request);
  const parsed = recordUsageSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Usage request is invalid.");
  }

  const result = await recordUsage(userId, parsed.data.featureKey);
  response.json(result);
}
