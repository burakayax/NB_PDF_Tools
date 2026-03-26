import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import {
  createPaymentController,
  paymentCallbackController,
  paymentCallbackUrlencoded,
} from "./payment.controller.js";

export const paymentRouter = Router();

paymentRouter.post("/callback", paymentCallbackUrlencoded, asyncHandler(paymentCallbackController));
paymentRouter.post("/create", asyncHandler(createPaymentController));
