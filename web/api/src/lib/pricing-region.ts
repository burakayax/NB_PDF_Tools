import type { Request } from "express";

export type PricingRegion = "TR" | "INTL";

const TR_COUNTRY_CODES = new Set(["TR", "TUR"]);

/**
 * Best-effort region for pricing display. Prefer IP-derived country headers when present
 * (Cloudflare, Vercel, CloudFront); fall back to Accept-Language.
 */
export function inferPricingRegionFromRequest(request: Request): { pricingRegion: PricingRegion; country: string | null } {
  const h = request.headers;
  const candidates = [
    h["cf-ipcountry"],
    h["x-vercel-ip-country"],
    h["cloudfront-viewer-country"],
    h["x-appengine-country"],
    h["x-geo-country"],
  ]
    .map((v) => (typeof v === "string" ? v.trim().toUpperCase() : ""))
    .filter(Boolean);

  const country = candidates[0] ?? null;
  if (country && TR_COUNTRY_CODES.has(country)) {
    return { pricingRegion: "TR", country };
  }

  const al = String(h["accept-language"] ?? "").toLowerCase();
  if (al.includes("tr-tr") || al.startsWith("tr,") || al.includes(",tr,") || al.includes(",tr;q")) {
    return { pricingRegion: "TR", country };
  }

  return { pricingRegion: "INTL", country };
}
