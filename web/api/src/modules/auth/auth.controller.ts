import type { Request, Response } from "express";
import { logGoogleOAuth, logLoginAttempt, logRegisterAttempt } from "../../lib/app-logger.js";
import { authLog } from "../../lib/auth-log.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { createSecureToken } from "../../lib/token.js";
import { authCredentialsSchema, preferredLanguageSchema } from "./auth.schema.js";
import {
  buildGoogleAuthorizeUrl,
  assertGoogleOAuthConfigured,
  exchangeGoogleAuthorizationCode,
  fetchGoogleProfile,
  getGoogleRedirectUri,
} from "./auth.google.js";
import {
  GOOGLE_OAUTH_LOG,
  logGoogleCallbackQuery,
  logGoogleOAuthRedirect,
  maskRedirectUrlForLog,
} from "./google-oauth.console.js";
import {
  getUserById,
  loginUser,
  logoutUser,
  refreshSession,
  registerUser,
  signInWithGoogle,
  type AuthSessionResult,
  updatePreferredLanguage,
  verifyEmailToken,
} from "./auth.service.js";
import { getDesktopDeviceIdFromHeaders, isDesktopClient } from "../device/device.service.js";

const REFRESH_COOKIE_NAME = "nbpdf_refresh_token";
const OAUTH_STATE_COOKIE = "nbpdf_google_oauth";

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/api/auth",
    domain: env.COOKIE_DOMAIN || undefined,
  };
}

function getOAuthStateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    maxAge: 10 * 60 * 1000,
    path: "/api/auth",
    domain: env.COOKIE_DOMAIN || undefined,
  };
}

/** Google OAuth sonrası SPA yönlendirmeleri (JSON yok; yalnızca redirect). */
function oauthFrontendRedirect(path: "login-success" | "login-error", query?: Record<string, string>) {
  const base = env.OAUTH_FRONTEND_REDIRECT_ORIGIN.replace(/\/$/, "");
  const url = new URL(`${base}/${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

/** Callback’te HttpError dışı (Prisma, vb.) hatalar için kullanıcıya güvenli kısa metin. */
function userFacingOAuthCallbackError(error: unknown): string {
  if (error instanceof HttpError) {
    return error.message.slice(0, 500);
  }
  if (error instanceof Error) {
    const prisma = error as Error & { code?: string; meta?: { target?: string[] } };
    if (prisma.code === "P2002") {
      return "This Google account may already be linked to another profile, or a unique field conflicted. Try another Google account or contact support.";
    }
    const msg = (error.message || "").trim() || error.name;
    return msg.length > 450 ? `${msg.slice(0, 450)}…` : msg;
  }
  return "Google sign-in failed (unexpected error). Check the API terminal logs for details.";
}

function writeSession(response: Response, session: AuthSessionResult) {
  response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, getCookieOptions());
  response.json({
    accessToken: session.accessToken,
    user: session.user,
  });
}

function clientRequestMeta(request: Request) {
  const ua = request.get("user-agent");
  return {
    ip: request.ip || request.socket?.remoteAddress,
    userAgent: typeof ua === "string" ? ua.slice(0, 500) : undefined,
    desktop: isDesktopClient(request.headers),
  };
}

function rawBodyEmail(request: Request) {
  if (!request.body || typeof request.body !== "object" || !("email" in request.body)) {
    return undefined;
  }
  const v = (request.body as { email?: unknown }).email;
  return typeof v === "string" ? v.trim().toLowerCase().slice(0, 320) : undefined;
}

function renderVerificationHtml(status: "success" | "error", title: string, detail: string) {
  const accent = status === "success" ? "#38bdf8" : "#f87171";
  const accentText = status === "success" ? "#082f49" : "#450a0a";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;min-height:100vh;background:#0f172a;font-family:Arial,Helvetica,sans-serif;color:#e2e8f0;display:flex;align-items:center;justify-content:center;padding:24px;">
    <div style="width:min(560px,100%);background:#111827;border:1px solid #1f2937;border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.35);overflow:hidden;">
      <div style="padding:28px 28px 16px;border-bottom:1px solid #1f2937;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.18em;color:#7dd3fc;text-transform:uppercase;">NB PDF TOOLS</div>
        <h1 style="margin:16px 0 0;font-size:28px;line-height:1.2;color:#f8fafc;">${title}</h1>
      </div>
      <div style="padding:28px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 14px;border-radius:999px;background:${accent};color:${accentText};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;">
          ${status === "success" ? "Verified" : "Verification error"}
        </div>
        <p style="margin:18px 0 0;font-size:15px;line-height:1.8;color:#cbd5e1;">${detail}</p>
        <p style="margin:18px 0 0;font-size:14px;line-height:1.8;color:#94a3b8;">You can now return to the application and continue with your account flow.</p>
        <a href="${env.FRONTEND_ORIGIN}/?view=login&email_verified=1" style="display:inline-block;margin-top:24px;padding:12px 18px;border-radius:14px;background:#1e293b;color:#f8fafc;text-decoration:none;font-weight:700;">
          Open NB PDF TOOLS
        </a>
      </div>
    </div>
  </body>
</html>`;
}

const registerBodySchema = authCredentialsSchema.extend({
  preferredLanguage: preferredLanguageSchema.shape.preferredLanguage.optional(),
});

export async function registerController(request: Request, response: Response) {
  const meta = clientRequestMeta(request);
  authLog.info("POST /api/auth/register: body keys", {
    keys: request.body && typeof request.body === "object" ? Object.keys(request.body as object) : [],
  });
  const parsed = registerBodySchema.safeParse(request.body);
  if (!parsed.success) {
    authLog.warn("POST /api/auth/register: validation failed", { issues: parsed.error.issues.map((i) => i.message) });
    logRegisterAttempt({
      outcome: "failure",
      email: typeof request.body === "object" && request.body && "email" in request.body ? String((request.body as { email?: unknown }).email) : null,
      reason: "validation",
      ...meta,
    });
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Registration data is invalid.");
  }

  try {
    const result = await registerUser(parsed.data);
    authLog.info("POST /api/auth/register: created", { userId: result.user.id });
    logRegisterAttempt({
      outcome: "success",
      email: result.user.email,
      userId: result.user.id,
      ...meta,
    });
    response.status(201).json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      logRegisterAttempt({
        outcome: "failure",
        email: parsed.data.email,
        httpStatus: error.statusCode,
        reason: error.message,
        ...meta,
      });
    }
    throw error;
  }
}

