import { useEffect, useMemo, useState } from "react";
import { submitContactForm } from "../../api/contact";
import { fetchPlans, type PlanDefinition } from "../../api/subscription";
import { getSaasApiBase } from "../../api/saasBase";
import { livePriceForLandingRow } from "../../lib/landingLivePricing";
import { mergeLandingWithCms, resolveCmsAssetUrl } from "../../lib/landingCmsMerge";
import { landingTranslations, type Language } from "../../i18n/landing";
import { LandingIcon } from "./LandingIcon";

type LandingPageProps = {
  language: Language;
  onLanguageChange: (language: Language) => void;
  windowsDownloadUrl: string;
  onUseWebApp: () => void;
  isAuthenticated: boolean;
  /** Giriş yapılmışsa: "Merhaba, Ahmet" / "Hello, Alex" (yalnızca ad). */
  authGreeting?: string;
  onLogin: () => void;
  onRegister: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
  /** Public CMS (`cms.content`) merged into copy; optional. */
  cmsContent?: Record<string, unknown> | null;
};

export function LandingPage({
  language,
  onLanguageChange,
  windowsDownloadUrl,
  onUseWebApp,
  isAuthenticated,
  authGreeting,
  onLogin,
  onRegister,
  onOpenTerms,
  onOpenPrivacy,
  cmsContent,
}: LandingPageProps) {
  const { copy, heroImageSrc, logoSrc } = useMemo(() => {
    const base = landingTranslations[language];
    const merged = mergeLandingWithCms(base, cmsContent ?? null, language);
    const apiBase = getSaasApiBase();
    const assets = cmsContent?.assets as { heroImageUrl?: string; logoUrl?: string } | undefined;
    const hero =
      resolveCmsAssetUrl(assets?.heroImageUrl, apiBase) ??
      "/app-preview-main.png";
    const logo = resolveCmsAssetUrl(assets?.logoUrl, apiBase);
    return { copy: merged, heroImageSrc: hero, logoSrc: logo };
  }, [cmsContent, language]);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactWebsite, setContactWebsite] = useState("");
  const [contactError, setContactError] = useState("");
  const [contactSuccess, setContactSuccess] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [publicPlans, setPublicPlans] = useState<PlanDefinition[] | null>(null);

  useEffect(() => {
    void fetchPlans()
      .then((list) => setPublicPlans(list))
      .catch(() => setPublicPlans(null));
  }, []);

  async function handleContactSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setContactError("");
    setContactSuccess("");

    if (!contactName.trim()) {
      setContactError(copy.contactSection.validation.nameRequired);
      return;
    }

    if (contactName.trim().length < 2) {
      setContactError(copy.contactSection.validation.nameTooShort);
      return;
    }

    if (!contactEmail.trim()) {
      setContactError(copy.contactSection.validation.emailRequired);
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(contactEmail.trim())) {
      setContactError(copy.contactSection.validation.emailInvalid);
      return;
    }

    if (!contactMessage.trim()) {
      setContactError(copy.contactSection.validation.messageRequired);
      return;
    }

    if (contactMessage.trim().length < 10) {
      setContactError(copy.contactSection.validation.messageTooShort);
      return;
    }

    try {
      setContactSubmitting(true);
      await submitContactForm({
        name: contactName.trim(),
        email: contactEmail.trim(),
        message: contactMessage.trim(),
        website: contactWebsite.trim(),
      });
      setContactSuccess(copy.contactSection.success);
      setContactName("");
      setContactEmail("");
      setContactMessage("");
      setContactWebsite("");
    } catch (error) {
      setContactError(error instanceof Error ? error.message : copy.contactSection.errorFallback);
    } finally {
      setContactSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-nb-bg font-sans text-nb-text antialiased">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[min(720px,85vh)] bg-[radial-gradient(ellipse_90%_60%_at_50%_-10%,rgba(37,99,235,0.22),transparent_52%),radial-gradient(circle_at_85%_15%,rgba(56,189,248,0.08),transparent_35%)]" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col px-6 pb-16 pt-8 sm:px-8 lg:px-12">
        <section className="mb-12 rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.02] px-5 py-5 shadow-[0_32px_80px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-md xl:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/30 bg-gradient-to-br from-blue-500/20 to-slate-900/40 shadow-[0_0_48px_rgba(37,99,235,0.25)]">
                <img
                  src={logoSrc ?? "/nb_pdf_tools_icon.png"}
                  alt="NB PDF TOOLS"
                  className="h-8 w-8 rounded-xl object-cover"
                />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.38em] text-sky-200/75">NB Global Studio</p>
                <h1 className="text-lg font-semibold tracking-[0.14em] text-white">{copy.navbar.productLabel}</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300">
                {copy.navbar.platformTag}
              </span>

              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1">
                <span className="px-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{copy.navbar.languageLabel}</span>
                <button
                  type="button"
                  onClick={() => onLanguageChange("tr")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    language === "tr" ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  TR
                </button>
                <button
                  type="button"
                  onClick={() => onLanguageChange("en")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    language === "en" ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  EN
                </button>
              </div>

              <a
                href="#contact"
                className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-white/5"
              >
                {copy.navbar.contact}
              </a>

              {isAuthenticated ? (
                <>
                  <span className="max-w-[min(280px,calc(100vw-12rem))] truncate rounded-full border border-white/12 bg-white/[0.07] px-4 py-2 text-sm font-medium text-slate-100">
                    {authGreeting ?? copy.navbar.signedInFallback}
                  </span>
                  <button
                    type="button"
                    onClick={onUseWebApp}
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                  >
                    {copy.navbar.openWorkspace}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onLogin}
                    className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-white/5"
                  >
                    {copy.navbar.login}
                  </button>
                  <button
                    type="button"
                    onClick={onRegister}
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                  >
                    {copy.navbar.register}
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-14 py-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)] lg:items-center lg:py-20">
          <div className="max-w-3xl">
            <div className="mb-6 flex flex-wrap gap-3">
              {copy.hero.audience.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium tracking-[0.12em] text-slate-300"
                >
                  {item}
                </span>
              ))}
            </div>

            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.32em] text-sky-300">{copy.hero.kicker}</p>
            <h2 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl lg:leading-[1.02]">
              {copy.hero.headline}
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">{copy.hero.description}</p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <button
                type="button"
                onClick={onUseWebApp}
                className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-gradient-to-b from-nb-primary-mid to-nb-primary px-7 text-base font-semibold text-white shadow-[0_20px_50px_-10px_rgba(37,99,235,0.5)] transition duration-300 ease-out hover:-translate-y-0.5 hover:brightness-110"
              >
                {copy.hero.primaryCta}
              </button>
              <a
                href={windowsDownloadUrl}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex min-h-14 items-center justify-center rounded-2xl border px-7 text-base font-semibold transition ${
                  windowsDownloadUrl === "#"
                    ? "cursor-not-allowed border-white/10 bg-white/5 text-slate-400"
                    : "border-white/[0.12] bg-white/[0.05] text-white transition duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09]"
                }`}
                aria-disabled={windowsDownloadUrl === "#"}
              >
                {copy.hero.secondaryCta}
              </a>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {copy.hero.highlights.map((item) => (
                <div key={item.label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-200">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -left-10 top-10 hidden h-40 w-40 rounded-full bg-sky-400/10 blur-3xl lg:block" />
            <div className="absolute -right-12 bottom-0 hidden h-44 w-44 rounded-full bg-indigo-400/10 blur-3xl lg:block" />

            <div className="relative rounded-[32px] border border-white/[0.08] bg-slate-900/70 p-4 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl">
              <div className="rounded-[28px] border border-white/[0.06] bg-gradient-to-b from-nb-panel/95 via-nb-bg to-nb-bg-soft p-3">
                <img
                  src={heroImageSrc}
                  alt="NB PDF TOOLS product preview"
                  className="w-full rounded-[22px] border border-white/10 object-cover shadow-[0_18px_60px_rgba(15,23,42,0.5)]"
                />
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {copy.hero.quickStats.map((item, index) => (
                  <div
                    key={item.title}
                    className={`rounded-2xl border p-4 ${
                      index === 0 ? "border-sky-400/20 bg-sky-500/10" : "border-emerald-400/20 bg-emerald-500/10"
                    }`}
                  >
                    <p className={`text-xs font-semibold uppercase tracking-[0.24em] ${index === 0 ? "text-sky-200" : "text-emerald-200"}`}>
                      {item.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-8 xl:py-12">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-300">{copy.features.kicker}</p>
            <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{copy.features.title}</h3>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {copy.features.items.map((item) => (
              <article
                key={item.title}
                className="group rounded-[28px] border border-white/10 bg-white/[0.045] p-7 transition duration-300 ease-out hover:-translate-y-1 hover:border-nb-primary/35 hover:bg-white/[0.07] hover:shadow-[0_20px_50px_-20px_rgba(37,99,235,0.2)]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10">
                  <LandingIcon kind={item.icon} />
                </div>
                <h4 className="mt-6 text-xl font-semibold text-white">{item.title}</h4>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.benefit}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-start">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.045] p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-300">{copy.trust.kicker}</p>
            <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{copy.trust.title}</h3>
            <p className="mt-5 text-base leading-8 text-slate-300">{copy.trust.description}</p>

            <div className="mt-8 space-y-4">
              {copy.trust.points.map((item, index) => (
                <div key={item.title} className="flex items-start gap-4 rounded-2xl border border-white/8 bg-slate-950/50 p-4">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-sm font-semibold text-sky-200">
                    0{index + 1}
                  </div>
                  <div>
                    <p className="text-base font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-300">{copy.screenshots.kicker}</p>
              <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{copy.screenshots.title}</h3>
              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">{copy.screenshots.description}</p>
            </div>

            {copy.screenshots.items.map((shot, index) => (
              <article
                key={shot.title}
                className={`group rounded-[30px] border border-white/10 bg-white/[0.045] p-4 transition duration-300 ease-out hover:-translate-y-1 hover:border-nb-primary/35 hover:shadow-[0_20px_50px_-20px_rgba(37,99,235,0.18)] ${
                  index === 0 ? "md:col-span-2" : ""
                }`}
              >
                <div className="overflow-hidden rounded-[24px] border border-white/10 bg-slate-950">
                  <img src={shot.src} alt={shot.title} className="w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
                </div>
                <div className="px-2 pb-2 pt-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{copy.screenshots.kicker}</p>
                  <h4 className="mt-2 text-xl font-semibold text-white">{shot.title}</h4>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{shot.description}</p>
                </div>
              </article>
            ))}

            <article className="rounded-[30px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 md:col-span-2">
              <div className="grid gap-4 md:grid-cols-2">
                {copy.screenshots.sideCards.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/8 bg-white/[0.04] p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                      <LandingIcon kind={item.icon} />
                    </div>
                    <h4 className="mt-4 text-lg font-semibold text-white">{item.title}</h4>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{item.description}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="py-10">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-300">{copy.pricing.kicker}</p>
            <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{copy.pricing.title}</h3>
            <p className="mt-4 text-base leading-8 text-slate-300">{copy.pricing.description}</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {copy.pricing.plans.map((plan) => (
              <article
                key={plan.name}
                className={`rounded-[30px] border p-8 ${
                  plan.highlighted
                    ? "border-blue-500/35 bg-blue-600/[0.1] shadow-[0_28px_80px_-16px_rgba(37,99,235,0.22)]"
                    : "border-white/10 bg-white/[0.045]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{plan.name}</p>
                    <h4 className="mt-4 text-4xl font-semibold tracking-tight text-white">
                      {livePriceForLandingRow(plan.name, publicPlans, language, plan.price)}
                    </h4>
                  </div>
                  {plan.badge ? (
                    <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
                      {plan.badge}
                    </span>
                  ) : null}
                </div>

                <p className="mt-5 text-sm leading-7 text-slate-300">{plan.description}</p>

                <div className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3 text-sm leading-6 text-slate-200">
                      <span className="mt-1 h-2 w-2 rounded-full bg-sky-400" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={onUseWebApp}
                  className={`mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-2xl px-5 text-sm font-semibold transition ${
                    plan.highlighted
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30 transition duration-300 hover:bg-blue-500"
                      : "border border-white/[0.1] bg-white/[0.05] text-white transition duration-300 hover:border-white/15 hover:bg-white/[0.08]"
                  }`}
                >
                  {plan.cta}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section id="contact" className="scroll-mt-8 py-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-300">{copy.contactSection.kicker}</p>
              <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{copy.contactSection.title}</h3>
              <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">{copy.contactSection.description}</p>
            </div>

            <form
              className="rounded-[30px] border border-white/[0.07] bg-white/[0.035] p-7 shadow-[0_28px_70px_-18px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.03)_inset]"
              onSubmit={handleContactSubmit}
            >
              <div className="grid gap-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">{copy.contactSection.nameLabel}</span>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    disabled={contactSubmitting}
                    className="w-full rounded-xl border border-white/[0.08] bg-nb-bg-soft/90 px-4 py-3.5 text-nb-text shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition duration-200 ease-out focus:border-nb-primary/50 focus:ring-2 focus:ring-nb-primary/15 hover:border-white/12 disabled:opacity-60"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">{copy.contactSection.emailLabel}</span>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    disabled={contactSubmitting}
                    className="w-full rounded-xl border border-white/[0.08] bg-nb-bg-soft/90 px-4 py-3.5 text-nb-text shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition duration-200 ease-out focus:border-nb-primary/50 focus:ring-2 focus:ring-nb-primary/15 hover:border-white/12 disabled:opacity-60"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">{copy.contactSection.messageLabel}</span>
                  <textarea
                    value={contactMessage}
                    onChange={(event) => setContactMessage(event.target.value)}
                    rows={6}
                    disabled={contactSubmitting}
                    className="w-full rounded-xl border border-white/[0.08] bg-nb-bg-soft/90 px-4 py-3.5 text-nb-text shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition duration-200 ease-out focus:border-nb-primary/50 focus:ring-2 focus:ring-nb-primary/15 hover:border-white/12 disabled:opacity-60"
                  />
                </label>

                <label className="hidden" aria-hidden="true">
                  <span>{copy.contactSection.honeypotLabel}</span>
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={contactWebsite}
                    onChange={(event) => setContactWebsite(event.target.value)}
                  />
                </label>

                {contactError ? (
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{contactError}</div>
                ) : null}

                {contactSuccess ? (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    {contactSuccess}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={contactSubmitting}
                  className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-gradient-to-b from-nb-primary-mid to-nb-primary px-7 text-base font-semibold text-white shadow-[0_16px_40px_-12px_rgba(37,99,235,0.45)] transition duration-300 ease-out hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {contactSubmitting ? copy.contactSection.submitting : copy.contactSection.submit}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="py-10">
          <div className="rounded-[34px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(37,99,235,0.16),rgba(15,23,42,0.92),rgba(56,189,248,0.1))] p-9 shadow-[0_36px_100px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)_inset] sm:p-11 lg:flex lg:items-center lg:justify-between lg:gap-12">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-200">{copy.finalCta.kicker}</p>
              <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{copy.finalCta.title}</h3>
              <p className="mt-4 text-base leading-8 text-slate-200/85">{copy.finalCta.description}</p>
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row lg:mt-0">
              <button
                type="button"
                onClick={onUseWebApp}
                className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-white px-7 text-base font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-slate-100"
              >
                {copy.finalCta.primaryCta}
              </button>
              <a
                href={windowsDownloadUrl}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex min-h-14 items-center justify-center rounded-2xl border px-7 text-base font-semibold transition ${
                  windowsDownloadUrl === "#"
                    ? "cursor-not-allowed border-white/10 bg-white/5 text-slate-400"
                    : "border-white/20 bg-white/10 text-white hover:-translate-y-0.5 hover:bg-white/15"
                }`}
                aria-disabled={windowsDownloadUrl === "#"}
              >
                {copy.finalCta.secondaryCta}
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/[0.06] bg-nb-bg-soft/95">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-8 text-sm text-slate-400 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
          <div>
            <p className="font-semibold tracking-[0.18em] text-slate-200">NB PDF TOOLS</p>
            <p className="mt-1">{copy.footer.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>{copy.footer.availability}</span>
            <span>{copy.footer.security}</span>
            <button
              type="button"
              onClick={onOpenTerms}
              className="text-slate-200 transition hover:text-white"
            >
              {language === "tr" ? "Hizmet Şartları" : "Terms of Service"}
            </button>
            <button
              type="button"
              onClick={onOpenPrivacy}
              className="text-slate-200 transition hover:text-white"
            >
              {language === "tr" ? "Gizlilik Politikası" : "Privacy Policy"}
            </button>
            <a
              href="#contact"
              className="text-slate-200 transition hover:text-white"
            >
              {copy.footer.contact}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

