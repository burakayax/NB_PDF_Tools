import { useEffect, useMemo, useState, type FormEvent } from "react";
import { userEffectiveHasPassword, type AuthUser } from "../../api/auth";
import type { Language } from "../../i18n/landing";
import { newPasswordStrengthScore, validateNewPasswordPolicy } from "../../lib/passwordPolicy";

type ToastFn = (type: "success" | "error" | "loading" | "info", title: string, detail: string) => void;

type ChangePasswordModalProps = {
  open: boolean;
  onClose: () => void;
  user: AuthUser;
  language: Language;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthUser | null>;
  setInitialPassword: (newPassword: string) => Promise<AuthUser | null>;
  showToast: ToastFn;
};

const inputClass =
  "w-full rounded-xl border border-white/[0.08] bg-nb-bg-soft/60 px-4 py-3 text-sm text-nb-text outline-none transition duration-200 ease-out placeholder:text-nb-muted focus:border-nb-primary/50 focus:ring-2 focus:ring-nb-primary/15 hover:border-white/12";

const MODAL_CLOSE_DELAY_MS = 900;

export function ChangePasswordModal({
  open,
  onClose,
  user,
  language,
  changePassword,
  setInitialPassword,
  showToast,
}: ChangePasswordModalProps) {
  const tr = language === "tr";
  const hasPwd = userEffectiveHasPassword(user);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSubmitting(false);
    setApiError("");
  }, [open, user.id]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, submitting]);

  const strengthScore = useMemo(() => newPasswordStrengthScore(newPassword), [newPassword]);
  const strengthLabels = tr
    ? ["Çok zayıf", "Zayıf", "Orta", "İyi", "Güçlü", "Çok güçlü"]
    : ["Very weak", "Weak", "Fair", "Good", "Strong", "Very strong"];
  const strengthLabel = strengthLabels[strengthScore];
  const strengthBarClass =
    strengthScore <= 1
      ? "bg-red-500/80"
      : strengthScore === 2
        ? "bg-amber-500/80"
        : strengthScore === 3
          ? "bg-yellow-400/80"
          : "bg-emerald-500/85";

  const checklist = tr
    ? [
        { ok: newPassword.length >= 10, text: "En az 10 karakter" },
        { ok: /[a-z]/.test(newPassword), text: "Küçük harf" },
        { ok: /[A-Z]/.test(newPassword), text: "Büyük harf" },
        { ok: /\d/.test(newPassword), text: "Rakam" },
        { ok: /[^A-Za-z0-9]/.test(newPassword), text: "Sembol" },
      ]
    : [
        { ok: newPassword.length >= 10, text: "10+ characters" },
        { ok: /[a-z]/.test(newPassword), text: "Lowercase" },
        { ok: /[A-Z]/.test(newPassword), text: "Uppercase" },
        { ok: /\d/.test(newPassword), text: "Number" },
        { ok: /[^A-Za-z0-9]/.test(newPassword), text: "Symbol" },
      ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setApiError("");

    if (hasPwd) {
      if (!currentPassword.trim()) {
        showToast("error", tr ? "Şifre" : "Password", tr ? "Mevcut şifrenizi girin." : "Enter your current password.");
        return;
      }
      if (currentPassword === newPassword) {
        showToast(
          "error",
          tr ? "Şifre" : "Password",
          tr ? "Yeni şifre mevcut şifrenizden farklı olmalıdır." : "New password must be different from your current password.",
        );
        return;
      }
    }

    const policy = validateNewPasswordPolicy(newPassword);
    if (!policy.ok) {
      const msg = tr ? policy.issues.map((i) => i.tr).join(" · ") : policy.issues.map((i) => i.en).join(" · ");
      showToast("error", tr ? "Şifre gücü" : "Password strength", msg);
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("error", tr ? "Şifre" : "Password", tr ? "Yeni şifreler eşleşmiyor." : "New passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const next = hasPwd
        ? await changePassword(currentPassword, newPassword)
        : await setInitialPassword(newPassword);
      if (!next) {
        showToast("error", tr ? "Şifre" : "Password", tr ? "Oturum bulunamadı; yeniden giriş yapın." : "Session not found; please sign in again.");
        setSubmitting(false);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast(
        "success",
        tr ? "Şifre" : "Password",
        hasPwd
          ? tr
            ? "Şifreniz başarıyla güncellendi"
            : "Your password was updated successfully."
          : tr
            ? "Hesap şifreniz kaydedildi; e-posta ve şifre ile de giriş yapabilirsiniz."
            : "Your account password is set; you can also sign in with email and password.",
      );
      window.setTimeout(() => {
        onClose();
      }, MODAL_CLOSE_DELAY_MS);
    } catch (error) {
      const msg = error instanceof Error ? error.message : tr ? "Şifre değiştirilemedi." : "Password change failed.";
      setApiError(msg);
      showToast("error", tr ? "Şifre" : "Password", msg);
      setSubmitting(false);
    }
  }

  if (!open) {
    return null;
  }

  const title = hasPwd ? (tr ? "Şifre değiştir" : "Change password") : tr ? "Şifre belirle" : "Set password";
  const closeLabel = tr ? "Kapat" : "Close";

  return (
    <div
      className="contact-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div
        className="contact-modal max-h-[min(90vh,560px)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-modal-title"
        aria-busy={submitting}
      >
        <div className="contact-modal__header">
          <h2 id="change-password-modal-title">{title}</h2>
          <button
            type="button"
            className="contact-modal__close"
            onClick={() => (!submitting ? onClose() : undefined)}
            disabled={submitting}
            aria-label={closeLabel}
          >
            ×
          </button>
        </div>

        <form className="contact-modal__form" onSubmit={(e) => void handleSubmit(e)}>
          {apiError ? (
            <div
              className="mb-4 rounded-xl border border-rose-500/45 bg-rose-950/50 px-3 py-2.5 text-sm leading-snug text-rose-100"
              role="alert"
            >
              {apiError}
            </div>
          ) : null}
          {hasPwd ? (
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-nb-muted">{tr ? "Mevcut şifre" : "Current password"}</span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
                disabled={submitting}
              />
            </label>
          ) : null}
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-nb-muted">{tr ? "Yeni şifre" : "New password"}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              disabled={submitting}
            />
            {newPassword.length > 0 ? (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-nb-muted">
                  <span>{tr ? "Güç" : "Strength"}</span>
                  <span className="font-medium text-nb-text">{strengthLabel}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuenow={strengthScore} aria-valuemin={0} aria-valuemax={5}>
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strengthBarClass}`}
                    style={{ width: `${(strengthScore / 5) * 100}%` }}
                  />
                </div>
                <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                  {checklist.map((row) => (
                    <li key={row.text} className={row.ok ? "text-emerald-400/90" : "text-nb-muted"}>
                      {row.ok ? "✓ " : "○ "}
                      {row.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-nb-muted">{tr ? "Yeni şifre (tekrar)" : "Confirm new password"}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              disabled={submitting}
            />
          </label>

          <button type="submit" className="primary-action" disabled={submitting}>
            {submitting ? (
              <span className="inline-flex items-center justify-center gap-2">
                <svg
                  className="h-4 w-4 shrink-0 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-90"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {tr ? "Güncelleniyor…" : "Updating…"}
              </span>
            ) : hasPwd ? (
              tr ? (
                "Şifreyi güncelle"
              ) : (
                "Update password"
              )
            ) : tr ? (
              "Şifreyi kaydet"
            ) : (
              "Save password"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
