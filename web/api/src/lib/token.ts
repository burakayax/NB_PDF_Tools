import crypto from "node:crypto";

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}
