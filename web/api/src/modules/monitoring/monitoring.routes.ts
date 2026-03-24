import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../lib/async-handler.js";
import { attachOptionalAuth } from "../../middleware/auth.middleware.js";
import { recordClientErrorController } from "./monitoring.controller.js";

const errorLogLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many error reports from this IP. Please slow down.",
  },
});

export const monitoringRouter = Router();

monitoringRouter.post("/log", errorLogLimiter, attachOptionalAuth, asyncHandler(recordClientErrorController));
