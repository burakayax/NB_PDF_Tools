import { useSettings } from "../../hooks/useSettings";
import type { Language } from "../../i18n/landing";

const variantClass: Record<string, string> = {
  info: "border-cyan-500/40 bg-cyan-500/15 text-cyan-50",
  warning: "border-amber-500/45 bg-amber-500/15 text-amber-50",
  error: "border-red-500/45 bg-red-500/15 text-red-50",
  success: "border-emerald-500/45 bg-emerald-500/15 text-emerald-50",
};

type Props = {
  language: Language;
};

export function SystemNotificationBanner({ language }: Props) {
  const { notifications } = useSettings();
  if (!notifications?.enabled) {
    return null;
  }
  const msg = language === "tr" ? notifications.messageTr : notifications.messageEn;
  if (!msg?.trim()) {
    return null;
  }
  const linkLabel = language === "tr" ? notifications.linkLabelTr : notifications.linkLabelEn;
  const v = notifications.variant?.toLowerCase() ?? "info";
  const box = variantClass[v] ?? variantClass.info;

  return (
    <div
      role="region"
      aria-label={language === "tr" ? "Sistem duyurusu" : "System announcement"}
      className={`pointer-events-none fixed left-0 right-0 top-0 z-[100] flex justify-center px-3 pt-3`}
    >
      <div
        className={`pointer-events-auto max-w-3xl rounded-2xl border px-4 py-3 text-center text-sm font-medium shadow-lg backdrop-blur-md ${box}`}
      >
        <p className="leading-relaxed">{msg}</p>
        {notifications.linkUrl?.trim() && linkLabel?.trim() ? (
          <a
            href={notifications.linkUrl.trim()}
            className="mt-2 inline-block text-xs font-semibold underline decoration-white/40 underline-offset-2 hover:decoration-white"
          >
            {linkLabel}
          </a>
        ) : null}
      </div>
    </div>
  );
}
