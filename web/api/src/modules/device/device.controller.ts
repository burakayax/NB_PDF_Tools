import type { Request, Response } from "express";
import { HttpError } from "../../lib/http-error.js";
import { isAdminEmail } from "../../lib/role-policy.js";
import { registerDeviceBodySchema } from "./device.schema.js";
import { registerDevice } from "./device.service.js";

export async function registerDeviceController(request: Request, response: Response) {
  const userId = request.authUser?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication is required.");
  }

  const parsed = registerDeviceBodySchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request body.");
  }

  const result = await registerDevice(
    userId,
    { existingDeviceId: parsed.data.deviceId },
    { bypassDeviceLimit: isAdminEmail(request.authUser!.email) },
  );

  response.status(200).json({
    deviceId: result.deviceId,
    activeDeviceCount: result.activeDeviceCount,
    deviceLimit: result.deviceLimit,
  });
}
