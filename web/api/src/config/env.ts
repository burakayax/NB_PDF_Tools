import dotenv from "dotenv";
import { z } from "zod";
import { assertEnvFileExists } from "./ensure-env-file.js";

assertEnvFileExists();
dotenv.config();

const rawEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
    /** Google OAuth sonrası tarayıcı yönlendirmesi (varsayılan: FRONTEND_ORIGIN). Örn. http://localhost:5173 */
    OAUTH_FRONTEND_REDIRECT_ORIGIN: z.string().url().optional(),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().default(24),
    COOKIE_DOMAIN: z.string().optional(),
    APP_BASE_URL: z.string().url().default("http://localhost:4000"),
    /**
     * Birincil e-posta kimlik bilgileri (Gmail: normal şifre yerine Uygulama Şifresi kullanın).
     * SMTP_USER / SMTP_PASS boşken Nodemailer kimlik doğrulaması olarak kullanılır.
     * Eksik veya hatalı olursa doğrulama ve bildirim e-postaları gönderilemez.
     */
    EMAIL_USER: z.string().email().optional(),
    EMAIL_PASS: z.string().min(1).optional(),
    /** Özel SMTP sunucusu (varsayılanlar Gmail ile uyumludur). */
    SMTP_HOST: z.string().min(1).default("smtp.gmail.com"),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z
      .string()
      .optional()
      .transform((value) => value === "true"),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    SMTP_FROM_EMAIL: z.string().email().optional(),
    SMTP_FROM_NAME: z.string().min(1).default("NB PDF TOOLS"),
    /** Yönetici bildirimleri ve iletişim formu için gelen kutusu adresi. */
    ADMIN_EMAIL: z.string().email(),
    /** İletişim formu POST /api/contact bildirimlerinin alıcısı (varsayılan: nbglobalstudio@gmail.com). */
    CONTACT_TO_EMAIL: z.string().email().default("nbglobalstudio@gmail.com"),
    /**
     * İlk sunucu açılışında isteğe bağlı hesap (ikisi de dolu olmalı). Rol e-postaya göre (yalnızca nbglobalstudio@gmail.com → ADMIN).
     */
    BOOTSTRAP_ADMIN_EMAIL: z.string().optional().default(""),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().optional().default(""),
    /** Web "Google ile devam et" OAuth; boş bırakılırsa Google girişi devre dışı kalır. */
    GOOGLE_CLIENT_ID: z.string().optional().default(""),
    GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
    /** Günlük dosyası yolu (göreli veya mutlak); üst dizin başlangıçta oluşturulur. */
    LOG_FILE_PATH: z.string().min(1).default("logs/nb-pdf-tools-api.log"),
    LOG_FILE_ENABLED: z.enum(["true", "false"]).optional().default("true"),
    /** Dakikada çoğu /api yolu için IP başına üst sınır (SPA eşzamanlı istekleri için 60 önerilir; /auth/preferences ayrı kota). */
    API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
    /** Aynı IP tekrarlı rate limit ihlalinde kaç kez sonra geçici blok (varsayılan 5). */
    API_ABUSE_THRESHOLD: z.coerce.number().int().positive().default(5),
    /** Tekrarlı kötüye kullanım sonrası IP blok süresi (dakika). */
    API_ABUSE_BLOCK_MINUTES: z.coerce.number().int().positive().default(60),
    /** Ters proxy arkasında doğru istemci IP için (örn. 1 veya sayı). Boş = güvenme. */
    TRUST_PROXY: z.string().optional().default(""),
    /** iyzico API (boşsa POST /api/payment/create 503 döner). */
    IYZICO_API_KEY: z.string().optional().default(""),
    IYZICO_SECRET_KEY: z.string().optional().default(""),
    /** Örn. https://sandbox-api.iyzipay.com veya üretim https://api.iyzipay.com */
    IYZICO_URI: z.string().optional().default(""),
    /** Sandbox / test alıcı T.C. kimlik no (11 hane). */
    IYZICO_BUYER_IDENTITY_NUMBER: z.string().length(11).optional().default("74300864791"),
    /** Alıcı GSM; iyzico formatı (+90...) */
    IYZICO_BUYER_GSM: z.string().min(5).optional().default("+905350000000"),
    /**
     * Üretimde ters proxy arkasında HTTP→HTTPS yönlendirmesi (X-Forwarded-Proto gerekir).
     * Doğrudan Node üzerinde TLS kullanıyorsanız genelde false bırakın; nginx/Caddy kullanımında true önerilir.
     */
    FORCE_HTTPS: z.enum(["true", "false"]).optional().default("false"),
    /** Doğrudan Node’da TLS için PEM yolları (ikisi de doluysa server.ts HTTPS dinler). */
    HTTPS_KEY_PATH: z.string().optional().default(""),
    HTTPS_CERT_PATH: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    const smtpOk = Boolean(data.SMTP_USER && data.SMTP_PASS);
    const emailOk = Boolean(data.EMAIL_USER && data.EMAIL_PASS);
    if (!smtpOk && !emailOk) {
      ctx.addIssue({
        code: "custom",
        message:
          "Set EMAIL_USER and EMAIL_PASS (recommended for Gmail) or both SMTP_USER and SMTP_PASS for Nodemailer.",
        path: ["EMAIL_USER"],
      });
    }
  });

const raw = rawEnvSchema.parse(process.env);

const smtpUser = raw.SMTP_USER ?? raw.EMAIL_USER;
const smtpPass = raw.SMTP_PASS ?? raw.EMAIL_PASS;
if (!smtpUser || !smtpPass) {
  throw new Error("Mail credentials missing after parse; check EMAIL_USER/EMAIL_PASS or SMTP_USER/SMTP_PASS.");
}

const smtpFromEmail = raw.SMTP_FROM_EMAIL ?? raw.EMAIL_USER ?? smtpUser;

const oauthRedirectOrigin = (raw.OAUTH_FRONTEND_REDIRECT_ORIGIN ?? raw.FRONTEND_ORIGIN).replace(/\/$/, "");

export const env = {
  ...raw,
  TRUST_PROXY: raw.TRUST_PROXY?.trim() ?? "",
  forceHttps: raw.FORCE_HTTPS === "true",
  HTTPS_KEY_PATH: raw.HTTPS_KEY_PATH?.trim() ?? "",
  HTTPS_CERT_PATH: raw.HTTPS_CERT_PATH?.trim() ?? "",
  iyzicoEnabled: Boolean(raw.IYZICO_API_KEY?.trim() && raw.IYZICO_SECRET_KEY?.trim() && raw.IYZICO_URI?.trim()),
  SMTP_USER: smtpUser,
  SMTP_PASS: smtpPass,
  SMTP_FROM_EMAIL: smtpFromEmail,
  GOOGLE_CLIENT_ID: raw.GOOGLE_CLIENT_ID?.trim() ?? "",
  GOOGLE_CLIENT_SECRET: raw.GOOGLE_CLIENT_SECRET?.trim() ?? "",
  LOG_FILE_ENABLED: raw.LOG_FILE_ENABLED === "true",
  BOOTSTRAP_ADMIN_EMAIL: raw.BOOTSTRAP_ADMIN_EMAIL?.trim() ?? "",
  BOOTSTRAP_ADMIN_PASSWORD: raw.BOOTSTRAP_ADMIN_PASSWORD ?? "",
  /** Google callback sonrası /login-success ve /login-error adreslerinin kökü */
  OAUTH_FRONTEND_REDIRECT_ORIGIN: oauthRedirectOrigin,
};
