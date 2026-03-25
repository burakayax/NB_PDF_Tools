import type { AuthUser } from "../../api/auth";
import type { Language } from "../../i18n/landing";

/**
 * Navbar ve üst bar: yalnızca Ad Soyad (first/last veya tam ad).
 * E-posta veya e-posta öneki asla gösterilmez.
 */
export function userDisplayName(user: AuthUser | null): string {
  if (!user) {
    return "Kullanıcı";
  }
  const fromParts = [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(" ").trim();
  if (fromParts) {
    return fromParts;
  }
  const trimmed = user.name?.trim();
  if (trimmed) {
    return trimmed;
  }
  return "Kullanıcı";
}

/** "Merhaba, Ahmet" / "Hello, Alex" — yalnızca ad, soyad yok. */
export function userGreetingLine(user: AuthUser | null, lang: Language): string {
  const first = userFirstNameOnly(user);
  return lang === "tr" ? `Merhaba, ${first}` : `Hello, ${first}`;
}

/** Üst menü: yalnızca ad (ad alanı veya tam adın ilk kelimesi). */
export function userFirstNameOnly(user: AuthUser | null): string {
  if (!user) {
    return "Kullanıcı";
  }
  const first = user.firstName?.trim();
  if (first) {
    return first;
  }
  const fromFull = user.name?.trim().split(/\s+/)[0];
  if (fromFull) {
    return fromFull;
  }
  return "Kullanıcı";
}

export function userInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  const one = parts[0] ?? "?";
  return one.slice(0, 2).toUpperCase();
}
