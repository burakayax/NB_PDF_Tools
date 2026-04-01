import crypto from "node:crypto";
import type { Language } from "@prisma/client";
import { HttpError } from "../../lib/http-error.js";
import { signPasswordResetJwt, verifyPasswordResetJwt } from "../../lib/jwt.js";
import { sendMail } from "../../lib/mailer.js";
import { hashPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { hashToken } from "../../lib/token.js";
import { normalizeEmailForStorage } from "../../lib/email-identity-normalize.js";
import { createPasswordResetCodeEmailTemplate } from "./auth.email.js";
import { strongNewPasswordField } from "./auth.schema.js";

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CODES_PER_HOUR = 5;

function genericSuccessMessage(lang: Language): string {
  return lang === "tr"
    ? "Bu e-posta ile kayıtlı bir hesap varsa, kısa süre içinde şifre sıfırlama kodu gönderildi."
    : "If an account exists for this email, we sent a password reset code shortly.";
}

export async function requestPasswordResetCode(email: string, preferredLanguage: Language): Promise<{ message: string }> {
  const normalized = normalizeEmailForStorage(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  if (!user?.passwordHash || user.authProvider !== "local") {
    return { message: genericSuccessMessage(preferredLanguage) };
  }

  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.passwordResetCode.count({
    where: { userId: user.id, createdAt: { gte: since } },
  });
  if (recentCount >= MAX_CODES_PER_HOUR) {
    return { message: genericSuccessMessage(preferredLanguage) };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await prisma.$transaction([
    prisma.passwordResetCode.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.passwordResetCode.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt,
      },
    }),
  ]);

  const lang = user.preferredLanguage === "tr" ? "tr" : preferredLanguage === "tr" ? "tr" : "en";
  const tpl = createPasswordResetCodeEmailTemplate({ code, lang });

  try {
    await sendMail({
      to: user.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
  } catch {
    await prisma.passwordResetCode.deleteMany({
      where: { userId: user.id, codeHash, consumedAt: null },
    });
    throw new HttpError(503, "We could not send the email. Please try again later.");
  }

  return { message: genericSuccessMessage(preferredLanguage) };
}

export async function verifyPasswordResetCode(email: string, code: string): Promise<{ resetToken: string }> {
  const normalized = normalizeEmailForStorage(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  if (!user || !user.passwordHash || user.authProvider !== "local") {
    throw new HttpError(400, "Invalid or expired code.");
  }

  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) {
    throw new HttpError(400, "Invalid or expired code.");
  }

  const expectedHash = hashToken(digits);
  const record = await prisma.passwordResetCode.findFirst({
    where: {
      userId: user.id,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      codeHash: expectedHash,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    throw new HttpError(400, "Invalid or expired code.");
  }

  await prisma.passwordResetCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });

  const resetToken = signPasswordResetJwt(user.id);
  return { resetToken };
}

export async function completePasswordResetWithToken(resetToken: string, newPassword: string): Promise<void> {
  let userId: string;
  try {
    userId = verifyPasswordResetJwt(resetToken);
  } catch {
    throw new HttpError(401, "Reset session expired. Please start again from Forgot password.");
  }

  const parsed = strongNewPasswordField.safeParse(newPassword);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid password.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash || user.authProvider !== "local") {
    throw new HttpError(400, "This account cannot reset password here.");
  }

  const passwordHash = await hashPassword(parsed.data);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
    prisma.passwordResetCode.deleteMany({ where: { userId } }),
  ]);
}
