import { renderCorporateEmail } from "../../lib/email-layout.js";
import { escapeHtml, escapeHtmlAttr } from "../../lib/email-html.js";

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
  const subject = `Verify your email for ${productName}`;
  const safeUrl = escapeHtmlAttr(verificationUrl);
  const safeProduct = escapeHtml(productName);

  const html = renderCorporateEmail({
    eyebrow: "Email Verification",
    title: "Verify your email address",
    intro: `Welcome to ${safeProduct}. Please confirm your email to activate your account and continue securely.`,
    bodyHtml: `
      <p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#cbd5e1;">
        Click the button below to verify your email address. For your security, this link will expire in ${expiresInHours} hours.
      </p>
      <div style="margin:28px 0;">
        <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:#38bdf8;color:#082f49;text-decoration:none;font-size:15px;font-weight:700;">
          Verify Email
        </a>
      </div>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.8;color:#94a3b8;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="margin:0;padding:14px 16px;border:1px solid #334155;border-radius:14px;background:#0f172a;word-break:break-all;font-size:13px;line-height:1.8;color:#e2e8f0;">
        ${escapeHtml(verificationUrl)}
      </p>
    `,
    footerText: `This email was sent automatically by ${safeProduct}. If you did not create an account, you can safely ignore this message.`,
    productName: safeProduct,
  });

  const text = [
    `Verify your email for ${productName}`,
    "",
    `Please verify your email address to activate your account.`,
    `Verification link: ${verificationUrl}`,
    `This link expires in ${expiresInHours} hours.`,
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
