import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { publicCmsController, publicPlansController, publicSiteConfigController } from "./public.controller.js";

export const publicRouter = Router();

publicRouter.get("/cms", asyncHandler(publicCmsController));
publicRouter.get("/site-config", asyncHandler(publicSiteConfigController));
publicRouter.get("/plans", asyncHandler(publicPlansController));
