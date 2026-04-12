import type { FeatureKey } from "../modules/subscription/subscription.config.js";
import { getResolvedTOOLSBusinessConfig } from "../modules/subscription/TOOLS-config-runtime.js";

/**
 * `TOOLS.config.disabledFeatures` — tüm kullanıcılar için geçici kapatılan araçlar (SiteSetting, önbellekli).
 */
export async function isFeatureGloballyDisabled(featureKey: FeatureKey): Promise<boolean> {
  const cfg = await getResolvedTOOLSBusinessConfig();
  return cfg.globallyDisabledFeatures.has(featureKey);
}
