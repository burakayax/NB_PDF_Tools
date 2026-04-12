import { prisma } from "../../lib/prisma.js";
import { upsertPackagesConfigPartial } from "../../lib/packages-config.service.js";
import { getSettingDirect, setSettingFromAdminPatch } from "../../lib/site-config.service.js";
import { PACKAGES_RELATED_KEYS, SITE_SETTING_KEYS } from "../../lib/site-setting-keys.js";
import { HttpError } from "../../lib/http-error.js";
import { invalidatePlanRuntimeCache } from "../subscription/plan-runtime.js";
import { invalidatePLARTFORMConfigCache } from "../subscription/PLARTFORM-config-runtime.js";

export type AdminActor = { userId: string; email: string };

const MAX_REVISIONS_PER_SCOPE = 80;

function revisionJson(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

async function trimOldRevisions(scope: string) {
  const rows = await prisma.settingRevision.findMany({
    where: { scope },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: MAX_REVISIONS_PER_SCOPE,
  });
  if (rows.length === 0) {
    return;
  }
  await prisma.settingRevision.deleteMany({
    where: { id: { in: rows.map((r) => r.id) } },
  });
}

export async function logAdminAudit(
  actor: AdminActor,
  action: string,
  targetKey: string | null,
  summary: string,
  meta?: Record<string, unknown>,
) {
  await prisma.adminAuditLog.create({
    data: {
      userId: actor.userId,
      userEmail: actor.email,
      action,
      targetKey,
      summary: summary.slice(0, 2000),
      metaJson: meta ? JSON.stringify(meta).slice(0, 8000) : null,
    },
  });
}

export async function recordSettingRevision(
  scope: string,
  previousValue: unknown,
  actor: AdminActor,
  summary?: string,
) {
  await prisma.settingRevision.create({
    data: {
      scope,
      previousJson: revisionJson(previousValue),
      userId: actor.userId,
      userEmail: actor.email,
      summary: summary?.slice(0, 500) ?? null,
    },
  });
  await trimOldRevisions(scope);
}

function runPatchSideEffectsForKey(key: string) {
  if (key === "plans.override") {
    invalidatePlanRuntimeCache();
  }
  if (key === "payment.prices") {
    void import("../payment/payment-pricing.js").then((m) => m.invalidatePaymentPricesCache());
  }
  if (key === SITE_SETTING_KEYS.PACKAGES_CONFIG || PACKAGES_RELATED_KEYS.has(key)) {
    invalidatePlanRuntimeCache();
    void import("../payment/payment-pricing.js").then((m) => m.invalidatePaymentPricesCache());
  }
  if (key === SITE_SETTING_KEYS.PLARTFORM_CONFIG) {
    invalidatePLARTFORMConfigCache();
  }
}

/** Read → write SiteSetting with revision + audit (used for admin patches). */
export async function auditedPatchSetting(
  key: string,
  value: unknown,
  actor: AdminActor,
  action: string,
  summary: string,
  meta?: Record<string, unknown>,
) {
  const prev = await getSettingDirect(key);
  await setSettingFromAdminPatch(key, value);
  await recordSettingRevision(key, prev, actor, summary);
  await logAdminAudit(actor, action, key, summary, meta);
  runPatchSideEffectsForKey(key);
}

export async function auditedPackagesPartial(
  patch: {
    plansOverride?: unknown;
    marketing?: unknown;
    prices?: Partial<Record<"PRO" | "BUSINESS", string>>;
  },
  actor: AdminActor,
  action: string,
  summary: string,
) {
  const prev = await getSettingDirect(SITE_SETTING_KEYS.PACKAGES_CONFIG);
  await upsertPackagesConfigPartial(patch);
  await recordSettingRevision(SITE_SETTING_KEYS.PACKAGES_CONFIG, prev, actor, summary);
  await logAdminAudit(actor, action, SITE_SETTING_KEYS.PACKAGES_CONFIG, summary);
  invalidatePlanRuntimeCache();
  void import("../payment/payment-pricing.js").then((m) => m.invalidatePaymentPricesCache());
}

export async function listAdminAuditLogs(limit: number) {
  const take = Math.min(Math.max(limit, 1), 200);
  return prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function listSettingRevisions(scope: string, limit: number) {
  const take = Math.min(Math.max(limit, 1), 100);
  return prisma.settingRevision.findMany({
    where: { scope },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function rollbackSettingRevision(revisionId: string, actor: AdminActor) {
  const rev = await prisma.settingRevision.findUnique({ where: { id: revisionId } });
  if (!rev) {
    throw new HttpError(404, "Revision not found.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rev.previousJson) as unknown;
  } catch {
    throw new HttpError(400, "Stored revision is not valid JSON.");
  }
  const summary = `Rollback to snapshot before change at ${rev.createdAt.toISOString()}`;
  await auditedPatchSetting(rev.scope, parsed, actor, "settings.rollback", summary, { revisionId: rev.id });
  return { ok: true, scope: rev.scope };
}
