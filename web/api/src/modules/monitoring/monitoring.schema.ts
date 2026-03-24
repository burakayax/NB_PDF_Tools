import { z } from "zod";

export const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  level: z.enum(["error", "warning"]).default("error"),
  source: z.string().trim().max(120).optional(),
  stack: z.string().trim().max(4000).optional(),
  url: z.string().trim().max(500).optional(),
  language: z.enum(["tr", "en"]).optional(),
});

export type ClientErrorInput = z.infer<typeof clientErrorSchema>;
