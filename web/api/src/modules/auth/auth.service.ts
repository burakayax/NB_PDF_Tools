import type { AuthProvider, EmailVerificationToken, Language, Plan, User, UserRole } from "@prisma/client";
import { authLog } from "../../lib/auth-log.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt.js";
import { sendMail } from "../../lib/mailer.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { isAdminUser } from "../../lib/user-role.js";
import { ensureDesktopDeviceAccess } from "../device/device.service.js";
import { createSecureToken, hashToken } from "../../lib/token.js";
import { createAdminNotificationEmailTemplate, createVerificationEmailTemplate } from "./auth.email.js";
import type { AuthCredentialsInput } from "./auth.schema.js";

type PublicUser = {
  id: string;
  email: string;
  plan: Plan;
  role: UserRole;
  preferredLanguage: Language;
  isVerified: boolean;
  authProvider: AuthProvider;
  createdAt: string;
};

type EmailVerificationTokenWithUser = EmailVerificationToken & {
  user: User;
};

export type AuthSessionResult = {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
};

export type RegistrationResult = {
  message: string;
  verificationRequired: true;
  user: PublicUser;
};

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    role: user.role,
    preferredLanguage: user.preferredLanguage,
    isVerified: user.isVerified,
    authProvider: user.authProvider,
    createdAt: user.createdAt.toISOString(),
  };
}

async function createSession(user: User) {
  const payload = {
    sub: user.id,
    email: user.email,
    plan: user.plan,
    role: user.role,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const refreshTokenHash = hashToken(refreshToken);

  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      tokenHash: refreshTokenHash,
      expiresAt,
      userId: user.id,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: toPublicUser(user),
  };
}

function createVerificationUrl(token: string) {
  const verifyUrl = new URL("/verify-email", env.APP_BASE_URL);
  verifyUrl.searchParams.set("token", token);
  return verifyUrl.toString();
}

async function createEmailVerificationToken(userId: string) {
  const rawToken = createSecureToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

  await prisma.emailVerificationToken.create({
    data: {
      tokenHash,
      expiresAt,
      userId,
    },
  });

  return rawToken;
}

async function sendVerificationEmail(user: User, rawToken: string) {
  const verificationUrl = createVerificationUrl(rawToken);
  const emailTemplate = createVerificationEmailTemplate({
    verificationUrl,
    productName: "NB PDF TOOLS",
    expiresInHours: env.EMAIL_VERIFICATION_TTL_HOURS,
  });

  await sendMail({
    to: user.email,
    subject: emailTemplate.subject,
    html: emailTemplate.html,
    text: emailTemplate.text,
  });
}

async function sendAdminNotificationEmail(user: User) {
  const notificationTemplate = createAdminNotificationEmailTemplate({
    userEmail: user.email,
    registeredAt: user.createdAt.toISOString(),
    productName: "NB PDF TOOLS",
  });

  await sendMail({
    to: env.ADMIN_EMAIL,
    replyTo: user.email,
    subject: notificationTemplate.subject,
    html: notificationTemplate.html,
    text: notificationTemplate.text,
  });
}

function ensureVerificationTokenUsable(tokenRecord: EmailVerificationTokenWithUser | null): EmailVerificationTokenWithUser {
  if (!tokenRecord) {
    throw new HttpError(400, "Verification token is invalid.");
  }

  if (tokenRecord.usedAt) {
    throw new HttpError(400, "Verification token has already been used.");
  }

  if (tokenRecord.expiresAt < new Date()) {
    throw new HttpError(410, "Verification token has expired.");
  }

  return tokenRecord;
}

async function revokeRefreshToken(token: string) {
  const tokenHash = hashToken(token);

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function registerUser(input: AuthCredentialsInput & { preferredLanguage?: Language }): Promise<RegistrationResult> {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    authLog.warn("register rejected: email already exists", { email: input.email });
    throw new HttpError(409, "An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: "USER",
      isVerified: false,
      preferredLanguage: input.preferredLanguage ?? "en",
    },
  });

  authLog.info("register: user saved", {
    userId: user.id,
    email: user.email,
    isVerified: user.isVerified,
    preferredLanguage: user.preferredLanguage,
  });

  const rawToken = await createEmailVerificationToken(user.id);
  try {
    await sendVerificationEmail(user, rawToken);
  } catch (error) {
    authLog.error("register: verification email failed, rolling back user", {
      userId: user.id,
      email: user.email,
      error: String(error),
    });
    await prisma.user.delete({ where: { id: user.id } });
    throw new HttpError(503, "We could not send the verification email. Please try again later.");
  }

  try {
    await sendAdminNotificationEmail(user);
  } catch (error) {
    authLog.warn("register: admin notification email failed (user kept)", {
      userId: user.id,
      error: String(error),
    });
  }

  return {
    message: "Verification email sent. Please verify your email before signing in.",
    verificationRequired: true,
    user: toPublicUser(user),
  };
}

