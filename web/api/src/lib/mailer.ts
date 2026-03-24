import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logApiFailure } from "./app-logger.js";

// Ortam değişkenlerindeki SMTP ayarlarıyla Nodemailer taşıyıcısını oluşturur (Gmail veya özel sunucu).
// Doğrulama e-postası, iletişim formu ve bildirimlerin tek gönderim kanalıdır.
// Kimlik bilgileri veya host/port yanlış olursa tüm e-posta akışı çalışmaz; hatalar app-logger üzerinden kaydedilir.
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
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
