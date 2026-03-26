import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { recordClientErrorController } from "./monitoring.controller.js";

export const monitoringRouter = Router();

monitoringRouter.post("/log", asyncHandler(recordClientErrorController));
