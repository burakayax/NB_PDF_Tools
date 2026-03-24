import crypto from "node:crypto";

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

/** Python `secrets.token_urlsafe(n)` karşılığı — e-posta doğrulama bağlantıları için (base64url, n bayt). */
export function createUrlSafeToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString("base64url");
}
