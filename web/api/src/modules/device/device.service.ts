import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { hashToken } from "../../lib/token.js";

export const MAX_DESKTOP_DEVICES = 3;

export function getDesktopDeviceIdFromHeaders(headers: Record<string, string | string[] | undefined>) {
  const raw = headers["x-nb-device-id"];
  if (Array.isArray(raw)) {
    return raw[0]?.trim() || "";
  }
  return typeof raw === "string" ? raw.trim() : "";
}

export function isDesktopClient(headers: Record<string, string | string[] | undefined>) {
  const raw = headers["x-nb-client-type"];
  if (Array.isArray(raw)) {
    return raw[0] === "desktop";
  }
  return raw === "desktop";
}

function normalizeDeviceHash(deviceId: string) {
  return hashToken(deviceId);
}

export type EnsureDesktopDeviceOptions = {
  /** PLATFORM yöneticileri masaüstü cihaz kotasından muaf tutulur. */
  bypassDeviceLimit?: boolean;
};

export async function ensureDesktopDeviceAccess(
  userId: string,
  rawDeviceId: string,
  requireDevice = false,
  options: EnsureDesktopDeviceOptions = {},
) {
  if (!rawDeviceId) {
    if (requireDevice) {
      throw new HttpError(400, "Desktop device identifier is required.");
    }
    return {
      currentDeviceRegistered: false,
      activeDeviceCount: 0,
      deviceLimit: MAX_DESKTOP_DEVICES,
    };
  }

  const deviceHash = normalizeDeviceHash(rawDeviceId);
  const existingDevice = await prisma.desktopDevice.findUnique({
    where: {
      userId_deviceHash: {
        userId,
        deviceHash,
      },
    },
  });

  if (existingDevice?.blockedAt) {
    throw new HttpError(403, "This desktop device is blocked for the current account.");
  }

  if (existingDevice) {
    await prisma.desktopDevice.update({
      where: { id: existingDevice.id },
      data: {
        lastSeenAt: new Date(),
      },
    });

    const activeDeviceCount = await prisma.desktopDevice.count({
      where: {
        userId,
        blockedAt: null,
      },
    });

    return {
      currentDeviceRegistered: true,
      activeDeviceCount,
      deviceLimit: MAX_DESKTOP_DEVICES,
    };
  }

  const activeDevices = await prisma.desktopDevice.findMany({
    where: {
      userId,
      blockedAt: null,
    },
    orderBy: {
      lastSeenAt: "desc",
    },
  });

  if (activeDevices.length >= MAX_DESKTOP_DEVICES && !options.bypassDeviceLimit) {
    throw new HttpError(403, `Device limit exceeded. This account can be used on up to ${MAX_DESKTOP_DEVICES} desktop devices.`);
  }

  await prisma.desktopDevice.create({
    data: {
      userId,
      deviceHash,
    },
  });

  return {
    currentDeviceRegistered: true,
    activeDeviceCount: activeDevices.length + 1,
    deviceLimit: MAX_DESKTOP_DEVICES,
  };
}
