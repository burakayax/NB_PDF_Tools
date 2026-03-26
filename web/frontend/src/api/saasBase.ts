/**
 * Kimlik ve SaaS API (Express, varsayılan :4000) kök adresi.
 * - Geliştirmede `http://localhost:4000` / `127.0.0.1:4000` gibi yerel adresler yok sayılır → göreli `/api/...` (Vite proxy).
 *   Aksi halde tarayıcı doğrudan :4000’e gider; UI API’den önce açılınca sıkça ERR_CONNECTION_REFUSED olur.
 * - Uzak veya özel adres (ör. staging URL) geliştirmede de kullanılır.
 * - Üretimde boşsa `http://localhost:4000`.
 */
function isLocalhostSaasDevUrl(trimmed: string): boolean {
  try {
    const u = new URL(trimmed);
    const h = u.hostname;
    if (h !== "localhost" && h !== "127.0.0.1") {
      return false;
    }
    const p = u.port;
    return p === "" || p === "4000";
  } catch {
    return false;
  }
}

export function getSaasApiBase(): string {
  const raw = import.meta.env.VITE_SAAS_API_BASE;
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  if (import.meta.env.DEV && (trimmed === "" || isLocalhostSaasDevUrl(trimmed))) {
    return "";
  }

  if (trimmed !== "") {
    return trimmed.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "";
  }
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    const p = window.location.port;
    if ((h === "localhost" || h === "127.0.0.1") && p === "4173") {
      return "";
    }
  }
  return "http://localhost:4000";
}
