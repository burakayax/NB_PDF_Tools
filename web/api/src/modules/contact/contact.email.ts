import { escapeHtml } from "../../lib/email-html.js";

type ContactEmailTemplateInput = {
  name: string;
  email: string;
  message: string;
};

/**
 * İletişim formu e-postası: konu ve düz metin gövdesi ürün gereksinimlerine göre sabit şablondur.
 * HTML sürümü aynı içeriği güvenli kaçışla sunar.
 */
export function createContactEmailTemplate({ name, email, message }: ContactEmailTemplateInput) {
  const subject = "Yeni İletişim Mesajı";

  const text = [`Ad: ${name}`, `Email: ${email}`, "", "Mesaj:", message].join("\n");

  const escaped = escapeHtml(text);
  const html = `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#0f172a;background:#f8fafc;">
  <pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:inherit;">${escaped}</pre>
</body>
</html>`;

  return {
    subject,
    html,
    text,
  };
}
