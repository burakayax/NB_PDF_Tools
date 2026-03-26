import type { Language } from "./landing";

/** Premium upgrade modal — conversion-focused copy (TR primary + EN). */
export function upgradeModalCopy(lang: Language) {
  const tr = lang === "tr";
  return {
    title: tr ? "Sınırsız Gücün Kilidini Aç" : "Unlock Unlimited Power",
    subtitle: tr
      ? "NB PDF TOOLS ile tüm işlemleri limitsiz ve hızlı yapın"
      : "Run every operation without limits — fast — with NB PDF TOOLS",
    planFree: tr ? "Ücretsiz" : "Free",
    planPro: tr ? "Pro" : "Pro",
    planBusiness: tr ? "Business" : "Business",
    recommended: tr ? "Önerilen" : "Recommended",
    freeBullets: tr
      ? ["Günlük 5 işlem", "Sadece temel özellikler"]
      : ["5 operations per day", "Core features only"],
    proBullets: tr
      ? ["Sınırsız işlem", "Tüm araçlara erişim", "Daha hızlı işlem"]
      : ["Unlimited operations", "Full toolkit access", "Faster processing"],
    businessBullets: tr
      ? ["Tüm PRO özellikleri", "Toplu işlem (batch)", "Öncelikli destek"]
      : ["Everything in PRO", "Batch processing", "Priority support"],
    ctaPro: tr ? "PRO'ya Geç" : "Go PRO",
    ctaBusiness: tr ? "Business'a Geç" : "Go Business",
    close: tr ? "Kapat" : "Close",
  };
}
