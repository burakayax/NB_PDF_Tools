import { getSaasApiBase } from "./saasBase";

async function ensureOk(response: Response, defaultMessage: string) {
  if (response.ok) {
    return;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message || defaultMessage);
  }
  const text = await response.text();
  throw new Error(text || defaultMessage);
}

export type PaidPlan = "PRO" | "BUSINESS";

export type PaymentBilling = "monthly" | "annual";

export type CreatePaymentResponse = {
  token: string;
  checkoutFormContent: string;
  paymentPageUrl?: string;
  conversationId: string;
};

/** iyzico ödeme oturumu başlatır (JWT gerekli). */
export async function createPaymentCheckout(
  accessToken: string,
  plan: PaidPlan,
  billing: PaymentBilling = "monthly",
): Promise<CreatePaymentResponse> {
  const body: { plan: PaidPlan; billing?: PaymentBilling } = { plan };
  if (plan === "PRO") {
    body.billing = billing;
  }
  const response = await fetch(`${getSaasApiBase()}/api/payment/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  await ensureOk(response, "Payment could not be started.");
  return response.json() as Promise<CreatePaymentResponse>;
}
