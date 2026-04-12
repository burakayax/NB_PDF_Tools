import type { Plan, Prisma, UserRole } from "@prisma/client";
import { listBlockedEmails, removeBlockedEmail, upsertBlockedEmail } from "../../lib/blocked-email.js";
import { normalizeEmailForStorage } from "../../lib/email-identity-normalize.js";
import { HttpError } from "../../lib/http-error.js";
import { hashPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { getResolvedPackagesConfig } from "../../lib/packages-config.service.js";
import { getSetting, setSetting } from "../../lib/site-config.service.js";
import { SITE_SETTING_KEYS } from "../../lib/site-setting-keys.js";
import type { AdminActor } from "./admin-audit.service.js";
import { auditedPackagesPartial, auditedPatchSetting, logAdminAudit } from "./admin-audit.service.js";
import { isAdminEmail, resolveRoleFromEmail } from "../../lib/role-policy.js";
import { getPaymentPricesTry } from "../payment/payment-pricing.js";
import { featureCatalog } from "../subscription/subscription.config.js";
import { getPlanDefinitionsResolved, invalidatePlanRuntimeCache } from "../subscription/plan-runtime.js";

function todayKeyUtc() {
  return new Date().toISOString().slice(0, 10);
}

function startOfTodayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/** `usageDate` alanı YYYY-MM-DD dizgesi; aralık için kullanılır. */
function usageDateKeySubtractDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export type AdminOverview = {
  generatedAt: string;
  usageDateUtc: string;
  totalUsers: number;
  activeUsersToday: number;
  todayTotalOperations: number;
  freeUsers: number;
  paidUsers: number;
  usersByPlan: { FREE: number; PRO: number; BUSINESS: number };
  mostUsedTOOLS: Array<{
    featureKey: string;
    userDayRows: number;
    operationsAttributed: number;
  }>;
  usagePerPackage: Array<{ plan: string; userCount: number }>;
  anonymousSessionsToday: number;
  registeredSessionsToday: number;
  anonymousPageViewsToday: number;
  checkoutsCompleted: number;
  checkoutsPending: number;
  usageByDay: Array<{ date: string; totalOperations: number }>;
  pageViewsByDay: Array<{ date: string; count: number }>;
  pageViewsTodayByHourUtc: Array<{ hour: number; count: number }>;
  conversionFunnel: {
    freeTierEverHitLimit: number;
    usersWithCompletedCheckout: number;
    totalUsers: number;
  };
  /** Son N dakikada en az bir sayfa görüntülemesi olan benzersiz tarayıcı oturumu. */
  presenceWindowMinutes: number;
  distinctSessionsActiveNow: number;
  /** Son N dakikada sayfa görüntüleyen farklı kayıtlı kullanıcı (userId dolu). */
  registeredUsersActiveNow: number;
  /** Son N dakikada sayfa görüntüleyen anonim oturum sayısı (sessionId, userId yok). */
  anonymousSessionsActiveNow: number;
  /** Araç sıralaması son 30 günde veri yoksa tüm zamanlara düşüldü. */
  mostUsedTOOLSAllTimeFallback: boolean;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const today = todayKeyUtc();
  const dayStart = startOfTodayUtc();
  const presenceWindowMinutes = 5;
  const activePresenceSince = new Date(Date.now() - presenceWindowMinutes * 60 * 1000);
  const TOOLStatsSince = usageDateKeySubtractDays(30);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [
    totalUsers,
    activeUsersToday,
    planGroups,
    todayAgg,
    anonSessions,
    regSessions,
    anonPv,
    checkoutDone,
    checkoutPending,
    usageByDayRows,
    pageViewsRecent,
    pvsToday,
    freeTierEverHitLimit,
    checkoutUsersDistinct,
    pvsLastPresenceWindow,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.dailyUsage.count({
      where: { usageDate: today, operationsCount: { gt: 0 } },
    }),
    prisma.user.groupBy({
      by: ["plan"],
      _count: { _all: true },
    }),
    prisma.dailyUsage.aggregate({
      where: { usageDate: today },
      _sum: { operationsCount: true },
    }),
    prisma.pageView.groupBy({
      by: ["sessionId"],
      where: { userId: null, createdAt: { gte: dayStart } },
    }),
    prisma.pageView.groupBy({
      by: ["sessionId"],
      where: { userId: { not: null }, createdAt: { gte: dayStart } },
    }),
    prisma.pageView.count({
      where: { userId: null, createdAt: { gte: dayStart } },
    }),
    prisma.paymentCheckout.count({ where: { status: "completed" } }),
    prisma.paymentCheckout.count({ where: { status: "pending" } }),
    prisma.dailyUsage.groupBy({
      by: ["usageDate"],
      _sum: { operationsCount: true },
      orderBy: { usageDate: "desc" },
      take: 30,
    }),
    prisma.pageView.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.pageView.findMany({
      where: { createdAt: { gte: dayStart } },
      select: { createdAt: true },
    }),
    prisma.user.count({ where: { freeLimitFirstExceededAt: { not: null } } }),
    prisma.paymentCheckout.findMany({
      where: { status: "completed" },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.pageView.findMany({
      where: { createdAt: { gte: activePresenceSince } },
      select: { userId: true, sessionId: true },
    }),
  ]);

  const registeredUsersActiveNow = new Set(
    pvsLastPresenceWindow.map((p) => p.userId).filter((id): id is string => id != null && id.length > 0),
  ).size;
  const distinctSessionsActiveNow = new Set(pvsLastPresenceWindow.map((p) => p.sessionId)).size;
  const anonymousSessionsActiveNow = new Set(
    pvsLastPresenceWindow.filter((p) => p.userId == null).map((p) => p.sessionId),
  ).size;

  const toolGroups30d = await prisma.dailyUsage.groupBy({
    by: ["lastFeatureKey"],
    where: {
      lastFeatureKey: { not: null },
      usageDate: { gte: TOOLStatsSince },
    },
    _count: { _all: true },
    _sum: { operationsCount: true },
  });
  const mostUsedTOOLSAllTimeFallback = toolGroups30d.length === 0;
  const toolGroups = mostUsedTOOLSAllTimeFallback
    ? await prisma.dailyUsage.groupBy({
        by: ["lastFeatureKey"],
        where: { lastFeatureKey: { not: null } },
        _count: { _all: true },
        _sum: { operationsCount: true },
      })
    : toolGroups30d;

  const usersByPlan = { FREE: 0, PRO: 0, BUSINESS: 0 };
  for (const row of planGroups) {
    usersByPlan[row.plan] = row._count._all;
  }

  const paidUsers = usersByPlan.PRO + usersByPlan.BUSINESS;
  const freeUsers = usersByPlan.FREE;

  const mostUsedTOOLS = toolGroups
    .map((row) => ({
      featureKey: row.lastFeatureKey as string,
      userDayRows: row._count._all,
      operationsAttributed: row._sum.operationsCount ?? 0,
    }))
    .sort((a, b) => b.operationsAttributed - a.operationsAttributed)
    .slice(0, 15);

  const usageByDay = [...usageByDayRows]
    .reverse()
    .map((r) => ({
      date: r.usageDate,
      totalOperations: r._sum.operationsCount ?? 0,
    }));

  const pvByDayMap = new Map<string, number>();
  for (const p of pageViewsRecent) {
    const k = p.createdAt.toISOString().slice(0, 10);
    pvByDayMap.set(k, (pvByDayMap.get(k) ?? 0) + 1);
  }
  const pageViewsByDay = [...pvByDayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  const hourCounts = new Array(24).fill(0) as number[];
  for (const p of pvsToday) {
    hourCounts[p.createdAt.getUTCHours()] += 1;
  }
  const pageViewsTodayByHourUtc = hourCounts.map((count, hour) => ({ hour, count }));

  return {
    generatedAt: new Date().toISOString(),
    usageDateUtc: today,
    totalUsers,
    activeUsersToday,
    todayTotalOperations: todayAgg._sum.operationsCount ?? 0,
    freeUsers,
    paidUsers,
    usersByPlan,
    mostUsedTOOLS,
    usagePerPackage: [
      { plan: "FREE", userCount: usersByPlan.FREE },
      { plan: "PRO", userCount: usersByPlan.PRO },
      { plan: "BUSINESS", userCount: usersByPlan.BUSINESS },
    ],
    anonymousSessionsToday: anonSessions.length,
    registeredSessionsToday: regSessions.length,
    anonymousPageViewsToday: anonPv,
    checkoutsCompleted: checkoutDone,
    checkoutsPending: checkoutPending,
    usageByDay,
    pageViewsByDay,
    pageViewsTodayByHourUtc,
    conversionFunnel: {
      freeTierEverHitLimit,
      usersWithCompletedCheckout: checkoutUsersDistinct.length,
      totalUsers,
    },
    presenceWindowMinutes,
    distinctSessionsActiveNow,
    registeredUsersActiveNow,
    anonymousSessionsActiveNow,
    mostUsedTOOLSAllTimeFallback,
  };
}

export async function listUsersForAdmin(params: {
  q?: string;
  page: number;
  pageSize: number;
  sort: "createdAt" | "email" | "plan";
  dir: "asc" | "desc";
}) {
  const { q, page, pageSize, sort, dir } = params;
  const skip = (page - 1) * pageSize;

  const where: Prisma.UserWhereInput | undefined = q?.trim()
    ? {
        OR: [
          { email: { contains: q.trim() } },
          { firstName: { contains: q.trim() } },
          { lastName: { contains: q.trim() } },
          { name: { contains: q.trim() } },
        ],
      }
    : undefined;

  const orderBy: Prisma.UserOrderByWithRelationInput =
    sort === "email"
      ? { email: dir }
      : sort === "plan"
        ? { plan: dir }
        : { createdAt: dir };

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        name: true,
        plan: true,
        role: true,
        isVerified: true,
        authProvider: true,
        subscriptionExpiry: true,
        preferredLanguage: true,
        createdAt: true,
        freeLimitFirstExceededAt: true,
        _count: { select: { dailyUsages: true } },
      },
    }),
  ]);

  const usageToday = todayKeyUtc();
  const userIds = rows.map((r) => r.id);
  const todayRows =
    userIds.length === 0
      ? []
      : await prisma.dailyUsage.findMany({
          where: { usageDate: usageToday, userId: { in: userIds } },
          select: { userId: true, operationsCount: true, postLimitExtraOps: true, lastFeatureKey: true },
        });
  const todayByUser = new Map(todayRows.map((r) => [r.userId, r]));

  const items = rows.map((u) => {
    const d = todayByUser.get(u.id);
    return {
      ...u,
      createdAt: u.createdAt.toISOString(),
      subscriptionExpiry: u.subscriptionExpiry?.toISOString() ?? null,
      freeLimitFirstExceededAt: u.freeLimitFirstExceededAt?.toISOString() ?? null,
      usageToday: d
        ? {
            operationsCount: d.operationsCount,
            postLimitExtraOps: d.postLimitExtraOps,
            lastFeatureKey: d.lastFeatureKey,
          }
        : null,
    };
  });

  return { total, page, pageSize, items };
}

