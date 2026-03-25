import type { AuthUser } from "../../api/auth";
import type { Language } from "../../i18n/landing";
import { UserMenu } from "./UserMenu";

type DashboardTopNavProps = {
  user: AuthUser;
  language: Language;
  onLogoClick: () => void;
  onProfile: () => void;
  onPassword: () => void;
  onLogout: () => void;
};

export function DashboardTopNav({ user, language, onLogoClick, onProfile, onPassword, onLogout }: DashboardTopNavProps) {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/[0.08] bg-gradient-to-r from-nb-bg/95 via-nb-bg-elevated/95 to-nb-bg/95 px-3 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.45)] backdrop-blur-md md:px-6">
      <button
        type="button"
        onClick={onLogoClick}
        className="nb-transition flex items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-nb-primary/45"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-nb-primary/30 bg-nb-primary/10 shadow-[0_0_24px_rgba(37,99,235,0.18)]">
          <img src="/nb_pdf_tools_icon.png" alt="" className="h-5 w-5 rounded-md object-cover" />
        </span>
        <span className="hidden sm:block">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">NB Global Studio</span>
          <span className="block text-[15px] font-semibold tracking-[0.12em] text-nb-text">NB PDF TOOLS</span>
        </span>
        <span className="max-w-[140px] truncate sm:hidden text-sm font-semibold tracking-wide text-nb-text">NB PDF TOOLS</span>
      </button>

      <UserMenu user={user} language={language} onProfile={onProfile} onPassword={onPassword} onLogout={onLogout} />
    </header>
  );
}
