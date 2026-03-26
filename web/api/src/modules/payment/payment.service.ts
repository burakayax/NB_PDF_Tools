import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { logSuspiciousActivity } from "../../lib/app-logger.js";
import { prisma } from "../../lib/prisma.js";
import IyzipayImport from "iyzipay";
import iyziUtilsImport from "iyzipay/lib/utils.js";

/** iyzipay CommonJS; ESM’de default import (Node 24 + require() ile ESM karışımı ERR_AMBIGUOUS_MODULE_SYNTAX verir). */
type IyzipayCtor = {
  new (o: { apiKey: string; secretKey: string; uri: string }): {
    checkoutFormInitialize: {
      create: (req: Record<string, unknown>, cb: (err: Error | null, result: IyzicoInitResult) => void) => void;
    };
    checkoutForm: {
      retrieve: (req: Record<string, unknown>, cb: (err: Error | null, result: IyzicoRetrieveResult) => void) => void;
    };
  };
  LOCALE: { TR: string; EN: string };
  CURRENCY: { TRY: string };
  PAYMENT_GROUP: { PRODUCT: string };
  BASKET_ITEM_TYPE: { VIRTUAL: string };
};

const Iyzipay = IyzipayImport as unknown as IyzipayCtor;
const iyziUtils = iyziUtilsImport as {
  calculateHmacSHA256Signature: (params: string[], secretKey: string) => string;
};

const PLAN_PRICES_TRY: Record<"PRO" | "BUSINESS", string> = {
  PRO: "200.00",
  BUSINESS: "400.00",
};

const SUBSCRIPTION_DAYS = 30;

function getIyzipay() {
  if (!env.iyzicoEnabled) {
    throw new HttpError(503, "Payment service is not configured.");
  }
  return new Iyzipay({
    apiKey: env.IYZICO_API_KEY,
    secretKey: env.IYZICO_SECRET_KEY,
    uri: env.IYZICO_URI.trim(),
  });
}

type IyzicoInitResult = {
  status: string;
  errorCode?: string;
  errorMessage?: string;
  errorGroup?: string;
  conversationId?: string;
  token?: string;
  signature?: string;
  checkoutFormContent?: string;
  paymentPageUrl?: string;
};

type IyzicoRetrieveResult = {
  status: string;
  errorCode?: string;
  errorMessage?: string;
  paymentStatus?: string;
  paymentId?: string;
  currency?: string;
  basketId?: string;
  conversationId?: string;
  paidPrice?: string;
  price?: string;
  token?: string;
  signature?: string;
  fraudStatus?: number;
};

function verifyInitSignature(conversationId: string, token: string, signature: string | undefined, secretKey: string) {
  if (!signature) {
    throw new HttpError(502, "Missing payment provider signature.");
  }
  const calculated = iyziUtils.calculateHmacSHA256Signature([conversationId, token], secretKey);
  if (calculated !== signature) {
    logSuspiciousActivity({
      type: "iyzico_signature_mismatch",
      detail: "checkoutFormInitialize",
    });
    throw new HttpError(502, "Payment response could not be verified.");
  }
}

function verifyRetrieveSignature(result: IyzicoRetrieveResult, secretKey: string) {
  const {
    paymentStatus,
    paymentId,
    currency,
    basketId,
    conversationId,
    paidPrice,
    price,
    token,
    signature,
  } = result;
  const paymentStatusStr = String(paymentStatus ?? "");
  const paymentIdStr = String(paymentId ?? "");
  const currencyStr = String(currency ?? "");
  const basketIdStr = String(basketId ?? "");
  const conversationIdStr = String(conversationId ?? "");
  const paidPriceStr = String(paidPrice ?? "");
  const priceStr = String(price ?? "");
  const tokenStr = String(token ?? "");
  if (!signature) {
    throw new HttpError(502, "Missing payment provider signature.");
  }
  const calculated = iyziUtils.calculateHmacSHA256Signature(
    [paymentStatusStr, paymentIdStr, currencyStr, basketIdStr, conversationIdStr, paidPriceStr, priceStr, tokenStr],
    secretKey,
  );
  if (calculated !== signature) {
    logSuspiciousActivity({
      type: "iyzico_signature_mismatch",
      detail: "checkoutForm.retrieve",
    });
    throw new HttpError(502, "Payment result could not be verified.");
  }
}

