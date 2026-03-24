import type { Plan } from "@prisma/client";

export const featureCatalog = [
  "split",
  "merge",
  "pdf-to-word",
  "word-to-pdf",
  "excel-to-pdf",
  "pdf-to-excel",
  "compress",
  "encrypt",
] as const;

export type FeatureKey = (typeof featureCatalog)[number];

export type PlanDefinition = {
  name: Plan;
  displayName: string;
  description: string;
  dailyLimit: number | null;
  allowedFeatures: FeatureKey[];
  multiUser: boolean;
};

export const planDefinitions: Record<Plan, PlanDefinition> = {
  FREE: {
    name: "FREE",
    displayName: "Free",
    description: "Starter access for trying core document workflows with a daily limit.",
    dailyLimit: 5,
    allowedFeatures: ["split", "merge", "pdf-to-word", "compress"],
    multiUser: false,
  },
  PRO: {
    name: "PRO",
    displayName: "Pro",
    description: "Unlimited usage with access to the full PDF toolkit.",
    dailyLimit: null,
    allowedFeatures: [...featureCatalog],
    multiUser: false,
  },
  BUSINESS: {
    name: "BUSINESS",
    displayName: "Business",
    description: "Unlimited access with business-ready entitlement structure for teams.",
    dailyLimit: null,
    allowedFeatures: [...featureCatalog],
    multiUser: true,
  },
};

export function isFeatureKey(value: string): value is FeatureKey {
  return featureCatalog.includes(value as FeatureKey);
}
