import type { ReactNode } from "react";
import type { PriceStackAnnual, PriceStackMonthly } from "../lib/pricingPsychology";

type Stack = PriceStackMonthly | PriceStackAnnual | null;

type Props = {
  stack: Stack;
  /** Shown when stack is null (e.g. missing pricing payload). */
  fallback: ReactNode;
  variant: "landing" | "modal";
};

export function PricingPsychologyStack({ stack, fallback, variant }: Props) {
  if (!stack) {
    return <>{fallback}</>;
  }
  const isLanding = variant === "landing";
  return (
    <div
      className={
        isLanding
          ? "nb-pricing-stack nb-pricing-stack--landing mt-4"
          : "nb-pricing-stack nb-pricing-stack--modal"
      }
    >
      <span className="nb-pricing-stack__strike">{stack.listPrice}</span>
      <span className={isLanding ? "nb-pricing-stack__price nb-pricing-stack__price--landing" : "nb-pricing-stack__price nb-pricing-stack__price--modal"}>
        {stack.yourPrice}
      </span>
      <span className="nb-pricing-stack__daily">{stack.perDayLine}</span>
    </div>
  );
}
