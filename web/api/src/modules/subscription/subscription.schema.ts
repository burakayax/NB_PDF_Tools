import { z } from "zod";
import { featureCatalog } from "./subscription.config.js";

export const changePlanSchema = z.object({
  plan: z.enum(["FREE", "PRO", "BUSINESS"]),
});

export const recordUsageSchema = z.object({
  featureKey: z.enum(featureCatalog),
});
