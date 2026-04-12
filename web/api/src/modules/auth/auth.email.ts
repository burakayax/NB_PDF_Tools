import { renderCorporateEmail } from "../../lib/email-layout.js";
import { escapeHtml } from "../../lib/email-html.js";
import { renderBrandedVerificationEmailHtml } from "./verification-email-branded.js";

type VerificationEmailTemplateInput = {
  verificationUrl: string;
  productName: string;
  expiresInHours: number;
};

type AdminNotificationEmailTemplateInput = {
  userEmail: string;
  registeredAt: string;
  productName: string;
};

export function createVerificationEmailTemplate({
  verificationUrl,
  productName,
  expiresInHours,
}: VerificationEmailTemplateInput) {
  const subject = "Email Doğrulama";
  const safeProduct = escapeHtml(productName);

  const html = renderBrandedVerificationEmailHtml(verificationUrl);

  const text = [
    "Email Doğrulama — NB PDF TOOLS",
    "",
    "Email Adresinizi Doğrulayın",
    "",
    "NB PDF TOOLS hesabınızı aktifleştirmek için aşağıdaki bağlantıyı tarayıcıda açın:",
    "",
    verificationUrl,
    "",
    `Bu bağlantı ${expiresInHours} saat içinde sona erer.`,
    "",
    "Bu işlemi siz yapmadıysanız bu emaili dikkate almayabilirsiniz.",
    `${safeProduct} © 2026`,
  ].join("\n");

  return {
    subject,
    html,
    text,
  };
}

export function createAdminNotificationEmailTemplate({
  userEmail,
  registeredAt,
  productName,
}: AdminNotificationEmailTemplateInput) {
  const subject = `New registration — ${productName}`;
  const safeEmail = escapeHtml(userEmail);
  const safeDate = escapeHtml(registeredAt);
  const safeProduct = escapeHtml(productName);

  const html = renderCorporateEmail({
    eyebrow: "Admin",
    title: "New user registered",
    intro: `A new account was created on ${safeProduct}. The user must verify their email before they can sign in.`,
    bodyHtml: `
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #334155;border-radius:20px;background:linear-gradient(180deg,#0f172a 0%,#0b1220 100%);padding:24px 26px;">
        <tbody>
          <tr>
            <td style="padding:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;">Email</td>
          </tr>
          <tr>
            <td style="padding:0 0 20px;font-size:17px;line-height:1.65;color:#f8fafc;border-bottom:1px solid #1e293b;">${safeEmail}</td>
          </tr>
          <tr>
            <td style="padding:18px 0 8px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;">Registered at</td>
          </tr>
          <tr>
            <td style="padding:0;font-size:15px;line-height:1.65;color:#cbd5e1;">${safeDate}</td>
          </tr>
        </tbody>
      </table>
    `,
    footerText: `This notification was sent to the configured administrator for ${safeProduct}.`,
    productName: safeProduct,
  });

  const text = [
    `New user registered — ${productName}`,
    "",
    `Email: ${userEmail}`,
    `Registered at: ${registeredAt}`,
  ].join("\n");

  return {
    subject,
    html,
    text,
  };
}

type PasswordResetCodeEmailInput = {
  code: string;
  lang: "tr" | "en";
};

export function createPasswordResetCodeEmailTemplate({ code, lang }: PasswordResetCodeEmailInput) {
  const safeCode = escapeHtml(code);
  const subject =
    lang === "tr" ? "NB PDF TOOLS — Şifre sıfırlama kodunuz" : "NB PDF TOOLS — Your password reset code";

  const title = lang === "tr" ? "Şifre sıfırlama kodu" : "Password reset code";
  const intro =
    lang === "tr"
      ? "Hesabınız için tek kullanımlık doğrulama kodunuz aşağıdadır. Kodu kimseyle paylaşmayın."
      : "Your one-time verification code is below. Do not share this code with anyone.";

  const html = renderCorporateEmail({
    eyebrow: lang === "tr" ? "Güvenlik" : "Security",
    title,
    intro,
    bodyHtml: `
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #334155;border-radius:20px;background:linear-gradient(180deg,#0f172a 0%,#0b1220 100%);padding:28px 24px;">
        <tbody>
          <tr>
            <td style="text-align:center;font-size:32px;font-weight:800;letter-spacing:0.35em;color:#38bdf8;font-family:ui-monospace,monospace;">${safeCode}</td>
          </tr>
        </tbody>
      </table>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#94a3b8;">
        ${lang === "tr" ? "Bu kod 15 dakika geçerlidir. İsteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz." : "This code expires in 15 minutes. If you did not request a reset, you can ignore this email."}
      </p>
    `,
    footerText: "NB PDF TOOLS — NB Global Studio",
    productName: "NB PDF TOOLS",
  });

  const text =
    lang === "tr"
      ? [
          "NB PDF TOOLS — Şifre sıfırlama",
          "",
          `Kodunuz: ${code}`,
          "",
          "Bu kod 15 dakika geçerlidir.",
          "İsteği siz yapmadıysanız bu e-postayı yok sayın.",
        ].join("\n")
      : [
          "NB PDF TOOLS — Password reset",
          "",
          `Your code: ${code}`,
          "",
          "This code expires in 15 minutes.",
          "If you did not request this, ignore this email.",
        ].join("\n");

  return { subject, html, text };
}
