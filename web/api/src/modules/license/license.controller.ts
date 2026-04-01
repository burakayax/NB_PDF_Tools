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

/**
 * Desktop clients must send a non-empty X-NB-Device-Id; web callers omit it.
 */
function resolveDesktopDeviceIdForRequest(request: Request): string | undefined {
  if (!isDesktopClient(request.headers)) {
    return undefined;
  }
  const deviceId = getDesktopDeviceIdFromHeaders(request.headers);
  if (!deviceId) {
    throw new HttpError(400, "Desktop device identifier is required.");
  }
  return deviceId;
}

export async function validateLicenseController(request: Request, response: Response) {
  const userId = requireUserId(request);
  const deviceId = resolveDesktopDeviceIdForRequest(request);
  const result = await validateDesktopLicense(userId, deviceId);
  response.json(result);
}

/** Desktop-only gate (device header required). Web apps continue to use GET /license/validate. */
export async function checkLicenseController(request: Request, response: Response) {
  const userId = requireUserId(request);
  if (!isDesktopClient(request.headers)) {
    throw new HttpError(400, "GET /license/check is for desktop clients only. Use GET /license/validate from web.");
  }
  const deviceId = resolveDesktopDeviceIdForRequest(request);
  const result = await validateDesktopLicense(userId, deviceId);
  response.json(result);
}

export async function authorizeDesktopOperationController(request: Request, response: Response) {
  const userId = requireUserId(request);
  if (!isDesktopClient(request.headers)) {
    throw new HttpError(400, "This endpoint requires a desktop client (X-NB-Client-Type: desktop).");
  }
  const parsed = desktopAuthorizeSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Desktop authorization payload is invalid.");
  }

  const deviceId = resolveDesktopDeviceIdForRequest(request);
  const result = await authorizeDesktopOperation(userId, parsed.data, deviceId);
  response.json(result);
}
