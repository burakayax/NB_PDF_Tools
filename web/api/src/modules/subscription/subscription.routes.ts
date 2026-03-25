import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import {
  assertFeatureController,
  currentSubscriptionController,
  listPlansController,
  recordUsageController,
} from "./subscription.controller.js";

export const subscriptionRouter = Router();

subscriptionRouter.get("/plans", asyncHandler(listPlansController));
subscriptionRouter.get("/current", requireAuth, asyncHandler(currentSubscriptionController));
subscriptionRouter.post("/assert-feature", requireAuth, asyncHandler(assertFeatureController));
subscriptionRouter.post("/record-usage", requireAuth, asyncHandler(recordUsageController));
