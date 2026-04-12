/**
 * Canonical SiteSetting keys (Prisma). Legacy keys remain readable for backward compatibility.
 */
export const SITE_SETTING_KEYS = {
  SITE_SETTINGS: "site.settings",
  CMS_CONTENT: "cms.content",
  /** Unified plans override, marketing copy, and payment prices (single source of truth for writes). */
  PACKAGES_CONFIG: "packages.config",
  TOOLS_CONFIG: "TOOLS.config",
  GLOBAL_FLAGS: "global.flags",
  /** System-wide banner / announcement (JSON). */
  GLOBAL_NOTIFICATIONS: "global.notifications",
  GLOBAL_ELEMENTS: "global.elements",
  /** @deprecated Read merged via packages resolver; still honored if packages.config omits sections. */
  PLANS_OVERRIDE_LEGACY: "plans.override",
  /** @deprecated */
  PACKAGES_MARKETING_LEGACY: "packages.marketing",
  /** @deprecated */
  PAYMENT_PRICES_LEGACY: "payment.prices",
} as const;

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[keyof typeof SITE_SETTING_KEYS];

export const PACKAGES_RELATED_KEYS: ReadonlySet<string> = new Set([
  SITE_SETTING_KEYS.PACKAGES_CONFIG,
  SITE_SETTING_KEYS.PLANS_OVERRIDE_LEGACY,
  SITE_SETTING_KEYS.PACKAGES_MARKETING_LEGACY,
  SITE_SETTING_KEYS.PAYMENT_PRICES_LEGACY,
]);
