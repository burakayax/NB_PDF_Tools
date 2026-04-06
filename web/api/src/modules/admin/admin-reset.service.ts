import { HttpError } from "../../lib/http-error.js";
import { SITE_SETTING_KEYS } from "../../lib/site-setting-keys.js";
import type { AdminActor } from "./admin-audit.service.js";
import { auditedPatchSetting } from "./admin-audit.service.js";
import { RESETTABLE_SCOPES, defaultPayloadForScope, type ResettableScope } from "./admin-system-defaults.js";

export async function resetAdminScopesToDefaults(scopes: string[], actor: AdminActor) {
  const normalized = [...new Set(scopes)];
  for (const s of normalized) {
    if (!RESETTABLE_SCOPES.includes(s as ResettableScope)) {
      throw new HttpError(400, `Unknown or non-resettable scope: ${s}`);
    }
  }
  for (const scope of normalized) {
    const payload = defaultPayloadForScope(scope);
    await auditedPatchSetting(
      scope,
      payload,
      actor,
      "settings.reset",
      `Reset to default: ${scope}`,
      { reset: true },
    );
  }
  return { ok: true, scopes: normalized };
}
