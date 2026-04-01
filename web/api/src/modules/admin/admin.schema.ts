import { z } from "zod";

const planEnum = z.enum(["FREE", "PRO", "BUSINESS"]);
const roleEnum = z.enum(["USER", "ADMIN"]);

export const adminListUsersQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["createdAt", "email", "plan"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  firstName: z.string().max(120).optional().default(""),
  lastName: z.string().max(120).optional().default(""),
  plan: planEnum.default("FREE"),
  skipEmailVerification: z.boolean().default(true),
});

export const adminUpdateUserSchema = z.object({
  firstName: z.string().max(120).nullable().optional(),
  lastName: z.string().max(120).nullable().optional(),
  plan: planEnum.optional(),
  role: roleEnum.optional(),
  isVerified: z.boolean().optional(),
  subscriptionExpiry: z.union([z.string(), z.null()]).optional(),
});

export const adminPatchSettingsSchema = z.object({
  patches: z.record(z.unknown()),
});

export const adminUsageExportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const adminUsageSeriesQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

export const adminDeleteUserQuerySchema = z.object({
  blockEmail: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export const adminPaymentPricesBodySchema = z.object({
  PRO: z.string().min(1).max(32),
  BUSINESS: z.string().min(1).max(32),
});

export const adminBlockedEmailBodySchema = z.object({
  email: z.string().email(),
  reason: z.string().max(500).optional(),
});

export const adminBlockedEmailQuerySchema = z.object({
  email: z.string().email(),
});
