import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { registerDeviceController } from "./device.controller.js";

export const deviceRouter = Router();

deviceRouter.post("/register", asyncHandler(registerDeviceController));
