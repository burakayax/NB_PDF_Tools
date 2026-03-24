import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { submitContactController } from "./contact.controller.js";
import { contactPostLimiter } from "./contact.rate-limit.js";

export const contactRouter = Router();

contactRouter.post("/", contactPostLimiter, asyncHandler(submitContactController));
