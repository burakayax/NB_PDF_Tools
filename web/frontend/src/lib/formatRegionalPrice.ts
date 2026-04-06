import type { PublicPricingPayload } from "../api/public";
import type { Language } from "../i18n/landing";

function strip00(s: string) {
  return s.replace(/\.00$/, "");
}

/** Display amount for workspace / upgrade UI (TRY for Turkey, USD for international marketing). */
export function formatRegionalPlanPrice(
  pricing: PublicPricingPayload | undefined,
  tier: "basicMonthly" | "proMonthly" | "proAnnual",
  language: Language,
): string {
  const region = pricing?.pricingRegion ?? "INTL";
  if (region === "TR" && pricing?.tryPrices) {
    const raw =
      tier === "basicMonthly"
        ? pricing.tryPrices.businessMonthly
        : tier === "proMonthly"
          ? pricing.tryPrices.proMonthly
          : pricing.tryPrices.proAnnual;
    const n = strip00(raw);
    const suffix = tier === "proAnnual" ? (language === "tr" ? "₺/yıl" : "TRY/yr") : language === "tr" ? "₺/ay" : "TRY/mo";
    return `${n} ${suffix}`;
  }
  const u = pricing?.usdDisplay;
  if (u) {
    const n = tier === "basicMonthly" ? u.basicMonthly : tier === "proMonthly" ? u.proMonthly : u.proAnnual;
    return tier === "proAnnual"
      ? `$${n}${language === "tr" ? "/yıl" : "/yr"}`
      : `$${n}${language === "tr" ? "/ay" : "/mo"}`;
  }
  return language === "tr" ? "—" : "—";
}

export function regionalCurrencyHint(pricing: PublicPricingPayload | undefined, language: Language): string | null {
  if (!pricing || pricing.pricingRegion === "TR") {
    return null;
  }
  return language === "tr" ? pricing.internationalCheckoutNote.tr : pricing.internationalCheckoutNote.en;
}
