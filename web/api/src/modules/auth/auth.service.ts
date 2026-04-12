import type { AuthProvider, EmailVerificationToken, Language, Plan, User, UserRole } from "@prisma/client";
import { isEmailBlocked } from "../../lib/blocked-email.js";
import { authLog } from "../../lib/auth-log.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt.js";
import { sendMail } from "../../lib/mailer.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { resolveRoleFromEmail } from "../../lib/role-policy.js";
import { isAdminUser } from "../../lib/user-role.js";
import { ensureDesktopDeviceAccess } from "../device/device.service.js";
import { normalizeEmailForStorage } from "../../lib/email-identity-normalize.js";
import { createUrlSafeToken, hashToken } from "../../lib/token.js";
import { createAdminNotificationEmailTemplate, createVerificationEmailTemplate } from "./auth.email.js";
import type { AuthCredentialsInput, ChangePasswordInput, RegisterInput, UpdateProfileInput } from "./auth.schema.js";
import { GOOGLE_OAUTH_LOG, logGoogleOAuthJwtIssued, previewSecret } from "./google-oauth.console.js";

type PublicUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  avatar: string | null;
  plan: Plan;
  subscription_expiry: string | null;
  role: UserRole;
  preferredLanguage: Language;
  isVerified: boolean;
  authProvider: AuthProvider;
  /** False when the account has no bcrypt password (e.g. Google-only). */
  hasPassword: boolean;
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

/** DB rolü ile e-posta politikası uyumsuzsa günceller (JWT oturumu doğru role ile üretilir). */
async function syncUserRoleFromEmail(user: User): Promise<User> {
  const expected = resolveRoleFromEmail(user.email);
  if (user.role === expected) {
    return user;
  }
  authLog.info("user role synced to email policy", { userId: user.id, from: user.role, to: expected });
  return prisma.user.update({
    where: { id: user.id },
    data: { role: expected },
  });
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name,
    avatar: user.avatar,
    plan: user.plan,
    subscription_expiry: user.subscriptionExpiry ? user.subscriptionExpiry.toISOString() : null,
    role: user.role,
    preferredLanguage: user.preferredLanguage,
    isVerified: user.isVerified,
    authProvider: user.authProvider,
    hasPassword: Boolean(user.passwordHash),
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

function logGoogleOAuthSessionIssued(session: AuthSessionResult, flow: "google-login" | "google-register") {
  logGoogleOAuthJwtIssued({
    userId: session.user.id,
    email: session.user.email,
    accessTokenPreview: previewSecret(session.accessToken, 24),
    accessTokenLength: session.accessToken.length,
    refreshTokenPreview: previewSecret(session.refreshToken, 24),
    refreshTokenLength: session.refreshToken.length,
  });
  console.log(`${GOOGLE_OAUTH_LOG} session ready`, {
    flow,
    userId: session.user.id,
    email: session.user.email,
    plan: session.user.plan,
    role: session.user.role,
  });
}

/** E-postadaki tıklanabilir bağlantı: {APP_BASE_URL}/api/auth/verify-email?token=... */
export function buildEmailVerificationLink(rawToken: string) {
  const verifyUrl = new URL("/api/auth/verify-email", env.APP_BASE_URL.replace(/\/$/, ""));
  verifyUrl.searchParams.set("token", rawToken);
  return verifyUrl.toString();
}

async function createEmailVerificationToken(userId: string) {
  const rawToken = createUrlSafeToken(32);
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
  const verificationUrl = buildEmailVerificationLink(rawToken);
  const emailTemplate = createVerificationEmailTemplate({
    verificationUrl,
    productName: "NB PDF PLARTFORM",
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
    productName: "NB PDF PLARTFORM",
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

export async function registerUser(input: RegisterInput): Promise<RegistrationResult> {
  if (await isEmailBlocked(input.email)) {
    authLog.warn("register rejected: email blocked", { email: input.email });
    throw new HttpError(403, "This email address cannot be used to create an account.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    authLog.warn("register rejected: email already exists", { email: input.email });
    throw new HttpError(409, "An account with this email already exists.");
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const displayName = `${firstName} ${lastName}`.trim() || null;

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      firstName,
      lastName,
      name: displayName,
      passwordHash,
      authProvider: "local",
      role: resolveRoleFromEmail(input.email),
      isVerified: false,
      preferredLanguage: input.preferredLanguage ?? "en",
    },
  });

  // İstenen teşhis çıktıları (kayıt ve e-posta akışı)
  console.log("User created");

  authLog.info("register: user saved", {
    userId: user.id,
    email: user.email,
    isVerified: user.isVerified,
    preferredLanguage: user.preferredLanguage,
  });

  const rawToken = await createEmailVerificationToken(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { verificationToken: rawToken },
  });

  console.log("Verification email sending...");
  try {
    await sendVerificationEmail(user, rawToken);
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Verification email failed — full error:", error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
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

  let user = await prisma.user.findUnique({
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

  user = await syncUserRoleFromEmail(user);

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

  let user = await prisma.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user) {
    throw new HttpError(404, "User account could not be found.");
  }

  if (!user.isVerified) {
    throw new HttpError(403, "Please verify your email address before continuing.");
  }

  user = await syncUserRoleFromEmail(user);

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
  let user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new HttpError(404, "User account could not be found.");
  }

  user = await syncUserRoleFromEmail(user);
  return toPublicUser(user);
}

export async function updatePreferredLanguage(userId: string, preferredLanguage: Language) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { preferredLanguage },
  });

  return toPublicUser(user);
}

