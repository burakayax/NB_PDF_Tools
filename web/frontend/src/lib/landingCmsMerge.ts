import type { LandingTranslation, Language } from "../i18n/landing";

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

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/**
 * Deep-merge CMS patch into landing copy. Empty strings in the patch keep the base string.
 * Empty arrays in the patch keep the base array.
 */
function mergeDeepLanding(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(patch)) {
    return base;
  }
  if (!isPlainObject(base)) {
    return base;
  }
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const bv = out[key];
    if (pv === undefined) {
      continue;
    }
    if (Array.isArray(pv)) {
      out[key] = pv.length > 0 ? pv : bv;
    } else if (isPlainObject(pv) && isPlainObject(bv)) {
      out[key] = mergeDeepLanding(bv, pv);
    } else if (typeof pv === "string" && typeof bv === "string" && pv.trim() === "") {
      continue;
    } else {
      out[key] = pv;
    }
  }
  return out;
}

function applyHomepageToLanding(base: LandingTranslation, cms: Record<string, unknown>): LandingTranslation {
  const hp = cms.homepage as Record<string, unknown> | undefined;
  if (!hp) {
    return base;
  }
  const hero: Partial<LandingTranslation["hero"]> = { ...base.hero };
  if (typeof hp.heroTitle === "string" && hp.heroTitle.trim()) {
    hero.headline = hp.heroTitle.trim();
  }
  if (typeof hp.heroSubtitle === "string" && hp.heroSubtitle.trim()) {
    hero.description = hp.heroSubtitle.trim();
  }
  if (typeof hp.primaryCta === "string" && hp.primaryCta.trim()) {
    hero.primaryCta = hp.primaryCta.trim();
  }
  if (typeof hp.secondaryCta === "string" && hp.secondaryCta.trim()) {
    hero.secondaryCta = hp.secondaryCta.trim();
  }
  const nav: Partial<LandingTranslation["navbar"]> = { ...base.navbar };
  if (typeof hp.productName === "string" && hp.productName.trim()) {
    nav.productLabel = hp.productName.trim();
  }
  return {
    ...base,
    navbar: { ...base.navbar, ...nav },
    hero: { ...base.hero, ...hero },
  };
}

function applyTopLevelCms(base: LandingTranslation, cms: Record<string, unknown>): LandingTranslation {
  let next = { ...base };
  const ts = cms.toolsStrip as { headline?: string } | undefined;
  if (typeof ts?.headline === "string" && ts.headline.trim()) {
    next = {
      ...next,
      features: {
        ...next.features,
        title: ts.headline.trim(),
      },
    };
  }
  return next;
}

/**
 * Full landing copy: i18n base + `cms.content` (`homepage`, `landing.[lang]`, optional toolsStrip/banner).
 */
export function mergeLandingWithCms(
  base: LandingTranslation,
  cms: Record<string, unknown> | null | undefined,
  language: Language,
): LandingTranslation {
  if (!cms) {
    return base;
  }
  let copy = applyHomepageToLanding(base, cms);
  copy = applyTopLevelCms(copy, cms);
  const landing = cms.landing as { en?: unknown; tr?: unknown } | undefined;
  const patch = landing?.[language];
  if (patch) {
    copy = mergeDeepLanding(copy, patch) as LandingTranslation;
  }
  return copy;
}

export function getCmsWorkspaceBanner(cms: Record<string, unknown> | null | undefined): {
  enabled: boolean;
  text: string;
} {
  const ws = cms?.workspace as { bannerEnabled?: boolean; bannerText?: string } | undefined;
  const text = String(ws?.bannerText ?? "").trim();
  return {
    enabled: Boolean(ws?.bannerEnabled && text),
    text,
  };
}

export function getWindowsDownloadUrlFromCms(cms: Record<string, unknown> | null | undefined): string {
  const hp = cms?.homepage as Record<string, unknown> | undefined;
  const raw = hp?.windowsDownloadUrl ?? hp?.downloadUrl;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return "#";
}
