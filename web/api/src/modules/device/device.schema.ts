import { z } from "zod";

export const registerDeviceBodySchema = z.object({
  /** Daha önce alınmış cihaz kimliği; gönderilmezse sunucu yeni üretir. */
  deviceId: z.string().min(8).max(512).optional(),
});

export type RegisterDeviceBody = z.infer<typeof registerDeviceBodySchema>;
