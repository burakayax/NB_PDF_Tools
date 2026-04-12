import { prisma } from "../../lib/prisma.js";
import { featureCatalog, type FeatureKey } from "./subscription.config.js";

export type ToolUsageCounts = Partial<Record<FeatureKey, number>>;

export function parseToolUsageCountsJson(raw: string | null | undefined): ToolUsageCounts {
  if (raw == null || String(raw).trim() === "") {
    return {};
  }
  try {
    const o = JSON.parse(String(raw)) as Record<string, unknown>;
    const out: ToolUsageCounts = {};
    for (const k of featureCatalog) {
      const n = o[k];
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
        out[k] = Math.min(1_000_000, Math.floor(n));
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeToolUsageCountsJson(c: ToolUsageCounts): string {
  const base: Record<string, number> = {};
  for (const k of featureCatalog) {
    const v = c[k];
    if (v != null && v > 0) {
      base[k] = v;
    }
  }
  return JSON.stringify(base);
}

export function getTopTOOLSFromCounts(
  c: ToolUsageCounts,
  limit: number,
): { featureKey: FeatureKey; count: number }[] {
  return (Object.entries(c) as [FeatureKey, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([featureKey, count]) => ({ featureKey, count }));
}

/**
 * FREE gecikme çarpanı: geçmiş gecikme hacmi, toplam işlem, sık kullanılan araçta ek yük.
 */
export function computeBehaviorStressMultiplier(input: {
  lifetimeThrottleEvents: number;
  lifetimeTotalOps: number;
  toolCounts: ToolUsageCounts;
  featureKey: FeatureKey;
}): number {
  const t = Math.max(0, input.lifetimeThrottleEvents);
  const o = Math.max(0, input.lifetimeTotalOps);
  const fromThrottle = Math.min(0.22, Math.log1p(t) * 0.026);
  const fromVolume = Math.min(0.14, Math.log1p(o) * 0.016);
  const top = getTopTOOLSFromCounts(input.toolCounts, 1)[0];
  const favorCurrent = top && top.featureKey === input.featureKey && top.count >= 8;
  const favorBump = favorCurrent ? 0.075 : 0;
  return 1 + fromThrottle + fromVolume + favorBump;
}

export async function incrementUserLifetimeOperation(userId: string, featureKey: FeatureKey): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const u = await tx.user.findUnique({
      where: { id: userId },
      select: { toolUsageCountsJson: true },
    });
    if (!u) {
      return;
    }
    const counts = parseToolUsageCountsJson(u.toolUsageCountsJson);
    counts[featureKey] = (counts[featureKey] ?? 0) + 1;
    await tx.user.update({
      where: { id: userId },
      data: {
        totalOperationsCount: { increment: 1 },
        toolUsageCountsJson: serializeToolUsageCountsJson(counts),
      },
    });
  });
}
