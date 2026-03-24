import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { authorizeDesktopOperationController, validateLicenseController } from "./license.controller.js";

const desktopLicenseLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many desktop license requests from this IP. Please try again shortly.",
  },
});

export const licenseRouter = Router();

licenseRouter.get("/validate", desktopLicenseLimiter, requireAuth, asyncHandler(validateLicenseController));
licenseRouter.post("/authorize", desktopLicenseLimiter, requireAuth, asyncHandler(authorizeDesktopOperationController));
