import type { Request, Response } from "express";
import { HttpError } from "../../lib/http-error.js";
import { isAdminEmail } from "../../lib/role-policy.js";
import { getUserById } from "../auth/auth.service.js";
import { ensureDesktopDeviceAccess, getDesktopDeviceIdFromHeaders, isDesktopClient } from "../device/device.service.js";

export async function profileController(request: Request, response: Response) {
  const userId = request.authUser?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication is required.");
  }

  if (isDesktopClient(request.headers)) {
    await ensureDesktopDeviceAccess(userId, getDesktopDeviceIdFromHeaders(request.headers), true, {
      bypassDeviceLimit: request.authUser ? isAdminEmail(request.authUser.email) : false,
    });
  }

  const user = await getUserById(userId);
  response.json({ user });
}
