import { appendLogLine } from "./file-log.js";

// Olayları tek satırlık JSON (NDJSON) olarak dosyaya yazar; üretimde hata ayıklama ve denetim içindir.
// kind alanı tüketicilerin satırı sınıflandırmasını sağlar; şema değişince arama panelleri güncellenmelidir.
// Dosya günlüğü env ile kapatılırsa bu fonksiyonlar sessizce no-op olur (file-log katmanında).

type LogKind = "login_attempt" | "register_attempt" | "google_oauth" | "error" | "api_failure" | "security";

function write(kind: LogKind, payload: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), kind, ...payload });
  appendLogLine(line);
}

export function logLoginAttempt(payload: {
  outcome: "success" | "failure";
  email?: string | null;
  userId?: string;
  reason?: string;
  httpStatus?: number;
  ip?: string;
  userAgent?: string;
  desktop?: boolean;
}): void {
  write("login_attempt", payload as Record<string, unknown>);
}

export function logRegisterAttempt(payload: {
  outcome: "success" | "failure";
  email?: string | null;
  userId?: string;
  reason?: string;
  httpStatus?: number;
  ip?: string;
  userAgent?: string;
  desktop?: boolean;
}): void {
  write("register_attempt", payload as Record<string, unknown>);
}

export function logGoogleOAuth(payload: {
  outcome: "success" | "failure";
  step?: string;
  email?: string;
  userId?: string;
  reason?: string;
  httpStatus?: number;
  ip?: string;
  userAgent?: string;
}): void {
  write("google_oauth", payload as Record<string, unknown>);
}

export function logError(payload: {
  category: "http" | "validation" | "unhandled" | "prisma";
  message: string;
  status?: number;
  method?: string;
  path?: string;
  ip?: string;
  issues?: string[];
  stack?: string;
  prismaCode?: string;
  meta?: unknown;
}): void {
  write("error", payload as Record<string, unknown>);
}

export function logApiFailure(payload: {
  service: string;
  operation: string;
  message?: string;
  httpStatus?: number;
  detail?: string;
}): void {
  write("api_failure", payload as Record<string, unknown>);
}

/** Şüpheli trafik: rate limit, geçersiz JWT, otomatik IP blokları. */
export function logSuspiciousActivity(payload: {
  type: string;
  ip?: string;
  path?: string;
  method?: string;
  detail?: string;
  userAgent?: string;
}): void {
  write("security", payload as Record<string, unknown>);
}