export async function loginController(request: Request, response: Response) {
  const meta = clientRequestMeta(request);
  authLog.info("POST /auth/login: request", {
    desktop: isDesktopClient(request.headers),
    keys: request.body && typeof request.body === "object" ? Object.keys(request.body as object) : [],
  });
  const parsed = authCredentialsSchema.safeParse(request.body);
  if (!parsed.success) {
    authLog.warn("POST /auth/login: validation failed", { issues: parsed.error.issues.map((i) => i.message) });
    logLoginAttempt({
      outcome: "failure",
      reason: "validation",
      email: rawBodyEmail(request) ?? null,
      ...meta,
    });
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Login data is invalid.");
  }

  const deviceId = isDesktopClient(request.headers) ? getDesktopDeviceIdFromHeaders(request.headers) : "";
  try {
    const session = await loginUser(parsed.data, deviceId || undefined);
    logLoginAttempt({
      outcome: "success",
      email: session.user.email,
      userId: session.user.id,
      ...meta,
    });
    writeSession(response, session);
  } catch (error) {
    if (error instanceof HttpError) {
      logLoginAttempt({
        outcome: "failure",
        email: parsed.data.email,
        httpStatus: error.statusCode,
        reason: error.message,
        ...meta,
      });
    }
    throw error;
  }
}

export async function refreshController(request: Request, response: Response) {
  const refreshToken = request.cookies[REFRESH_COOKIE_NAME] as string | undefined;
  if (!refreshToken) {
    throw new HttpError(401, "No active session found.");
  }

  const session = await refreshSession(refreshToken);
  writeSession(response, session);
}

export async function logoutController(request: Request, response: Response) {
  const refreshToken = request.cookies[REFRESH_COOKIE_NAME] as string | undefined;
  await logoutUser(refreshToken);

  response.clearCookie(REFRESH_COOKIE_NAME, getCookieOptions());
  response.status(204).send();
}

export async function meController(request: Request, response: Response) {
  if (!request.authUser) {
    throw new HttpError(401, "Authentication is required.");
  }

  const user = await getUserById(request.authUser.id);
  response.json({ user });
}

export async function updatePreferredLanguageController(request: Request, response: Response) {
  if (!request.authUser) {
    throw new HttpError(401, "Authentication is required.");
  }

  const parsed = preferredLanguageSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Preferred language is invalid.");
  }

  const user = await updatePreferredLanguage(request.authUser.id, parsed.data.preferredLanguage);
  response.json({ user });
}

