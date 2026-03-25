import type { FeatureKey } from "../../api/subscription";
import type { Language } from "../../i18n/landing";
import { SIDEBAR_TOOL_ORDER, sidebarToolLabel, ws } from "../../i18n/workspace";
import type { SubscriptionSummary } from "../../api/subscription";

export type SidebarToolId = FeatureKey | "subscription";

const planIcon = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
    />
  </svg>
);

type DashboardSidebarProps = {
  active: SidebarToolId;
  onSelect: (id: SidebarToolId) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onGoHome: () => void;
  lockedFeatures: Set<FeatureKey>;
  subscriptionSummary?: SubscriptionSummary | null;
  userRole?: string;
};

export function DashboardSidebar({
  active,
  onSelect,
  language,
  onLanguageChange,
  onGoHome,
  lockedFeatures,
  subscriptionSummary,
  userRole,
}: DashboardSidebarProps) {
  const L = ws(language);
  const showUsageChip =
    userRole !== "ADMIN" && subscriptionSummary && subscriptionSummary.usage.dailyLimit !== null;

  return (
    <aside className="fixed bottom-0 left-0 top-14 z-40 hidden w-60 flex-col border-r border-white/[0.06] bg-nb-bg-elevated/95 shadow-[4px_0_28px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md md:flex">
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Tools">
        {SIDEBAR_TOOL_ORDER.map((id) => {
          const isActive = active === id;
          const locked = lockedFeatures.has(id);
          const label = sidebarToolLabel(id, language);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`nb-transition flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${
                isActive
                  ? "border border-nb-primary/40 bg-nb-primary/12 text-nb-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "border border-transparent text-nb-muted hover:bg-white/[0.05] hover:text-nb-text"
              } ${locked ? "opacity-85" : ""}`}
            >
              <span className={isActive ? "text-nb-primary-mid" : "text-nb-muted"}>
                {locked ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                ) : (
                  <span className="w-5 text-center text-xs font-bold opacity-80">•</span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate">{label}</span>
                {locked ? <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-400/90">Pro</span> : null}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onSelect("subscription")}
          className={`nb-transition mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${
            active === "subscription"
              ? "border border-nb-primary/40 bg-nb-primary/12 text-nb-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              : "border border-transparent text-nb-muted hover:bg-white/[0.05] hover:text-nb-text"
          }`}
        >
          <span className={active === "subscription" ? "text-nb-primary-mid" : "text-nb-muted"}>{planIcon}</span>
          {L.planNav}
        </button>
      </nav>

      {showUsageChip ? (
        <div className="border-t border-white/[0.06] px-3 py-3">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-nb-muted">{L.usageRemainingShort}</p>
          <div className="rounded-xl border border-white/[0.08] bg-nb-panel/60 px-3 py-2.5 text-sm text-nb-text">
            <span className="font-semibold tabular-nums text-nb-accent">
              {subscriptionSummary!.usage.remainingToday === null
                ? L.usageUnlimited
                : subscriptionSummary!.usage.remainingToday}
            </span>
            {subscriptionSummary!.usage.dailyLimit !== null ? (
              <span className="text-nb-muted"> / {subscriptionSummary!.usage.dailyLimit}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="border-t border-white/[0.06] px-3 py-4">
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-nb-muted">{L.langSection}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onLanguageChange("tr")}
            className={`nb-transition flex-1 rounded-xl border px-3 py-2 text-center text-xs font-semibold ${
              language === "tr"
                ? "border-nb-primary/45 bg-nb-primary/15 text-nb-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                : "border-white/[0.08] bg-nb-bg-soft/80 text-nb-muted hover:border-nb-primary/30 hover:text-nb-text"
            }`}
          >
            TR
          </button>
          <button
            type="button"
            onClick={() => onLanguageChange("en")}
            className={`nb-transition flex-1 rounded-xl border px-3 py-2 text-center text-xs font-semibold ${
              language === "en"
                ? "border-nb-primary/45 bg-nb-primary/15 text-nb-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                : "border-white/[0.08] bg-nb-bg-soft/80 text-nb-muted hover:border-nb-primary/30 hover:text-nb-text"
            }`}
          >
            EN
          </button>
        </div>
        <button
          type="button"
          onClick={onGoHome}
          className="nb-transition mt-3 w-full rounded-xl border border-white/[0.08] bg-nb-panel/50 px-3 py-2 text-center text-xs font-medium text-nb-muted hover:border-nb-primary/30 hover:bg-nb-panel hover:text-nb-text"
        >
          {L.homeNav}
        </button>
      </div>
    </aside>
  );
}

export function DashboardSidebarMobileRail({ active, onSelect, language, onLanguageChange, onGoHome, lockedFeatures }: DashboardSidebarProps) {
  const L = ws(language);

  return (
    <div className="sticky top-14 z-30 border-b border-white/[0.06] bg-nb-bg/95 backdrop-blur-md md:hidden">
      <div className="flex gap-1.5 overflow-x-auto py-2 pl-2 pr-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SIDEBAR_TOOL_ORDER.map((id) => {
          const isActive = active === id;
          const locked = lockedFeatures.has(id);
          const short = sidebarToolLabel(id, language).replace(/\s+/g, "");
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`nb-transition shrink-0 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold whitespace-nowrap ${
                isActive
                  ? "border-nb-primary/45 bg-nb-primary/15 text-nb-accent"
                  : "border-white/[0.08] bg-nb-panel/60 text-nb-muted hover:border-nb-primary/25 hover:text-nb-text"
              } ${locked ? "opacity-75" : ""}`}
            >
              {short}
              {locked ? " ⧉" : ""}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onSelect("subscription")}
          className={`nb-transition shrink-0 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold whitespace-nowrap ${
            active === "subscription"
              ? "border-nb-primary/45 bg-nb-primary/15 text-nb-accent"
              : "border-white/[0.08] bg-nb-panel/60 text-nb-muted"
          }`}
        >
          {L.planNav}
        </button>
      </div>
      <div className="flex items-center justify-center gap-2 border-t border-white/[0.04] px-3 py-2">
        <button
          type="button"
          onClick={() => onLanguageChange("tr")}
          className={`nb-transition rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            language === "tr" ? "border-nb-primary/45 bg-nb-primary/15 text-nb-accent" : "border-white/[0.08] text-nb-muted"
          }`}
        >
          TR
        </button>
        <button
          type="button"
          onClick={() => onLanguageChange("en")}
          className={`nb-transition rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            language === "en" ? "border-nb-primary/45 bg-nb-primary/15 text-nb-accent" : "border-white/[0.08] text-nb-muted"
          }`}
        >
          EN
        </button>
        <span className="mx-1 h-4 w-px bg-white/10" aria-hidden />
        <button type="button" onClick={onGoHome} className="text-xs font-medium text-nb-muted hover:text-nb-text">
          {L.homeNav}
        </button>
      </div>
    </div>
  );
}
