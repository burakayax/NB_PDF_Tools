import type { LandingTranslation, Language } from "../i18n/landing";

type LangPatch = {
  navbar?: Partial<LandingTranslation["navbar"]>;
  hero?: Partial<LandingTranslation["hero"]>;
  footer?: Partial<LandingTranslation["footer"]>;
  finalCta?: Partial<LandingTranslation["finalCta"]>;
};

export function resolveCmsAssetUrl(raw: string | undefined, apiBase: string): string | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const u = raw.trim();
  if (/^https?:\/\//i.test(u)) {
    return u;
  }
  const base = apiBase.replace(/\/$/, "");
  if (u.startsWith("/")) {
    return `${base}${u}`;
  }
  return `${base}/${u}`;
}

export function mergeLandingWithCms(
  base: LandingTranslation,
  cms: Record<string, unknown> | null | undefined,
  language: Language,
): LandingTranslation {
  if (!cms) {
    return base;
  }
  const landing = cms.landing as { en?: LangPatch; tr?: LangPatch } | undefined;
  const patch = landing?.[language];
  if (!patch) {
    return base;
  }
  let copy = base;
  if (patch.navbar) {
    copy = { ...copy, navbar: { ...copy.navbar, ...patch.navbar } };
  }
  if (patch.hero) {
    copy = { ...copy, hero: { ...copy.hero, ...patch.hero } };
  }
  if (patch.footer) {
    copy = { ...copy, footer: { ...copy.footer, ...patch.footer } };
  }
  if (patch.finalCta) {
    copy = { ...copy, finalCta: { ...copy.finalCta, ...patch.finalCta } };
  }
  return copy;
}

export function getCmsWorkspaceBanner(cms: Record<string, unknown> | null | undefined): {
  enabled: boolean;
  text: string;
} {
  const ws = cms?.workspace as { bannerEnabled?: boolean; bannerText?: string } | undefined;
  return {
    enabled: Boolean(ws?.bannerEnabled && String(ws.bannerText ?? "").trim()),
    text: String(ws?.bannerText ?? "").trim(),
  };
}
