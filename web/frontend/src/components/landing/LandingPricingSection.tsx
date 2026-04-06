import type { PublicPricingPayload } from "../../api/public";
import { PricingPsychologyStack } from "../PricingPsychologyStack";
import { formatRegionalPlanPrice, regionalCurrencyHint } from "../../lib/formatRegionalPrice";
import { getAnnualPricePsychology, getMonthlyPricePsychology } from "../../lib/pricingPsychology";
import { pricingSectionCopy } from "../../i18n/pricingSection";
import type { Language } from "../../i18n/landing";

type Props = {
  language: Language;
  pricing: PublicPricingPayload | undefined;
  kicker: string;
  title: string;
  description: string;
  onUseWebApp: () => void;
};

export function LandingPricingSection({ language, pricing, kicker, title, description, onUseWebApp }: Props) {
  const P = pricingSectionCopy(language);
  const savePct = pricing?.annualSavePercent ?? 0;
  const hint = regionalCurrencyHint(pricing, language);

  const freePrice = language === "tr" ? "Ücretsiz" : "Free";
  const pb = formatRegionalPlanPrice(pricing, "basicMonthly", language);
  const pm = formatRegionalPlanPrice(pricing, "proMonthly", language);
  const pa = formatRegionalPlanPrice(pricing, "proAnnual", language);
  const perDay = (amount: string) => P.onlyPerDay(amount);
  const psychBasic = getMonthlyPricePsychology(pricing, "basic", language, perDay);
  const psychPro = getMonthlyPricePsychology(pricing, "pro", language, perDay);
  const psychAnnual = getAnnualPricePsychology(pricing, language, perDay);

  return (
    <section className="py-10" data-nb-preview="pricing">
      <div className="mb-8 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">{kicker}</p>
        <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h3>
        <p className="mt-4 text-base leading-8 text-slate-300">{description}</p>
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          {pricing?.pricingRegion === "TR" ? P.regionTry : P.regionIntl}
        </p>
        {hint ? <p className="mt-2 text-sm leading-relaxed text-amber-200/90">{hint}</p> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-4 md:grid-cols-2">
        <article className="rounded-[30px] border border-white/10 bg-white/[0.045] p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{P.freeTitle}</p>
          <h4 className="mt-4 text-3xl font-semibold tracking-tight text-white">{freePrice}</h4>
          <p className="mt-4 text-sm leading-7 text-slate-300">{P.freeDesc}</p>
          <ul className="mt-5 space-y-2 text-sm text-slate-200">
            <li className="flex gap-2"><span className="text-cyan-400">✓</span>{P.featFree1}</li>
            <li className="flex gap-2"><span className="text-cyan-400">✓</span>{P.featFree2}</li>
            <li className="flex gap-2"><span className="text-cyan-400">✓</span>{P.featFree3}</li>
          </ul>
          <button
            type="button"
            onClick={onUseWebApp}
            className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.05] px-5 text-sm font-semibold text-white hover:border-white/15 hover:bg-white/[0.08]"
          >
            {P.ctaStart}
          </button>
        </article>

        <article className="rounded-[30px] border border-white/10 bg-white/[0.045] p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{P.basicTitle}</p>
          <PricingPsychologyStack
            variant="landing"
            stack={psychBasic}
            fallback={<h4 className="mt-4 text-3xl font-semibold tracking-tight text-white">{pb}</h4>}
          />
          <p className="mt-4 text-sm leading-7 text-slate-300">{P.basicDesc}</p>
          <ul className="mt-5 space-y-2 text-sm text-slate-200">
            <li className="flex gap-2"><span className="text-cyan-400">✓</span>{P.featPaid1}</li>
            <li className="flex gap-2"><span className="text-cyan-400">✓</span>{P.featPaid2}</li>
            <li className="flex gap-2"><span className="text-cyan-400">✓</span>{P.featBasicNote}</li>
          </ul>
          <button
            type="button"
            onClick={onUseWebApp}
            className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.05] px-5 text-sm font-semibold text-white hover:border-white/15 hover:bg-white/[0.08]"
          >
            {P.ctaChoose}
          </button>
        </article>

        <article className="rounded-[30px] border border-indigo-400/35 bg-gradient-to-br from-cyan-500/[0.08] to-indigo-500/[0.1] p-7 shadow-[0_28px_80px_-16px_rgba(34,211,238,0.22)] ring-1 ring-cyan-400/25">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200">{P.proTitle}</p>
            <span className="pricing-badge-most-popular shrink-0 rounded-full border border-cyan-400/45 bg-gradient-to-r from-cyan-500/35 to-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm shadow-cyan-950/40">
              {P.mostPopular}
            </span>
          </div>
          <PricingPsychologyStack
            variant="landing"
            stack={psychPro}
            fallback={<h4 className="mt-4 text-3xl font-semibold tracking-tight text-white">{pm}</h4>}
          />
          <p className="mt-4 text-sm leading-7 text-slate-200">{P.proDesc}</p>
          <ul className="mt-5 space-y-2 text-sm text-slate-100">
            <li className="flex gap-2"><span className="text-cyan-300">✓</span>{P.featPaid1}</li>
            <li className="flex gap-2"><span className="text-cyan-300">✓</span>{P.featPaid2}</li>
            <li className="flex gap-2"><span className="text-cyan-300">✓</span>{P.featPaid3}</li>
          </ul>
          <button
            type="button"
            onClick={onUseWebApp}
            className="nb-transition mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-cyan-400 px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/35 hover:bg-cyan-500"
          >
            {P.ctaPro}
          </button>
        </article>

        <article className="rounded-[30px] border border-indigo-400/30 bg-indigo-950/[0.25] p-7">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200/90">{P.annualTitle}</p>
            {savePct > 0 ? (
              <span className="rounded-full border border-indigo-400/35 bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-100">
                {P.saveAnnual(savePct)}
              </span>
            ) : null}
          </div>
          <PricingPsychologyStack
            variant="landing"
            stack={psychAnnual}
            fallback={<h4 className="mt-4 text-3xl font-semibold tracking-tight text-white">{pa}</h4>}
          />
          <p className="mt-4 text-sm leading-7 text-slate-300">{P.annualDesc}</p>
          <ul className="mt-5 space-y-2 text-sm text-slate-200">
            <li className="flex gap-2"><span className="text-indigo-300">✓</span>{P.featPaid1}</li>
            <li className="flex gap-2"><span className="text-indigo-300">✓</span>{P.featPaid2}</li>
            <li className="flex gap-2"><span className="text-indigo-300">✓</span>{P.featPaid3}</li>
          </ul>
          <button
            type="button"
            onClick={onUseWebApp}
            className="nb-transition mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-indigo-400/45 bg-indigo-500/80 px-5 text-sm font-semibold text-white hover:bg-indigo-400/90"
          >
            {P.ctaAnnual}
          </button>
        </article>
      </div>

      <p className="nb-pricing-trust mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-xs font-medium text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-cyan-400/90" aria-hidden>
            ✓
          </span>
          {P.trustCancel}
        </span>
        <span className="hidden text-slate-600 sm:inline" aria-hidden>
          ·
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-indigo-400/90" aria-hidden>
            ✓
          </span>
          {P.trustSecure}
        </span>
      </p>

      <div className="mt-12 overflow-x-auto rounded-[24px] border border-white/10 bg-white/[0.03]">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <caption className="border-b border-white/10 px-5 py-4 text-left text-base font-semibold text-white">
            {P.compareTitle}
          </caption>
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="px-4 py-3 font-medium" />
              <th className="px-4 py-3 font-semibold text-slate-200">{P.compareColFree}</th>
              <th className="px-4 py-3 font-semibold text-slate-200">{P.compareColBasic}</th>
              <th className="px-4 py-3 font-semibold text-cyan-200">{P.compareColPro}</th>
              <th className="px-4 py-3 font-semibold text-indigo-200/90">{P.compareColAnnual}</th>
            </tr>
          </thead>
          <tbody className="text-slate-300">
            <tr className="border-b border-white/5">
              <td className="px-4 py-3 font-medium text-slate-400">{P.rowPrice}</td>
              <td className="px-4 py-3">{freePrice}</td>
              <td className="px-4 py-3">{pb}</td>
              <td className="px-4 py-3 text-cyan-100">{pm}</td>
              <td className="px-4 py-3 text-indigo-100">{pa}</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="px-4 py-3 font-medium text-slate-400">{P.rowBilling}</td>
              <td className="px-4 py-3">—</td>
              <td className="px-4 py-3">{P.valBasic}</td>
              <td className="px-4 py-3">{P.valPro}</td>
              <td className="px-4 py-3">{P.valAnnual}</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="px-4 py-3 font-medium text-slate-400">{P.rowProcessing}</td>
              <td className="px-4 py-3">{P.valQueue}</td>
              <td className="px-4 py-3">{P.featBasicNote}</td>
              <td className="px-4 py-3 text-cyan-100">{P.valInstant}</td>
              <td className="px-4 py-3 text-indigo-100">{P.valInstant}</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="px-4 py-3 font-medium text-slate-400">{P.rowQuality}</td>
              <td className="px-4 py-3">{P.valStd}</td>
              <td className="px-4 py-3">{P.valFull}</td>
              <td className="px-4 py-3">{P.valFull}</td>
              <td className="px-4 py-3">{P.valFull}</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="px-4 py-3 font-medium text-slate-400">{P.rowTools}</td>
              <td className="px-4 py-3">{P.valCore}</td>
              <td className="px-4 py-3">{P.valAll}</td>
              <td className="px-4 py-3">{P.valAll}</td>
              <td className="px-4 py-3">{P.valAll}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium text-slate-400">{P.rowDaily}</td>
              <td className="px-4 py-3">{P.valLimited}</td>
              <td className="px-4 py-3">{P.valUnlimited}</td>
              <td className="px-4 py-3">{P.valUnlimited}</td>
              <td className="px-4 py-3">{P.valUnlimited}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