export async function googleOAuthStartController(request: Request, response: Response) {
  const meta = clientRequestMeta(request);
  try {
    assertGoogleOAuthConfigured();
  } catch (error) {
    if (error instanceof HttpError) {
      logGoogleOAuth({ outcome: "failure", step: "start", reason: error.message, ...meta });
      console.error(`${GOOGLE_OAUTH_LOG} start FAILED (not configured or misconfigured)`, {
        message: error.message,
        ...meta,
      });
      const failUrl = oauthFrontendRedirect("login-error", { reason: error.message });
      logGoogleOAuthRedirect({ kind: "login-error", urlMasked: maskRedirectUrlForLog(failUrl) });
      response.redirect(failUrl);
      return;
    }
    throw error;
  }

  const langParam = typeof request.query.lang === "string" ? request.query.lang : "";
  const preferredLanguage = langParam === "tr" ? "tr" : "en";
  const desktopPortRaw = typeof request.query.desktop_port === "string" ? request.query.desktop_port.trim() : "";
  let desktopLocalPort: number | null = null;
  if (desktopPortRaw) {
    const parsed = Number.parseInt(desktopPortRaw, 10);
    if (!Number.isNaN(parsed) && parsed >= 1024 && parsed <= 65_535) {
      desktopLocalPort = parsed;
    }
  }
  const state = createSecureToken(24);
  const oauthCookieValue =
    desktopLocalPort !== null
      ? `${state}|${preferredLanguage}|desktop|${desktopLocalPort}`
      : `${state}|${preferredLanguage}`;
  response.cookie(OAUTH_STATE_COOKIE, oauthCookieValue, getOAuthStateCookieOptions());
  const authorizeUrl = buildGoogleAuthorizeUrl(state);
  console.log(`${GOOGLE_OAUTH_LOG} start → redirect to Google accounts`, {
    preferredLanguage,
    redirectUri: getGoogleRedirectUri(),
    statePreview: `${state.slice(0, 8)}…`,
    authorizeUrlLength: authorizeUrl.length,
  });
  authLog.info("GET /auth/google: redirect to Google", { preferredLanguage });
  response.redirect(authorizeUrl);
}

