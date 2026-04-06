import {
  DEFAULT_PAYMENT_PRICES_TRY,
  getResolvedPackagesConfig,
  invalidatePaymentPricesCache as invalidatePackagesPricesCache,
  putPaymentPricesTry as putPackagesPaymentPricesTry,
} from "../../lib/packages-config.service.js";

export { DEFAULT_PAYMENT_PRICES_TRY };

export type PaymentPricesTry = Record<"PRO" | "BUSINESS" | "PRO_ANNUAL", string>;

export async function getPaymentPricesTry(): Promise<PaymentPricesTry> {
  const { prices } = await getResolvedPackagesConfig();
  return prices;
}

export function invalidatePaymentPricesCache() {
  invalidatePackagesPricesCache();
}

export async function putPaymentPricesTry(prices: Record<"PRO" | "BUSINESS", string>) {
  await putPackagesPaymentPricesTry(prices);
}
