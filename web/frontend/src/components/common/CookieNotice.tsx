import { legalDocuments } from "../../content/legal";
import type { Language } from "../../i18n/landing";

type CookieNoticeProps = {
  language: Language;
  visible: boolean;
  onAccept: () => void;
  onOpenPrivacy: () => void;
};

export function CookieNotice({ language, visible, onAccept, onOpenPrivacy }: CookieNoticeProps) {
  if (!visible) {
    return null;
  }

  const copy = legalDocuments[language].cookieNotice;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 rounded-[24px] border border-white/[0.08] bg-nb-bg/95 p-5 shadow-[0_32px_80px_-12px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-nb-accent">{copy.title}</p>
          <p className="mt-2 text-sm leading-7 text-nb-muted">{copy.description}</p>
        </div>
        <div className="flex flex-col gap-3 sm:min-w-[240px] sm:items-end">
          <button
            type="button"
            onClick={onAccept}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-b from-nb-primary-mid to-nb-primary px-5 text-sm font-semibold text-slate-950 shadow-[0_12px_32px_-8px_rgba(34,211,238,0.4)] transition duration-200 ease-out hover:brightness-110"
          >
            {copy.accept}
          </button>
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="text-sm font-medium text-nb-muted transition duration-200 hover:text-nb-text"
          >
            {copy.learnMore}
          </button>
        </div>
      </div>
    </div>
  );
}
