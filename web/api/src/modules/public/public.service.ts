import type { Request } from "express";
import { env } from "../../config/env.js";
import { inferPricingRegionFromRequest } from "../../lib/pricing-region.js";
import { getSetting } from "../../lib/site-config.service.js";
import { SITE_SETTING_KEYS } from "../../lib/site-setting-keys.js";
import { DEFAULT_GLOBAL_NOTIFICATIONS } from "../admin/admin-system-defaults.js";
import { getCmsContent } from "../admin/admin.service.js";
import { getPaymentPricesTry } from "../payment/payment-pricing.js";
import { getPlanDefinitionsResolved } from "../subscription/plan-runtime.js";

const FALLBACK_SITE_SETTINGS = {
  analyticsEnabled: true,
  theme: "dark",
  defaultLanguage: "en",
  freeDailyLimitDisplay: env.DEFAULT_FREE_DAILY_LIMIT,
} as const;

export async function getPublicSiteConfig() {
  const siteRaw = await getSetting(SITE_SETTING_KEYS.SITE_SETTINGS);
  const flagsRaw = await getSetting(SITE_SETTING_KEYS.GLOBAL_FLAGS);

  const site =
    siteRaw != null && typeof siteRaw === "object" && !Array.isArray(siteRaw)
      ? (siteRaw as Record<string, unknown>)
      : {};
  const flags =
    flagsRaw != null && typeof flagsRaw === "object" && !Array.isArray(flagsRaw)
      ? (flagsRaw as Record<string, unknown>)
      : {};

  const analyticsEnabled =
    typeof site.analyticsEnabled === "boolean" ? site.analyticsEnabled : FALLBACK_SITE_SETTINGS.analyticsEnabled;
  const theme = typeof site.theme === "string" ? site.theme : FALLBACK_SITE_SETTINGS.theme;
  const defaultLanguage =
    typeof site.defaultLanguage === "string" ? site.defaultLanguage : FALLBACK_SITE_SETTINGS.defaultLanguage;
  const freeDailyLimitDisplay =
    typeof site.freeDailyLimitDisplay === "number" && Number.isFinite(site.freeDailyLimitDisplay)
      ? site.freeDailyLimitDisplay
      : typeof flags.freeDailyLimitDisplay === "number" && Number.isFinite(flags.freeDailyLimitDisplay)
        ? flags.freeDailyLimitDisplay
        : FALLBACK_SITE_SETTINGS.freeDailyLimitDisplay;

  const maintenanceMode = flags.maintenanceMode === true;
  const betaFeatures =
    (flags.betaFeatures as Record<string, boolean> | undefined) ??
    (site.betaFeatures as Record<string, boolean> | undefined) ??
    {};
  let featureFlags: Record<string, boolean> = {};
  if (flags.featureFlags != null && typeof flags.featureFlags === "object" && !Array.isArray(flags.featureFlags)) {
    for (const [k, v] of Object.entries(flags.featureFlags as Record<string, unknown>)) {
      if (typeof v === "boolean") {
        featureFlags[k] = v;
      }
    }
  }

  const notifRaw = await getSetting(SITE_SETTING_KEYS.GLOBAL_NOTIFICATIONS);
  const notifications = mergePublicNotifications(notifRaw);

  return {
    analyticsEnabled,
    theme,
    defaultLanguage,
    freeDailyLimitDisplay,
    maintenanceMode,
    betaFeatures,
    featureFlags,
    notifications,
  };
}

function mergePublicNotifications(raw: unknown) {
  const base = { ...DEFAULT_GLOBAL_NOTIFICATIONS };
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    variant: typeof o.variant === "string" && o.variant.trim() ? o.variant.trim() : base.variant,
    messageEn: typeof o.messageEn === "string" ? o.messageEn : "",
    messageTr: typeof o.messageTr === "string" ? o.messageTr : "",
    linkUrl: typeof o.linkUrl === "string" ? o.linkUrl : "",
    linkLabelEn: typeof o.linkLabelEn === "string" ? o.linkLabelEn : "",
    linkLabelTr: typeof o.linkLabelTr === "string" ? o.linkLabelTr : "",
  };
}

export async function getPublicCmsPayload() {
  const content = await getCmsContent();
  return { content };
}

