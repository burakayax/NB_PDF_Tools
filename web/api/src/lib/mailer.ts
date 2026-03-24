import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logApiFailure } from "./app-logger.js";

/**
 * Gmail (ve uyumlu SMTP) için Nodemailer taşıyıcısı.
 *
 * Kimlik: `EMAIL_USER` + `EMAIL_PASS` veya `SMTP_USER` + `SMTP_PASS` (env.ts birleştirir).
 * Gmail’de `EMAIL_PASS` mutlaka hesap şifresi değil, Google hesabında oluşturulan
 * 16 karakterlik Uygulama Şifresi olmalıdır (2 adımlı doğrulama açık → App passwords).
 *
 * Önerilen Gmail ayarı: host smtp.gmail.com, port 587, secure false (STARTTLS).
 */
const useStartTls = env.SMTP_PORT === 587 && !env.SMTP_SECURE;

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  ...(useStartTls ? { requireTLS: true } : {}),
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** İsteğe bağlı Yanıtla adresi (ör. iletişim formunu gönderen kişi). */
  replyTo?: string;
};

export async function sendMail(input: SendMailInput) {
  try {
    await transporter.sendMail({
      from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
      to: input.to,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  } catch (error) {
    logApiFailure({
      service: "smtp",
      operation: "send_mail",
      message: error instanceof Error ? error.message : String(error),
      detail: error instanceof Error && "response" in error ? String((error as { response?: string }).response).slice(0, 500) : undefined,
    });
    throw error;
  }
}
