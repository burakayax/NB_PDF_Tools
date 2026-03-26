import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { authorizeDesktopOperationController, validateLicenseController } from "./license.controller.js";

export const licenseRouter = Router();

licenseRouter.get("/validate", asyncHandler(validateLicenseController));
licenseRouter.post("/authorize", asyncHandler(authorizeDesktopOperationController));
