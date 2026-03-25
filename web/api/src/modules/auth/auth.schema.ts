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

/** Kayıt ve şifre değişikliği: uzunluk + karmaşıklık (giriş hâlâ passwordField kullanır). */
export const strongNewPasswordField = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(128, "Password is too long.")
  .refine((value) => /[a-z]/.test(value), { message: "Password must include a lowercase letter." })
  .refine((value) => /[A-Z]/.test(value), { message: "Password must include an uppercase letter." })
  .refine((value) => /\d/.test(value), { message: "Password must include a number." })
  .refine((value) => /[^A-Za-z0-9]/.test(value), { message: "Password must include a symbol." });

/** Giriş ve e-posta/şifre ile kayıt (POST /api/auth/login, POST /api/auth/register) */
export const authCredentialsSchema = z.object({
  email: emailField,
  password: passwordField,
});

const firstNameField = z
  .string()
  .trim()
  .min(1, "First name is required.")
  .max(80, "First name is too long.");

const lastNameField = z
  .string()
  .trim()
  .min(1, "Last name is required.")
  .max(80, "Last name is too long.");

/** POST /api/auth/register */
export const registerSchema = z.object({
  firstName: firstNameField,
  lastName: lastNameField,
  email: emailField,
  password: strongNewPasswordField,
  preferredLanguage: z.enum(["tr", "en"]).optional(),
});

export const preferredLanguageSchema = z.object({
  preferredLanguage: z.enum(["tr", "en"]),
});

/** PATCH /api/auth/profile */
export const updateProfileSchema = z.object({
  firstName: firstNameField,
  lastName: lastNameField,
});

/** PATCH /api/auth/password */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: strongNewPasswordField,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from your current password.",
    path: ["newPassword"],
  });

/** POST /api/auth/change-password (snake_case body; same rules as PATCH /password) */
export const changePasswordSnakeSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required."),
    new_password: strongNewPasswordField,
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: "New password must be different from your current password.",
    path: ["new_password"],
  });

export type AuthCredentialsInput = z.infer<typeof authCredentialsSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type PreferredLanguageInput = z.infer<typeof preferredLanguageSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
