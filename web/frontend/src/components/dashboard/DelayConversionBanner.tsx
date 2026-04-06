import type { Language } from "../../i18n/landing";
import type { SaasFrictionPayload } from "../../api/subscription";
import { ws } from "../../i18n/workspace";

type Props = {
  language: Language;
  friction: SaasFrictionPayload;
  onDismiss: () => void;
  onUpgradeClick: () => void;
};

export function DelayConversionBanner({ language, friction, onDismiss, onUpgradeClick }: Props) {
  const W = ws(language);
  const body =
    (typeof friction.message === "string" && friction.message.trim()) ||
    (typeof friction.usageSummary === "string" && friction.usageSummary.trim()) ||
    W.delayMonetizationDuringBody;
  const cta = friction.upgradeCta;
  const label =
    cta?.clientAction === "open_upgrade_modal" && cta.label?.trim()
      ? cta.label.trim()
      : W.delayMonetizationInstantCta;

  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/40 to-indigo-950/25 px-4 py-3 text-sm shadow-md backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="min-w-0 flex-1 leading-relaxed text-slate-200">{body}</p>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {cta?.subtitle ? (
          <span className="hidden max-w-[220px] text-xs text-indigo-200/85 sm:inline">{cta.subtitle}</span>
        ) : null}
        <button
          type="button"
          className="nb-transition rounded-xl bg-gradient-to-b from-cyan-400 to-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow hover:brightness-105"
          onClick={onUpgradeClick}
        >
          {label}
        </button>
        <button
          type="button"
          className="nb-transition rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-slate-300 hover:border-indigo-400/35 hover:bg-indigo-500/10 hover:text-white"
          onClick={onDismiss}
        >
          {language === "tr" ? "Kapat" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}
