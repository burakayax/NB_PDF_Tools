import { prisma } from "../../lib/prisma.js";

export type ToolsConversionOverrides = {
  upgradeCtaLabel?: string;
  upgradeCtaSubtitle?: string;
};

let cache: { at: number; value: ToolsConversionOverrides } | null = null;
const TTL_MS = 15_000;

function parseConversionFromToolsConfig(raw: string | null | undefined): ToolsConversionOverrides {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const conv = parsed.conversion;
    if (conv == null || typeof conv !== "object" || Array.isArray(conv)) {
      return {};
    }
    const c = conv as Record<string, unknown>;
    const out: ToolsConversionOverrides = {};
    if (typeof c.upgradeCtaLabel === "string" && c.upgradeCtaLabel.trim()) {
      out.upgradeCtaLabel = c.upgradeCtaLabel.trim();
    }
    if (typeof c.upgradeCtaSubtitle === "string" && c.upgradeCtaSubtitle.trim()) {
      out.upgradeCtaSubtitle = c.upgradeCtaSubtitle.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export async function getToolsConversionOverrides(): Promise<ToolsConversionOverrides> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.value;
  }
  const row = await prisma.siteSetting.findUnique({ where: { key: "tools.config" } });
  const value = parseConversionFromToolsConfig(row?.value ?? undefined);
  cache = { at: Date.now(), value };
  return value;
}

export function invalidateToolsConfigCache() {
  cache = null;
}
