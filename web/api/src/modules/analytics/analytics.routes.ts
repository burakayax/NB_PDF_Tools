import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { attachOptionalAuth } from "../../middleware/auth.middleware.js";
import { pageViewController } from "./analytics.controller.js";

export const analyticsRouter = Router();

analyticsRouter.post("/page-view", attachOptionalAuth, asyncHandler(pageViewController));
