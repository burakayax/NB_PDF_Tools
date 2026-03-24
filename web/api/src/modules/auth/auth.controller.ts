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
} from "./auth.google.js";
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
        <a href="${env.FRONTEND_ORIGIN}" style="display:inline-block;margin-top:24px;padding:12px 18px;border-radius:14px;background:#1e293b;color:#f8fafc;text-decoration:none;font-weight:700;">
          Open NB PDF TOOLS
        </a>
      </div>
    </div>
  </body>
</html>`;
}

export async function registerController(request: Request, response: Response) {
  authLog.info("POST /auth/register: body keys", {
    keys: request.body && typeof request.body === "object" ? Object.keys(request.body as object) : [],
  });
  const parsed = authCredentialsSchema.extend({ preferredLanguage: preferredLanguageSchema.shape.preferredLanguage.optional() }).safeParse(request.body);
  if (!parsed.success) {
    authLog.warn("POST /auth/register: validation failed", { issues: parsed.error.issues.map((i) => i.message) });
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Registration data is invalid.");
  }

  const result = await registerUser(parsed.data);
  authLog.info("POST /auth/register: created", { userId: result.user.id });
  response.status(201).json(result);
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
      response.redirect(`${env.FRONTEND_ORIGIN}/?view=login&oauth_error=${encodeURIComponent(error.message)}`);
      return;
    }
    throw error;
  }

  const langParam = typeof request.query.lang === "string" ? request.query.lang : "";
  const preferredLanguage = langParam === "tr" ? "tr" : "en";
  const state = createSecureToken(24);
  response.cookie(OAUTH_STATE_COOKIE, `${state}|${preferredLanguage}`, getOAuthStateCookieOptions());
  authLog.info("GET /auth/google: redirect to Google", { preferredLanguage });
  response.redirect(buildGoogleAuthorizeUrl(state));
}

export async function googleOAuthCallbackController(request: Request, response: Response) {
  const meta = clientRequestMeta(request);
  const oauthErr = typeof request.query.error === "string" ? request.query.error : "";
  if (oauthErr) {
    response.clearCookie(OAUTH_STATE_COOKIE, getOAuthStateCookieOptions());
    const desc =
      typeof request.query.error_description === "string" ? request.query.error_description : oauthErr;
    logGoogleOAuth({ outcome: "failure", step: "callback", reason: desc.slice(0, 500), ...meta });
    response.redirect(`${env.FRONTEND_ORIGIN}/?view=login&oauth_error=${encodeURIComponent(desc)}`);
    return;
  }

  const code = typeof request.query.code === "string" ? request.query.code : "";
  const state = typeof request.query.state === "string" ? request.query.state : "";
  if (!code || !state) {
    response.clearCookie(OAUTH_STATE_COOKIE, getOAuthStateCookieOptions());
    logGoogleOAuth({
      outcome: "failure",
      step: "callback",
      reason: "missing_code_or_state",
      ...meta,
    });
    response.redirect(
      `${env.FRONTEND_ORIGIN}/?view=login&oauth_error=${encodeURIComponent("Missing authorization response from Google.")}`,
    );
    return;
  }

  const rawCookie = request.cookies[OAUTH_STATE_COOKIE] as string | undefined;
  response.clearCookie(OAUTH_STATE_COOKIE, getOAuthStateCookieOptions());

  if (!rawCookie) {
    logGoogleOAuth({ outcome: "failure", step: "callback", reason: "oauth_cookie_missing", ...meta });
    response.redirect(
      `${env.FRONTEND_ORIGIN}/?view=login&oauth_error=${encodeURIComponent("Sign-in session expired. Please try again.")}`,
    );
    return;
  }

  const pipeIdx = rawCookie.indexOf("|");
  const expectedState = pipeIdx >= 0 ? rawCookie.slice(0, pipeIdx) : rawCookie;
  const langPart = pipeIdx >= 0 ? rawCookie.slice(pipeIdx + 1) : "en";
  if (!expectedState || state !== expectedState) {
    logGoogleOAuth({ outcome: "failure", step: "callback", reason: "state_mismatch", ...meta });
    response.redirect(
      `${env.FRONTEND_ORIGIN}/?view=login&oauth_error=${encodeURIComponent("Invalid sign-in state. Please try again.")}`,
    );
    return;
  }

  const preferredLanguage = langPart === "tr" ? "tr" : "en";

  try {
    const googleAccess = await exchangeGoogleAuthorizationCode(code);
    const profile = await fetchGoogleProfile(googleAccess);
    const session = await signInWithGoogle({ email: profile.email, preferredLanguage });
    response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, getCookieOptions());
    authLog.info("GET /auth/google/callback: session issued", { userId: session.user.id, email: session.user.email });
    logGoogleOAuth({
      outcome: "success",
      step: "callback",
      email: session.user.email,
      userId: session.user.id,
      ...meta,
    });
    response.redirect(`${env.FRONTEND_ORIGIN}/?view=web&oauth=complete`);
  } catch (error) {
    const message = error instanceof HttpError ? error.message : "Google sign-in failed.";
    authLog.warn("GET /auth/google/callback: failed", { message });
    logGoogleOAuth({
      outcome: "failure",
      step: "callback",
      reason: message.slice(0, 500),
      httpStatus: error instanceof HttpError ? error.statusCode : undefined,
      ...meta,
    });
    response.redirect(`${env.FRONTEND_ORIGIN}/?view=login&oauth_error=${encodeURIComponent(message)}`);
  }
}

export async function verifyEmailController(request: Request, response: Response) {
  const token = typeof request.query.token === "string" ? request.query.token.trim() : "";
  if (!token) {
    response.status(400).send(renderVerificationHtml("error", "Verification link is invalid", "The verification token is missing or malformed."));
    return;
  }

  try {
    const result = await verifyEmailToken(token);
    response.status(200).send(renderVerificationHtml("success", "Email verified", `${result.email} is now verified. Your account has been activated successfully.`));
  } catch (error) {
    if (error instanceof HttpError) {
      response.status(error.statusCode).send(renderVerificationHtml("error", "Verification failed", error.message));
      return;
    }
    throw error;
  }
}
