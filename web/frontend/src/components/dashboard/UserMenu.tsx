import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "../../api/auth";
import type { Language } from "../../i18n/landing";
import { userGreetingLine } from "./userDisplayName";

type UserMenuProps = {
  user: AuthUser;
  language: Language;
  onProfile: () => void;
  onPassword: () => void;
  onLogout: () => void;
};

export function UserMenu({ user, language, onProfile, onPassword, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const greeting = userGreetingLine(user, language);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="nb-transition flex items-center gap-2 rounded-xl border border-white/[0.08] bg-nb-panel/75 px-3 py-1.5 text-left shadow-sm hover:border-nb-primary/35 hover:bg-nb-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-nb-primary/45"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="max-w-[260px] truncate text-sm font-medium text-nb-text">{greeting}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-nb-muted transition duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-[60] mt-2 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-nb-bg-elevated/98 py-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.05)_inset] backdrop-blur-md"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-4 py-2.5 text-left text-sm text-nb-text transition duration-200 hover:bg-nb-primary/10"
            onClick={() => {
              setOpen(false);
              onProfile();
            }}
          >
            Profilim
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-4 py-2.5 text-left text-sm text-nb-text transition duration-200 hover:bg-nb-primary/10"
            onClick={() => {
              setOpen(false);
              onPassword();
            }}
          >
            Şifre Değiştir
          </button>
          <div className="my-1 h-px bg-white/[0.08]" />
          <button
            type="button"
            role="menuitem"
            className="block w-full px-4 py-2.5 text-left text-sm text-rose-300/95 transition hover:bg-rose-950/50"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Çıkış Yap
          </button>
        </div>
      ) : null}
    </div>
  );
}
