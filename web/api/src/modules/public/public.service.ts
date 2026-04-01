import { prisma } from "../../lib/prisma.js";
import { getCmsContent } from "../admin/admin.service.js";
import { getPlanDefinitionsResolved } from "../subscription/plan-runtime.js";

const DEFAULT_SITE_SETTINGS = {
  analyticsEnabled: true,
  theme: "dark",
  defaultLanguage: "en",
} as const;

export async function getPublicSiteConfig() {
  const row = await prisma.siteSetting.findUnique({ where: { key: "site.settings" } });
  let parsed: Record<string, unknown> = {};
  if (row?.value) {
    try {
      parsed = JSON.parse(row.value) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  const analyticsEnabled =
    typeof parsed.analyticsEnabled === "boolean" ? parsed.analyticsEnabled : DEFAULT_SITE_SETTINGS.analyticsEnabled;
  const theme = typeof parsed.theme === "string" ? parsed.theme : DEFAULT_SITE_SETTINGS.theme;
  const defaultLanguage =
    typeof parsed.defaultLanguage === "string" ? parsed.defaultLanguage : DEFAULT_SITE_SETTINGS.defaultLanguage;
  return { analyticsEnabled, theme, defaultLanguage };
}

export async function getPublicCmsPayload() {
  const content = await getCmsContent();
  return { content };
}

export async function getPublicPlansPayload() {
  const defs = await getPlanDefinitionsResolved();
  return {
    plans: Object.values(defs).map((p) => ({ ...p })),
  };
}
