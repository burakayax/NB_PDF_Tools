import type { Language } from "../i18n/landing";
import { getSaasApiBase } from "./saasBase";

/** useAuthSession ile aynı anahtar; yenileme sonrası güncel jetonu paylaşmak için dışa açık. */
export const AUTH_ACCESS_TOKEN_STORAGE_KEY = "nbpdf-access-token";

export type AuthUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  avatar?: string | null;
  plan: string;
  /** ISO 8601; ücretli abonelik bitişi, yoksa null veya atlanmış. */
  subscription_expiry?: string | null;
  role?: "USER" | "ADMIN";
  preferredLanguage: Language;
  isVerified?: boolean;
  authProvider?: "local" | "google";
  createdAt: string;
};

type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export type RegisterResponse = {
  message: string;
  verificationRequired: true;
  user: AuthUser;
};

function authNetworkFailureMessage(): string {
  return import.meta.env.DEV
    ? "Kimlik API (port 4000) yanıt vermiyor. Proje kökünde veya `web/api` içinde API’yi başlatın. Geliştirmede `web/frontend/.env` içinde VITE_SAAS_API_BASE’i boş bırakın (Vite proxy kullanılır)."
    : "API sunucusuna ulaşılamıyor. VITE_SAAS_API_BASE ve dağıtım adresini kontrol edin.";
}

async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const attempts = import.meta.env.DEV ? 10 : 1;
  const delayMs = 320;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      last = e;
      const retryable = e instanceof TypeError && import.meta.env.DEV && i < attempts - 1;
      if (retryable) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      if (e instanceof TypeError) {
        throw new Error(authNetworkFailureMessage());
      }
      throw e;
    }
  }
  throw last instanceof Error ? last : new Error(authNetworkFailureMessage());
}

function messageFromErrorPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const o = payload as Record<string, unknown>;
  if (typeof o.message === "string" && o.message.trim()) {
    return o.message;
  }
  if (typeof o.error === "string" && o.error.trim()) {
    return o.error;
  }
  if (typeof o.detail === "string" && o.detail.trim()) {
    return o.detail;
  }
  if (Array.isArray(o.detail) && o.detail.length > 0) {
    const first = o.detail[0];
    if (first && typeof first === "object" && "msg" in first && typeof (first as { msg: unknown }).msg === "string") {
      return (first as { msg: string }).msg;
    }
  }
  return fallback;
}

async function ensureOk(response: Response, defaultMessage: string) {
  if (response.ok) {
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = await response.json();
    const message = messageFromErrorPayload(payload, defaultMessage);
    if (import.meta.env.DEV) {
      console.warn("[auth] request failed", response.status, message);
    }
    throw new Error(message);
  }

  const message = await response.text();
  if (import.meta.env.DEV) {
    console.warn("[auth] request failed", response.status, message);
  }
  throw new Error(message || defaultMessage);
}

type RegisterPayload = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  preferredLanguage: Language;
};

async function sendAuthRequest<T>(path: string, body?: RegisterPayload | Record<string, string>): Promise<T | null> {
  const url = `${getSaasApiBase()}/api/auth${path}`;
  const response = await authFetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  await ensureOk(response, "Authentication request failed.");
  if (response.status === 204) {
    return null;
  }

  return response.json() as Promise<T>;
}

export async function registerAuthUser(
  firstName: string,
  lastName: string,
  email: string,
  password: string,
  preferredLanguage: Language,
) {
  const payload: RegisterPayload = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    password,
    preferredLanguage,
  };
  if (import.meta.env.DEV) {
    console.info("[auth] POST /api/auth/register", { email: payload.email, preferredLanguage: payload.preferredLanguage });
  }
  const response = await sendAuthRequest<RegisterResponse>("/register", payload);
  if (!response) {
    throw new Error("Registration response was empty.");
  }
  return response;
}

export async function loginAuthUser(email: string, password: string) {
  const payload = { email: email.trim().toLowerCase(), password };
  if (import.meta.env.DEV) {
    console.info("[auth] POST /api/auth/login", { email: payload.email });
  }
  const response = await sendAuthRequest<AuthResponse>("/login", payload);
  if (!response) {
    throw new Error("Login response was empty.");
  }
  return response;
}

export async function refreshAuthSession() {
  return sendAuthRequest<AuthResponse>("/refresh");
}

export async function logoutAuthUser() {
  await sendAuthRequest("/logout");
}

export async function fetchAuthenticatedUser(accessToken: string) {
  const response = await authFetch(`${getSaasApiBase()}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
  });

  await ensureOk(response, "User session could not be verified.");
  const payload = (await response.json()) as { user: AuthUser };
  return payload.user;
}

export function getGoogleOAuthStartUrl(language: Language) {
  const lang = language === "tr" ? "tr" : "en";
  return `${getSaasApiBase()}/api/auth/google?lang=${lang}`;
}

export async function updateAuthProfile(accessToken: string, body: { firstName: string; lastName: string }) {
  const response = await authFetch(`${getSaasApiBase()}/api/auth/profile`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
    }),
  });

  await ensureOk(response, "Profile could not be updated.");
  const payload = (await response.json()) as { user: AuthUser };
  return payload.user;
}

export async function changeAuthPassword(accessToken: string, body: { currentPassword: string; newPassword: string }) {
  const response = await authFetch(`${getSaasApiBase()}/api/auth/change-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      current_password: body.currentPassword,
      new_password: body.newPassword,
    }),
  });

  await ensureOk(response, "Password could not be changed.");
  const payload = (await response.json()) as { user: AuthUser; message?: string };
  return payload.user;
}

export async function updateAuthPreferredLanguage(accessToken: string, preferredLanguage: Language) {
  const response = await authFetch(`${getSaasApiBase()}/api/auth/preferences/language`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ preferredLanguage }),
  });

  await ensureOk(response, "Preferred language could not be updated.");
  const payload = (await response.json()) as { user: AuthUser };
  return payload.user;
}

