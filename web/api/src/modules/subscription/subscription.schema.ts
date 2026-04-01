import { z } from "zod";
import { featureCatalog } from "./subscription.config.js";

export const recordUsageSchema = z.object({
  featureKey: z.enum(featureCatalog),
});

/** POST /subscription/assert-feature — optional payload size for post-limit delay weighting. */
export const assertFeatureSchema = z.object({
  featureKey: z.enum(featureCatalog),
  totalSizeBytes: z.coerce.number().int().nonnegative().optional(),
});