function splitBuyerName(user: User): { name: string; surname: string } {
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  if (first && last) {
    return { name: first, surname: last };
  }
  const full = user.name?.trim() || user.email.split("@")[0] || "User";
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { name: parts[0]!, surname: parts.slice(1).join(" ") };
  }
  return { name: full, surname: "User" };
}

function promisifyInit(
  iyzipay: ReturnType<typeof getIyzipay>,
  request: Record<string, unknown>,
): Promise<IyzicoInitResult> {
  return new Promise((resolve, reject) => {
    iyzipay.checkoutFormInitialize.create(request, (err: Error | null, result: IyzicoInitResult) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });
  });
}

function promisifyRetrieve(iyzipay: ReturnType<typeof getIyzipay>, request: Record<string, unknown>): Promise<IyzicoRetrieveResult> {
  return new Promise((resolve, reject) => {
    iyzipay.checkoutForm.retrieve(request, (err: Error | null, result: IyzicoRetrieveResult) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });
  });
}

export async function createPaymentCheckoutSession(params: {
  userId: string;
  plan: "PRO" | "BUSINESS";
  clientIp: string;
}): Promise<{
  token: string;
  checkoutFormContent: string;
  paymentPageUrl?: string;
  conversationId: string;
}> {
  const price = PLAN_PRICES_TRY[params.plan];
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
  });

  if (!user) {
    throw new HttpError(404, "User account could not be found.");
  }

  if (!user.isVerified) {
    throw new HttpError(403, "Please verify your email before purchasing a subscription.");
  }

  const conversationId = randomUUID();
  const basketId = `nbpdf-${params.plan.toLowerCase()}-${conversationId.slice(0, 8)}`;
  const { name, surname } = splitBuyerName(user);
  const fmtIyziDate = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
  const callbackBase = env.APP_BASE_URL.replace(/\/$/, "");
  const callbackUrl = `${callbackBase}/api/payment/callback`;

  await prisma.paymentCheckout.create({
    data: {
      conversationId,
      userId: user.id,
      plan: params.plan,
      status: "pending",
      priceTry: price,
    },
  });

  const iyzipay = getIyzipay();
  const buyerId = user.id.slice(0, 20);

  const request = {
    locale: Iyzipay.LOCALE.TR,
    conversationId,
    price,
    paidPrice: price,
    currency: Iyzipay.CURRENCY.TRY,
    basketId,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: buyerId,
      name,
      surname,
      gsmNumber: env.IYZICO_BUYER_GSM,
      email: user.email,
      identityNumber: env.IYZICO_BUYER_IDENTITY_NUMBER,
      lastLoginDate: fmtIyziDate(new Date()),
      registrationDate: fmtIyziDate(user.createdAt),
      registrationAddress: "Turkey",
      ip: params.clientIp || "127.0.0.1",
      city: "Istanbul",
      country: "Turkey",
      zipCode: "34000",
    },
    shippingAddress: {
      contactName: `${name} ${surname}`,
      city: "Istanbul",
      country: "Turkey",
      address: "Dijital ürün teslimatı — adres gerekmez.",
      zipCode: "34000",
    },
    billingAddress: {
      contactName: `${name} ${surname}`,
      city: "Istanbul",
      country: "Turkey",
      address: "Dijital ürün teslimatı — adres gerekmez.",
      zipCode: "34000",
    },
    basketItems: [
      {
        id: params.plan,
        name: params.plan === "PRO" ? "NB PDF TOOLS PRO (1 ay)" : "NB PDF TOOLS BUSINESS (1 ay)",
        category1: "Subscription",
        category2: "Software",
        itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
        price,
      },
    ],
  };

  let result: IyzicoInitResult;
  try {
    result = await promisifyInit(iyzipay, request);
  } catch (e) {
    await prisma.paymentCheckout.updateMany({
      where: { conversationId, status: "pending" },
      data: { status: "failed" },
    });
    throw e instanceof HttpError ? e : new HttpError(502, "Payment provider request failed.");
  }

  if (result.status !== "success" || !result.token || !result.conversationId) {
    await prisma.paymentCheckout.updateMany({
      where: { conversationId, status: "pending" },
      data: { status: "failed" },
    });
    throw new HttpError(
      502,
      result.errorMessage ?? "Could not start payment session.",
    );
  }

  verifyInitSignature(result.conversationId, result.token, result.signature, env.IYZICO_SECRET_KEY);

  return {
    token: result.token,
    checkoutFormContent: result.checkoutFormContent ?? "",
    paymentPageUrl: result.paymentPageUrl,
    conversationId: result.conversationId,
  };
}

