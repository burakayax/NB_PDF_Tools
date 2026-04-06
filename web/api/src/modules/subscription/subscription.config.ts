/**
 * Feature key union and built-in plan defaults used when `SiteSetting` / `packages.config`
 * has no overlay. Runtime entitlements resolve via `getPlanDefinitionsResolved()` (DB + fallback).
 */
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
    description: "Full toolkit with unlimited daily use; later runs may be slower until you upgrade.",
    dailyLimit: null,
    allowedFeatures: [...featureCatalog],
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
    displayName: "Basic",
    description: "Unlimited operations and full toolkit for individual productivity (Basic tier).",
    dailyLimit: null,
    allowedFeatures: [...featureCatalog],
    multiUser: true,
  },
};

export function isFeatureKey(value: string): value is FeatureKey {
  return featureCatalog.includes(value as FeatureKey);
}
