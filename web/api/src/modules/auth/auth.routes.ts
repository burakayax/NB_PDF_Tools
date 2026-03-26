import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import {
  changePasswordController,
  googleOAuthCallbackController,
  googleOAuthStartController,
  loginController,
  logoutController,
  meController,
  refreshController,
  registerController,
  updatePreferredLanguageController,
  changePasswordPostController,
  updateProfileController,
  verifyEmailController,
} from "./auth.controller.js";

export const authRouter = Router();

authRouter.get("/google", asyncHandler(googleOAuthStartController));
authRouter.get("/google/callback", asyncHandler(googleOAuthCallbackController));
authRouter.post("/register", asyncHandler(registerController));
authRouter.post("/login", asyncHandler(loginController));
authRouter.post("/refresh", asyncHandler(refreshController));
authRouter.post("/logout", asyncHandler(logoutController));
authRouter.get("/me", asyncHandler(meController));
authRouter.get("/verify-email", asyncHandler(verifyEmailController));
authRouter.patch("/preferences/language", asyncHandler(updatePreferredLanguageController));
authRouter.patch("/profile", asyncHandler(updateProfileController));
authRouter.patch("/password", asyncHandler(changePasswordController));
/** JWT: üst düzey `requireJwtUnlessPublic` + Bearer. */
authRouter.post("/change-password", asyncHandler(changePasswordPostController));
