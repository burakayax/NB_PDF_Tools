import type { Language } from "./landing";

/** Upgrade modal — Basic / Pro / Annual + regional pricing. */
export function upgradeModalCopy(lang: Language) {
  const tr = lang === "tr";
  return {
    title: tr ? "Doğru planı seçin" : "Choose your plan",
    subtitle: tr
      ? "Bölgenize göre gösterilen fiyatlar. Ödeme TRY ile güvenli ödeme ortağı üzerinden alınır."
      : "Prices shown for your region. Checkout is securely processed in Turkish Lira (TRY).",
    planFree: tr ? "Ücretsiz" : "Free",
    planBasic: tr ? "Basic" : "Basic",
    planPro: tr ? "Pro" : "Pro",
    planAnnual: tr ? "Pro (yıllık)" : "Pro (annual)",
    mostPopular: tr ? "En popüler" : "Most Popular",
    saveAnnual: (pct: number) =>
      tr ? `~%${pct} tasarruf` : `Save ~${pct}%`,
    freeBullets: tr
      ? ["Günlük sınırlı işlem", "Temel araçlar", "Web erişimi"]
      : ["Limited daily operations", "Core TOOLS", "Web access"],
    basicBullets: tr
      ? ["Sınırsız işlem", "Tüm araçlar", "Standart öncelik"]
      : ["Unlimited operations", "Full toolkit", "Standard priority"],
    proBullets: tr
      ? ["Sınırsız işlem", "Öncelikli işlem hattı", "Tam kalite çıktı"]
      : ["Unlimited operations", "Priority processing lane", "Full quality output"],
    annualBullets: tr
      ? ["Pro’nun tümü", "En iyi aylık değer", "Tek yıllık ödeme"]
      : ["Everything in Pro", "Best monthly value", "One annual payment"],
    ctaBasic: tr ? "Basic seç" : "Choose Basic",
    ctaPro: tr ? "Pro’ya geç" : "Get Pro",
    ctaAnnual: tr ? "Yıllık Pro" : "Get annual Pro",
    close: tr ? "Kapat" : "Close",
  };
}
