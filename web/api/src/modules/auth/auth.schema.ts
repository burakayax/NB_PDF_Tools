import { z } from "zod";

const emailField = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Please enter a valid email address.")
  .transform((value) => value.toLowerCase());

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password is too long.");

/** Giriş ve e-posta/şifre ile kayıt (POST /api/auth/login, POST /api/auth/register) */
export const authCredentialsSchema = z.object({
  email: emailField,
  password: passwordField,
});

export const preferredLanguageSchema = z.object({
  preferredLanguage: z.enum(["tr", "en"]),
});

export type AuthCredentialsInput = z.infer<typeof authCredentialsSchema>;
export type PreferredLanguageInput = z.infer<typeof preferredLanguageSchema>;
