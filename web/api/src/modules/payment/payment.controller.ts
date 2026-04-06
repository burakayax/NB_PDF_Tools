import type { Request, Response } from "express";
import express from "express";
import { HttpError } from "../../lib/http-error.js";
import { getClientIp } from "../../middleware/api-security.middleware.js";
import { createPaymentBodySchema } from "./payment.schema.js";
import { createPaymentCheckoutSession, processPaymentCallback } from "./payment.service.js";

export async function createPaymentController(request: Request, response: Response) {
  const userId = request.authUser?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication is required.");
  }

  const parsed = createPaymentBodySchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request body.");
  }

  const session = await createPaymentCheckoutSession({
    userId,
    plan: parsed.data.plan,
    billing: parsed.data.billing ?? "monthly",
    clientIp: getClientIp(request),
  });

  response.status(200).json(session);
}

/** iyzico form POST (application/x-www-form-urlencoded); token ile ödeme sonucu alınır. */
export const paymentCallbackUrlencoded = express.urlencoded({ extended: true });

export async function paymentCallbackController(request: Request, response: Response) {
  const raw = request.body as Record<string, unknown>;
  const token = typeof raw.token === "string" ? raw.token : "";
  const html = await processPaymentCallback(token);
  response.status(200).type("html").send(html);
}
