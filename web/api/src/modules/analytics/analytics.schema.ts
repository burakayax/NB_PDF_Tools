import { z } from "zod";

export const pageViewSchema = z.object({
  view: z.string().trim().min(1).max(80),
  path: z.string().trim().min(1).max(160),
  sessionId: z.string().trim().min(8).max(64),
  language: z.enum(["tr", "en"]).optional(),
  referrer: z.string().trim().max(500).optional(),
});

export type PageViewInput = z.infer<typeof pageViewSchema>;
