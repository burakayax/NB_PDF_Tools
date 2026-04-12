import { env } from "../../config/env.js";
import { SITE_SETTING_KEYS } from "../../lib/site-setting-keys.js";

/** Same baseline as `DEFAULT_CMS` in admin.service (reset / factory default). */
export const DEFAULT_CMS_RESET: Record<string, unknown> = {
  homepage: {
    heroTitle: "",
    heroSubtitle: "",
    primaryCta: "",
    secondaryCta: "",
  },
  PLARTFORMStrip: { headline: "" },
  banner: { text: "", enabled: false },
  modals: { upgradeTeaser: "" },
  landing: {
    en: {},
    tr: {},
  },
  workspace: { bannerEnabled: false, bannerText: "" },
  assets: { heroImageUrl: "", logoUrl: "", screenshot1Url: "", screenshot2Url: "" },
};

/** Default `site.settings` when admin resets (aligned with frontend bootstrap). */
export const DEFAULT_SITE_SETTINGS_PAYLOAD = {
  theme: "dark",
  defaultLanguage: "en",
  analyticsEnabled: true,
  freeDailyLimitDisplay: env.DEFAULT_FREE_DAILY_LIMIT,
  betaFeatures: {} as Record<string, boolean>,
  apiSecurity: {
    defaultPerMinute: 60,
    abuseThreshold: 5,
    abuseBlockMinutes: 60,
  },
};

export const DEFAULT_GLOBAL_FLAGS = {
  maintenanceMode: false,
  betaFeatures: {} as Record<string, boolean>,
  featureFlags: {} as Record<string, boolean>,
};

export const DEFAULT_GLOBAL_NOTIFICATIONS = {
  enabled: false,
  variant: "info" as const,
  messageEn: "",
  messageTr: "",
  linkUrl: "",
  linkLabelEn: "",
  linkLabelTr: "",
};

export const DEFAULT_GLOBAL_ELEMENTS = {
  headerTagline: "",
  footerNote: "",
  tooltips: {} as Record<string, unknown>,
};

/** Known feature toggles in `global.flags.featureFlags` (client + server can branch on these). */
export const FEATURE_FLAG_CATALOG = [
  { key: "googleOAuth", label: "Google ile giriş", description: "OAuth yapılandırması sunucuda doluysa kullanılabilir." },
  { key: "contactForm", label: "İletişim formu", description: "Karşılama sayfasındaki iletişim bölümü." },
  { key: "workspacePLARTFORM", label: "Çalışma alanı araçları", description: "Kapatıldığında üst düzeyde araçlara erişim kısıtlanabilir (istemci kontrolü)." },
] as const;

export const BETA_FLAG_CATALOG = [
  { key: "experimentalUi", label: "Deneysel arayüz", description: "İstemci tarafında deneysel bileşenler." },
  { key: "previewPricing", label: "Önizleme fiyatlandırması", description: "Paket ekranında taslak metinler." },
] as const;

export type ResettableScope =
  | typeof SITE_SETTING_KEYS.SITE_SETTINGS
  | typeof SITE_SETTING_KEYS.GLOBAL_FLAGS
  | typeof SITE_SETTING_KEYS.CMS_CONTENT
  | typeof SITE_SETTING_KEYS.PLARTFORM_CONFIG
  | typeof SITE_SETTING_KEYS.GLOBAL_NOTIFICATIONS
  | typeof SITE_SETTING_KEYS.GLOBAL_ELEMENTS
  | typeof SITE_SETTING_KEYS.PACKAGES_CONFIG;

export const RESETTABLE_SCOPES: ResettableScope[] = [
  SITE_SETTING_KEYS.SITE_SETTINGS,
  SITE_SETTING_KEYS.GLOBAL_FLAGS,
  SITE_SETTING_KEYS.CMS_CONTENT,
  SITE_SETTING_KEYS.PLARTFORM_CONFIG,
  SITE_SETTING_KEYS.GLOBAL_NOTIFICATIONS,
  SITE_SETTING_KEYS.GLOBAL_ELEMENTS,
  SITE_SETTING_KEYS.PACKAGES_CONFIG,
];

export function defaultPayloadForScope(scope: string): unknown {
  switch (scope) {
    case SITE_SETTING_KEYS.SITE_SETTINGS:
      return { ...DEFAULT_SITE_SETTINGS_PAYLOAD };
    case SITE_SETTING_KEYS.GLOBAL_FLAGS:
      return { ...DEFAULT_GLOBAL_FLAGS };
    case SITE_SETTING_KEYS.GLOBAL_NOTIFICATIONS:
      return { ...DEFAULT_GLOBAL_NOTIFICATIONS };
    case SITE_SETTING_KEYS.GLOBAL_ELEMENTS:
      return { ...DEFAULT_GLOBAL_ELEMENTS };
    case SITE_SETTING_KEYS.PLARTFORM_CONFIG:
      return {};
    case SITE_SETTING_KEYS.PACKAGES_CONFIG:
      return {};
    case SITE_SETTING_KEYS.CMS_CONTENT:
      return { ...DEFAULT_CMS_RESET };
    default:
      return null;
  }
}
