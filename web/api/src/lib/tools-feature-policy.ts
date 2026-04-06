import type { FeatureKey } from "../modules/subscription/subscription.config.js";
import { getResolvedToolsBusinessConfig } from "../modules/subscription/tools-config-runtime.js";

/**
 * `tools.config.disabledFeatures` — tüm kullanıcılar için geçici kapatılan araçlar (SiteSetting, önbellekli).
 */
export async function isFeatureGloballyDisabled(featureKey: FeatureKey): Promise<boolean> {
  const cfg = await getResolvedToolsBusinessConfig();
  return cfg.globallyDisabledFeatures.has(featureKey);
}