export async function googleOAuthCallbackController(request: Request, response: Response) {
  const meta = clientRequestMeta(request);
  const oauthErr = typeof request.query.error === "string" ? request.query.error : "";
  const code = typeof request.query.code === "string" ? request.query.code : "";
  const state = typeof request.query.state === "string" ? request.query.state : "";

  logGoogleCallbackQuery({
    hasError: Boolean(oauthErr),
    error: oauthErr || undefined,
    hasCode: Boolean(code),
    hasState: Boolean(state),
  });

  if (oauthErr) {
    response.clearCookie(OAUTH_STATE_COOKIE, getOAuthStateCookieOptions());
    const desc =
      typeof request.query.error_description === "string" ? request.query.error_description : oauthErr;
    logGoogleOAuth({ outcome: "failure", step: "callback", reason: desc.slice(0, 500), ...meta });
    console.error(`${GOOGLE_OAUTH_LOG} callback: Google returned error to redirect_uri`, {
      error: oauthErr,
      errorDescription: desc.slice(0, 500),
      ...meta,
    });
    const url = oauthFrontendRedirect("login-error", { reason: desc.slice(0, 500) });
    logGoogleOAuthRedirect({ kind: "login-error", urlMasked: maskRedirectUrlForLog(url) });
    response.redirect(url);
    return;
  }

  if (!code || !state) {
    response.clearCookie(OAUTH_STATE_COOKIE, getOAuthStateCookieOptions());
    logGoogleOAuth({
      outcome: "failure",
      step: "callback",
      reason: "missing_code_or_state",
      ...meta,
    });
    console.error(`${GOOGLE_OAUTH_LOG} callback: missing code or state`, { ...meta });
    const url = oauthFrontendRedirect("login-error", { reason: "Missing authorization response from Google." });
    logGoogleOAuthRedirect({ kind: "login-error", urlMasked: maskRedirectUrlForLog(url) });
    response.redirect(url);
    return;
  }

  const rawCookie = request.cookies[OAUTH_STATE_COOKIE] as string | undefined;
  response.clearCookie(OAUTH_STATE_COOKIE, getOAuthStateCookieOptions());

  if (!rawCookie) {
    logGoogleOAuth({ outcome: "failure", step: "callback", reason: "oauth_cookie_missing", ...meta });
    console.error(`${GOOGLE_OAUTH_LOG} callback: OAuth state cookie missing (expired or blocked)`, { ...meta });
    const url = oauthFrontendRedirect("login-error", { reason: "Sign-in session expired. Please try again." });
    logGoogleOAuthRedirect({ kind: "login-error", urlMasked: maskRedirectUrlForLog(url) });
    response.redirect(url);
    return;
  }

  const parts = rawCookie.split("|");
  const expectedState = parts[0] ?? "";
  const preferredLanguage = parts[1] === "tr" ? "tr" : "en";
  let desktopLocalPort: number | null = null;
  if (parts[2] === "desktop" && parts[3]) {
    const parsed = Number.parseInt(parts[3], 10);
    if (!Number.isNaN(parsed) && parsed >= 1024 && parsed <= 65_535) {
      desktopLocalPort = parsed;
    }
  }
  if (!expectedState || state !== expectedState) {
    logGoogleOAuth({ outcome: "failure", step: "callback", reason: "state_mismatch", ...meta });
    console.error(`${GOOGLE_OAUTH_LOG} callback: state mismatch (possible CSRF or stale session)`, {
      ...meta,
    });
    const url = oauthFrontendRedirect("login-error", { reason: "Invalid sign-in state. Please try again." });
    logGoogleOAuthRedirect({ kind: "login-error", urlMasked: maskRedirectUrlForLog(url) });
    response.redirect(url);
    return;
  }

  try {
    console.log(`${GOOGLE_OAUTH_LOG} callback: exchanging authorization code for tokens`, {
      codeLength: code.length,
      statePreview: `${state.slice(0, 8)}…`,
      preferredLanguage,
    });
    const googleAccess = await exchangeGoogleAuthorizationCode(code);
    console.log(`${GOOGLE_OAUTH_LOG} callback: fetching userinfo with access token`);
    const profile = await fetchGoogleProfile(googleAccess);

    const session = await signInWithGoogle({
      email: profile.email,
      googleId: profile.googleId,
      name: profile.name,
      avatar: profile.avatar,
      preferredLanguage,
    });

    response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, getCookieOptions());
    authLog.info("GET /auth/google/callback: session issued", { userId: session.user.id, email: session.user.email });
    logGoogleOAuth({
      outcome: "success",
      step: "callback",
      email: session.user.email,
      userId: session.user.id,
      ...meta,
    });

    const redirectUrl =
      desktopLocalPort !== null
        ? `http://127.0.0.1:${desktopLocalPort}/oauth?token=${encodeURIComponent(session.accessToken)}`
        : oauthFrontendRedirect("login-success", { token: session.accessToken });
    console.log(`${GOOGLE_OAUTH_LOG} callback: issuing HTTP redirect`, {
      redirectKind: desktopLocalPort !== null ? "desktop-localhost" : "login-success",
      maskedUrl: maskRedirectUrlForLog(redirectUrl),
    });
    logGoogleOAuthRedirect({ kind: "login-success", urlMasked: maskRedirectUrlForLog(redirectUrl) });
    response.redirect(redirectUrl);
  } catch (error) {
    const message = userFacingOAuthCallbackError(error);
    const stack = error instanceof Error ? error.stack : undefined;
    authLog.warn("GET /auth/google/callback: failed", {
      message,
      raw: error instanceof Error ? error.message : String(error),
    });
    console.error(`${GOOGLE_OAUTH_LOG} callback: unhandled failure`, {
      userMessage: message,
      httpStatus: error instanceof HttpError ? error.statusCode : undefined,
      stack,
      rawError: error instanceof Error ? error.message : String(error),
      ...meta,
    });
    logGoogleOAuth({
      outcome: "failure",
      step: "callback",
      reason: message.slice(0, 500),
      httpStatus: error instanceof HttpError ? error.statusCode : undefined,
      ...meta,
    });
    const url = oauthFrontendRedirect("login-error", { reason: message });
    logGoogleOAuthRedirect({ kind: "login-error", urlMasked: maskRedirectUrlForLog(url) });
    response.redirect(url);
  }
}

export async function verifyEmailController(request: Request, response: Response) {
  const token = typeof request.query.token === "string" ? request.query.token.trim() : "";
  authLog.info("GET /verify-email", { hasToken: Boolean(token) });
  if (!token) {
    response.status(400).send(renderVerificationHtml("error", "Verification link is invalid", "The verification token is missing or malformed."));
    return;
  }

  try {
    const result = await verifyEmailToken(token);
    response
      .status(200)
      .send(
        renderVerificationHtml(
          "success",
          "Email verified",
          `${result.email} is now verified. You can sign in with your email and password.`,
        ),
      );
  } catch (error) {
    if (error instanceof HttpError) {
      response.status(error.statusCode).send(renderVerificationHtml("error", "Verification failed", error.message));
      return;
    }
    throw error;
  }
}
