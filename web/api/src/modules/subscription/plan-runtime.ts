import type { Plan } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  planDefinitions,
  type FeatureKey,
  type PlanDefinition,
  isFeatureKey,
} from "./subscription.config.js";

let cache: { t: number; v: Record<Plan, PlanDefinition> } | null = null;
const TTL_MS = 20_000;

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
  if (cache && Date.now() - cache.t < TTL_MS) {
    return cache.v;
  }
  let out = cloneBase();
  const row = await prisma.siteSetting.findUnique({ where: { key: "plans.override" } });
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value) as Partial<Record<Plan, unknown>>;
      for (const plan of PLANS) {
        if (parsed[plan] !== undefined) {
          out[plan] = mergePlan(planDefinitions[plan], parsed[plan]);
        }
      }
    } catch {
      /* ignore invalid JSON */
    }
  }
  cache = { t: Date.now(), v: out };
  return out;
}

export function invalidatePlanRuntimeCache() {
  cache = null;
}
