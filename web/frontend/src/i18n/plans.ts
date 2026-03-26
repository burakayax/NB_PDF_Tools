import type { PlanName } from "../api/subscription";
import type { Language } from "./landing";

const DESCRIPTIONS: Record<PlanName, { tr: string; en: string }> = {
  FREE: {
    tr: "Temel belge iş akışlarını denemek için günlük limitli başlangıç erişimi.",
    en: "Starter access for trying core document workflows with a daily limit.",
  },
  PRO: {
    tr: "Öncelikli işlem, tam araç seti ve günlük kota olmadan sınırsız kullanım.",
    en: "Priority processing, the full toolkit, and unlimited usage without a daily cap.",
  },
  BUSINESS: {
    tr: "Ekipler için işletmeye uygun yetkilendirme yapısıyla sınırsız erişim.",
    en: "Unlimited access with business-ready entitlement structure for teams.",
  },
};

const DISPLAY: Record<PlanName, { tr: string; en: string }> = {
  FREE: { tr: "Ücretsiz", en: "Free" },
  PRO: { tr: "Pro", en: "Pro" },
  BUSINESS: { tr: "İşletme", en: "Business" },
};

export function localizedPlanDisplayName(name: PlanName, language: Language): string {
  return DISPLAY[name][language];
}

export function localizedPlanDescription(name: PlanName, language: Language): string {
  return DESCRIPTIONS[name][language];
}
