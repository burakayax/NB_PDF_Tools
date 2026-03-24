import { env } from "../../config/env.js";
import { logApiFailure } from "../../lib/app-logger.js";
import { HttpError } from "../../lib/http-error.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";

export function assertGoogleOAuthConfigured() {
  if (!env.GOOGLE_CLIENT_ID?.trim() || !env.GOOGLE_CLIENT_SECRET?.trim()) {
    throw new HttpError(503, "Google sign-in is not configured on this server.");
  }
}

export function getGoogleRedirectUri() {
  return new URL("/api/auth/google/callback", env.APP_BASE_URL).toString();
}

export function buildGoogleAuthorizeUrl(state: string) {
  assertGoogleOAuthConfigured();
  const redirectUri = getGoogleRedirectUri();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export async function exchangeGoogleAuthorizationCode(code: string): Promise<string> {
  assertGoogleOAuthConfigured();
  const redirectUri = getGoogleRedirectUri();
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID!.trim(),
    client_secret: env.GOOGLE_CLIENT_SECRET!.trim(),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (error) {
    logApiFailure({
      service: "google_oauth",
      operation: "token_exchange",
      message: "fetch_failed",
      detail: error instanceof Error ? error.message : String(error),
    });
    throw new HttpError(503, "Could not reach Google. Try again in a moment.");
  }

  let data: GoogleTokenResponse;
  try {
    data = (await response.json()) as GoogleTokenResponse;
  } catch (error) {
    logApiFailure({
      service: "google_oauth",
      operation: "token_exchange",
      httpStatus: response.status,
      message: "invalid_json",
      detail: error instanceof Error ? error.message : String(error),
    });
    throw new HttpError(400, "Invalid response from Google token endpoint.");
  }

  if (!response.ok || !data.access_token) {
    const msg = data.error_description || data.error || "Failed to exchange Google authorization code.";
    logApiFailure({
      service: "google_oauth",
      operation: "token_exchange",
      httpStatus: response.status,
      message: data.error ?? "token_error",
      detail: typeof data.error_description === "string" ? data.error_description.slice(0, 500) : undefined,
    });
    throw new HttpError(400, msg);
  }

  return data.access_token;
}

type GoogleUserInfo = {
  id?: string;
  email?: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
};

export async function fetchGoogleProfile(accessToken: string): Promise<{ email: string; emailVerified: boolean }> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    logApiFailure({
      service: "google_oauth",
      operation: "userinfo",
      message: "fetch_failed",
      detail: error instanceof Error ? error.message : String(error),
    });
    throw new HttpError(503, "Could not reach Google. Try again in a moment.");
  }

  if (!response.ok) {
    logApiFailure({
      service: "google_oauth",
      operation: "userinfo",
      httpStatus: response.status,
      message: "http_error",
    });
    throw new HttpError(400, "Could not load Google profile.");
  }

  let profile: GoogleUserInfo;
  try {
    profile = (await response.json()) as GoogleUserInfo;
  } catch (error) {
    logApiFailure({
      service: "google_oauth",
      operation: "userinfo",
      message: "invalid_json",
      detail: error instanceof Error ? error.message : String(error),
    });
    throw new HttpError(400, "Invalid Google profile response.");
  }
  const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  if (!email) {
    throw new HttpError(400, "Google did not return an email address for this account.");
  }

  if (profile.verified_email !== true) {
    throw new HttpError(403, "Your Google email must be verified to sign in.");
  }

  return { email, emailVerified: true };
}
