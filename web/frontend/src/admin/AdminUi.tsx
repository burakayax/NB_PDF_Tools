import type { ReactNode } from "react";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition-shadow focus:ring-2 focus:ring-violet-500/35";

/** Label + açıklama + kontrol — tek tip alan düzeni. */
export function AdminField({
  label,
  description,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  description?: string;
  /** Kısa ipucu; küçük (i) ile gösterilir. */
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-0">
      <div className="flex items-center gap-2">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-200">
          {label}
        </label>
        {hint ? (
          <button
            type="button"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-[10px] font-bold text-slate-400 hover:border-white/25 hover:text-slate-200"
            title={hint}
            aria-label={hint}
          >
            i
          </button>
        ) : null}
      </div>
      {description ? <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{description}</p> : null}
      <div className={description ? "mt-2" : "mt-1.5"}>{children}</div>
    </div>
  );
}

export type AdminSaveStripState = "idle" | "saving" | "saved" | "error";

export function AdminSaveStrip({ state, detail }: { state: AdminSaveStripState; detail?: string | null }) {
  if (state === "idle" && !detail) {
    return null;
  }
  const styles =
    state === "saving"
      ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-100"
      : state === "saved"
        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
        : state === "error"
          ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
          : "border-white/[0.08] bg-white/[0.04] text-slate-300";
  const label =
    state === "saving" ? "Kaydediliyor…" : state === "saved" ? "Kaydedildi" : state === "error" ? "Hata oluştu" : "";
  return (
    <div className={`rounded-xl border px-4 py-2.5 text-sm ${styles}`} role="status">
      {label ? <span className="font-medium">{label}</span> : null}
      {detail ? <span className={label ? "mt-1 block text-[13px] opacity-90" : "block"}>{detail}</span> : null}
    </div>
  );
}

const sectionVariants = {
  default: "border-white/[0.08] bg-black/25",
  emerald: "border-emerald-500/20 bg-emerald-500/[0.06]",
  violet: "border-violet-500/25 bg-violet-500/[0.07]",
  sky: "border-cyan-500/20 bg-cyan-500/[0.06]",
  amber: "border-amber-500/20 bg-amber-500/[0.07]",
} as const;

export function AdminSection({
  title,
  description,
  children,
  variant = "default",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  variant?: keyof typeof sectionVariants;
}) {
  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${sectionVariants[variant]}`}>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {description ? <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{description}</p> : null}
      <div className={description ? "mt-5 space-y-5" : "mt-4 space-y-5"}>{children}</div>
    </section>
  );
}

export function AdminMutedBox({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[13px] leading-relaxed text-slate-400">{children}</div>;
}

/** Where admin edits show up in the product (honest mapping for operators). */
export function AdminImpactCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200/95">{title}</p>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-slate-300">{children}</div>
    </aside>
  );
}

export { inputClass as adminInputClass };

export type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  variant = "default",
  busy = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} aria-label="Kapat" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#0f1628] p-6 shadow-2xl">
        <h2 id="confirm-title" className="text-lg font-semibold text-white">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{message}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-white/[0.12] px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/[0.06] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${
              variant === "danger"
                ? "bg-red-600/85 text-white hover:bg-red-600"
                : "bg-violet-600/80 text-white hover:bg-violet-600"
            }`}
          >
            {busy ? "İşleniyor…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export type NavItem = { id: string; label: string; hint?: string };
export type NavGroup = { title: string; items: NavItem[] };

export function AdminSidebarNav({
  groups,
  activeId,
  onSelect,
}: {
  groups: NavGroup[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-2">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{g.title}</p>
          <div className="flex flex-col gap-0.5">
            {g.items.map((t) => {
              const active = activeId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(t.id)}
                  title={t.hint}
                  className={`rounded-xl px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-violet-500/25 text-violet-50 ring-1 ring-violet-400/40" : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                  }`}
                >
                  <span className="block text-[13px] font-medium leading-tight">{t.label}</span>
                  {t.hint && !active ? <span className="mt-0.5 block text-[10px] text-slate-600">{t.hint}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
