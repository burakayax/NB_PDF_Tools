import type { Request, Response } from "express";
import { HttpError } from "../../lib/http-error.js";
import { getDesktopDeviceIdFromHeaders, isDesktopClient } from "../device/device.service.js";
import { authorizeDesktopOperation, validateDesktopLicense } from "./license.service.js";
import { desktopAuthorizeSchema } from "./license.schema.js";

function requireUserId(request: Request) {
  const userId = request.authUser?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication is required.");
  }
  return userId;
}

export async function validateLicenseController(request: Request, response: Response) {
  const userId = requireUserId(request);
  const deviceId = isDesktopClient(request.headers) ? getDesktopDeviceIdFromHeaders(request.headers) : "";
  const result = await validateDesktopLicense(userId, deviceId || undefined);
  response.json(result);
}

export async function authorizeDesktopOperationController(request: Request, response: Response) {
  const userId = requireUserId(request);
  const parsed = desktopAuthorizeSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Desktop authorization payload is invalid.");
  }

  const deviceId = isDesktopClient(request.headers) ? getDesktopDeviceIdFromHeaders(request.headers) : "";
  const result = await authorizeDesktopOperation(userId, parsed.data, deviceId || undefined);
  response.json(result);
}
