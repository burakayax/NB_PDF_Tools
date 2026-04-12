import { getSaasApiBase } from "./saasBase";
import type { PlanDefinition } from "./subscription";

export type SystemNotificationsPayload = {
  enabled: boolean;
  variant: string;
  messageEn: string;
  messageTr: string;
  linkUrl: string;
  linkLabelEn: string;
  linkLabelTr: string;
};

export type PublicSiteConfig = {
  analyticsEnabled: boolean;
  theme: string;
  defaultLanguage: string;
  freeDailyLimitDisplay?: number;
  maintenanceMode?: boolean;
  betaFeatures?: Record<string, boolean>;
  featureFlags?: Record<string, boolean>;
  notifications?: SystemNotificationsPayload;
};

export async function fetchPublicCms(): Promise<{ content: Record<string, unknown> }> {
  const base = getSaasApiBase().replace(/\/$/, "");
  const r = await fetch(`${base}/api/public/cms`, { credentials: "include" });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<{ content: Record<string, unknown> }>;
}

export async function fetchPublicSiteConfig(): Promise<PublicSiteConfig> {
  const base = getSaasApiBase().replace(/\/$/, "");
  const r = await fetch(`${base}/api/public/site-config`, { credentials: "include" });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<PublicSiteConfig>;
}

export type PublicTOOLSPublicSlice = {
  disabledFeatures: string[];
  displayFreeDailyLimit: number | null;
};

export type PublicPricingPayload = {
  pricingRegion: "TR" | "INTL";
  detectedCountry: string | null;
  checkoutCurrency: "TRY";
  tryPrices: { businessMonthly: string; proMonthly: string; proAnnual: string };
  usdDisplay: { basicMonthly: string; proMonthly: string; proAnnual: string };
  annualSavePercent: number;
  internationalCheckoutNote: { en: string; tr: string };
};

export type PublicRuntimePayload = {
  cms: Record<string, unknown>;
  site: PublicSiteConfig;
  plans: PlanDefinition[];
  TOOLSPublic: PublicTOOLSPublicSlice;
  pricing: PublicPricingPayload;
  flags: {
    maintenanceMode: boolean;
    betaFeatures: Record<string, boolean>;
    featureFlags: Record<string, boolean>;
  };
  notifications: SystemNotificationsPayload;
};

export async function fetchPublicRuntime(): Promise<PublicRuntimePayload> {
  const base = getSaasApiBase().replace(/\/$/, "");
  const r = await fetch(`${base}/api/public/runtime`, { credentials: "include" });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<PublicRuntimePayload>;
}
