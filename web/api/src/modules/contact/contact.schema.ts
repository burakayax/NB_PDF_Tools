import { z } from "zod";

export const contactRequestSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(80, "Name is too long."),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  message: z.string().trim().min(10, "Message is required.").max(2000, "Message is too long."),
  website: z.string().trim().max(0, "Spam submission detected.").optional().default(""),
});

export type ContactRequestInput = z.infer<typeof contactRequestSchema>;
