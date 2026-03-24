import type { Request, Response } from "express";
import { HttpError } from "../../lib/http-error.js";
import { changePlanSchema, recordUsageSchema } from "./subscription.schema.js";
import { changeUserPlan, getSubscriptionSummary, listPlans, recordUsage } from "./subscription.service.js";

function requireUserId(request: Request) {
  const userId = request.authUser?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication is required.");
  }
  return userId;
}

export async function listPlansController(_request: Request, response: Response) {
  response.json({
    plans: listPlans(),
  });
}

export async function currentSubscriptionController(request: Request, response: Response) {
  const userId = requireUserId(request);
  const summary = await getSubscriptionSummary(userId);
  response.json(summary);
}

export async function changePlanController(request: Request, response: Response) {
  const userId = requireUserId(request);
  const parsed = changePlanSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Plan request is invalid.");
  }

  const result = await changeUserPlan(userId, parsed.data.plan);
  response.json(result);
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
