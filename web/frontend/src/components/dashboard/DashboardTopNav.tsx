import type { AuthUser } from "../../api/auth";
import type { PlanName, SubscriptionStatus } from "../../api/subscription";
import { getSaasApiBase } from "../../api/saasBase";
import { useSettings } from "../../hooks/useSettings";
import type { Language } from "../../i18n/landing";
import { resolveCmsAssetUrl } from "../../lib/landingCmsMerge";
import { ws } from "../../i18n/workspace";
import { useMemo } from "react";
import { UserMenu } from "./UserMenu";

type DashboardTopNavProps = {
  user: AuthUser;
  language: Language;
  subscriptionStatus: SubscriptionStatus | null;
  onLogoClick: () => void;
  onProfile: () => void;
  onPassword: () => void;
  onLogout: () => void;
  /** FREE / PRO için plan yükseltme (ör. ücretlendirme modalı) */
  onUpgradeClick?: () => void;
  showAdminEntry?: boolean;
  onOpenAdmin?: () => void;
};

function planNameFromApi(plan: string): PlanName {
  if (plan === "PRO" || plan === "BUSINESS" || plan === "FREE") {
    return plan;
  }
  return "FREE";
}

function subscriptionNavbarLabel(status: SubscriptionStatus, language: Language): string {
  const tier = planNameFromApi(status.plan);
  if (tier === "FREE") {
    return language === "tr" ? "Ücretsiz Plan" : "Free Plan";
  }
  const tierUpper = tier === "PRO" ? "PRO" : "BUSINESS";
  if (status.remaining_days === null) {
    return tierUpper;
  }
  const suffix =
    language === "tr" ? `${status.remaining_days} gün kaldı` : `${status.remaining_days} days left`;
  return `${tierUpper} • ${suffix}`;
}

function showNavbarUpgrade(plan: PlanName): boolean {
  return plan === "FREE" || plan === "PRO";
}

export function DashboardTopNav({
  user,
  language,
  subscriptionStatus,
  onLogoClick,
  onProfile,
  onPassword,
  onLogout,
  onUpgradeClick,
  showAdminEntry,
  onOpenAdmin,
}: DashboardTopNavProps) {
  const W = ws(language);
  const { cms } = useSettings();
  const dashboardLogoSrc = useMemo(() => {
    const assets = cms?.assets as { logoUrl?: string } | undefined;
    return resolveCmsAssetUrl(assets?.logoUrl, getSaasApiBase()) ?? "/nb_pdf_PLARTFORM_icon.png";
  }, [cms]);
  const plan = subscriptionStatus ? planNameFromApi(subscriptionStatus.plan) : null;
  const upgradeVisible = Boolean(onUpgradeClick && plan && showNavbarUpgrade(plan));

  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/[0.1] bg-gradient-to-r from-nb-bg/90 via-nb-bg-elevated/92 to-nb-bg/90 px-3 shadow-[0_4px_28px_-6px_rgba(0,0,0,0.5)] backdrop-blur-xl backdrop-saturate-150 md:px-6">
      <button
        type="button"
        onClick={onLogoClick}
        className="nb-transition flex items-center gap-3 rounded-2xl px-1 py-1 text-left hover:scale-[1.01] hover:bg-white/[0.06] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-nb-primary/45"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-nb-primary/35 bg-gradient-to-br from-nb-primary/20 to-nb-primary/8 shadow-[0_0_28px_rgba(59,130,246,0.28)]">
          <img src={dashboardLogoSrc} alt="" className="h-5 w-5 rounded-md object-cover" />
        </span>
        <span className="hidden sm:block">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">NB Global Studio</span>
          <span className="block text-[15px] font-semibold tracking-[0.12em] text-nb-text">NB PDF PLARTFORM</span>
        </span>
        <span className="max-w-[140px] truncate sm:hidden text-sm font-semibold tracking-wide text-nb-text">NB PDF PLARTFORM</span>
      </button>

      {subscriptionStatus ? (
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-0.5 sm:gap-2 sm:px-2">
          <div
            className="min-w-0 flex-1 flex justify-center"
            title={language === "tr" ? "Sunucu hesaplı kalan süre" : "Remaining time (server-calculated)"}
          >
            <span className="max-w-[min(100%,min(260px,100vw-10rem))] truncate rounded-full border border-white/[0.08] bg-nb-panel/60 px-2 py-1 text-center text-[10px] font-semibold leading-snug tracking-wide text-cyan-200/95 sm:max-w-[min(100%,min(320px,100vw-12rem))] sm:px-3 sm:text-[11px]">
              {subscriptionNavbarLabel(subscriptionStatus, language)}
            </span>
          </div>
          {upgradeVisible ? (
            <button
              type="button"
              onClick={onUpgradeClick}
              className="nb-transition shrink-0 rounded-full border border-cyan-400/45 bg-gradient-to-r from-cyan-500/28 to-indigo-500/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-cyan-50 shadow-[0_0_22px_-8px_rgba(34,211,238,0.5)] hover:border-cyan-300/55 hover:from-cyan-500/38 hover:to-indigo-500/35 sm:px-3 sm:text-[11px]"
            >
              {W.navbarUpgrade}
            </button>
          ) : null}
        </div>
      ) : null}

      {showAdminEntry && onOpenAdmin ? (
        <button
          type="button"
          onClick={onOpenAdmin}
          className="nb-transition mr-1 shrink-0 rounded-full border border-violet-400/40 bg-violet-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-violet-100 hover:bg-violet-500/25 sm:mr-2 sm:px-3 sm:text-[11px]"
        >
          {language === "tr" ? "Yönetim" : "Admin"}
        </button>
      ) : null}

      <UserMenu user={user} language={language} onProfile={onProfile} onPassword={onPassword} onLogout={onLogout} />
    </header>
  );
}
