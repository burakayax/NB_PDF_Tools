import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getGoogleOAuthStartUrl } from "../../api/auth";
import { getAuthCopy } from "../../i18n/auth";
import type { Language } from "../../i18n/landing";

type AuthMode = "login" | "register";

type AuthPageProps = {
  mode: AuthMode;
  language: Language;
  submitting: boolean;
  serverError: string;
  /** Kayıt sonrası giriş sekmesinde gösterilen API başarı metni */
  registrationSuccessBanner?: string | null;
  onDismissRegistrationSuccess?: () => void;
  onBack: () => void;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (payload: { email: string; password: string }) => Promise<void>;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
};

const inputClassName =
  "w-full rounded-xl border border-white/[0.08] bg-[#0f172a]/90 px-4 py-3.5 text-[15px] leading-snug text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition duration-200 placeholder:text-slate-500 focus:border-blue-500/55 focus:ring-2 focus:ring-blue-500/20 hover:border-white/15";

function GoogleMark() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function AuthPage({
  mode,
  language,
  submitting,
  serverError,
  registrationSuccessBanner,
  onDismissRegistrationSuccess,
  onBack,
  onModeChange,
  onSubmit,
  onOpenTerms,
  onOpenPrivacy,
}: AuthPageProps) {
  const copy = useMemo(() => getAuthCopy(language, mode), [language, mode]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [urlAuthError, setUrlAuthError] = useState("");
  const [urlEmailVerifiedNotice, setUrlEmailVerifiedNotice] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    const err = url.searchParams.get("oauth_error");
    if (err) {
      try {
        setUrlAuthError(decodeURIComponent(err.replace(/\+/g, " ")));
      } catch {
        setUrlAuthError(err);
      }
      url.searchParams.delete("oauth_error");
      changed = true;
    }
    if (url.searchParams.get("email_verified") === "1") {
      setUrlEmailVerifiedNotice(true);
      url.searchParams.delete("email_verified");
      changed = true;
    }
    if (changed) {
      const qs = url.searchParams.toString();
      window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      setLocalError(language === "tr" ? "E-posta adresi gereklidir." : "Email address is required.");
      return;
    }

    if (password.length < 8) {
      setLocalError(language === "tr" ? "Şifre en az 8 karakter olmalıdır." : "Password must be at least 8 characters.");
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setLocalError(language === "tr" ? "Şifreler eşleşmiyor." : "Passwords do not match.");
      return;
    }

    setLocalError("");
    await onSubmit({ email, password });
  }

  const activeError = localError || serverError || urlAuthError;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0f172a] font-sans text-slate-100 antialiased">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-18%,rgba(37,99,235,0.2),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[40vh] bg-[radial-gradient(ellipse_80%_60%_at_50%_100%,rgba(56,189,248,0.09),transparent_65%)]" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[480px] flex-col justify-center px-5 py-14 sm:px-8">
        <button
          type="button"
          onClick={onBack}
          className="group mb-10 inline-flex min-h-11 w-fit items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-semibold text-slate-200 shadow-sm transition duration-200 hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
        >
          <span className="mr-1 transition group-hover:-translate-x-0.5">←</span>
          {copy.shared.backToLanding}
        </button>

        <div className="rounded-[28px] border border-white/[0.07] bg-slate-900/55 p-8 shadow-[0_50px_100px_-24px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl sm:p-10">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.38em] text-sky-300/90">NB Global Studio</p>
          <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem] sm:leading-tight">{copy.screen.title}</h1>
          <p className="mx-auto mt-3 max-w-[340px] text-center text-sm leading-relaxed text-slate-400">{copy.screen.description}</p>

          <a
            href={getGoogleOAuthStartUrl(language)}
            className="mt-8 flex min-h-[3.25rem] w-full items-center justify-center gap-3 rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 text-base font-semibold text-white shadow-sm transition duration-200 hover:border-white/20 hover:bg-white/[0.09]"
          >
            <GoogleMark />
            {copy.shared.continueWithGoogle}
          </a>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-white/[0.08]" />
            </div>
            <div className="relative flex justify-center text-xs font-medium uppercase tracking-wider">
              <span className="rounded-md bg-slate-900/95 px-3 py-0.5 text-slate-500">{copy.shared.orContinueEmail}</span>
            </div>
          </div>

          <div className="flex rounded-xl border border-white/[0.08] bg-[#0f172a]/50 p-1">
            <button
              type="button"
              onClick={() => onModeChange("login")}
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition duration-200 ${
                mode === "login"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-950/40"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
              }`}
            >
              {getAuthCopy(language, "login").screen.submit}
            </button>
            <button
              type="button"
              onClick={() => onModeChange("register")}
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition duration-200 ${
                mode === "register"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-950/40"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
              }`}
            >
              {getAuthCopy(language, "register").screen.submit}
            </button>
          </div>

          {mode === "login" && urlEmailVerifiedNotice ? (
            <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.12] px-4 py-3 text-sm text-emerald-50">
              <p>
                <span className="font-semibold">{language === "tr" ? "E-posta doğrulandı. " : "Email verified. "}</span>
                {language === "tr"
                  ? "Artık e-posta adresiniz ve şifrenizle giriş yapabilirsiniz."
                  : "You can now sign in with your email and password."}
              </p>
            </div>
          ) : null}

          {mode === "login" && registrationSuccessBanner ? (
            <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.12] px-4 py-3 text-sm text-emerald-50">
              <div className="flex items-start justify-between gap-3">
                <p>
                  <span className="font-semibold">
                    {language === "tr" ? "Kayıt başarılı — " : "Registration successful — "}
                  </span>
                  {registrationSuccessBanner}
                </p>
                {onDismissRegistrationSuccess ? (
                  <button
                    type="button"
                    onClick={onDismissRegistrationSuccess}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-200/90 hover:bg-white/10"
                  >
                    {language === "tr" ? "Kapat" : "Dismiss"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeError ? (
            <div className="mt-6 rounded-xl border border-rose-500/20 bg-rose-500/[0.08] px-4 py-3 text-sm text-rose-100">
              <span className="font-semibold">{copy.shared.errorPrefix}</span> {activeError}
            </div>
          ) : null}

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">{copy.shared.emailLabel}</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClassName}
                placeholder="name@company.com"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">{copy.shared.passwordLabel}</span>
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputClassName}
                placeholder="••••••••"
              />
            </label>

            {mode === "register" ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">{copy.shared.confirmPasswordLabel}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className={inputClassName}
                  placeholder="••••••••"
                />
              </label>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-lg shadow-blue-950/35 transition duration-200 hover:bg-blue-500 hover:shadow-blue-900/40 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 disabled:shadow-none"
            >
              {submitting ? (language === "tr" ? "İşleniyor..." : "Processing...") : copy.screen.submit}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-400">
            {copy.screen.alternatePrompt}{" "}
            <button
              type="button"
              onClick={() => onModeChange(mode === "login" ? "register" : "login")}
              className="font-semibold text-sky-300 transition duration-200 hover:text-sky-200"
            >
              {copy.screen.alternateAction}
            </button>
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-white/[0.06] pt-8 text-sm text-slate-500">
            <button type="button" onClick={onOpenTerms} className="transition duration-200 hover:text-slate-200">
              {language === "tr" ? "Hizmet Şartları" : "Terms of Service"}
            </button>
            <button type="button" onClick={onOpenPrivacy} className="transition duration-200 hover:text-slate-200">
              {language === "tr" ? "Gizlilik Politikası" : "Privacy Policy"}
            </button>
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-md px-1">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{copy.shared.trustTitle}</p>
          <ul className="mt-5 space-y-3">
            {copy.shared.trustPoints.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm leading-relaxed text-slate-400">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400/90" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
