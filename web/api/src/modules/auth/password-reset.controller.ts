import type { Request, Response } from "express";
import { HttpError } from "../../lib/http-error.js";
import {
  completePasswordResetWithToken,
  requestPasswordResetCode,
  verifyPasswordResetCode,
} from "./password-reset.service.js";
import {
  forgotPasswordRequestSchema,
  forgotPasswordResetSchema,
  forgotPasswordVerifySchema,
} from "./auth.schema.js";

export async function forgotPasswordRequestController(request: Request, response: Response) {
  const parsed = forgotPasswordRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  const preferredLanguage = parsed.data.preferredLanguage ?? "en";
  const result = await requestPasswordResetCode(parsed.data.email, preferredLanguage);
  response.json(result);
}

export async function forgotPasswordVerifyController(request: Request, response: Response) {
  const parsed = forgotPasswordVerifySchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  const result = await verifyPasswordResetCode(parsed.data.email, parsed.data.code);
  response.json(result);
}

export async function forgotPasswordResetController(request: Request, response: Response) {
  const parsed = forgotPasswordResetSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  await completePasswordResetWithToken(parsed.data.resetToken, parsed.data.newPassword);
  response.json({ message: "Password has been updated. You can sign in with your new password." });
}
