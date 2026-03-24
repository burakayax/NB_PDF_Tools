import { z } from "zod";
import { featureCatalog } from "../subscription/subscription.config.js";

export const desktopAuthorizeSchema = z.object({
  featureKey: z.enum(featureCatalog),
  fileCount: z.coerce.number().int().positive(),
  totalSizeBytes: z.coerce.number().int().nonnegative(),
});

export type DesktopAuthorizeInput = z.infer<typeof desktopAuthorizeSchema>;
