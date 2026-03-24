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
     * İlk sunucu açılışında tek seferlik ADMIN oluşturmak için (ikisi de dolu olmalı).
     * Boş bırakılırsa varsayılan yönetici oluşturulmaz.
     */
    BOOTSTRAP_ADMIN_EMAIL: z.string().optional().default(""),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().optional().default(""),
    /** Web "Google ile devam et" OAuth; boş bırakılırsa Google girişi devre dışı kalır. */
    GOOGLE_CLIENT_ID: z.string().optional().default(""),
    GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
    /** Günlük dosyası yolu (göreli veya mutlak); üst dizin başlangıçta oluşturulur. */
    LOG_FILE_PATH: z.string().min(1).default("logs/nb-pdf-tools-api.log"),
    LOG_FILE_ENABLED: z.enum(["true", "false"]).optional().default("true"),
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
