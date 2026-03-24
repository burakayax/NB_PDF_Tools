import { z } from "zod";

export const authCredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password is too long.")
    .regex(/[a-z]/, "Password must include at least one lowercase letter.")
    .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
    .regex(/\d/, "Password must include at least one number."),
});

export const preferredLanguageSchema = z.object({
  preferredLanguage: z.enum(["tr", "en"]),
});

export type AuthCredentialsInput = z.infer<typeof authCredentialsSchema>;
export type PreferredLanguageInput = z.infer<typeof preferredLanguageSchema>;
