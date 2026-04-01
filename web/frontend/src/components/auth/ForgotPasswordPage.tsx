import { useMemo, useState, type FormEvent } from "react";
import {
  completePasswordResetApi,
  requestPasswordReset,
  verifyPasswordResetCodeApi,
} from "../../api/auth";
import { forgotPasswordTranslations, translateAuthApiMessage } from "../../i18n/auth";
import type { Language } from "../../i18n/landing";
import { validateNewPasswordPolicy } from "../../lib/passwordPolicy";

type Step = "email" | "code" | "newPassword";

type ForgotPasswordPageProps = {
  language: Language;
  onBackToLogin: () => void;
  onCompleted: (successMessage: string) => void;
};

const inputClassName =
  "w-full rounded-xl border border-white/[0.08] bg-nb-bg-soft/95 px-4 py-3.5 text-[15px] leading-snug text-nb-text shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition duration-200 ease-out placeholder:text-nb-muted focus:border-nb-primary/55 focus:ring-2 focus:ring-nb-primary/20 hover:border-white/14";

export function ForgotPasswordPage({ language, onBackToLogin, onCompleted }: ForgotPasswordPageProps) {
  const copy = useMemo(() => forgotPasswordTranslations[language], [language]);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleEmailStep(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim()) {
      setError(language === "tr" ? "E-posta adresi gereklidir." : "Email address is required.");
      return;
    }
    setSubmitting(true);
    try {
      const { message } = await requestPasswordReset(email, language);
      setInfo(message);
      setStep("code");
    } catch (e) {
      setError(translateAuthApiMessage(e instanceof Error ? e.message : "Request failed.", language));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodeStep(event: FormEvent) {
    event.preventDefault();
    setError("");
    const digits = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(digits)) {
      setError(language === "tr" ? "6 haneli kodu girin." : "Enter the 6-digit code.");
      return;
    }
    setSubmitting(true);
    try {
      const { resetToken: token } = await verifyPasswordResetCodeApi(email, digits);
      setResetToken(token);
      setStep("newPassword");
    } catch (e) {
      setError(translateAuthApiMessage(e instanceof Error ? e.message : "Verification failed.", language));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNewPasswordStep(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError(copy.passwordsMismatch);
      return;
    }
    const policy = validateNewPasswordPolicy(newPassword);
    if (!policy.ok) {
      const msg =
        language === "tr"
          ? policy.issues.map((i) => i.tr).join(" · ")
          : policy.issues.map((i) => i.en).join(" · ");
      setError(msg);
      return;
    }
    setSubmitting(true);
    try {
      const { message } = await completePasswordResetApi(resetToken, newPassword);
      onCompleted(translateAuthApiMessage(message, language));
    } catch (e) {
      setError(translateAuthApiMessage(e instanceof Error ? e.message : "Reset failed.", language));
    } finally {
      setSubmitting(false);
    }
  }

  const stepTitle =
    step === "email" ? copy.stepEmailTitle : step === "code" ? copy.stepCodeTitle : copy.stepNewTitle;
  const stepHint =
    step === "email" ? copy.stepEmailHint : step === "code" ? copy.stepCodeHint : copy.stepNewHint;

  return (
    <div className="relative min-h-screen overflow-hidden bg-nb-bg font-sans text-nb-text antialiased">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-18%,rgba(37,99,235,0.2),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[40vh] bg-[radial-gradient(ellipse_80%_60%_at_50%_100%,rgba(56,189,248,0.09),transparent_65%)]" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[480px] flex-col justify-center px-5 py-14 sm:px-8">
        <button
          type="button"
          onClick={onBackToLogin}
          className="group mb-10 inline-flex min-h-11 w-fit items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-semibold text-nb-text shadow-sm transition duration-200 ease-out hover:border-nb-primary/30 hover:bg-white/[0.08] hover:text-white"
        >
          <span className="mr-1 transition group-hover:-translate-x-0.5">←</span>
          {copy.backToLogin}
        </button>

        <div className="rounded-[28px] border border-white/[0.08] bg-nb-panel/55 p-8 shadow-[0_50px_100px_-24px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl sm:p-10">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.38em] text-sky-300/90">NB Global Studio</p>
          <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem] sm:leading-tight">{copy.title}</h1>
          <h2 className="mt-6 text-center text-lg font-semibold text-white/95">{stepTitle}</h2>
          <p className="mx-auto mt-2 max-w-[340px] text-center text-sm leading-relaxed text-nb-muted">{stepHint}</p>

          {info && step === "code" ? (
            <div className="mt-5 rounded-xl border border-sky-500/25 bg-sky-500/[0.1] px-4 py-3 text-sm text-sky-50">{info}</div>
          ) : null}

          {error ? (
            <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/[0.08] px-4 py-3 text-sm text-rose-100">{error}</div>
          ) : null}

          {step === "email" ? (
            <form className="mt-8 space-y-5" onSubmit={handleEmailStep}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-nb-muted">{copy.emailLabel}</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClassName}
                  placeholder="name@company.com"
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-nb-primary-mid to-nb-primary px-6 text-base font-semibold text-white shadow-[0_16px_40px_-12px_rgba(37,99,235,0.45)] transition duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (language === "tr" ? "Gönderiliyor…" : "Sending…") : copy.sendCode}
              </button>
            </form>
          ) : null}

          {step === "code" ? (
            <form className="mt-8 space-y-5" onSubmit={handleCodeStep}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-nb-muted">{copy.codeLabel}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ""))}
                  className={inputClassName}
                  placeholder="000000"
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-nb-primary-mid to-nb-primary px-6 text-base font-semibold text-white shadow-[0_16px_40px_-12px_rgba(37,99,235,0.45)] transition duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (language === "tr" ? "Kontrol…" : "Checking…") : copy.verifyCode}
              </button>
            </form>
          ) : null}

          {step === "newPassword" ? (
            <form className="mt-8 space-y-5" onSubmit={handleNewPasswordStep}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-nb-muted">{copy.newPasswordLabel}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClassName}
                  placeholder="••••••••"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-nb-muted">{copy.confirmPasswordLabel}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClassName}
                  placeholder="••••••••"
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-nb-primary-mid to-nb-primary px-6 text-base font-semibold text-white shadow-[0_16px_40px_-12px_rgba(37,99,235,0.45)] transition duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (language === "tr" ? "Kaydediliyor…" : "Saving…") : copy.savePassword}
              </button>
            </form>
          ) : null}
        </div>
      </main>
    </div>
  );
}
