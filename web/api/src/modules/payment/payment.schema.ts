import { z } from "zod";

export const createPaymentBodySchema = z.object({
  plan: z.enum(["PRO", "BUSINESS"]),
});

export type CreatePaymentBody = z.infer<typeof createPaymentBodySchema>;
