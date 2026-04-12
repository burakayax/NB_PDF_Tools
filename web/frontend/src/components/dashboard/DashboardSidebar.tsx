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
  /** Kota CTA: yükseltme modali (yoksa abonelik sayfasına gider). */
  onUsageUpgradeClick?: () => void;
  /** Yalnızca ADMIN: istatistik modali. */
  onOpenAdminDashboard?: () => void;
  /** Sunucu `TOOLS.config.disabledFeatures` sonrası görünen araçlar; verilmezse tam liste. */
  enabledToolIds?: FeatureKey[];
  /** CMS / çalışma alanı araç başlığı; verilmezse `sidebarToolLabel`. */
  resolveToolLabel?: (id: FeatureKey) => string;
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
  onUsageUpgradeClick,
  onOpenAdminDashboard,
  enabledToolIds,
  resolveToolLabel,
}: DashboardSidebarProps) {
  const L = ws(language);
  const toolOrder = enabledToolIds?.length ? enabledToolIds : SIDEBAR_TOOL_ORDER;
  const labelForTool = resolveToolLabel ?? ((id: FeatureKey) => sidebarToolLabel(id, language));
  const showUsageChip =
    userRole !== "ADMIN" && subscriptionSummary && subscriptionSummary.currentPlan.name === "FREE";
  const usageFrictionActive = Boolean(subscriptionSummary?.usage.conversionTracking?.freeLimitExceeded);

  return (
    <aside className="fixed bottom-0 left-0 top-14 z-40 hidden w-60 flex-col border-r border-white/[0.08] bg-gradient-to-b from-nb-bg-elevated/92 via-[#0c1424]/95 to-nb-bg-elevated/92 shadow-[4px_0_32px_-6px_rgba(0,0,0,0.55)] backdrop-blur-xl backdrop-saturate-150 md:flex">
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="TOOLS">
        {userRole === "ADMIN" && onOpenAdminDashboard ? (
          <button
            type="button"
            onClick={onOpenAdminDashboard}
            className="nb-transition mb-1 flex w-full items-center gap-3 rounded-2xl border border-violet-400/35 bg-violet-500/12 px-3 py-2.5 text-left text-sm font-medium text-violet-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:scale-[1.02] hover:border-violet-400/50 hover:bg-violet-500/18 hover:shadow-md"
          >
            <span className="text-violet-300/95">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
            </span>
            {language === "tr" ? "Yönetim paneli" : "Admin Dashboard"}
          </button>
        ) : null}
        {toolOrder.map((id) => {
          const isActive = active === id;
          const locked = lockedFeatures.has(id);
          const label = labelForTool(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              title={locked ? L.lockedFeatureTooltip : undefined}
              aria-label={locked ? `${label}. ${L.lockedFeatureTooltip}` : undefined}
              className={`nb-transition flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium ${
                isActive
                  ? "border border-nb-primary/45 bg-nb-primary/14 text-nb-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_28px_-8px_rgba(59,130,246,0.45)]"
                  : "border border-transparent text-nb-muted hover:scale-[1.02] hover:bg-white/[0.06] hover:text-nb-text hover:shadow-md"
              } ${
                locked
                  ? "ring-1 ring-amber-400/35 shadow-[0_0_28px_-10px_rgba(245,158,11,0.55),inset_0_1px_0_rgba(255,255,255,0.04)] hover:ring-amber-400/50 hover:shadow-[0_0_36px_-8px_rgba(245,158,11,0.6)]"
                  : ""
              }`}
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
                {locked ? (
                  <span
                    className="shrink-0 rounded-md border border-amber-400/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300/95 shadow-[0_0_12px_-4px_rgba(251,191,36,0.45)]"
                    aria-hidden
                  >
                    Pro
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onSelect("subscription")}
          className={`nb-transition mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium ${
            active === "subscription"
              ? "border border-nb-primary/45 bg-nb-primary/14 text-nb-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_28px_-8px_rgba(59,130,246,0.45)]"
              : "border border-transparent text-nb-muted hover:scale-[1.02] hover:bg-white/[0.06] hover:text-nb-text hover:shadow-md"
          }`}
        >
          <span className={active === "subscription" ? "text-nb-primary-mid" : "text-nb-muted"}>{planIcon}</span>
          {L.planNav}
        </button>
      </nav>

      {showUsageChip ? (
        <div className="border-t border-white/[0.06] px-3 py-3">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-nb-muted">{L.usageDailyHeading}</p>
          <div
            className={`rounded-2xl border px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm ${
              usageFrictionActive
                ? "border-amber-500/40 bg-gradient-to-b from-amber-950/40 to-nb-panel/70"
                : "border-white/[0.1] bg-nb-panel/55"
            }`}
          >
            <p className="text-[13px] font-semibold leading-snug text-nb-text">
              {subscriptionSummary!.usage.dailyLimit != null
                ? L.usageUsedTodayLine(
                    subscriptionSummary!.usage.usedToday,
                    subscriptionSummary!.usage.dailyLimit,
                  )
                : L.usageSoftTierLine(
                    subscriptionSummary!.usage.usedToday,
                    subscriptionSummary!.usage.softFrictionAfterOps ?? 5,
                  )}
            </p>
            <p
              className={`mt-1 text-xs font-semibold tabular-nums ${
                usageFrictionActive ? "text-amber-200/95" : "text-cyan-300/95"
              }`}
            >
              {subscriptionSummary!.usage.dailyLimit != null
                ? L.usageRemainingLine(subscriptionSummary!.usage.remainingToday ?? 0)
                : L.usageNoDailyCapLine}
            </p>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-black/35">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  usageFrictionActive
                    ? "bg-gradient-to-r from-amber-600 to-amber-400"
                    : "bg-gradient-to-r from-nb-primary to-nb-secondary"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    subscriptionSummary!.usage.dailyLimit != null &&
                      (subscriptionSummary!.usage.dailyLimit ?? 0) > 0
                      ? (subscriptionSummary!.usage.usedToday / (subscriptionSummary!.usage.dailyLimit ?? 1)) * 100
                      : ((subscriptionSummary!.usage.softFrictionAfterOps ?? 5) > 0
                          ? subscriptionSummary!.usage.usedToday / (subscriptionSummary!.usage.softFrictionAfterOps ?? 5)
                          : 0) * 100,
                  )}%`,
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => (onUsageUpgradeClick ? onUsageUpgradeClick() : onSelect("subscription"))}
              className="nb-transition mt-3 w-full rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 to-amber-600/10 px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.06em] text-amber-100 shadow-[0_0_22px_-10px_rgba(245,158,11,0.55)] hover:brightness-110"
            >
              {L.usageUpgradeCta}
            </button>
          </div>
        </div>
      ) : null}

      <div className="border-t border-white/[0.06] px-3 py-4">
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-nb-muted">{L.langSection}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onLanguageChange("tr")}
            className={`nb-transition flex-1 rounded-2xl border px-3 py-2 text-center text-xs font-semibold ${
              language === "tr"
                ? "border-nb-primary/45 bg-nb-primary/15 text-nb-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_20px_-6px_rgba(59,130,246,0.35)]"
                : "border-white/[0.08] bg-nb-bg-soft/80 text-nb-muted hover:scale-[1.02] hover:border-nb-primary/30 hover:text-nb-text"
            }`}
          >
            TR
          </button>
          <button
            type="button"
            onClick={() => onLanguageChange("en")}
            className={`nb-transition flex-1 rounded-2xl border px-3 py-2 text-center text-xs font-semibold ${
              language === "en"
                ? "border-nb-primary/45 bg-nb-primary/15 text-nb-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_20px_-6px_rgba(59,130,246,0.35)]"
                : "border-white/[0.08] bg-nb-bg-soft/80 text-nb-muted hover:scale-[1.02] hover:border-nb-primary/30 hover:text-nb-text"
            }`}
          >
            EN
          </button>
        </div>
        <button
          type="button"
          onClick={onGoHome}
          className="nb-transition mt-3 w-full rounded-2xl border border-white/[0.1] bg-nb-panel/50 px-3 py-2 text-center text-xs font-medium text-nb-muted hover:scale-[1.01] hover:border-nb-primary/30 hover:bg-nb-panel hover:text-nb-text hover:shadow-md"
        >
          {L.homeNav}
        </button>
      </div>
    </aside>
  );
}

export function DashboardSidebarMobileRail({
  active,
  onSelect,
  language,
  onLanguageChange,
  onGoHome,
  lockedFeatures,
  userRole,
  onOpenAdminDashboard,
  enabledToolIds,
  resolveToolLabel,
}: DashboardSidebarProps) {
  const L = ws(language);
  const toolOrder = enabledToolIds?.length ? enabledToolIds : SIDEBAR_TOOL_ORDER;
  const labelForTool = resolveToolLabel ?? ((id: FeatureKey) => sidebarToolLabel(id, language));
  const labelFor = (id: FeatureKey) => labelForTool(id);

  return (
    <div className="sticky top-14 z-30 border-b border-white/[0.06] bg-nb-bg/95 backdrop-blur-md md:hidden">
      <div className="flex gap-1.5 overflow-x-auto py-2 pl-2 pr-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {userRole === "ADMIN" && onOpenAdminDashboard ? (
          <button
            type="button"
            onClick={onOpenAdminDashboard}
            className="nb-transition shrink-0 rounded-full border border-violet-400/40 bg-violet-500/15 px-2.5 py-1.5 text-[10px] font-semibold whitespace-nowrap text-violet-100"
          >
            {language === "tr" ? "Yönetim" : "Admin"}
          </button>
        ) : null}
        {toolOrder.map((id) => {
          const isActive = active === id;
          const locked = lockedFeatures.has(id);
          const short = labelForTool(id).replace(/\s+/g, "");
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              title={locked ? L.lockedFeatureTooltip : undefined}
              aria-label={locked ? `${labelFor(id)}. ${L.lockedFeatureTooltip}` : undefined}
              className={`nb-transition shrink-0 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold whitespace-nowrap ${
                isActive
                  ? "border-nb-primary/45 bg-nb-primary/15 text-nb-accent"
                  : "border-white/[0.08] bg-nb-panel/60 text-nb-muted hover:border-nb-primary/25 hover:text-nb-text"
              } ${
                locked
                  ? "ring-1 ring-amber-400/40 shadow-[0_0_18px_-6px_rgba(245,158,11,0.55)] hover:ring-amber-400/55"
                  : ""
              }`}
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
