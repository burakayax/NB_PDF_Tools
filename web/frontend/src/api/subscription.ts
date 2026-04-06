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

/** Shared by subscription and admin API clients (401 → refresh session). */
export async function saasAuthorizedFetch(initialToken: string, run: (token: string) => Promise<Response>): Promise<Response> {
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
  /** Aylık abonelik fiyatı (TRY), ücretli planlar için API’den gelir. */
  monthlyPriceTry?: string | null;
  /** PRO yıllık paket (TRY), yalnızca PRO satırında. */
  annualPriceTry?: string | null;
};

export type UsageWarningCode = "approaching_80" | "at_free_cap" | "beyond_free";

export type UpgradeCta = {
  intent: "subscribe_premium";
  label: string;
  subtitle: string;
  clientAction: "open_upgrade_modal";
};

export type ConversionTracking = {
  freeLimitExceeded: boolean;
  /** True when this response applied progressive delay (Free soft friction). */
  softFrictionActive?: boolean;
  operationsToday: number;
  dailyLimit: number | null;
  /** First N operations on Free without server-side delay (`postLimitThrottle.freeOpsBeforeThrottle`). */
  softFrictionAfterOps?: number;
  postLimitExtraOps: number;
  postLimitThrottleEventsToday: number;
  freeLimitFirstExceededAt: string | null;
  /** Lifetime server-applied delay events (same source as `User.totalThrottleEventsCount`). */
  lifetimeDelaysExperienced?: number;
  /** Lifetime upgrade CTA impressions (delays + post-limit copy). */
  lifetimeUpgradeCtaImpressions?: number;
};

/** FREE: lifetime counters + top tools for adaptive UI nudges (API `behaviorMonetization`). */
export type BehaviorMonetization = {
  totalOperationsLifetime: number;
  totalThrottleEventsLifetime: number;
  totalUpgradeCtaImpressionsLifetime?: number;
  toolUsageTop: { featureKey: FeatureKey; count: number }[];
};

/** PDF API / Node assert-feature: delay + CTA forwarded to the web client. */
export type SaasFrictionPayload = {
  message?: string | null;
  upgradeCta?: UpgradeCta;
  conversionTracking?: ConversionTracking | null;
  delayMs?: number;
  usageSummary?: string | null;
};

export type SubscriptionSummary = {
  currentPlan: PlanDefinition;
  usage: {
    date: string;
    usedToday: number;
    remainingToday: number | null;
    dailyLimit: number | null;
    lastFeatureKey: FeatureKey | null;
    /** Ops today after free daily allowance (backend analytics / conversion). */
    postLimitExtraOps?: number;
    /** Delayed assert/authorize events today (post–free-cap). */
    postLimitThrottleEventsToday?: number;
    /** Free unlimited: delay kicks in after this many fast runs (server tools config). */
    softFrictionAfterOps?: number | null;
    usageWarningCode?: UsageWarningCode | null;
    softUsageWarning?: string | null;
    strongUsageWarning?: string | null;
    premiumBenefitsLine?: string | null;
    upgradeCta?: UpgradeCta;
    conversionSummary?: string;
    conversionTracking?: ConversionTracking | null;
    behaviorMonetization?: BehaviorMonetization | null;
    /** PRO/Business: premium PDF API lane (no server delay, full quality). */
    processingTier?: "premium" | "standard";
    priorityProcessing?: boolean;
    /** False for paid when monetization delays are off or N/A. */
    serverThrottleApplies?: boolean;
  };
  allowedFeatures: FeatureKey[];
};

export type RecordUsageResponse = {
  usageDate: string;
  operationsCount: number;
  remainingToday: number | null;
  postLimitExtraOps?: number;
  usageWarningCode?: UsageWarningCode | null;
  softUsageWarning?: string | null;
  strongUsageWarning?: string | null;
  premiumBenefitsLine?: string | null;
  usageSummary: string | null;
  conversionMessage: string | null;
  reducedOutputQuality: boolean;
  priorityProcessing: boolean;
  postLimitMessage: string | null;
  upgradeCta?: UpgradeCta | null;
  conversionTracking?: ConversionTracking | null;
};

export type AssertFeatureThrottlePayload = {
  throttleApplied: true;
  delayMs: number;
  message: string;
  usageSummary: string;
  reducedOutputQuality: boolean;
  priorityProcessing: boolean;
  upgradeCta: UpgradeCta;
  conversionTracking: ConversionTracking;
};

export type AssertFeatureResult = {
  throttleApplied: boolean;
  reducedOutputQuality: boolean;
  throttlePayload?: AssertFeatureThrottlePayload;
};

/** Sunucu hesaplı kalan gün; geri sayım için istemci tarihi kullanılmaz. */
export type SubscriptionStatus = {
  plan: PlanName;
  remaining_days: number | null;
  plan_downgraded?: boolean;
  processingTier?: "premium" | "standard";
  priorityProcessing?: boolean;
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
export async function assertFeatureBeforeAction(
  accessToken: string,
  featureKey: FeatureKey,
  options?: { totalSizeBytes?: number },
): Promise<AssertFeatureResult> {
  const token = readLatestAccessToken(accessToken);
  const body: { featureKey: FeatureKey; totalSizeBytes?: number } = { featureKey };
  if (options?.totalSizeBytes != null && options.totalSizeBytes >= 0) {
    body.totalSizeBytes = Math.floor(options.totalSizeBytes);
  }
  const response = await saasAuthorizedFetch(token, (t) =>
    fetch(`${getSaasApiBase()}/api/subscription/assert-feature`, {
      method: "POST",
      headers: createHeaders(t),
      credentials: "include",
      body: JSON.stringify(body),
    }),
  );
  await ensureOk(response, "This action is not allowed on your current plan.");
  if (response.status === 204) {
    return { throttleApplied: false, reducedOutputQuality: false };
  }
  const data = (await response.json()) as AssertFeatureThrottlePayload;
  return {
    throttleApplied: true,
    reducedOutputQuality: data.reducedOutputQuality,
    throttlePayload: data,
  };
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
  return response.json() as Promise<RecordUsageResponse>;
}
