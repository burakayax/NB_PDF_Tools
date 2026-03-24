const SAAS_API_BASE = import.meta.env.VITE_SAAS_API_BASE ?? "http://localhost:4000";

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
  const response = await fetch(`${SAAS_API_BASE}/api/subscription/plans`);
  await ensureOk(response, "Plans could not be loaded.");
  const payload = (await response.json()) as { plans: PlanDefinition[] };
  return payload.plans;
}

export async function fetchSubscriptionSummary(accessToken: string) {
  const response = await fetch(`${SAAS_API_BASE}/api/subscription/current`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
  });
  await ensureOk(response, "Subscription summary could not be loaded.");
  return response.json() as Promise<SubscriptionSummary>;
}

export async function changePlan(accessToken: string, plan: PlanName) {
  const response = await fetch(`${SAAS_API_BASE}/api/subscription/change-plan`, {
    method: "POST",
    headers: createHeaders(accessToken),
    credentials: "include",
    body: JSON.stringify({ plan }),
  });
  await ensureOk(response, "Plan could not be updated.");
  return response.json() as Promise<{ plan: PlanDefinition }>;
}

export async function recordUsage(accessToken: string, featureKey: FeatureKey) {
  const response = await fetch(`${SAAS_API_BASE}/api/subscription/record-usage`, {
    method: "POST",
    headers: createHeaders(accessToken),
    credentials: "include",
    body: JSON.stringify({ featureKey }),
  });
  await ensureOk(response, "Usage could not be recorded.");
  return response.json() as Promise<{ usageDate: string; operationsCount: number; remainingToday: number | null }>;
}
