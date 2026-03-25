import { z } from "zod";
import { featureCatalog } from "./subscription.config.js";

export const recordUsageSchema = z.object({
  featureKey: z.enum(featureCatalog),
});
