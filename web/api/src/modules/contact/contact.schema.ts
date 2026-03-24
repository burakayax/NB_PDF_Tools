import { z } from "zod";

/** Görünmez alan: botlar doldurursa istek reddedilir (içerik boş olmalı). */
const honeypotField = z.preprocess((value) => {
  if (value == null || value === undefined) {
    return "";
  }
  return String(value).trim();
}, z.string().max(0, "Invalid submission."));

const hasLetter = /\p{L}/u;

export const contactRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name is required.")
    .max(80, "Name is too long.")
    .refine((value) => hasLetter.test(value), "Please enter a valid name."),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .toLowerCase()
    .email("Please enter a valid email address."),
  message: z
    .string()
    .trim()
    .min(10, "Message is required.")
    .max(2000, "Message is too long.")
    .refine((value) => !/^(.)\1{15,}$/u.test(value), "Message appears invalid."),
  /** Honeypot (ör. "Web sitesi") — her zaman boş bırakılmalı. */
  website: honeypotField,
});

export type ContactRequestInput = z.infer<typeof contactRequestSchema>;