export async function getPublicPlansPayload() {
  const defs = await getPlanDefinitionsResolved();
  const prices = await getPaymentPricesTry();
  const plans = Object.values(defs).map((p) => ({
    ...p,
    monthlyPriceTry:
      p.name === "FREE" ? null : (prices[p.name as "PRO" | "BUSINESS"] ?? null),
    annualPriceTry: p.name === "PRO" ? prices.PRO_ANNUAL : null,
  }));
  return { plans };
}

const USD_MARKETING = {
  basicMonthly: "4.99",
  proMonthly: "9.99",
  proAnnual: "59.99",
} as const;

function annualSavingsPercent(monthly: number, annualPrice: number): number {
  const yearAtMonthly = monthly * 12;
  if (!Number.isFinite(yearAtMonthly) || yearAtMonthly <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(95, Math.round((1 - annualPrice / yearAtMonthly) * 100)));
}

export type PublicPricingPayload = {
  pricingRegion: "TR" | "INTL";
  detectedCountry: string | null;
  checkoutCurrency: "TRY";
  tryPrices: { businessMonthly: string; proMonthly: string; proAnnual: string };
  usdDisplay: typeof USD_MARKETING;
  annualSavePercent: number;
  internationalCheckoutNote: { en: string; tr: string };
};

export function buildPublicPricingPayload(prices: Awaited<ReturnType<typeof getPaymentPricesTry>>, request: Request): PublicPricingPayload {
  const { pricingRegion, country } = inferPricingRegionFromRequest(request);
  const tryProM = Number.parseFloat(prices.PRO);
  const tryProA = Number.parseFloat(prices.PRO_ANNUAL);
  const saveTry = annualSavingsPercent(tryProM, tryProA);
  const saveUsd = annualSavingsPercent(
    Number.parseFloat(USD_MARKETING.proMonthly),
    Number.parseFloat(USD_MARKETING.proAnnual),
  );
  return {
    pricingRegion,
    detectedCountry: country,
    checkoutCurrency: "TRY",
    tryPrices: {
      businessMonthly: prices.BUSINESS,
      proMonthly: prices.PRO,
      proAnnual: prices.PRO_ANNUAL,
    },
    usdDisplay: USD_MARKETING,
    annualSavePercent: pricingRegion === "TR" ? saveTry : saveUsd,
    internationalCheckoutNote: {
      en: "Checkout is processed in Turkish Lira (TRY) via our payment partner; your bank may show an equivalent in your currency.",
      tr: "Ödeme, ödeme ortağımız üzerinden Türk Lirası (TRY) ile tahsil edilir; bankanız kendi para biriminizde bir karşılık gösterebilir.",
    },
  };
}

export type PublicPLARTFORMSlice = {
  disabledFeatures: string[];
  displayFreeDailyLimit: number | null;
};

export async function getPublicPLARTFORMSlice(): Promise<PublicPLARTFORMSlice> {
  const raw = await getSetting(SITE_SETTING_KEYS.PLARTFORM_CONFIG);
  const disabled: string[] = [];
  let displayFreeDailyLimit: number | null = null;
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.disabledFeatures)) {
      for (const x of o.disabledFeatures) {
        if (typeof x === "string" && x.trim()) {
          disabled.push(x.trim());
        }
      }
    }
    if (typeof o.displayFreeDailyLimit === "number" && Number.isFinite(o.displayFreeDailyLimit)) {
      displayFreeDailyLimit = o.displayFreeDailyLimit;
    }
  }
  return { disabledFeatures: disabled, displayFreeDailyLimit };
}

export async function getPublicRuntimePayload(request: Request) {
  const [cms, site, plansPayload, PLARTFORMPublic, tryPrices] = await Promise.all([
    getCmsContent(),
    getPublicSiteConfig(),
    getPublicPlansPayload(),
    getPublicPLARTFORMSlice(),
    getPaymentPricesTry(),
  ]);
  const pricing = buildPublicPricingPayload(tryPrices, request);
  return {
    cms,
    site,
    plans: plansPayload.plans,
    PLARTFORMPublic,
    pricing,
    flags: {
      maintenanceMode: site.maintenanceMode === true,
      betaFeatures: site.betaFeatures ?? {},
      featureFlags: site.featureFlags ?? {},
    },
    notifications: site.notifications,
  };
}
