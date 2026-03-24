// Kullanıcı veya sistem metnini HTML e-posta gövdesinde güvenle göstermek için kaçışlar uygular.
// <script> veya özel karakterlerin şablonu bozmasını veya XSS riskini azaltır.
// Atlanırsa veya eksik kalırsa e-posta istemcilerinde biçim bozulması veya enjeksiyon riski artar.
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Çift tırnaklı HTML öznitelik değerleri için güvenli metin üretir (satır sonlarını sadeleştirir).
// Öznitelik içi tırnak kaçışı, gövde kaçışıyla birlikte tutarlı olmalıdır.
// Kullanılmazsa href veya title gibi alanlarda öznitelik sınırları kırılabilir.
export function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/\n/g, " ");
}
