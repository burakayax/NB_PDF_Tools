import { AUTH_ACCESS_TOKEN_STORAGE_KEY, refreshAuthSession, type AuthUser } from "./auth";
import { getSaasApiBase } from "./saasBase";

type SaasSessionSync = (session: { accessToken: string; user: AuthUser }) => void;

let saasSessionSync: SaasSessionSync | null = null;

/** React oturumu; 401 sonrası yenilemede yeni jeton state + localStorage’a yazılır. */
export function registerSaasSessionSync(fn: SaasSessionSync | null) {
  saasSessionSync = fn;
}

function readLatestAccessToken(fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  return window.localStorage.getItem(AUTH_ACCESS_TOKEN_STORAGE_KEY) ?? fallback;
}

async function saasAuthorizedFetch(initialToken: string, run: (token: string) => Promise<Response>): Promise<Response> {
  let response = await run(initialToken);
  if (response.status !== 401 || !saasSessionSync) {
    return response;
  }
  try {
    const refreshed = await refreshAuthSession();
    if (!refreshed?.accessToken) {
      return response;
    }
    saasSessionSync({ accessToken: refreshed.accessToken, user: refreshed.user });
    const token = readLatestAccessToken(refreshed.accessToken);
    return await run(token);
  } catch {
    return response;
  }
}

export type PlanName = "FREE" | "PRO" | "BUSINESS";
export type FeatureKey =
  | "split"
  | "merge"
  | "pdf-to-word"
  | "word-to-pdf"
  | "excel-to-pdf"
  | "pdf-to-excel"
  | "compress"
  | "encrypt";

export type PlanDefinition = {
  name: PlanName;
  displayName: string;
  description: string;
  dailyLimit: number | null;
  allowedFeatures: FeatureKey[];
  multiUser: boolean;
};

export type SubscriptionSummary = {
  currentPlan: PlanDefinition;
  usage: {
    date: string;
    usedToday: number;
    remainingToday: number | null;
    dailyLimit: number | null;
    lastFeatureKey: FeatureKey | null;
  };
  allowedFeatures: FeatureKey[];
};

/** Sunucu hesaplı kalan gün; geri sayım için istemci tarihi kullanılmaz. */
export type SubscriptionStatus = {
  plan: PlanName;
  remaining_days: number | null;
  plan_downgraded?: boolean;
};

async function ensureOk(response: Response, defaultMessage: string) {
  if (response.ok) {
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message || defaultMessage);
  }

  const message = await response.text();
  throw new Error(message || defaultMessage);
}

function createHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export async function fetchPlans() {
  const response = await fetch(`${getSaasApiBase()}/api/subscription/plans`);
  await ensureOk(response, "Plans could not be loaded.");
  const payload = (await response.json()) as { plans: PlanDefinition[] };
  return payload.plans;
}

export async function fetchSubscriptionSummary(accessToken: string) {
  const token = readLatestAccessToken(accessToken);
  const response = await saasAuthorizedFetch(token, (t) =>
    fetch(`${getSaasApiBase()}/api/subscription/current`, {
      headers: {
        Authorization: `Bearer ${t}`,
      },
      credentials: "include",
    }),
  );
  await ensureOk(response, "Subscription summary could not be loaded.");
  return response.json() as Promise<SubscriptionSummary>;
}

export async function fetchSubscriptionStatus(accessToken: string) {
  const token = readLatestAccessToken(accessToken);
  const response = await saasAuthorizedFetch(token, (t) =>
    fetch(`${getSaasApiBase()}/api/subscription/status`, {
      headers: {
        Authorization: `Bearer ${t}`,
      },
      credentials: "include",
    }),
  );
  await ensureOk(response, "Subscription status could not be loaded.");
  return response.json() as Promise<SubscriptionStatus>;
}

/** Server-side plan and quota check before running a PDF operation (does not consume quota). */
export async function assertFeatureBeforeAction(accessToken: string, featureKey: FeatureKey) {
  const token = readLatestAccessToken(accessToken);
  const response = await saasAuthorizedFetch(token, (t) =>
    fetch(`${getSaasApiBase()}/api/subscription/assert-feature`, {
      method: "POST",
      headers: createHeaders(t),
      credentials: "include",
      body: JSON.stringify({ featureKey }),
    }),
  );
  await ensureOk(response, "This action is not allowed on your current plan.");
}

export async function recordUsage(accessToken: string, featureKey: FeatureKey) {
  const token = readLatestAccessToken(accessToken);
  const response = await saasAuthorizedFetch(token, (t) =>
    fetch(`${getSaasApiBase()}/api/subscription/record-usage`, {
      method: "POST",
      headers: createHeaders(t),
      credentials: "include",
      body: JSON.stringify({ featureKey }),
    }),
  );
  await ensureOk(response, "Usage could not be recorded.");
  return response.json() as Promise<{ usageDate: string; operationsCount: number; remainingToday: number | null }>;
}
