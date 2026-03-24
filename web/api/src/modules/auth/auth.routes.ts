import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import {
  googleOAuthCallbackController,
  googleOAuthStartController,
  loginController,
  logoutController,
  meController,
  refreshController,
  registerController,
  updatePreferredLanguageController,
  verifyEmailController,
} from "./auth.controller.js";

export const authRouter = Router();

authRouter.get("/google", asyncHandler(googleOAuthStartController));
authRouter.get("/google/callback", asyncHandler(googleOAuthCallbackController));
authRouter.post("/register", asyncHandler(registerController));
authRouter.post("/login", asyncHandler(loginController));
authRouter.post("/refresh", asyncHandler(refreshController));
authRouter.post("/logout", asyncHandler(logoutController));
authRouter.get("/me", requireAuth, asyncHandler(meController));
authRouter.get("/verify-email", asyncHandler(verifyEmailController));
authRouter.patch("/preferences/language", requireAuth, asyncHandler(updatePreferredLanguageController));
