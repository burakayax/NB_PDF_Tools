type CorporateEmailLayoutInput = {
  eyebrow: string;
  title: string;
  intro: string;
  bodyHtml: string;
  footerText: string;
  productName: string;
};

export function renderCorporateEmail({
  eyebrow,
  title,
  intro,
  bodyHtml,
  footerText,
  productName,
}: CorporateEmailLayoutInput) {
  return `
  <div style="margin:0;padding:32px 16px;background:#0f172a;font-family:Arial,Helvetica,sans-serif;color:#e2e8f0;">
    <div style="max-width:640px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:24px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.35);">
      <div style="padding:32px 32px 20px;border-bottom:1px solid #1f2937;background:linear-gradient(180deg,#111827 0%,#0b1220 100%);">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:16px;border:1px dashed #38bdf8;background:rgba(56,189,248,0.08);color:#7dd3fc;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
            Logo
          </div>
          <div>
            <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;color:#7dd3fc;text-transform:uppercase;">${productName}</div>
            <div style="margin-top:4px;font-size:12px;font-weight:700;letter-spacing:0.12em;color:#94a3b8;text-transform:uppercase;">${eyebrow}</div>
          </div>
        </div>
        <h1 style="margin:22px 0 0;font-size:28px;line-height:1.2;color:#f8fafc;">${title}</h1>
        <p style="margin:14px 0 0;font-size:16px;line-height:1.75;color:#cbd5e1;">${intro}</p>
      </div>
      <div style="padding:32px;">
        ${bodyHtml}
      </div>
      <div style="padding:20px 32px;border-top:1px solid #1f2937;background:#0f172a;color:#94a3b8;font-size:13px;line-height:1.8;">
        <div style="font-weight:700;color:#cbd5e1;">NB Global Studio</div>
        <div style="margin-top:6px;">${footerText}</div>
      </div>
    </div>
  </div>`;
}
