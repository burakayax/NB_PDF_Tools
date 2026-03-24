import { useCallback, useEffect, useState } from "react";

const SHOW_AFTER_PX = 360;

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);
  const [, langTick] = useState(0);

  const updateVisible = useCallback(() => {
    setVisible(window.scrollY > SHOW_AFTER_PX);
  }, []);

  useEffect(() => {
    updateVisible();
    window.addEventListener("scroll", updateVisible, { passive: true });
    return () => window.removeEventListener("scroll", updateVisible);
  }, [updateVisible]);

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      langTick((n) => n + 1);
    });
    observer.observe(el, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const label = document.documentElement.lang === "tr" ? "Yukarı çık" : "Back to top";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={scrollToTop}
      className={`fixed bottom-[max(7rem,calc(env(safe-area-inset-bottom)+5.5rem))] right-5 z-[55] flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.12] bg-slate-900/85 text-slate-200 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.06)_inset] backdrop-blur-md transition-[opacity,transform,box-shadow] duration-300 ease-out hover:border-blue-500/35 hover:bg-slate-800/90 hover:text-white hover:shadow-[0_12px_40px_-8px_rgba(37,99,235,0.25)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500/60 active:scale-95 sm:bottom-10 sm:right-6 ${
        visible ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-2 scale-95 opacity-0"
      }`}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
