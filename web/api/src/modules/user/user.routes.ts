import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { profileController } from "./user.controller.js";

export const userRouter = Router();

userRouter.get("/profile", asyncHandler(profileController));
