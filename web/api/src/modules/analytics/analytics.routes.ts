import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { pageViewController } from "./analytics.controller.js";

export const analyticsRouter = Router();

analyticsRouter.post("/page-view", asyncHandler(pageViewController));
