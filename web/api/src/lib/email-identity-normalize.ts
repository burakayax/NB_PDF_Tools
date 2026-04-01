/**
 * Gmail / Googlemail için Google ile aynı posta kutusuna giden adresleri tek kimlikte birleştirir:
 * - Yerel kısımdaki noktalar kaldırılır (a.bc === abc)
 * - + etiketi ve sonrası atılır
 * - googlemail.com → gmail.com
 *
 * Diğer sağlayıcılar: yalnızca trim + küçük harf.
 * Kayıt / giriş / OAuth / şifre sıfırlamada kullanılmalı; günlük kota suistimalini azaltır.
 */

const GMAIL_FAMILY = new Set(["gmail.com", "googlemail.com"]);

export function normalizeEmailForStorage(email: string): string {
  const raw = email.trim();
  const at = raw.lastIndexOf("@");
  if (at <= 0 || at === raw.length - 1) {
    throw new Error("Invalid email address.");
  }
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1).toLowerCase().trim();
  const localLower = local.toLowerCase().trim();
  if (!localLower || !domain) {
    throw new Error("Invalid email address.");
  }

  if (GMAIL_FAMILY.has(domain)) {
    let localPart = localLower.replace(/\./g, "");
    const plusIdx = localPart.indexOf("+");
    if (plusIdx >= 0) {
      localPart = localPart.slice(0, plusIdx);
    }
    localPart = localPart.trim();
    if (!localPart) {
      throw new Error("Invalid Gmail local part.");
    }
    return `${localPart}@gmail.com`;
  }

  return `${localLower}@${domain}`;
}

/** Geçersiz girişte boş döndürme yerine güvenli geri dönüş (log / isteğe bağlı). */
export function tryNormalizeEmailForStorage(email: string): string | null {
  try {
    return normalizeEmailForStorage(email);
  } catch {
    return null;
  }
}
