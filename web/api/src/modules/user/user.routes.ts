import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { profileController } from "./user.controller.js";

export const userRouter = Router();

userRouter.get("/profile", requireAuth, asyncHandler(profileController));
