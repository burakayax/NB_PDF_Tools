import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../lib/async-handler.js";
import { attachOptionalAuth } from "../../middleware/auth.middleware.js";
import { pageViewController } from "./analytics.controller.js";

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many analytics events from this IP. Please slow down.",
  },
});

export const analyticsRouter = Router();

analyticsRouter.post("/page-view", analyticsLimiter, attachOptionalAuth, asyncHandler(pageViewController));
