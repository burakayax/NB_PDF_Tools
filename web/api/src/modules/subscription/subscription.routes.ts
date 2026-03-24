import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import {
  changePlanController,
  currentSubscriptionController,
  listPlansController,
  recordUsageController,
} from "./subscription.controller.js";

export const subscriptionRouter = Router();

subscriptionRouter.get("/plans", asyncHandler(listPlansController));
subscriptionRouter.get("/current", requireAuth, asyncHandler(currentSubscriptionController));
subscriptionRouter.post("/change-plan", requireAuth, asyncHandler(changePlanController));
subscriptionRouter.post("/record-usage", requireAuth, asyncHandler(recordUsageController));
