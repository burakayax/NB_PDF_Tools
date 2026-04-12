import type { Plan } from "@prisma/client";
import { getResolvedPackagesConfig, invalidateResolvedPackagesConfig } from "../../lib/packages-config.service.js";
import {
  featureCatalog,
  planDefinitions,
  type FeatureKey,
  type PlanDefinition,
  isFeatureKey,
} from "./subscription.config.js";

const PLANS: Plan[] = ["FREE", "PRO", "BUSINESS"];

function cloneBase(): Record<Plan, PlanDefinition> {
  return {
    FREE: { ...planDefinitions.FREE, allowedFeatures: [...planDefinitions.FREE.allowedFeatures] },
    PRO: { ...planDefinitions.PRO, allowedFeatures: [...planDefinitions.PRO.allowedFeatures] },
    BUSINESS: { ...planDefinitions.BUSINESS, allowedFeatures: [...planDefinitions.BUSINESS.allowedFeatures] },
  };
}

function mergeFeatures(patch: unknown, base: FeatureKey[]): FeatureKey[] {
  if (!Array.isArray(patch)) {
    return base;
  }
  const next = patch.filter((x): x is FeatureKey => typeof x === "string" && isFeatureKey(x));
  return next.length ? next : base;
}

function mergePlan(base: PlanDefinition, patch: unknown): PlanDefinition {
  if (!patch || typeof patch !== "object") {
    return { ...base, allowedFeatures: [...base.allowedFeatures] };
  }
  const p = patch as Record<string, unknown>;
  const dl =
    "dailyLimit" in p && (typeof p.dailyLimit === "number" || p.dailyLimit === null)
      ? (p.dailyLimit as number | null)
      : base.dailyLimit;
  return {
    name: base.name,
    displayName: typeof p.displayName === "string" ? p.displayName : base.displayName,
    description: typeof p.description === "string" ? p.description : base.description,
    dailyLimit: dl,
    allowedFeatures: mergeFeatures(p.allowedFeatures, base.allowedFeatures),
    multiUser: typeof p.multiUser === "boolean" ? p.multiUser : base.multiUser,
  };
}

export async function getPlanDefinitionsResolved(): Promise<Record<Plan, PlanDefinition>> {
  let out = cloneBase();
  const { plansOverride: parsed } = await getResolvedPackagesConfig();
  try {
    const partial = parsed as Partial<Record<Plan, unknown>>;
    for (const plan of PLANS) {
      if (partial[plan] !== undefined) {
        out[plan] = mergePlan(planDefinitions[plan], partial[plan]);
      }
    }
  } catch {
    /* ignore invalid shape */
  }
  /* Free tier: never restrict PLARTFORM via packages.config — monetization is soft friction only. */
  out.FREE = { ...out.FREE, allowedFeatures: [...featureCatalog] };
  return out;
}

export function invalidatePlanRuntimeCache() {
  invalidateResolvedPackagesConfig();
}
