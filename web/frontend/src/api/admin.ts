import { AUTH_ACCESS_TOKEN_STORAGE_KEY } from "./auth";
import { getSaasApiBase } from "./saasBase";
import { saasAuthorizedFetch } from "./subscription";

function readLatestAccessToken(fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  return window.localStorage.getItem(AUTH_ACCESS_TOKEN_STORAGE_KEY) ?? fallback;
}

async function adminFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  const token = readLatestAccessToken(accessToken);
  return saasAuthorizedFetch(token, (t) =>
    fetch(`${getSaasApiBase()}/api/admin${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${t}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      credentials: "include",
    }),
  );
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
  mostUsedTOOLS: Array<{ featureKey: string; userDayRows: number; operationsAttributed: number }>;
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
  presenceWindowMinutes: number;
  distinctSessionsActiveNow: number;
  registeredUsersActiveNow: number;
  anonymousSessionsActiveNow: number;
  mostUsedTOOLSAllTimeFallback: boolean;
};

export type AdminUserRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  plan: string;
  role: string;
  isVerified: boolean;
  authProvider: string;
  subscriptionExpiry: string | null;
  preferredLanguage: string;
  createdAt: string;
  freeLimitFirstExceededAt: string | null;
  _count: { dailyUsages: number };
  usageToday: {
    operationsCount: number;
    postLimitExtraOps: number;
    lastFeatureKey: string | null;
  } | null;
};

export async function fetchAdminOverview(accessToken: string): Promise<AdminOverview> {
  const r = await adminFetch(accessToken, "/overview");
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<AdminOverview>;
}

export async function fetchAdminUsers(
  accessToken: string,
  params: { q?: string; page?: number; pageSize?: number; sort?: string; dir?: string },
): Promise<{ total: number; page: number; pageSize: number; items: AdminUserRow[] }> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.sort) sp.set("sort", params.sort);
  if (params.dir) sp.set("dir", params.dir);
  const r = await adminFetch(accessToken, `/users?${sp.toString()}`);
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<{ total: number; page: number; pageSize: number; items: AdminUserRow[] }>;
}

export async function patchAdminUser(
  accessToken: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const r = await adminFetch(accessToken, `/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function deleteAdminUser(accessToken: string, userId: string, blockEmail: boolean): Promise<void> {
  const q = blockEmail ? "?blockEmail=true" : "";
  const r = await adminFetch(accessToken, `/users/${encodeURIComponent(userId)}${q}`, { method: "DELETE" });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export type BlockedEmailRow = { email: string; reason: string | null; createdAt: string };

export async function fetchAdminBlockedEmails(accessToken: string): Promise<BlockedEmailRow[]> {
  const r = await adminFetch(accessToken, "/blocked-emails");
  if (!r.ok) {
    throw new Error(await r.text());
  }
  const j = (await r.json()) as { items: BlockedEmailRow[] };
  return j.items;
}

export async function postAdminBlockedEmail(accessToken: string, body: { email: string; reason?: string }): Promise<void> {
  const r = await adminFetch(accessToken, "/blocked-emails", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function deleteAdminBlockedEmail(accessToken: string, email: string): Promise<void> {
  const q = new URLSearchParams({ email });
  const r = await adminFetch(accessToken, `/blocked-emails?${q}`, { method: "DELETE" });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function putAdminPlanPricing(accessToken: string, prices: { PRO: string; BUSINESS: string }): Promise<void> {
  const r = await adminFetch(accessToken, "/plans/pricing", {
    method: "PUT",
    body: JSON.stringify(prices),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function createAdminUser(
  accessToken: string,
  body: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    plan?: string;
    skipEmailVerification?: boolean;
  },
): Promise<void> {
  const r = await adminFetch(accessToken, "/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function fetchAdminSettings(accessToken: string): Promise<Record<string, unknown>> {
  const r = await adminFetch(accessToken, "/settings");
  if (!r.ok) {
    throw new Error(await r.text());
  }
  const j = (await r.json()) as { settings: Record<string, unknown> };
  return j.settings;
}

export async function putAdminSettingsPatches(accessToken: string, patches: Record<string, unknown>): Promise<void> {
  const r = await adminFetch(accessToken, "/settings", {
    method: "PUT",
    body: JSON.stringify({ patches }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function fetchAdminCms(accessToken: string): Promise<Record<string, unknown>> {
  const r = await adminFetch(accessToken, "/cms");
  if (!r.ok) {
    throw new Error(await r.text());
  }
  const j = (await r.json()) as { content: Record<string, unknown> };
  return j.content;
}

export async function putAdminCms(accessToken: string, content: unknown): Promise<void> {
  const r = await adminFetch(accessToken, "/cms", {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function fetchAdminPlans(accessToken: string): Promise<unknown> {
  const r = await adminFetch(accessToken, "/plans");
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json();
}

export async function putAdminPackagesMarketing(accessToken: string, marketing: unknown): Promise<void> {
  const r = await adminFetch(accessToken, "/packages/marketing", {
    method: "PUT",
    body: JSON.stringify({ marketing }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function fetchAdminTOOLS(accessToken: string): Promise<unknown> {
  const r = await adminFetch(accessToken, "/TOOLS");
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json();
}

export async function putAdminTOOLSConfig(accessToken: string, config: unknown): Promise<void> {
  const r = await adminFetch(accessToken, "/TOOLS/config", {
    method: "PUT",
    body: JSON.stringify({ config }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function fetchAdminUsageSeries(accessToken: string, days: number): Promise<{ series: { date: string; totalOperations: number }[] }> {
  const r = await adminFetch(accessToken, `/reports/usage-series?days=${days}`);
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<{ series: { date: string; totalOperations: number }[] }>;
}

export function buildAdminUsageExportUrl(from: string, to: string): string {
  const base = getSaasApiBase();
  const q = new URLSearchParams({ from, to }).toString();
  return `${base}/api/admin/reports/usage-export?${q}`;
}

export async function putAdminPlansOverride(accessToken: string, override: unknown): Promise<void> {
  const r = await adminFetch(accessToken, "/plans/override", {
    method: "PUT",
    body: JSON.stringify({ override }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export type AdminMediaItem = {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  url: string;
};

export async function fetchAdminMediaList(accessToken: string): Promise<{ items: AdminMediaItem[] }> {
  const r = await adminFetch(accessToken, "/media");
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<{ items: AdminMediaItem[] }>;
}

export async function uploadAdminMedia(accessToken: string, file: File): Promise<AdminMediaItem> {
  const token = readLatestAccessToken(accessToken);
  const fd = new FormData();
  fd.set("file", file);
  const r = await saasAuthorizedFetch(token, (t) =>
    fetch(`${getSaasApiBase()}/api/admin/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}` },
      body: fd,
      credentials: "include",
    }),
  );
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<AdminMediaItem>;
}

export type AdminControlMeta = {
  featureFlagCatalog: readonly { key: string; label: string; description: string }[];
  betaFlagCatalog: readonly { key: string; label: string; description: string }[];
  resettableScopes: readonly string[];
};

export async function fetchAdminControlMeta(accessToken: string): Promise<AdminControlMeta> {
  const r = await adminFetch(accessToken, "/control/meta");
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<AdminControlMeta>;
}

export type AdminAuditRow = {
  id: string;
  createdAt: string;
  userId: string | null;
  userEmail: string;
  action: string;
  targetKey: string | null;
  summary: string;
  meta: unknown;
};

export async function fetchAdminAuditLog(accessToken: string, limit = 120): Promise<{ items: AdminAuditRow[] }> {
  const r = await adminFetch(accessToken, `/audit-log?limit=${limit}`);
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<{ items: AdminAuditRow[] }>;
}

export type AdminRevisionRow = {
  id: string;
  createdAt: string;
  scope: string;
  userEmail: string;
  summary: string | null;
};

export async function fetchAdminRevisions(
  accessToken: string,
  scope: string,
  limit = 40,
): Promise<{ items: AdminRevisionRow[] }> {
  const q = new URLSearchParams({ scope, limit: String(limit) });
  const r = await adminFetch(accessToken, `/revisions?${q}`);
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<{ items: AdminRevisionRow[] }>;
}

export async function postAdminRollbackRevision(accessToken: string, revisionId: string): Promise<{ ok: boolean; scope: string }> {
  const r = await adminFetch(accessToken, "/revisions/rollback", {
    method: "POST",
    body: JSON.stringify({ revisionId }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<{ ok: boolean; scope: string }>;
}

export async function postAdminSystemReset(accessToken: string, scopes: string[]): Promise<{ ok: boolean; scopes: string[] }> {
  const r = await adminFetch(accessToken, "/system/reset", {
    method: "POST",
    body: JSON.stringify({ scopes, confirm: "RESET" as const }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<{ ok: boolean; scopes: string[] }>;
}
