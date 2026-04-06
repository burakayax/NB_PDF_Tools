import type { PublicPricingPayload } from "../api/public";
import type { Language } from "../i18n/landing";

/** Soft list-price anchor for monthly tiers (presentation only). */
const MONTHLY_LIST_MULTIPLIER = 1.28;

function strip00(s: string): string {
  return s.replace(/\.00$/, "");
}

function parseAmount(raw: string): number {
  return Number.parseFloat(String(raw).trim().replace(",", "."));
}

function formatTryInt(n: number): string {
  return String(Math.round(n));
}

function formatTryDaily(n: number, language: Language): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const rounded = n >= 10 ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, "");
  return language === "tr" ? `${rounded} ₺` : `${rounded} TRY`;
}

function formatUsdDaily(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${n.toFixed(2)}`;
}

export type PriceStackMonthly = {
  listPrice: string;
  yourPrice: string;
  perDayLine: string;
};

export type PriceStackAnnual = {
  listPrice: string;
  yourPrice: string;
  perDayLine: string;
};

function monthlyListAnchorTry(current: number): number {
  return Math.max(current + 5, Math.ceil(current * MONTHLY_LIST_MULTIPLIER));
}

/** Strikethrough “list” price + current monthly line + per-day breakdown. */
export function getMonthlyPricePsychology(
  pricing: PublicPricingPayload | undefined,
  kind: "basic" | "pro",
  language: Language,
  perDayLabel: (amount: string) => string,
): PriceStackMonthly | null {
  if (!pricing) return null;
  const tr = language === "tr";
  if (pricing.pricingRegion === "TR" && pricing.tryPrices) {
    const raw = kind === "basic" ? pricing.tryPrices.businessMonthly : pricing.tryPrices.proMonthly;
    const cur = parseAmount(raw);
    if (!Number.isFinite(cur) || cur <= 0) return null;
    const list = monthlyListAnchorTry(cur);
    const daily = cur / 30;
    const n = strip00(raw);
    return {
      listPrice: tr ? `${formatTryInt(list)} ₺/ay` : `${formatTryInt(list)} TRY/mo`,
      yourPrice: tr ? `${n} ₺/ay` : `${n} TRY/mo`,
      perDayLine: perDayLabel(formatTryDaily(daily, language)),
    };
  }
  const u = pricing.usdDisplay;
  if (!u) return null;
  const raw = kind === "basic" ? u.basicMonthly : u.proMonthly;
  const cur = parseAmount(raw);
  if (!Number.isFinite(cur) || cur <= 0) return null;
  const list = Math.ceil(cur * MONTHLY_LIST_MULTIPLIER * 10) / 10;
  const daily = cur / 30;
  return {
    listPrice: tr ? `$${list}/ay` : `$${list}/mo`,
    yourPrice: tr ? `$${raw}/ay` : `$${raw}/mo`,
    perDayLine: perDayLabel(formatUsdDaily(daily)),
  };
}

/** Anchor = 12× monthly Pro; your price = annual (honest comparison). */
export function getAnnualPricePsychology(
  pricing: PublicPricingPayload | undefined,
  language: Language,
  perDayLabel: (amount: string) => string,
): PriceStackAnnual | null {
  if (!pricing) return null;
  const tr = language === "tr";
  if (pricing.pricingRegion === "TR" && pricing.tryPrices) {
    const pm = parseAmount(pricing.tryPrices.proMonthly);
    const ann = parseAmount(pricing.tryPrices.proAnnual);
    if (!Number.isFinite(pm) || !Number.isFinite(ann) || pm <= 0 || ann <= 0) return null;
    const yearIfMonthly = pm * 12;
    const daily = ann / 365;
    const n = strip00(pricing.tryPrices.proAnnual);
    return {
      listPrice: tr ? `${formatTryInt(yearIfMonthly)} ₺/yıl` : `${formatTryInt(yearIfMonthly)} TRY/yr`,
      yourPrice: tr ? `${n} ₺/yıl` : `${n} TRY/yr`,
      perDayLine: perDayLabel(formatTryDaily(daily, language)),
    };
  }
  const u = pricing.usdDisplay;
  if (!u) return null;
  const pm = parseAmount(u.proMonthly);
  const ann = parseAmount(u.proAnnual);
  if (!Number.isFinite(pm) || !Number.isFinite(ann) || ann <= 0) return null;
  const yearIfMonthly = pm * 12;
  const daily = ann / 365;
  return {
    listPrice: tr ? `$${yearIfMonthly.toFixed(2)}/yıl` : `$${yearIfMonthly.toFixed(2)}/yr`,
    yourPrice: tr ? `$${u.proAnnual}/yıl` : `$${u.proAnnual}/yr`,
    perDayLine: perDayLabel(formatUsdDaily(daily)),
  };
}