export async function loginUser(input: AuthCredentialsInput, deviceId?: string): Promise<AuthSessionResult> {
  authLog.info("login: attempt", { email: input.email, desktop: Boolean(deviceId) });

  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    authLog.warn("login failed: unknown email", { email: input.email });
    throw new HttpError(401, "Invalid email or password.");
  }

  if (!user.passwordHash) {
    authLog.warn("login failed: oauth-only account", { userId: user.id, email: input.email });
    throw new HttpError(401, "This account uses Google sign-in. Please use Continue with Google.");
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    authLog.warn("login failed: bad password", { userId: user.id, email: input.email });
    throw new HttpError(401, "Invalid email or password.");
  }

  if (!user.isVerified) {
    authLog.warn("login rejected: email not verified", { userId: user.id, email: input.email });
    throw new HttpError(403, "Please verify your email address before signing in.");
  }

  if (deviceId) {
    await ensureDesktopDeviceAccess(user.id, deviceId, true, {
      bypassDeviceLimit: isAdminUser(user),
    });
  }

  authLog.info("login: success", { userId: user.id, email: user.email });
  return createSession(user);
}

export async function refreshSession(refreshToken: string): Promise<AuthSessionResult> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, "Session refresh token is invalid.");
  }

  const storedToken = await prisma.refreshToken.findUnique({
    where: {
      tokenHash: hashToken(refreshToken),
    },
  });

  if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
    throw new HttpError(401, "Session refresh token has expired.");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user) {
    throw new HttpError(404, "User account could not be found.");
  }

  if (!user.isVerified) {
    throw new HttpError(403, "Please verify your email address before continuing.");
  }

  await revokeRefreshToken(refreshToken);

  return createSession(user);
}

export async function logoutUser(refreshToken: string | undefined) {
  if (!refreshToken) {
    return;
  }

  await revokeRefreshToken(refreshToken);
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new HttpError(404, "User account could not be found.");
  }

  return toPublicUser(user);
}

export async function updatePreferredLanguage(userId: string, preferredLanguage: Language) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { preferredLanguage },
  });

  return toPublicUser(user);
}

export async function signInWithGoogle(params: { email: string; preferredLanguage: Language }): Promise<AuthSessionResult> {
  const email = params.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    if (existing.authProvider !== "google") {
      authLog.warn("google oauth rejected: email registered locally", { email });
      throw new HttpError(
        409,
        "An account with this email already exists. Sign in with your email and password, or use a different Google account.",
      );
    }

    let user = existing;
    if (!user.isVerified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true, verifiedAt: new Date() },
      });
    }

    authLog.info("google login: success", { userId: user.id, email: user.email });
    return createSession(user);
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      authProvider: "google",
      role: "USER",
      isVerified: true,
      verifiedAt: new Date(),
      preferredLanguage: params.preferredLanguage,
    },
  });

  authLog.info("google register: user created", { userId: user.id, email: user.email });

  try {
    await sendAdminNotificationEmail(user);
  } catch (error) {
    authLog.warn("google register: admin notification email failed (user kept)", {
      userId: user.id,
      error: String(error),
    });
  }

  return createSession(user);
}

export async function verifyEmailToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const tokenRecord = ensureVerificationTokenUsable(
    await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    }),
  );

  if (tokenRecord.user.isVerified) {
    throw new HttpError(400, "Email address is already verified.");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: tokenRecord.userId },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
    }),
    prisma.emailVerificationToken.update({
      where: { id: tokenRecord.id },
      data: {
        usedAt: new Date(),
      },
    }),
  ]);

  return {
    message: "Your email address has been verified successfully.",
    email: tokenRecord.user.email,
  };
}