export async function updateUserProfile(userId: string, input: UpdateProfileInput) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const displayName = `${firstName} ${lastName}`.trim() || null;

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      firstName,
      lastName,
      name: displayName,
    },
  });

  return toPublicUser(user);
}

export async function changeUserPassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new HttpError(404, "User account could not be found.");
  }

  if (!user.passwordHash) {
    throw new HttpError(
      400,
      "This account does not use a password. Use Google sign-in or contact support if you need access.",
    );
  }

  const currentMatches = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!currentMatches) {
    authLog.warn("password change rejected: wrong current password", { userId: user.id });
    throw new HttpError(401, "Current password is incorrect.");
  }

  if (input.currentPassword === input.newPassword) {
    authLog.warn("password change rejected: new password same as current", { userId: user.id });
    throw new HttpError(400, "New password must be different from your current password.");
  }

  const passwordHash = await hashPassword(input.newPassword);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  authLog.info("security_event", {
    event: "password_changed",
    userId: updated.id,
    email: updated.email,
  });
  return toPublicUser(updated);
}

export async function setInitialPasswordForUser(userId: string, newPassword: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new HttpError(404, "User account could not be found.");
  }

  if (user.passwordHash) {
    throw new HttpError(400, "A password is already set for this account. Use change password instead.");
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  authLog.info("security_event", {
    event: "initial_password_set",
    userId: updated.id,
    email: updated.email,
  });
  return toPublicUser(updated);
}

export async function signInWithGoogle(params: {
  email: string;
  googleId: string;
  name: string | null;
  avatar: string | null;
  preferredLanguage: Language;
}): Promise<AuthSessionResult> {
  const email = normalizeEmailForStorage(params.email);
  const googleId = params.googleId.trim();
  console.log(`${GOOGLE_OAUTH_LOG} signInWithGoogle: lookup`, { email, name: params.name ?? null, googleId });

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    if (existing.authProvider !== "google") {
      console.error(`${GOOGLE_OAUTH_LOG} signInWithGoogle ERROR: email already used by local account`, {
        email,
        existingAuthProvider: existing.authProvider,
      });
      authLog.warn("google oauth rejected: email registered locally", { email });
      throw new HttpError(
        409,
        "An account with this email already exists. Sign in with your email and password, or use a different Google account.",
      );
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        googleId,
        name: params.name,
        avatar: params.avatar,
        role: resolveRoleFromEmail(email),
        ...(existing.isVerified
          ? {}
          : {
              isVerified: true,
              verifiedAt: new Date(),
            }),
      },
    });

    console.log(`${GOOGLE_OAUTH_LOG} user record updated (existing Google user)`, {
      userId: user.id,
      email: user.email,
      googleId,
    });
    authLog.info("google login: success", { userId: user.id, email: user.email });
    const synced = await syncUserRoleFromEmail(user);
    const session = await createSession(synced);
    logGoogleOAuthSessionIssued(session, "google-login");
    return session;
  }

  if (await isEmailBlocked(email)) {
    authLog.warn("google oauth rejected: email blocked", { email });
    throw new HttpError(403, "This email address cannot be used to create an account.");
  }

  const user = await prisma.user.create({
    data: {
      email,
      googleId,
      name: params.name,
      avatar: params.avatar,
      passwordHash: null,
      authProvider: "google",
      role: resolveRoleFromEmail(email),
      isVerified: true,
      verifiedAt: new Date(),
      preferredLanguage: params.preferredLanguage,
    },
  });

  console.log(`${GOOGLE_OAUTH_LOG} user record created (new Google user)`, {
    userId: user.id,
    email: user.email,
    googleId,
    preferredLanguage: params.preferredLanguage,
  });
  authLog.info("google register: user created", { userId: user.id, email: user.email });

  try {
    await sendAdminNotificationEmail(user);
  } catch (error) {
    console.warn(`${GOOGLE_OAUTH_LOG} admin notification email failed (user kept)`, { userId: user.id, error: String(error) });
    authLog.warn("google register: admin notification email failed (user kept)", {
      userId: user.id,
      error: String(error),
    });
  }

  const session = await createSession(user);
  logGoogleOAuthSessionIssued(session, "google-register");
  return session;
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
        verificationToken: null,
      },
    }),
    prisma.emailVerificationToken.update({
      where: { id: tokenRecord.id },
      data: {
        usedAt: new Date(),
      },
    }),
  ]);

  authLog.info("verify-email: success", { userId: tokenRecord.userId, email: tokenRecord.user.email });

  return {
    message: "Your email address has been verified successfully.",
    email: tokenRecord.user.email,
  };
}
