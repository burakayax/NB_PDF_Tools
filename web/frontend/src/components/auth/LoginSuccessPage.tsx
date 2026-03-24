import { useEffect, useState } from "react";
import type { AuthUser } from "../../api/auth";

type Phase = "loading" | "redirecting" | "error";

type LoginSuccessPageProps = {
  completeOAuthLogin: (token: string) => Promise<AuthUser>;
  clearSession: () => void;
  onNavigateToDashboard: () => void;
};

/**
 * Google OAuth callback sonrası: ?token= JWT okunur, localStorage'a yazılır (hook üzerinden), dashboard'a gidilir.
 */
export function LoginSuccessPage({ completeOAuthLogin, clearSession, onNavigateToDashboard }: LoginSuccessPageProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token")?.trim();

    if (!token) {
      if (import.meta.env.DEV) {
        console.warn("[LoginSuccessPage] missing ?token= in URL");
      }
      setErrorMessage("No sign-in token was provided. Please try Google sign-in again.");
      setPhase("error");
      return;
    }

    if (import.meta.env.DEV) {
      console.info("[LoginSuccessPage] validating token and persisting session");
    }

    let cancelled = false;

    void completeOAuthLogin(token)
      .then((user) => {
        if (cancelled) {
          return;
        }
        if (import.meta.env.DEV) {
          console.info("[LoginSuccessPage] session stored in localStorage, redirecting", { userId: user.id });
        }
        setPhase("redirecting");
        onNavigateToDashboard();
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        console.error("[LoginSuccessPage] token validation failed:", error);
        clearSession();
        setErrorMessage("Google sign-in failed. The link may have expired or the token is invalid.");
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [clearSession, completeOAuthLogin, onNavigateToDashboard]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f172a] px-6 py-16 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#111827] p-8 shadow-xl">
        {phase === "loading" || phase === "redirecting" ? (
          <>
            <div className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">NB PDF TOOLS</div>
            <h1 className="text-xl font-semibold text-white">
              {phase === "redirecting" ? "Opening workspace…" : "Signing you in…"}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              {phase === "redirecting" ? "Redirecting to your dashboard." : "Verifying your account and saving your session."}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <span
                className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"
                aria-hidden
              />
              <span className="text-sm text-slate-500">Please wait</span>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-rose-300">Error</div>
            <h1 className="text-xl font-semibold text-white">Sign-in could not complete</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{errorMessage}</p>
            <a
              href="/?view=login"
              className="mt-8 inline-flex items-center justify-center rounded-xl bg-slate-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-600"
            >
              Back to login
            </a>
          </>
        )}
      </div>
    </div>
  );
}
