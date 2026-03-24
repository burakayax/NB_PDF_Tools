import type { Language } from "../i18n/landing";

const SAAS_API_BASE = import.meta.env.VITE_SAAS_API_BASE ?? "http://localhost:4000";

export type ClientErrorPayload = {
  message: string;
  level?: "error" | "warning";
  source?: string;
  stack?: string;
  url?: string;
  language: Language;
};

export async function reportClientError(payload: ClientErrorPayload, accessToken?: string | null) {
  await fetch(`${SAAS_API_BASE}/api/errors/log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    keepalive: true,
    body: JSON.stringify({
      level: "error",
      ...payload,
    }),
  });
}