function buildRedirectHtml(success: boolean): string {
  const target = new URL("/", env.FRONTEND_ORIGIN);
  target.searchParams.set("payment", success ? "success" : "failed");
  const url = target.toString();
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ödeme</title>
</head>
<body>
  <p>Yönlendiriliyorsunuz…</p>
  <script>location.replace(${JSON.stringify(url)});</script>
</body>
</html>`;
}

/**
 * iyzico callback: token ile ödeme sonucunu çeker, imzayı doğrular, başarılıysa planı 30 gün uzatır.
 */
export async function processPaymentCallback(token: string): Promise<string> {
  if (!token?.trim()) {
    return buildRedirectHtml(false);
  }

  if (!env.iyzicoEnabled) {
    return buildRedirectHtml(false);
  }

  const iyzipay = getIyzipay();
  let result: IyzicoRetrieveResult;
  try {
    result = await promisifyRetrieve(iyzipay, {
      locale: Iyzipay.LOCALE.TR,
      token: token.trim(),
    });
  } catch {
    return buildRedirectHtml(false);
  }

  if (result.status !== "success") {
    return buildRedirectHtml(false);
  }

  verifyRetrieveSignature(result, env.IYZICO_SECRET_KEY);

  if (result.paymentStatus !== "SUCCESS") {
    return buildRedirectHtml(false);
  }

  const conversationId = result.conversationId;
  if (!conversationId) {
    return buildRedirectHtml(false);
  }

  const pending = await prisma.paymentCheckout.findUnique({
    where: { conversationId: String(conversationId) },
  });

  if (!pending) {
    logSuspiciousActivity({
      type: "iyzico_unknown_conversation",
      detail: conversationId,
    });
    return buildRedirectHtml(false);
  }

  if (pending.status === "completed") {
    return buildRedirectHtml(true);
  }

  const expectedPrice = PLAN_PRICES_TRY[pending.plan as "PRO" | "BUSINESS"];
  if (result.paidPrice != null && String(result.paidPrice) !== expectedPrice) {
    logSuspiciousActivity({
      type: "iyzico_price_mismatch",
      detail: `expected=${expectedPrice} got=${String(result.paidPrice)}`,
    });
    return buildRedirectHtml(false);
  }

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + SUBSCRIPTION_DAYS);

  await prisma.$transaction(async (tx) => {
    const current = await tx.paymentCheckout.findUnique({
      where: { conversationId },
    });
    if (!current || current.status === "completed") {
      return;
    }

    await tx.user.update({
      where: { id: current.userId },
      data: {
        plan: current.plan,
        subscriptionExpiry: expiry,
      },
    });

    await tx.paymentCheckout.update({
      where: { conversationId },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });
  });

  return buildRedirectHtml(true);
}
