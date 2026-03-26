import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import {
  assertFeatureController,
  currentSubscriptionController,
  listPlansController,
  recordUsageController,
  subscriptionStatusController,
} from "./subscription.controller.js";

export const subscriptionRouter = Router();

subscriptionRouter.get("/plans", asyncHandler(listPlansController));
subscriptionRouter.get("/status", asyncHandler(subscriptionStatusController));
subscriptionRouter.get("/current", asyncHandler(currentSubscriptionController));
subscriptionRouter.post("/assert-feature", asyncHandler(assertFeatureController));
subscriptionRouter.post("/record-usage", asyncHandler(recordUsageController));
