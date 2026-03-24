import type { Language } from "../i18n/landing";

const SAAS_API_BASE = import.meta.env.VITE_SAAS_API_BASE ?? "http://localhost:4000";

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  avatar?: string | null;
  plan: string;
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

async function ensureOk(response: Response, defaultMessage: string) {
  if (response.ok) {
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { message?: string; error?: string };
    const message = payload.message || payload.error || defaultMessage;
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
  email: string;
  password: string;
  preferredLanguage: Language;
};

async function sendAuthRequest<T>(path: string, body?: RegisterPayload | Record<string, string>): Promise<T | null> {
  const url = `${SAAS_API_BASE}/api/auth${path}`;
  const response = await fetch(url, {
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

export async function registerAuthUser(email: string, password: string, preferredLanguage: Language) {
  const payload: RegisterPayload = {
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
  const response = await fetch(`${SAAS_API_BASE}/api/auth/me`, {
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
  return `${SAAS_API_BASE}/api/auth/google?lang=${lang}`;
}

export async function updateAuthPreferredLanguage(accessToken: string, preferredLanguage: Language) {
  const response = await fetch(`${SAAS_API_BASE}/api/auth/preferences/language`, {
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

