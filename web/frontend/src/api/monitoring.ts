import type { Language } from "../i18n/landing";
import { getSaasApiBase } from "./saasBase";

export type ClientErrorPayload = {
  message: string;
  level?: "error" | "warning";
  source?: string;
  stack?: string;
  url?: string;
  language: Language;
};

export async function reportClientError(payload: ClientErrorPayload, accessToken?: string | null) {
  await fetch(`${getSaasApiBase()}/api/errors/log`, {
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
