import { prisma } from "../../lib/prisma.js";

const SETTING_KEY = "payment.prices";

export const DEFAULT_PAYMENT_PRICES_TRY: Record<"PRO" | "BUSINESS", string> = {
  PRO: "200.00",
  BUSINESS: "400.00",
};

let cache: { t: number; v: Record<"PRO" | "BUSINESS", string> } | null = null;
const TTL_MS = 20_000;

function parsePriceToFixed2(raw: string): string {
  const n = Number.parseFloat(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 999_999.99) {
    throw new Error("Invalid price.");
  }
  return n.toFixed(2);
}

function mergeParsed(rowValue: string | null | undefined): Record<"PRO" | "BUSINESS", string> {
  const out = { ...DEFAULT_PAYMENT_PRICES_TRY };
  if (!rowValue?.trim()) {
    return out;
  }
  try {
    const p = JSON.parse(rowValue) as Record<string, unknown>;
    if (typeof p.PRO === "string") {
      out.PRO = parsePriceToFixed2(p.PRO);
    }
    if (typeof p.BUSINESS === "string") {
      out.BUSINESS = parsePriceToFixed2(p.BUSINESS);
    }
  } catch {
    /* keep defaults */
  }
  return out;
}

export async function getPaymentPricesTry(): Promise<Record<"PRO" | "BUSINESS", string>> {
  if (cache && Date.now() - cache.t < TTL_MS) {
    return cache.v;
  }
  const row = await prisma.siteSetting.findUnique({ where: { key: SETTING_KEY } });
  const v = mergeParsed(row?.value);
  cache = { t: Date.now(), v };
  return v;
}

export function invalidatePaymentPricesCache() {
  cache = null;
}

export async function putPaymentPricesTry(prices: Record<"PRO" | "BUSINESS", string>) {
  const payload = {
    PRO: parsePriceToFixed2(prices.PRO),
    BUSINESS: parsePriceToFixed2(prices.BUSINESS),
  };
  await prisma.siteSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(payload) },
    update: { value: JSON.stringify(payload) },
  });
  invalidatePaymentPricesCache();
}