export async function updateUserForAdmin(
  userId: string,
  data: {
    firstName?: string | null;
    lastName?: string | null;
    plan?: Plan;
    role?: UserRole;
    isVerified?: boolean;
    subscriptionExpiry?: string | null;
  },
  actor: AdminActor,
) {
  if (userId === actor.userId && data.role === "USER") {
    throw new HttpError(400, "You cannot remove your own admin role from this panel.");
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new HttpError(404, "User not found.");
  }

  const nextPlan = data.plan ?? existing.plan;
  let nextExpiry = existing.subscriptionExpiry;
  if (data.subscriptionExpiry !== undefined) {
    nextExpiry =
      data.subscriptionExpiry && String(data.subscriptionExpiry).trim() !== ""
        ? new Date(data.subscriptionExpiry)
        : null;
  }
  if (data.plan === "FREE") {
    nextExpiry = null;
  }

  const displayName =
    data.firstName !== undefined || data.lastName !== undefined
      ? `${(data.firstName ?? existing.firstName ?? "").trim()} ${(data.lastName ?? existing.lastName ?? "").trim()}`.trim() ||
        null
      : existing.name;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
      ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
      ...(data.plan !== undefined ? { plan: data.plan } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.isVerified !== undefined ? { isVerified: data.isVerified } : {}),
      ...(data.subscriptionExpiry !== undefined || data.plan !== undefined
        ? { subscriptionExpiry: nextPlan === "FREE" ? null : nextExpiry }
        : {}),
      ...(data.firstName !== undefined || data.lastName !== undefined ? { name: displayName } : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      name: true,
      plan: true,
      role: true,
      isVerified: true,
      subscriptionExpiry: true,
    },
  });
  await logAdminAudit(actor, "user.update", userId, `Kullanıcı güncellendi: ${existing.email}`, {
    fields: Object.keys(data),
  });
  return updated;
}

