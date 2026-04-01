import type { PlanDefinition } from "../api/subscription";
import type { Language } from "../i18n/landing";

/** Karşılama sayfası satır adı (Free/Ücretsiz, Pro, Business) ile API planlarını eşleştirir. */
export function livePriceForLandingRow(
  planRowName: string,
  apiPlans: PlanDefinition[] | null,
  lang: Language,
  fallbackPrice: string,
): string {
  if (!apiPlans?.length) {
    return fallbackPrice;
  }
  const n = planRowName.toLowerCase();
  let plan: PlanDefinition | undefined;
  if (n.includes("ücretsiz") || n === "free") {
    plan = apiPlans.find((p) => p.name === "FREE");
  } else if (n === "pro") {
    plan = apiPlans.find((p) => p.name === "PRO");
  } else if (n === "business") {
    plan = apiPlans.find((p) => p.name === "BUSINESS");
  }
  if (!plan) {
    return fallbackPrice;
  }
  if (plan.name === "FREE") {
    return lang === "tr" ? "Ücretsiz" : "Free";
  }
  const px = plan.monthlyPriceTry;
  if (px == null || px === "") {
    return fallbackPrice;
  }
  const num = px.replace(/\.00$/, "");
  return lang === "tr" ? `${num} ₺/ay` : `${num} TRY/mo`;
}
