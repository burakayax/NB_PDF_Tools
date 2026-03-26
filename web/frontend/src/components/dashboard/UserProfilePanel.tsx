import { useEffect, useState, type FormEvent } from "react";
import type { AuthUser } from "../../api/auth";
import type { PlanName } from "../../api/subscription";
import { localizedPlanDisplayName } from "../../i18n/plans";
import type { Language } from "../../i18n/landing";

type ToastType = "success" | "error" | "loading" | "info";

type UserProfilePanelProps = {
  user: AuthUser;
  language: Language;
  updateProfile: (firstName: string, lastName: string) => Promise<AuthUser | null>;
  showToast: (type: ToastType, title: string, detail: string) => void;
  onOpenChangePassword: () => void;
};

const inputClass =
  "w-full rounded-xl border border-white/[0.08] bg-nb-bg-soft/60 px-4 py-3 text-sm text-nb-text outline-none transition duration-200 ease-out placeholder:text-nb-muted focus:border-nb-primary/50 focus:ring-2 focus:ring-nb-primary/15 hover:border-white/12";

function planNameFromUser(plan: string): PlanName {
  if (plan === "PRO" || plan === "BUSINESS" || plan === "FREE") {
    return plan;
  }
  return "FREE";
}

function formatSubscriptionExpiry(iso: string | null | undefined, language: Language): string {
  if (!iso) {
    return "—";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  return d.toLocaleDateString(language === "tr" ? "tr-TR" : "en-US", { dateStyle: "long" });
}

function splitFromName(name: string | null | undefined): { first: string; last: string } {
  const t = name?.trim() ?? "";
  if (!t) {
    return { first: "", last: "" };
  }
  const i = t.indexOf(" ");
  if (i <= 0) {
    return { first: t, last: "" };
  }
  return { first: t.slice(0, i).trim(), last: t.slice(i + 1).trim() };
}

export function UserProfilePanel({ user, language, updateProfile, showToast, onOpenChangePassword }: UserProfilePanelProps) {
  const tr = language === "tr";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileSubmitting, setProfileSubmitting] = useState(false);

  useEffect(() => {
    const f = user.firstName?.trim() ?? "";
    const l = user.lastName?.trim() ?? "";
    if (f || l) {
      setFirstName(f);
      setLastName(l);
    } else {
      const s = splitFromName(user.name);
      setFirstName(s.first);
      setLastName(s.last);
    }
  }, [user.id, user.firstName, user.lastName, user.name]);

  const isLocalPassword = user.authProvider !== "google";

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstName.trim()) {
      showToast("error", tr ? "Profil" : "Profile", tr ? "Ad gereklidir." : "First name is required.");
      return;
    }
    if (!lastName.trim()) {
      showToast("error", tr ? "Profil" : "Profile", tr ? "Soyad gereklidir." : "Last name is required.");
      return;
    }

    setProfileSubmitting(true);
    try {
      const next = await updateProfile(firstName.trim(), lastName.trim());
      if (next) {
        showToast(
          "success",
          tr ? "Profil" : "Profile",
          tr ? "Ad ve soyadınız güncellendi." : "Your name was updated.",
        );
      }
    } catch (error) {
      showToast(
        "error",
        tr ? "Profil" : "Profile",
        error instanceof Error ? error.message : tr ? "Güncellenemedi." : "Update failed.",
      );
    } finally {
      setProfileSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/[0.08] bg-nb-panel/50 p-6 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-nb-muted">{tr ? "Profil" : "Profile"}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-nb-text">{tr ? "Kişisel bilgiler" : "Personal details"}</h2>

        <form className="mt-6 space-y-4" onSubmit={(e) => void handleProfileSubmit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-nb-muted">{tr ? "Ad" : "First name"}</span>
              <input type="text" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} disabled={profileSubmitting} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-nb-muted">{tr ? "Soyad" : "Last name"}</span>
              <input type="text" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} disabled={profileSubmitting} />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-nb-muted">{tr ? "E-posta" : "Email"}</span>
            <input type="email" value={user.email} readOnly className={`${inputClass} cursor-not-allowed opacity-80`} />
            <span className="mt-1 block text-xs text-nb-muted">{tr ? "E-posta değiştirilemez." : "Email cannot be changed here."}</span>
          </label>

          <button
            type="submit"
            disabled={profileSubmitting}
            className="rounded-xl bg-gradient-to-b from-nb-primary-mid to-nb-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_32px_-10px_rgba(37,99,235,0.45)] transition duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {profileSubmitting ? (tr ? "Kaydediliyor…" : "Saving…") : tr ? "Adı güncelle" : "Update name"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-nb-panel/50 p-6 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-nb-muted">{tr ? "Abonelik" : "Subscription"}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-nb-text">{tr ? "Plan ve yenileme" : "Plan and renewal"}</h2>
        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] pb-3">
            <dt className="text-nb-muted">{tr ? "Plan" : "Plan"}</dt>
            <dd className="font-medium text-nb-text">{localizedPlanDisplayName(planNameFromUser(user.plan), language)}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-nb-muted">{tr ? "Abonelik bitişi" : "Subscription ends"}</dt>
            <dd className="font-medium text-nb-text">{formatSubscriptionExpiry(user.subscription_expiry, language)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-nb-muted">
          {tr
            ? "Abonelik bitişi, ücretli plan satın alındığında veya yenilendiğinde güncellenir."
            : "Subscription end date is set when you purchase or renew a paid plan."}
        </p>
      </section>

      <section
        id="profile-password-section"
        className="rounded-2xl border border-white/[0.08] bg-nb-panel/50 p-6 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)] backdrop-blur-sm"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-nb-muted">{tr ? "Güvenlik" : "Security"}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-nb-text">{tr ? "Şifre değiştir" : "Change password"}</h2>

        {!isLocalPassword ? (
          <p className="mt-4 text-sm leading-relaxed text-nb-muted">
            {tr
              ? "Google hesabınızla giriş yaptınız. Şifre yönetimi Google hesabınız üzerinden yapılır."
              : "You signed in with Google. Password is managed in your Google account."}
          </p>
        ) : (
          <div className="mt-6">
            <p className="text-sm leading-relaxed text-nb-muted">
              {tr
                ? "Hesap şifrenizi güncellemek için aşağıdaki düğmeyi kullanın."
                : "Use the button below to update your account password."}
            </p>
            <button
              type="button"
              onClick={onOpenChangePassword}
              className="nb-transition mt-4 rounded-xl border border-white/[0.1] bg-nb-panel/70 px-5 py-2.5 text-sm font-semibold text-nb-text hover:border-nb-primary/35 hover:bg-nb-panel"
            >
              {tr ? "Şifre değiştir" : "Change password"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
