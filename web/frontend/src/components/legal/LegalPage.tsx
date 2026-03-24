import { legalDocuments } from "../../content/legal";
import type { Language } from "../../i18n/landing";

type LegalPageProps = {
  language: Language;
  documentKey: "terms" | "privacy";
  onBack: () => void;
};

export function LegalPage({ language, documentKey, onBack }: LegalPageProps) {
  const document = legalDocuments[language][documentKey];

  return (
    <div className="min-h-screen overflow-hidden bg-[#0f172a] font-sans text-slate-100 antialiased">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(37,99,235,0.18),transparent_55%)]" />

      <main className="relative mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:px-12">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-semibold text-slate-200 shadow-sm transition duration-200 hover:border-white/15 hover:bg-white/[0.08]"
        >
          ← {language === "tr" ? "Geri dön" : "Back"}
        </button>

        <section className="mt-10 rounded-[28px] border border-white/[0.07] bg-slate-900/50 p-8 shadow-[0_40px_90px_-24px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl sm:p-11">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">NB PDF TOOLS</p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{document.title}</h1>
          <p className="mt-5 text-base leading-8 text-slate-300">{document.summary}</p>

          <div className="mt-6 inline-flex rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
            <span className="font-semibold text-white">{document.effectiveDateLabel}:</span>
            <span className="ml-2">{document.effectiveDate}</span>
          </div>

          <div className="mt-10 space-y-8">
            {document.sections.map((section) => (
              <section key={section.title} className="rounded-[28px] border border-white/8 bg-slate-950/45 p-6 sm:p-7">
                <h2 className="text-2xl font-semibold text-white">{section.title}</h2>
                <div className="mt-4 space-y-4 text-sm leading-8 text-slate-300 sm:text-base">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
