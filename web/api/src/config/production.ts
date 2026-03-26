import { env } from "./env.js";

/**
 * Üretim ortamı türetilmiş bayrakları (env tek doğrulama kaynağıdır).
 * Özellik bayrakları için doğrudan `env` kullanılabilir; bu nesne yalnızca okunabilir özet sağlar.
 */
export const productionConfig = {
  isProduction: env.NODE_ENV === "production",
  /** Ters proxy arkasında HTTP isteklerini HTTPS’e yönlendirir (FORCE_HTTPS=true). */
  enforceHttps: env.forceHttps,
  /** Node.js doğrudan TLS ile dinliyorsa true (aksi halde nginx/Caddy sonlandırır). */
  tlsInline: Boolean(env.HTTPS_KEY_PATH && env.HTTPS_CERT_PATH),
} as const;
