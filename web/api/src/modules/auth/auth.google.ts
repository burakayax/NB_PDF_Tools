import { env } from "../../config/env.js";
import { logApiFailure } from "../../lib/app-logger.js";
import { normalizeEmailForStorage } from "../../lib/email-identity-normalize.js";
import { HttpError } from "../../lib/http-error.js";
import {
  logGoogleTokenEndpointError,
  logGoogleTokenEndpointResponse,
  logGoogleUserInfoError,
  logGoogleUserInfoResponse,
  previewSecret,
} from "./google-oauth.console.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";

export function assertGoogleOAuthConfigured() {
  if (!env.GOOGLE_CLIENT_ID?.trim() || !env.GOOGLE_CLIENT_SECRET?.trim()) {
    throw new HttpError(
      503,
      "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in web/api/.env and restart the API.",
    );
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
    const detail = error instanceof Error ? error.message : String(error);
    logGoogleTokenEndpointError({ phase: "network", message: "fetch to Google token endpoint failed", cause: detail });
    logApiFailure({
      service: "google_oauth",
      operation: "token_exchange",
      message: "fetch_failed",
      detail,
    });
    throw new HttpError(503, "Could not reach Google. Try again in a moment.");
  }

  let data: GoogleTokenResponse;
  try {
    data = (await response.json()) as GoogleTokenResponse;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logGoogleTokenEndpointError({
      phase: "json",
      message: "token response body is not valid JSON",
      httpStatus: response.status,
      cause: detail,
    });
    logApiFailure({
      service: "google_oauth",
      operation: "token_exchange",
      httpStatus: response.status,
      message: "invalid_json",
      detail,
    });
    throw new HttpError(400, "Invalid response from Google token endpoint.");
  }

  const accessToken = data.access_token ?? "";
  logGoogleTokenEndpointResponse({
    httpStatus: response.status,
    ok: response.ok,
    tokenType: data.token_type,
    expiresIn: data.expires_in,
    accessTokenLength: accessToken.length,
    accessTokenPreview: previewSecret(accessToken, 20),
    error: data.error,
    errorDescription: typeof data.error_description === "string" ? data.error_description.slice(0, 400) : undefined,
  });

  if (!response.ok || !data.access_token) {
    const msg = data.error_description || data.error || "Failed to exchange Google authorization code.";
    logGoogleTokenEndpointError({
      phase: "business",
      message: "Google returned error or missing access_token",
      httpStatus: response.status,
      cause: msg.slice(0, 300),
    });
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

export async function fetchGoogleProfile(accessToken: string): Promise<{
  email: string;
  emailVerified: boolean;
  googleId: string;
  name: string | null;
  avatar: string | null;
}> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logGoogleUserInfoError({ phase: "network", message: "fetch to Google userinfo failed", cause: detail });
    logApiFailure({
      service: "google_oauth",
      operation: "userinfo",
      message: "fetch_failed",
      detail,
    });
    throw new HttpError(503, "Could not reach Google. Try again in a moment.");
  }

  if (!response.ok) {
    logGoogleUserInfoError({
      phase: "http",
      message: "Google userinfo returned non-OK status",
      httpStatus: response.status,
    });
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
    const detail = error instanceof Error ? error.message : String(error);
    logGoogleUserInfoError({ phase: "json", message: "userinfo response is not valid JSON", cause: detail });
    logApiFailure({
      service: "google_oauth",
      operation: "userinfo",
      message: "invalid_json",
      detail,
    });
    throw new HttpError(400, "Invalid Google profile response.");
  }

  logGoogleUserInfoResponse({
    httpStatus: response.status,
    ok: response.ok,
    raw: {
      id: profile.id,
      email: profile.email,
      verified_email: profile.verified_email,
      name: profile.name,
      picture: profile.picture,
    },
  });

  let email = "";
  if (typeof profile.email === "string" && profile.email.trim()) {
    try {
      email = normalizeEmailForStorage(profile.email);
    } catch {
      email = profile.email.trim().toLowerCase();
    }
  }
  if (!email) {
    logGoogleUserInfoError({ phase: "validation", message: "missing email in Google profile" });
    throw new HttpError(400, "Google did not return an email address for this account.");
  }

  if (profile.verified_email !== true) {
    logGoogleUserInfoError({
      phase: "validation",
      message: "Google email is not verified (verified_email !== true)",
      cause: `email=${email}`,
    });
    throw new HttpError(403, "Your Google email must be verified to sign in.");
  }

  const googleId = typeof profile.id === "string" && profile.id.trim() ? profile.id.trim() : "";
  if (!googleId) {
    logGoogleUserInfoError({ phase: "validation", message: "missing Google account id (sub)" });
    throw new HttpError(400, "Google did not return a stable account id for this profile.");
  }

  const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : null;
  const avatar = typeof profile.picture === "string" && profile.picture.trim() ? profile.picture.trim() : null;

  return { email, emailVerified: true, googleId, name, avatar };
}
