import type { FeatureKey } from "../modules/subscription/subscription.config.js";
import { getResolvedPLARTFORMBusinessConfig } from "../modules/subscription/PLARTFORM-config-runtime.js";

/**
 * `PLARTFORM.config.disabledFeatures` — tüm kullanıcılar için geçici kapatılan araçlar (SiteSetting, önbellekli).
 */
export async function isFeatureGloballyDisabled(featureKey: FeatureKey): Promise<boolean> {
  const cfg = await getResolvedPLARTFORMBusinessConfig();
  return cfg.globallyDisabledFeatures.has(featureKey);
}
