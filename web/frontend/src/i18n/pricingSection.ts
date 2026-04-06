import type { Language } from "./landing";

/** Landing + shared comparison copy for regional pricing UI. */
export function pricingSectionCopy(lang: Language) {
  const tr = lang === "tr";
  return {
    saveAnnual: (pct: number) =>
      tr ? `Yıllık faturalamada ~%${pct} tasarruf` : `Save ~${pct}% vs paying monthly`,
    mostPopular: tr ? "En popüler" : "Most Popular",
    /** @param amount e.g. "2.63 TRY" or "2.63 ₺" */
    onlyPerDay: (amount: string) =>
      tr ? `Günde yalnızca ~${amount}` : `Only ~${amount}/day`,
    trustCancel: tr ? "İstediğiniz zaman iptal" : "Cancel anytime",
    trustSecure: tr ? "Güvenli ödeme" : "Secure payment",
    regionTry: tr ? "Türkiye fiyatları (TRY)" : "Turkey pricing (TRY)",
    regionIntl: tr ? "Uluslararası fiyatlar (USD)" : "International pricing (USD)",
    checkoutTryNote: tr
      ? "Ödeme TRY üzerinden işlenir."
      : "Checkout is billed in TRY via our payment partner.",
    compareTitle: tr ? "Plan karşılaştırması" : "Compare plans",
    compareColFree: tr ? "Ücretsiz" : "Free",
    compareColBasic: tr ? "Basic" : "Basic",
    compareColPro: tr ? "Pro" : "Pro",
    compareColAnnual: tr ? "Pro Yıllık" : "Pro Annual",
    rowPrice: tr ? "Fiyat" : "Price",
    rowBilling: tr ? "Faturalama" : "Billing",
    rowProcessing: tr ? "İşlem hızı" : "Processing",
    rowQuality: tr ? "Çıktı kalitesi" : "Output quality",
    rowTools: tr ? "PDF araçları" : "PDF tools",
    rowDaily: tr ? "Günlük limit" : "Daily limit",
    valFree: tr ? "Ücretsiz" : "Free",
    valBasic: tr ? "Aylık" : "Monthly",
    valPro: tr ? "Aylık" : "Monthly",
    valAnnual: tr ? "Yıllık" : "Annual",
    valQueue: tr ? "Sıra / gecikme olabilir" : "Queue / delays may apply",
    valInstant: tr ? "Öncelikli, anında" : "Priority, instant",
    valStd: tr ? "Tam" : "Full",
    valFull: tr ? "Tam" : "Full",
    valCore: tr ? "Temel +" : "Core +",
    valAll: tr ? "Tümü" : "All",
    valLimited: tr ? "Günlük kota" : "Daily cap",
    valUnlimited: tr ? "Sınırsız" : "Unlimited",
    freeTitle: tr ? "Ücretsiz" : "Free",
    freeDesc: tr ? "Deneme ve hafif günlük kullanım." : "Try the product and light daily use.",
    basicTitle: tr ? "Basic" : "Basic",
    basicDesc: tr ? "Bireysel kullanıcılar için sınırsız işlem ve tam araç seti." : "Unlimited runs and full toolkit for individuals.",
    proTitle: tr ? "Pro" : "Pro",
    proDesc: tr ? "Öncelikli işlem, tam kalite ve üretim kullanımı için ideal." : "Priority lane and full quality for daily production use.",
    annualTitle: tr ? "Pro — Yıllık" : "Pro — Annual",
    annualDesc: tr ? "Pro’nun tüm avantajları, en iyi değer." : "All Pro benefits with the best value.",
    ctaStart: tr ? "Ücretsiz başla" : "Start free",
    ctaChoose: tr ? "Basic seç" : "Choose Basic",
    ctaPro: tr ? "Pro’ya geç" : "Get Pro",
    ctaAnnual: tr ? "Yıllık Pro" : "Get annual Pro",
    featFree1: tr ? "Günlük sınırlı işlem" : "Limited daily operations",
    featFree2: tr ? "Çekirdek PDF araçları" : "Core PDF tools",
    featFree3: tr ? "Web erişimi" : "Web access",
    featPaid1: tr ? "Sınırsız işlem" : "Unlimited operations",
    featPaid2: tr ? "Tüm premium araçlar" : "All premium tools",
    featPaid3: tr ? "Öncelikli işlem (Pro)" : "Priority processing (Pro)",
    featBasicNote: tr ? "Standart öncelik" : "Standard priority",
    featTeam: tr ? "Çok kullanıcılı (Business planı)" : "Multi-user (Business plan)",
  };
}
