import { renderCorporateEmail } from "../../lib/email-layout.js";
import { escapeHtml } from "../../lib/email-html.js";

type ContactEmailTemplateInput = {
  name: string;
  email: string;
  message: string;
  submittedAt: string;
  productName: string;
};

function fieldBlock(label: string, value: string, options?: { preWrap?: boolean }) {
  const safe = escapeHtml(value);
  const wrap = options?.preWrap ? "white-space:pre-wrap;" : "";
  return `
      <tr>
        <td style="padding:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;">${escapeHtml(label)}</td>
      </tr>
      <tr>
        <td style="padding:0 0 22px;font-size:17px;line-height:1.65;color:#f8fafc;border-bottom:1px solid #1e293b;${wrap}">${safe}</td>
      </tr>`;
}

export function createContactEmailTemplate({
  name,
  email,
  message,
  submittedAt,
  productName,
}: ContactEmailTemplateInput) {
  const subject = `Contact: ${name.slice(0, 60)}${name.length > 60 ? "…" : ""}`;

  const html = renderCorporateEmail({
    eyebrow: "Contact form",
    title: "New contact message",
    intro: `Someone submitted the ${escapeHtml(productName)} contact form. Details below.`,
    bodyHtml: `
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #334155;border-radius:20px;background:linear-gradient(180deg,#0f172a 0%,#0b1220 100%);padding:24px 26px;">
        <tbody>
          ${fieldBlock("Name", name)}
          ${fieldBlock("Email", email)}
          ${fieldBlock("Message", message, { preWrap: true })}
          <tr>
            <td style="padding:16px 0 0;font-size:12px;color:#64748b;">Submitted: ${escapeHtml(submittedAt)}</td>
          </tr>
        </tbody>
      </table>
    `,
    footerText: `Reply directly to this email to reach ${escapeHtml(name)} at ${escapeHtml(email)}.`,
    productName: escapeHtml(productName),
  });

  const text = [
    "New contact message — NB PDF TOOLS",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Submitted: ${submittedAt}`,
    "",
    "Message:",
    message,
  ].join("\n");

  return {
    subject,
    html,
    text,
  };
}