export async function createUserForAdmin(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  plan: Plan;
  skipEmailVerification: boolean;
}) {
  let email: string;
  try {
    email = normalizeEmailForStorage(input.email);
  } catch {
    throw new HttpError(400, "Invalid email address.");
  }

  if (await prisma.blockedEmail.findUnique({ where: { email } })) {
    throw new HttpError(403, "This email address is blocked from registration.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, "An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const displayName = `${input.firstName} ${input.lastName}`.trim() || null;

  const user = await prisma.user.create({
    data: {
      email,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      name: displayName,
      passwordHash,
      authProvider: "local",
      role: resolveRoleFromEmail(email),
      isVerified: input.skipEmailVerification,
      verifiedAt: input.skipEmailVerification ? new Date() : null,
      plan: input.plan,
      preferredLanguage: "en",
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      plan: true,
      role: true,
      isVerified: true,
    },
  });

  return user;
}

export async function deleteUserForAdmin(userId: string, actor: AdminActor, blockEmail: boolean) {
  if (userId === actor.userId) {
    throw new HttpError(400, "You cannot delete your own account from the admin panel.");
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    throw new HttpError(404, "User not found.");
  }

  if (isAdminEmail(target.email)) {
    throw new HttpError(400, "Policy administrator accounts cannot be deleted from this panel.");
  }

  if (blockEmail) {
    await upsertBlockedEmail(target.email, "admin_delete_user");
  }

  await prisma.user.delete({ where: { id: userId } });
  await logAdminAudit(actor, "user.delete", userId, `Kullanıcı silindi: ${target.email}`, { blockEmail });
}

export async function adminListBlockedEmails() {
  const rows = await listBlockedEmails();
  return rows.map((r) => ({
    email: r.email,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function adminAddBlockedEmailRaw(email: string, reason?: string | null) {
  let normalized: string;
  try {
    normalized = normalizeEmailForStorage(email);
  } catch {
    throw new HttpError(400, "Invalid email address.");
  }
  await upsertBlockedEmail(normalized, reason ?? null);
}

export async function adminRemoveBlockedEmailRaw(email: string) {
  let normalized: string;
  try {
    normalized = normalizeEmailForStorage(email);
  } catch {
    throw new HttpError(400, "Invalid email address.");
  }
  const ok = await removeBlockedEmail(normalized);
  if (!ok) {
    throw new HttpError(404, "Email is not on the block list.");
  }
}

export async function adminPutPaymentPrices(prices: Record<"PRO" | "BUSINESS", string>, actor: AdminActor) {
  try {
    await auditedPackagesPartial(
      { prices: { PRO: prices.PRO, BUSINESS: prices.BUSINESS } },
      actor,
      "plans.pricing",
      "Ödeme fiyatları güncellendi",
    );
  } catch {
    throw new HttpError(400, "Invalid price values. Use positive numbers (e.g. 199.99).");
  }
}

export async function getAllSiteSettings(): Promise<Record<string, unknown>> {
  const rows = await prisma.siteSetting.findMany();
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value) as unknown;
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}

export async function patchSiteSettings(patches: Record<string, unknown>, actor: AdminActor) {
  for (const [key, value] of Object.entries(patches)) {
    await auditedPatchSetting(key, value, actor, "settings.patch", `Güncellendi: ${key}`);
  }
}

export async function putPlansOverride(override: unknown, actor: AdminActor) {
  await auditedPackagesPartial({ plansOverride: override }, actor, "plans.override", "Plan override kaydedildi");
}

const DEFAULT_CMS = {
  homepage: {
    heroTitle: "",
    heroSubtitle: "",
    primaryCta: "",
    secondaryCta: "",
  },
  TOOLSStrip: { headline: "" },
  banner: { text: "", enabled: false },
  modals: { upgradeTeaser: "" },
  /** Shallow merge into `landingTranslations` per language (navbar, hero, footer, finalCta). */
  landing: {
    en: {} as Record<string, unknown>,
    tr: {} as Record<string, unknown>,
  },
  workspace: { bannerEnabled: false, bannerText: "" },
  assets: { heroImageUrl: "", logoUrl: "", screenshot1Url: "", screenshot2Url: "" },
};

function mergeCmsDefaults(parsed: Record<string, unknown>): Record<string, unknown> {
  const landingRaw = (parsed.landing as { en?: Record<string, unknown>; tr?: Record<string, unknown> }) ?? {};
  const defLand = DEFAULT_CMS.landing as { en: Record<string, unknown>; tr: Record<string, unknown> };
  const ws = typeof parsed.workspace === "object" && parsed.workspace !== null ? (parsed.workspace as Record<string, unknown>) : {};
  const ast = typeof parsed.assets === "object" && parsed.assets !== null ? (parsed.assets as Record<string, unknown>) : {};
  return {
    ...DEFAULT_CMS,
    ...parsed,
    landing: {
      en: { ...defLand.en, ...landingRaw.en },
      tr: { ...defLand.tr, ...landingRaw.tr },
    },
    workspace: { ...DEFAULT_CMS.workspace, ...ws },
    assets: { ...DEFAULT_CMS.assets, ...ast },
  };
}

export async function getCmsContent(): Promise<Record<string, unknown>> {
  const parsed = await getSetting(SITE_SETTING_KEYS.CMS_CONTENT);
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...DEFAULT_CMS };
  }
  try {
    return mergeCmsDefaults(parsed as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_CMS };
  }
}

export async function putCmsContent(content: unknown, actor: AdminActor) {
  await auditedPatchSetting(SITE_SETTING_KEYS.CMS_CONTENT, content, actor, "cms.put", "CMS içeriği kaydedildi");
}

export async function getPlansAdminPayload() {
  const defs = await getPlanDefinitionsResolved();
  const plans = Object.values(defs).map((p) => ({
    name: p.name,
    displayName: p.displayName,
    description: p.description,
    dailyLimit: p.dailyLimit,
    allowedFeatures: p.allowedFeatures,
    multiUser: p.multiUser,
  }));

  const pkg = await getResolvedPackagesConfig();
  const plansOverride = pkg.plansOverride;

  const byPlan = await prisma.paymentCheckout.groupBy({
    by: ["plan", "status"],
    _count: { _all: true },
  });

  const checkoutStats: Record<string, { completed: number; pending: number }> = {};
  for (const p of ["FREE", "PRO", "BUSINESS"] as const) {
    checkoutStats[p] = { completed: 0, pending: 0 };
  }
  for (const row of byPlan) {
    const key = row.plan;
    if (!checkoutStats[key]) {
      checkoutStats[key] = { completed: 0, pending: 0 };
    }
    if (row.status === "completed") {
      checkoutStats[key].completed += row._count._all;
    } else if (row.status === "pending") {
      checkoutStats[key].pending += row._count._all;
    }
  }

  const marketingParsed = pkg.marketing;

  const paymentPrices = await getPaymentPricesTry();

  return { plans, checkoutStats, marketing: marketingParsed, plansOverride, paymentPrices };
}

export async function putPackagesMarketing(marketing: unknown, actor: AdminActor) {
  await auditedPackagesPartial({ marketing }, actor, "packages.marketing", "Paket pazarlama metni güncellendi");
}

export async function getTOOLSAdminPayload() {
  const defs = await getPlanDefinitionsResolved();
  const overrides = await getSetting(SITE_SETTING_KEYS.TOOLS_CONFIG);

  const perTool = await prisma.dailyUsage.groupBy({
    by: ["lastFeatureKey"],
    where: { lastFeatureKey: { not: null } },
    _count: { _all: true },
    _sum: { operationsCount: true },
  });

  const usageByTool = Object.fromEntries(
    featureCatalog.map((fk) => {
      const hit = perTool.find((p) => p.lastFeatureKey === fk);
      return [fk, { rows: hit?._count._all ?? 0, operations: hit?._sum.operationsCount ?? 0 }];
    }),
  );

  return {
    catalog: featureCatalog,
    planDefinitions: Object.values(defs).map((p) => ({
      plan: p.name,
      dailyLimit: p.dailyLimit,
      allowedFeatures: p.allowedFeatures,
    })),
    overrides,
    usageByTool,
    postLimitNote:
      "Monetization lives in SiteSetting `TOOLS.config`: `postLimitThrottle` (delaysEnabled, freeOpsBeforeThrottle, delayCapMs, delayFloorMs, delayTiers, featureWeights, fileTiers), `conversion` (upgradeCtaLabel, upgradeCtaSubtitle), and `conversionMessaging` (strong message thresholds). The Araçlar tab exposes these in the Monetization section.",
  };
}

export async function putTOOLSConfig(config: unknown, actor: AdminActor) {
  await auditedPatchSetting(SITE_SETTING_KEYS.TOOLS_CONFIG, config, actor, "TOOLS.config", "Araç yapılandırması kaydedildi");
}

export async function getUsageSeries(days: number) {
  const rows = await prisma.dailyUsage.groupBy({
    by: ["usageDate"],
    _sum: { operationsCount: true },
    orderBy: { usageDate: "desc" },
    take: days,
  });
  return [...rows].reverse().map((r) => ({
    date: r.usageDate,
    totalOperations: r._sum.operationsCount ?? 0,
  }));
}

export async function buildUsageExportCsv(from: string, to: string): Promise<string> {
  const rows = await prisma.dailyUsage.findMany({
    where: {
      usageDate: { gte: from, lte: to },
    },
    include: {
      user: { select: { email: true } },
    },
    orderBy: [{ usageDate: "asc" }, { userId: "asc" }],
  });

  const header = ["usageDate", "userId", "email", "operationsCount", "postLimitExtraOps", "postLimitThrottleCount", "lastFeatureKey"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      r.usageDate,
      r.userId,
      r.user.email,
      String(r.operationsCount),
      String(r.postLimitExtraOps),
      String(r.postLimitThrottleCount),
      r.lastFeatureKey ?? "",
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

/** @deprecated use getAdminOverview */
export async function getAdminDashboardStats() {
  return getAdminOverview();
}
