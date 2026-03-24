/**
 * Google OAuth için konsol logları. Tam JWT/refresh değerleri yazılmaz (yalnızca özet).
 */
export const GOOGLE_OAUTH_LOG = "[oauth/google]";

function previewSecret(value: string, visible = 16): string {
  if (!value) {
    return "(empty)";
  }
  if (value.length <= visible) {
    return `${value.slice(0, 4)}…(len=${value.length})`;
  }
  return `${value.slice(0, visible)}…(len=${value.length})`;
}

/** Yönlendirme URL’sindeki token= değerini maskele */
export function maskRedirectUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has("token")) {
      u.searchParams.set("token", "***REDACTED***");
    }
    if (u.searchParams.has("reason")) {
      const r = u.searchParams.get("reason") ?? "";
      u.searchParams.set("reason", r.length > 120 ? `${r.slice(0, 120)}…` : r);
    }
    return u.toString();
  } catch {
    return "(invalid URL)";
  }
}

export function logGoogleCallbackQuery(details: {
  hasError: boolean;
  error?: string;
  hasCode: boolean;
  hasState: boolean;
}) {
  console.log(`${GOOGLE_OAUTH_LOG} callback query`, details);
}

export function logGoogleTokenEndpointResponse(details: {
  httpStatus: number;
  ok: boolean;
  tokenType?: string;
  expiresIn?: number;
  accessTokenLength: number;
  accessTokenPreview: string;
  error?: string;
  errorDescription?: string;
}) {
  console.log(`${GOOGLE_OAUTH_LOG} Google token endpoint (oauth2.googleapis.com/token)`, details);
}

export function logGoogleTokenEndpointError(details: {
  phase: "network" | "json" | "business";
  message: string;
  httpStatus?: number;
  cause?: string;
}) {
  console.error(`${GOOGLE_OAUTH_LOG} Google token endpoint ERROR`, details);
}

export function logGoogleUserInfoResponse(details: {
  httpStatus: number;
  ok: boolean;
  raw: {
    id?: string;
    email?: string;
    verified_email?: boolean;
    name?: string;
    picture?: string;
  };
}) {
  const { picture, ...rest } = details.raw;
  console.log(`${GOOGLE_OAUTH_LOG} Google userinfo (oauth2/v2/userinfo)`, {
    httpStatus: details.httpStatus,
    ok: details.ok,
    profile: {
      ...rest,
      picture: picture ? `[url len=${picture.length}]` : undefined,
    },
  });
}

export function logGoogleUserInfoError(details: {
  phase: "network" | "json" | "http" | "validation";
  message: string;
  httpStatus?: number;
  cause?: string;
}) {
  console.error(`${GOOGLE_OAUTH_LOG} Google userinfo ERROR`, details);
}

export function logGoogleOAuthJwtIssued(details: {
  userId: string;
  email: string;
  accessTokenPreview: string;
  accessTokenLength: number;
  refreshTokenPreview: string;
  refreshTokenLength: number;
}) {
  console.log(`${GOOGLE_OAUTH_LOG} JWT / session issued`, {
    ...details,
    note: "Full tokens are never logged; use previews for correlation only.",
  });
}

export function logGoogleOAuthRedirect(details: { kind: "login-success" | "login-error"; urlMasked: string }) {
  console.log(`${GOOGLE_OAUTH_LOG} redirect`, details);
}

export { previewSecret };
