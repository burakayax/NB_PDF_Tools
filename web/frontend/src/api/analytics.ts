import type { Language } from "../i18n/landing";
import { getSaasApiBase } from "./saasBase";
const SESSION_KEY = "nbpdf-analytics-session-id";

export type PageViewPayload = {
  view: string;
  path: string;
  sessionId: string;
  language: Language;
  referrer?: string;
};

function getOrCreateSessionId() {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }

  const next = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
}

export async function trackPageView(payload: Omit<PageViewPayload, "sessionId">, accessToken?: string | null) {
  await fetch(`${getSaasApiBase()}/api/analytics/page-view`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: "include",
    keepalive: true,
    body: JSON.stringify({
      ...payload,
      sessionId: getOrCreateSessionId(),
    }),
  });
}
