import { z } from "zod";

export const createPaymentBodySchema = z
  .object({
    plan: z.enum(["PRO", "BUSINESS"]),
    billing: z.enum(["monthly", "annual"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.billing === "annual" && data.plan !== "PRO") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Annual billing is only available for the Pro plan.",
        path: ["billing"],
      });
    }
  });

export type CreatePaymentBody = z.infer<typeof createPaymentBodySchema>;
