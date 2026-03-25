import type { PlanName } from "../api/subscription";
import type { Language } from "./landing";

const DESCRIPTIONS: Record<PlanName, { tr: string; en: string }> = {
  FREE: {
    tr: "Temel belge iş akışlarını denemek için günlük limitli başlangıç erişimi.",
    en: "Starter access for trying core document workflows with a daily limit.",
  },
  PRO: {
    tr: "Tüm PDF araç setine sınırsız erişim.",
    en: "Unlimited usage with access to the full PDF toolkit.",
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
