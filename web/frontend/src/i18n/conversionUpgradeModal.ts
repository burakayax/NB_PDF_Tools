import type { Language } from "./landing";

/** High-conversion upgrade popup — speed-first copy (EN + TR). */
export function conversionUpgradeModalCopy(lang: Language) {
  const tr = lang === "tr";
  return {
    title: tr ? "Beklemeyi bırakın. Anında sonuç alın." : "Stop waiting. Get instant results.",
    subtitle: tr
      ? "Ücretsiz kullanım eşiğine ulaştınız. Premium kullanıcılar tam kalitede anında işler."
      : "You've reached the free usage threshold. Premium users process instantly with full quality.",
    speedStrip: tr
      ? "Ücretsiz: sıra ve gecikme · Premium: öncelikli, anında işlem"
      : "Free: queue & delays · Premium: priority, instant processing",
    features: tr
      ? [
          "Anında işlem (bekleme yok)",
          "Tam kalite çıktı",
          "Sınırsız kullanım",
          "Öncelikli performans",
        ]
      : [
          "Instant processing (no waiting)",
          "Full quality output",
          "Unlimited usage",
          "Priority performance",
        ],
    usageLine: (n: number) =>
      tr ? `Bugün ${n} işlem kullandınız.` : `You've used ${n} operations today.`,
    ctaPrimary: tr ? "Beklemeden devam et" : "Continue without waiting",
    ctaSecondary: tr ? "Belki sonra" : "Maybe later",
    close: tr ? "Kapat" : "Close",
  };
}
