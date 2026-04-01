import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  createAdminUser,
  deleteAdminBlockedEmail,
  deleteAdminUser,
  fetchAdminBlockedEmails,
  fetchAdminCms,
  fetchAdminMediaList,
  fetchAdminOverview,
  fetchAdminPlans,
  fetchAdminSettings,
  fetchAdminTools,
  fetchAdminUsageSeries,
  fetchAdminUsers,
  patchAdminUser,
  postAdminBlockedEmail,
  putAdminCms,
  putAdminPackagesMarketing,
  putAdminPlanPricing,
  putAdminPlansOverride,
  putAdminSettingsPatches,
  putAdminToolsConfig,
  uploadAdminMedia,
  type AdminMediaItem,
  type AdminOverview,
  type AdminUserRow,
  type BlockedEmailRow,
} from "../api/admin";
import { saasAuthorizedFetch } from "../api/subscription";
import { AUTH_ACCESS_TOKEN_STORAGE_KEY } from "../api/auth";
import { getSaasApiBase } from "../api/saasBase";
import { useJsonEditorHistory } from "./useJsonEditorHistory";

type AdminTabId =
  | "dashboard"
  | "users"
  | "packages"
  | "tools"
  | "content"
  | "media"
  | "settings"
  | "analytics"
  | "global";

const TABS: { id: AdminTabId; label: string }[] = [
  { id: "dashboard", label: "Özet panel" },
  { id: "users", label: "Kullanıcılar" },
  { id: "packages", label: "Paketler ve fiyatlandırma" },
  { id: "tools", label: "Araçlar / Özellikler" },
  { id: "content", label: "İçerik yönetimi" },
  { id: "media", label: "Medya kütüphanesi" },
  { id: "settings", label: "Site ayarları" },
  { id: "analytics", label: "Analitik / Raporlar" },
  { id: "global", label: "Genel site öğeleri" },
];

function readToken(fallback: string) {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(AUTH_ACCESS_TOKEN_STORAGE_KEY) ?? fallback;
}

async function downloadUsageExport(accessToken: string, from: string, to: string) {
  const token = readToken(accessToken);
  const url = `${getSaasApiBase()}/api/admin/reports/usage-export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const r = await saasAuthorizedFetch(token, (t) =>
    fetch(url, { headers: { Authorization: `Bearer ${t}` }, credentials: "include" }),
  );
  if (!r.ok) {
    throw new Error(await r.text());
  }
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `usage-${from}-${to}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function BarTrend({ data, h = 100 }: { data: { date: string; totalOperations: number }[]; h?: number }) {
  const max = Math.max(1, ...data.map((d) => d.totalOperations));
  return (
    <div className="flex items-end gap-0.5 overflow-x-auto pb-8 pt-2" style={{ minHeight: h + 28 }}>
      {data.map((d) => (
        <div key={d.date} className="flex w-7 shrink-0 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-sky-500/50"
            style={{
              height: `${Math.max(2, (d.totalOperations / max) * h)}px`,
            }}
            title={`${d.date}: ${d.totalOperations} işlem`}
          />
          <span className="max-w-[4.5rem] rotate-45 whitespace-nowrap origin-top-left translate-y-3 text-[10px] font-semibold tracking-tight text-slate-200">
            {d.date.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

function PageViewBarTrend({ data, h = 90 }: { data: { date: string; count: number }[]; h?: number }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-0.5 overflow-x-auto pb-8 pt-2" style={{ minHeight: h + 28 }}>
      {data.map((d) => (
        <div key={d.date} className="flex w-7 shrink-0 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-emerald-500/45"
            style={{ height: `${Math.max(2, (d.count / max) * h)}px` }}
            title={`${d.date}: ${d.count} görüntüleme`}
          />
          <span className="max-w-[4.5rem] rotate-45 whitespace-nowrap origin-top-left translate-y-3 text-[10px] font-semibold tracking-tight text-emerald-100/95">
            {d.date.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

function HourBarTrend({ data, h = 72 }: { data: { hour: number; count: number }[]; h?: number }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-0.5 overflow-x-auto pb-6 pt-2" style={{ minHeight: h + 22 }}>
      {data.map((d) => (
        <div key={d.hour} className="flex w-5 shrink-0 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-violet-500/45"
            style={{ height: `${Math.max(2, (d.count / max) * h)}px` }}
            title={`${d.hour}:00 UTC — ${d.count} görüntüleme`}
          />
          <span className="text-[9px] font-bold tabular-nums text-violet-100/90">{d.hour}</span>
        </div>
      ))}
    </div>
  );
}

const PDF_TOOL_LABELS_TR: Record<string, string> = {
  split: "Sayfa ayır",
  merge: "PDF birleştir",
  "pdf-to-word": "PDF → Word",
  "word-to-pdf": "Word → PDF",
  "excel-to-pdf": "Excel → PDF",
  "pdf-to-excel": "PDF → Excel",
  compress: "Sıkıştır",
  encrypt: "Şifrele",
};

function pdfToolLabelTr(featureKey: string): string {
  return PDF_TOOL_LABELS_TR[featureKey] ?? featureKey;
}

const DEFAULT_SITE_SETTINGS = {
  theme: "dark",
  defaultLanguage: "en",
  analyticsEnabled: true,
  freeDailyLimitDisplay: 5,
  betaFeatures: {} as Record<string, boolean>,
};

type AdminPanelProps = {
  accessToken: string;
  onExit: () => void;
  onLogout: () => void;
};

export function AdminPanel({ accessToken, onExit, onLogout }: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTabId>("dashboard");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setLoadErr(null);
      setOverview(await fetchAdminOverview(accessToken));
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Yükleme başarısız");
    }
  }, [accessToken]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (tab !== "dashboard" && tab !== "analytics") {
      return;
    }
    const id = window.setInterval(() => {
      void loadOverview();
    }, 12_000);
    return () => window.clearInterval(id);
  }, [tab, loadOverview]);

  return (
    <div className="admin-shell fixed inset-0 z-[60] flex bg-[#070b14] text-slate-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.08] bg-[#0a1020] md:w-64">
        <div className="border-b border-white/[0.08] px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/90">Yönetim</p>
          <p className="mt-1 text-sm font-semibold text-white">NB PDF Tools</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                tab === t.id ? "bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/35" : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/[0.08] p-3 space-y-2">
          <button
            type="button"
            onClick={onExit}
            className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08]"
          >
            Uygulamaya dön
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20"
          >
            Çıkış yap
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3 md:px-8">
          <h1 className="text-lg font-semibold text-white">{TABS.find((x) => x.id === tab)?.label}</h1>
          <span className="text-[10px] uppercase tracking-widest text-slate-500">Sadece yönetici</span>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          {loadErr && tab === "dashboard" ? (
            <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{loadErr}</p>
          ) : null}

          {tab === "dashboard" ? <DashboardTab overview={overview} /> : null}
          {tab === "users" ? <UsersTab accessToken={accessToken} /> : null}
          {tab === "packages" ? <PackagesTab accessToken={accessToken} /> : null}
          {tab === "tools" ? <ToolsTab accessToken={accessToken} /> : null}
          {tab === "content" ? <ContentTab accessToken={accessToken} /> : null}
          {tab === "media" ? <MediaTab accessToken={accessToken} /> : null}
          {tab === "settings" ? <SettingsTab accessToken={accessToken} /> : null}
          {tab === "analytics" ? <AnalyticsTab accessToken={accessToken} overview={overview} /> : null}
          {tab === "global" ? <GlobalElementsTab accessToken={accessToken} /> : null}
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0c1222]/90 p-4 shadow-inner">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Where admin edits show up in the product (honest mapping for operators). */
function AdminImpactCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200/95">{title}</p>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-slate-300">{children}</div>
    </aside>
  );
}

function DashboardTab({ overview }: { overview: AdminOverview | null }) {
  if (!overview) {
    return <p className="text-slate-500">Özet yükleniyor…</p>;
  }
  const updatedAt = new Date(overview.generatedAt).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
  return (
    <div className="space-y-6">
      <AdminImpactCard title="Bu sekmede ne değişir?">
        <p>
          Özet kartları ve grafikler <strong className="text-slate-100">salt okunur</strong> istatistiktir; kullanıcı davranışını veya site metnini buradan değiştirmezsiniz. Metin ve görseller için{" "}
          <strong className="text-slate-100">İçerik yönetimi</strong> / <strong className="text-slate-100">Site ayarları</strong> / <strong className="text-slate-100">Araçlar</strong> sekmelerini kullanın.
        </p>
      </AdminImpactCard>
      <p className="rounded-xl border border-sky-500/20 bg-sky-500/[0.08] px-4 py-3 text-sm text-slate-200">
        <span className="font-semibold text-sky-100">Bilgi:</span> Veriler yaklaşık 12 saniyede bir yenilenir.{" "}
        <span className="font-mono text-[13px] font-semibold text-white">Son güncelleme: {updatedAt}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Kayıtlı kullanıcılar">
          <p className="text-3xl font-bold tabular-nums text-white">{overview.totalUsers}</p>
        </StatCard>
        <StatCard title="Bugün işlem yapan kullanıcı">
          <p className="text-3xl font-bold tabular-nums text-sky-300">{overview.activeUsersToday}</p>
          <p className="mt-1 text-[12px] text-slate-400">Bugün en az bir PDF işlemi yapan hesap sayısı</p>
        </StatCard>
        <StatCard title="Bugün toplam işlem">
          <p className="text-3xl font-bold tabular-nums text-cyan-300/90">{overview.todayTotalOperations}</p>
          <p className="mt-1 text-[12px] text-slate-400">UTC güne göre tüm kullanıcılar</p>
        </StatCard>
        <StatCard title={`Şu an sitede (son ${overview.presenceWindowMinutes} dk)`}>
          <p className="text-3xl font-bold tabular-nums text-violet-200">{overview.distinctSessionsActiveNow}</p>
          <p className="mt-1 text-[11px] text-slate-500">Benzersiz tarayıcı oturumu (sayfa görüntülemesi)</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-medium text-slate-300">
            <span>Kayıtlı hesap: {overview.registeredUsersActiveNow}</span>
            <span>Ziyaretçi oturumu: {overview.anonymousSessionsActiveNow}</span>
          </div>
        </StatCard>
        <StatCard title="Ziyaretçi oturumları (anonim, bugün)">
          <p className="text-3xl font-bold tabular-nums text-amber-200/90">{overview.anonymousSessionsToday}</p>
        </StatCard>
        <StatCard title="Kayıtlı oturumlar (bugün)">
          <p className="text-3xl font-bold tabular-nums text-emerald-300/90">{overview.registeredSessionsToday}</p>
        </StatCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <StatCard title="Paket dağılımı">
          <ul className="space-y-2 text-sm">
            {overview.usagePerPackage.map((p) => (
              <li key={p.plan} className="flex justify-between border-b border-white/[0.06] border-dashed py-1">
                <span>{p.plan}</span>
                <span className="font-mono text-sky-300">{p.userCount}</span>
              </li>
            ))}
            <li className="flex justify-between pt-2 text-xs font-medium text-slate-400">
              <span>Tamamlanan ödemeler (tüm zamanlar)</span>
              <span>{overview.checkoutsCompleted}</span>
            </li>
            <li className="flex justify-between text-xs font-medium text-slate-400">
              <span>Bekleyen ödemeler</span>
              <span>{overview.checkoutsPending}</span>
            </li>
          </ul>
        </StatCard>
        <StatCard title="En çok kullanılan araçlar">
          <p className="mb-2 text-[12px] leading-relaxed text-slate-400">
            {overview.mostUsedToolsAllTimeFallback
              ? "Son 30 günde veri yok; tüm zamanların toplamı gösteriliyor. İşlem sayısı günlük satırlarındaki son araç alanına göre dağıtılır."
              : "Son 30 gün, günlük kullanım kayıtlarına göre (işlem sayısı o günkü son araç alanına yazılır)."}
          </p>
          {overview.mostUsedTools.length === 0 ? (
            <p className="text-sm text-slate-500">
              Henüz araç kullanımı yok veya <code className="text-slate-400">lastFeatureKey</code> dolu kayıt bulunmuyor. PDF işlemi yaptıktan sonra burası dolacaktır.
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {overview.mostUsedTools.map((t) => (
                <li key={t.featureKey} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="text-slate-200">{pdfToolLabelTr(t.featureKey)}</span>
                    <span className="ml-1 text-[10px] text-slate-600">({t.featureKey})</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-slate-400" title={`${t.userDayRows} kullanıcı-gün satırı`}>
                    {t.operationsAttributed}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </StatCard>
      </div>
      <StatCard title="Günlük işlemler (son 30 gün, UTC)">
        <BarTrend data={overview.usageByDay} h={120} />
      </StatCard>
      <p className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-slate-300">
        Anonim sayfa görüntülemeleri (bugün: <span className="font-mono font-semibold text-white">{overview.anonymousPageViewsToday}</span>) ve ödeme akışı. Tam dışa aktarma:{" "}
        <strong className="text-sky-200">Analitik / Raporlar</strong>.
      </p>
    </div>
  );
}

function UsersTab({ accessToken }: { accessToken: string }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [blocked, setBlocked] = useState<BlockedEmailRow[]>([]);
  const [blockEmailInput, setBlockEmailInput] = useState("");
  const [blockReasonInput, setBlockReasonInput] = useState("");

  const loadBlocked = useCallback(async () => {
    try {
      setBlocked(await fetchAdminBlockedEmails(accessToken));
    } catch {
      /* ignore list errors — table still usable */
    }
  }, [accessToken]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchAdminUsers(accessToken, { q, page, pageSize: 20, sort: "createdAt", dir: "desc" });
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "İstek başarısız");
    } finally {
      setLoading(false);
    }
  }, [accessToken, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadBlocked();
  }, [loadBlocked]);

  return (
    <div className="space-y-4">
      <AdminImpactCard title="Bu sekmede ne değişir?">
        <p>
          Plan ve rol güncellemeleri <strong className="text-slate-100">hemen</strong> ilgili kullanıcının oturumunda geçerli olur (bir sonraki API çağrısında). Silme ve e-posta engeli{" "}
          <strong className="text-slate-100">kalıcıdır</strong>; engelli adresle yeni kayıt açılamaz.
        </p>
      </AdminImpactCard>
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          placeholder="E-posta, ad ara…"
          className="min-w-[200px] flex-1 rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-400/50"
        />
        <button type="button" onClick={() => void load()} className="rounded-xl bg-white/[0.08] px-4 py-2 text-xs font-semibold">
          Ara
        </button>
        <button type="button" onClick={() => setCreateOpen((v) => !v)} className="rounded-xl bg-violet-500/20 px-4 py-2 text-xs font-semibold text-violet-100">
          {createOpen ? "Formu kapat" : "Kullanıcı ekle"}
        </button>
      </div>
      {createOpen ? (
        <form
          className="grid gap-2 rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await createAdminUser(accessToken, {
                email: newEmail,
                password: newPassword,
                firstName: newFirst,
                lastName: newLast,
                plan: "FREE",
                skipEmailVerification: true,
              });
              setNewEmail("");
              setNewPassword("");
              setCreateOpen(false);
              void load();
            } catch (er) {
              setErr(er instanceof Error ? er.message : "Oluşturma başarısız");
            }
          }}
        >
          <input required type="email" placeholder="E-posta" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 text-sm" />
          <input required type="password" placeholder="Şifre (en az 8 karakter)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 text-sm" />
          <input placeholder="Ad" value={newFirst} onChange={(e) => setNewFirst(e.target.value)} className="rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 text-sm" />
          <input placeholder="Soyad" value={newLast} onChange={(e) => setNewLast(e.target.value)} className="rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 text-sm" />
          <button type="submit" className="sm:col-span-2 rounded-xl bg-violet-600/80 py-2 text-sm font-semibold">
            Kullanıcı oluştur (e-posta test için önceden doğrulanmış)
          </button>
        </form>
      ) : null}
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
        <table className="w-full min-w-[880px] text-left text-xs">
          <thead className="border-b border-white/[0.08] bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">E-posta</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Bugün</th>
              <th className="px-3 py-2">Doğrulandı</th>
              <th className="px-3 py-2">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  Yükleniyor…
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <UserRow key={u.id} u={u} accessToken={accessToken} onSaved={load} onBlockedListChange={loadBlocked} />
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>
          {total} kullanıcı · sayfa {page}
        </span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-white/[0.1] px-2 py-1 disabled:opacity-30">
            Önceki
          </button>
          <button type="button" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-white/[0.1] px-2 py-1 disabled:opacity-30">
            Sonraki
          </button>
        </div>
      </div>
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
        <p className="text-sm font-semibold text-amber-100/95">Engelli e-postalar (yeni kayıt / Google ile hesap yok)</p>
        <p className="mt-1 text-[11px] text-slate-500">
          Listede olan normalize adreslerle sistemde hesap oluşturulamaz. Kullanıcıyı silip aynı anda engellemek için satırdaki «Sil + engelle» kullanın.
        </p>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!blockEmailInput.trim()) return;
            setErr(null);
            try {
              await postAdminBlockedEmail(accessToken, { email: blockEmailInput.trim(), reason: blockReasonInput.trim() || undefined });
              setBlockEmailInput("");
              setBlockReasonInput("");
              await loadBlocked();
            } catch (er) {
              setErr(er instanceof Error ? er.message : "Engel eklenemedi");
            }
          }}
        >
          <input
            type="email"
            required
            placeholder="E-posta ekle"
            value={blockEmailInput}
            onChange={(e) => setBlockEmailInput(e.target.value)}
            className="min-w-[200px] flex-1 rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 text-sm"
          />
          <input
            placeholder="Not (isteğe bağlı)"
            value={blockReasonInput}
            onChange={(e) => setBlockReasonInput(e.target.value)}
            className="min-w-[160px] flex-1 rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-xl bg-amber-500/25 px-4 py-2 text-xs font-semibold text-amber-50">
            Listeye ekle
          </button>
        </form>
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-[11px]">
          {blocked.length === 0 ? <li className="text-slate-500">Liste boş.</li> : null}
          {blocked.map((b) => (
            <li key={b.email} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/25 px-2 py-1.5">
              <span className="font-mono text-slate-200">{b.email}</span>
              <span className="text-slate-500">{b.reason ?? "—"}</span>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`${b.email} engelini kaldırmak istiyor musunuz?`)) return;
                  setErr(null);
                  try {
                    await deleteAdminBlockedEmail(accessToken, b.email);
                    await loadBlocked();
                  } catch (er) {
                    setErr(er instanceof Error ? er.message : "Kaldırılamadı");
                  }
                }}
                className="rounded-md border border-white/[0.12] px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/[0.06]"
              >
                Engeli kaldır
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] text-slate-500">
        “Yönetici” API erişimi yapılandırılmış yönetici e-posta kuralına bağlıdır; JWT rolü e-postadan türetilir. Veritabanındaki rol kayıt içindir—e-posta tabanlı yönetici denetimleri politika uyumlu olana kadar bunu aşmaz.
      </p>
    </div>
  );
}

function UserRow({
  u,
  accessToken,
  onSaved,
  onBlockedListChange,
}: {
  u: AdminUserRow;
  accessToken: string;
  onSaved: () => void;
  onBlockedListChange: () => void;
}) {
  const [plan, setPlan] = useState(u.plan);
  const [role, setRole] = useState(u.role);
  const [saving, setSaving] = useState(false);

  return (
    <tr className="border-b border-white/[0.05] hover:bg-white/[0.02]">
      <td className="px-3 py-2 font-medium text-slate-200">{u.email}</td>
      <td className="px-3 py-2">
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className="rounded border border-white/[0.1] bg-black/40 px-1 py-1 text-[11px]">
          <option value="FREE">FREE</option>
          <option value="PRO">PRO</option>
          <option value="BUSINESS">BUSINESS</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded border border-white/[0.1] bg-black/40 px-1 py-1 text-[11px]">
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
        {u.usageToday ? `${u.usageToday.operationsCount} (+${u.usageToday.postLimitExtraOps} kota sonrası)` : "—"}
      </td>
      <td className="px-3 py-2">{u.isVerified ? "Evet" : "Hayır"}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await patchAdminUser(accessToken, u.id, { plan, role });
                await onSaved();
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-lg bg-sky-500/20 px-2 py-1 text-[11px] font-semibold text-sky-100"
          >
            Kaydet
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              if (!window.confirm(`${u.email} kullanıcısını kalıcı olarak silmek istiyor musunuz?`)) return;
              setSaving(true);
              try {
                await deleteAdminUser(accessToken, u.id, false);
                await onSaved();
              } catch (e) {
                window.alert(e instanceof Error ? e.message : "Silinemedi");
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-lg border border-white/[0.12] px-2 py-1 text-[11px] text-slate-300 hover:bg-white/[0.04]"
          >
            Sil
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              if (
                !window.confirm(
                  `${u.email} silinsin ve bu adres bir daha kayıt olamasın mı? (Kara listeye eklenir.)`,
                )
              ) {
                return;
              }
              setSaving(true);
              try {
                await deleteAdminUser(accessToken, u.id, true);
                await onSaved();
                onBlockedListChange();
              } catch (e) {
                window.alert(e instanceof Error ? e.message : "İşlem başarısız");
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-lg border border-rose-500/35 bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/25"
          >
            Sil + engelle
          </button>
        </div>
      </td>
    </tr>
  );
}

type AdminPlansPayload = {
  plans: Array<{
    name: string;
    displayName: string;
    description: string;
    dailyLimit: number | null;
    allowedFeatures: string[];
    multiUser: boolean;
  }>;
  checkoutStats: Record<string, { completed: number; pending: number }>;
  marketing: unknown;
  plansOverride: unknown;
  paymentPrices?: { PRO: string; BUSINESS: string };
};

function PackagesTab({ accessToken }: { accessToken: string }) {
  const [payload, setPayload] = useState<AdminPlansPayload | null>(null);
  const [proPrice, setProPrice] = useState("200.00");
  const [businessPrice, setBusinessPrice] = useState("400.00");
  const [pricingBusy, setPricingBusy] = useState(false);
  const [mkHeadline, setMkHeadline] = useState("");
  const [mkNotes, setMkNotes] = useState("");
  const [mkBusy, setMkBusy] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const marketingHist = useJsonEditorHistory("{}");
  const overrideHist = useJsonEditorHistory("{}");
  const [msg, setMsg] = useState<string | null>(null);
  const [loadTick, setLoadTick] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const d = (await fetchAdminPlans(accessToken)) as AdminPlansPayload;
        setPayload(d);
        if (d.paymentPrices) {
          setProPrice(d.paymentPrices.PRO);
          setBusinessPrice(d.paymentPrices.BUSINESS);
        }
        const m = d.marketing;
        marketingHist.reset(JSON.stringify(m ?? { upgradeCtaHeadline: "", notes: "" }, null, 2));
        const mObj =
          m && typeof m === "object" && m !== null ? (m as Record<string, unknown>) : { upgradeCtaHeadline: "", notes: "" };
        setMkHeadline(String(mObj.upgradeCtaHeadline ?? ""));
        setMkNotes(String(mObj.notes ?? ""));
        const ov = d.plansOverride;
        overrideHist.reset(JSON.stringify(ov && typeof ov === "object" ? ov : {}, null, 2));
        setMsg(null);
      } catch {
        setMsg("Planlar yüklenemedi");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hist reset + token
  }, [accessToken, loadTick]);

  return (
    <div className="space-y-6">
      <AdminImpactCard title="Bu sekmede ne değişir?">
        <p>
          Aylık fiyatlar <strong className="text-slate-100">iyzico ödeme oturumuna</strong> ve (varsa) sitedeki canlı plan listesine yansır. Plan JSON&apos;u (<code className="text-slate-400">plans.override</code>) hangi aracın hangi pakette olduğunu ve günlük ücretsiz kotayı belirler.
        </p>
        <p>
          <code className="text-slate-400">packages.marketing</code> (upgradeCtaHeadline / notes) şu an veritabanında saklanır; uygulama arayüzü bu alanları <strong className="text-slate-100">otomatik göstermiyor</strong>. İleride paket sayfası veya modallar bu kayda bağlanabilir.
        </p>
      </AdminImpactCard>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Paketler ve ödeme</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Aylık PRO ve Business fiyatlarını buradan güncelleyin; iyzico ödeme oturumu bu tutarlarla açılır. Plan kotası ve özellikleri için gelişmiş JSON düzenleyiciyi kullanın.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLoadTick((t) => t + 1)}
          className="rounded-xl border border-white/[0.12] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.05]"
        >
          Sunucudan yenile
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(payload?.plans ?? []).map((p) => {
          const st = payload?.checkoutStats?.[p.name] ?? { completed: 0, pending: 0 };
          const limitLabel =
            p.dailyLimit === null ? "Günlük limit yok" : `Günlük ${p.dailyLimit} işlem`;
          return (
            <div
              key={p.name}
              className={`rounded-2xl border p-4 ${
                p.name === "PRO"
                  ? "border-violet-500/35 bg-gradient-to-b from-violet-500/10 to-black/20"
                  : "border-white/[0.08] bg-black/25"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{p.name}</p>
              <p className="mt-1 text-lg font-semibold text-white">{p.displayName}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{p.description}</p>
              <ul className="mt-3 space-y-1 text-[11px] text-slate-400">
                <li>{limitLabel}</li>
                <li>{p.allowedFeatures.length} araç / özellik</li>
                <li>{p.multiUser ? "Çok kullanıcı yapısı" : "Tek kullanıcı"}</li>
                <li>
                  Ödeme: <span className="text-slate-300">{st.completed}</span> tamamlandı ·{" "}
                  <span className="text-amber-200/80">{st.pending}</span> beklemede
                </li>
              </ul>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-5">
        <h3 className="text-sm font-semibold text-emerald-100">Aylık abonelik fiyatları (TRY, KDV hariç)</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Ondalık ayırıcı olarak nokta kullanın (örn. 199.99). Kaydettiğinizde yeni ödemeler bu tutarlarla başlar; önbellek ~20 sn içinde güncellenir.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-slate-400">
            PRO (1 ay)
            <input
              value={proPrice}
              onChange={(e) => setProPrice(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 py-2.5 font-mono text-sm text-white outline-none focus:ring-1 focus:ring-emerald-400/40"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Business (1 ay)
            <input
              value={businessPrice}
              onChange={(e) => setBusinessPrice(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 py-2.5 font-mono text-sm text-white outline-none focus:ring-1 focus:ring-emerald-400/40"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={pricingBusy}
          onClick={async () => {
            setPricingBusy(true);
            setMsg(null);
            try {
              await putAdminPlanPricing(accessToken, { PRO: proPrice.trim(), BUSINESS: businessPrice.trim() });
              setMsg("Fiyatlar kaydedildi. Ödeme ve plan listesi birkaç saniye içinde yeni tutarları kullanır.");
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
            } finally {
              setPricingBusy(false);
            }
          }}
          className="mt-4 rounded-xl bg-emerald-500/30 px-5 py-2.5 text-sm font-semibold text-emerald-50 hover:bg-emerald-500/40 disabled:opacity-40"
        >
          {pricingBusy ? "Kaydediliyor…" : "Fiyatları kaydet"}
        </button>
      </div>

      <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.08] p-5">
        <h3 className="text-sm font-semibold text-violet-100">Pazarlama metinleri</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Yükseltme CTA başlığı ve notlar. Ek alanlar için aşağıdaki gelişmiş JSON bölümünü kullanın.
        </p>
        <div className="mt-4 grid gap-4">
          <label className="block text-xs text-slate-400">
            upgradeCtaHeadline
            <input
              value={mkHeadline}
              onChange={(e) => setMkHeadline(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-violet-400/40"
            />
          </label>
          <label className="block text-xs text-slate-400">
            notes
            <textarea
              value={mkNotes}
              onChange={(e) => setMkNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-violet-400/40"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={mkBusy}
          onClick={async () => {
            setMkBusy(true);
            setMsg(null);
            try {
              let base: Record<string, unknown> = {};
              try {
                base = JSON.parse(marketingHist.value) as Record<string, unknown>;
              } catch {
                base = {};
              }
              const merged = { ...base, upgradeCtaHeadline: mkHeadline, notes: mkNotes };
              await putAdminPackagesMarketing(accessToken, merged);
              marketingHist.reset(JSON.stringify(merged, null, 2));
              setMsg("Pazarlama metinleri kaydedildi.");
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
            } finally {
              setMkBusy(false);
            }
          }}
          className="mt-4 rounded-xl bg-violet-500/35 px-5 py-2.5 text-sm font-semibold text-violet-50 disabled:opacity-40"
        >
          {mkBusy ? "Kaydediliyor…" : "Pazarlama metnini kaydet"}
        </button>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-black/20">
        <button
          type="button"
          onClick={() => setAdvOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-200"
        >
          Gelişmiş: plan limitleri ve tam pazarlama JSON
          <span className="text-slate-500">{advOpen ? "▼" : "▶"}</span>
        </button>
        {advOpen ? (
          <div className="space-y-4 border-t border-white/[0.06] p-4">
            <p className="text-xs text-slate-500">
              <code className="text-slate-400">plans.override</code> çalışma zamanında Node varsayılanları ile birleşir. Pazarlama metinleri ayrı anahtarda saklanır.
            </p>
            <label className="block text-xs font-semibold text-slate-400">plans.override</label>
            <textarea
              value={overrideHist.value}
              onChange={(e) => overrideHist.setValue(e.target.value)}
              rows={10}
              className="w-full rounded-xl border border-white/[0.1] bg-black/40 p-3 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!overrideHist.canUndo}
                onClick={() => overrideHist.undo()}
                className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Geri al
              </button>
              <button
                type="button"
                disabled={!overrideHist.canRedo}
                onClick={() => overrideHist.redo()}
                className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Yinele
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const parsed = JSON.parse(overrideHist.value);
                    await putAdminPlansOverride(accessToken, parsed);
                    setMsg("plans.override kaydedildi.");
                  } catch {
                    setMsg("Geçersiz plan geçersiz kılma JSON’u");
                  }
                }}
                className="rounded-xl bg-amber-500/25 px-4 py-2 text-xs font-semibold"
              >
                Plan override kaydet
              </button>
            </div>
            <label className="mt-4 block text-xs font-semibold text-slate-400">packages.marketing</label>
            <textarea
              value={marketingHist.value}
              onChange={(e) => marketingHist.setValue(e.target.value)}
              rows={8}
              className="w-full rounded-xl border border-white/[0.1] bg-black/40 p-3 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!marketingHist.canUndo}
                onClick={() => marketingHist.undo()}
                className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Geri al
              </button>
              <button
                type="button"
                disabled={!marketingHist.canRedo}
                onClick={() => marketingHist.redo()}
                className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Yinele
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const parsed = JSON.parse(marketingHist.value);
                    await putAdminPackagesMarketing(accessToken, parsed);
                    setMsg("Pazarlama JSON kaydedildi.");
                  } catch {
                    setMsg("Geçersiz pazarlama JSON’u");
                  }
                }}
                className="rounded-xl bg-violet-500/25 px-4 py-2 text-xs font-semibold"
              >
                Pazarlama kaydet
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}
    </div>
  );
}

function cmsDeepClone(obj: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
}

function cmsGetStr(root: Record<string, unknown>, path: string[]): string {
  let cur: unknown = root;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return "";
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "string" ? cur : "";
}

function cmsSetStr(root: Record<string, unknown>, path: string[], value: string): Record<string, unknown> {
  const next = cmsDeepClone(root);
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    let ch = cur[k];
    if (ch == null || typeof ch !== "object" || Array.isArray(ch)) {
      ch = {};
      cur[k] = ch;
    }
    cur = ch as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = value;
  return next;
}

function cmsGetBool(root: Record<string, unknown>, path: string[]): boolean {
  let cur: unknown = root;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[k];
  }
  return Boolean(cur);
}

function cmsSetBool(root: Record<string, unknown>, path: string[], value: boolean): Record<string, unknown> {
  const next = cmsDeepClone(root);
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    let ch = cur[k];
    if (ch == null || typeof ch !== "object" || Array.isArray(ch)) {
      ch = {};
      cur[k] = ch;
    }
    cur = ch as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = value;
  return next;
}

const cmsInputClass =
  "mt-1 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-violet-400/40";

type AdminToolsApiPayload = {
  catalog?: string[];
  planDefinitions?: Array<{ plan: string; dailyLimit: number | null; allowedFeatures: string[] }>;
  overrides?: Record<string, unknown> | null;
  usageByTool?: Record<string, { rows: number; operations: number }>;
  postLimitNote?: string;
};

function readConversion(obj: Record<string, unknown>): Record<string, unknown> {
  const c = obj.conversion;
  if (c != null && typeof c === "object" && !Array.isArray(c)) {
    return { ...(c as Record<string, unknown>) };
  }
  return {};
}

function mergeToolsQuickForm(
  base: Record<string, unknown>,
  notes: string,
  upgradeCtaLabel: string,
  upgradeCtaSubtitle: string,
): Record<string, unknown> {
  const conv = readConversion(base);
  return {
    ...base,
    notes,
    conversion: {
      ...conv,
      upgradeCtaLabel,
      upgradeCtaSubtitle,
    },
  };
}

function ToolsTab({ accessToken }: { accessToken: string }) {
  const [full, setFull] = useState<Record<string, unknown>>({ notes: "" });
  const [notes, setNotes] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaSubtitle, setCtaSubtitle] = useState("");
  const [catalog, setCatalog] = useState<string[]>([]);
  const [planDefinitions, setPlanDefinitions] = useState<AdminToolsApiPayload["planDefinitions"]>([]);
  const [usageByTool, setUsageByTool] = useState<Record<string, { rows: number; operations: number }>>({});
  const [postLimitNote, setPostLimitNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [rawText, setRawText] = useState("{}");
  const [rawErr, setRawErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadErr(null);
    try {
      const d = (await fetchAdminTools(accessToken)) as AdminToolsApiPayload;
      const o = d.overrides && typeof d.overrides === "object" ? { ...(d.overrides as Record<string, unknown>) } : { notes: "" };
      setFull(o);
      setNotes(String(o.notes ?? ""));
      const conv = readConversion(o);
      setCtaLabel(String(conv.upgradeCtaLabel ?? ""));
      setCtaSubtitle(String(conv.upgradeCtaSubtitle ?? ""));
      setRawText(JSON.stringify(o, null, 2));
      setCatalog(Array.isArray(d.catalog) ? d.catalog : []);
      setPlanDefinitions(Array.isArray(d.planDefinitions) ? d.planDefinitions : []);
      setUsageByTool(d.usageByTool && typeof d.usageByTool === "object" ? d.usageByTool : {});
      setPostLimitNote(typeof d.postLimitNote === "string" ? d.postLimitNote : null);
      setMsg(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Yükleme başarısız");
    }
  }, [accessToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Araçlar ve dönüşüm metinleri</h2>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-xl border border-white/[0.12] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.05]"
        >
          Sunucudan yenile
        </button>
      </div>

      <AdminImpactCard title="Bu sekmede ne değişir?">
        <p>
          <code className="text-slate-200">tools.config</code> veritabanında saklanır.{" "}
          <strong className="text-slate-100">conversion.upgradeCtaLabel</strong> ve{" "}
          <strong className="text-slate-100">conversion.upgradeCtaSubtitle</strong> alanları, ücretsiz kota aşıldığında API’nin döndürdüğü yükseltme düğmesi ve açıklama metnini günceller (web abonelik özeti, gecikmeli işlem yanıtları, masaüstü lisans akışı).{" "}
          <strong className="text-slate-100">notes</strong> yalnızca yönetici notu içindir; uygulama bunu göstermez.
        </p>
        <p>
          Hangi PDF aracının hangi planda açık olduğu <strong className="text-slate-100">Paketler</strong> sekmesindeki plan tanımlarıyla belirlenir; bu sekme o kuralları değiştirmez, sadece özetler ve kullanım sayar.
        </p>
      </AdminImpactCard>

      {loadErr ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{loadErr}</p> : null}

      <section className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
        <h3 className="text-sm font-semibold text-white">Kayıtlı özellik anahtarları ve günlük kullanım</h3>
        <p className="mt-1 text-[12px] text-slate-500">
          <span className="font-mono text-slate-400">operations</span>: toplam işlem sayısı; <span className="font-mono text-slate-400">rows</span>: bu aracı son kullanan kullanıcı-gün satırı sayısı.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead className="border-b border-white/[0.08] text-slate-500">
              <tr>
                <th className="px-3 py-2">Araç</th>
                <th className="px-3 py-2">Anahtar</th>
                <th className="px-3 py-2 text-right">Satır</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {catalog.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-slate-500">
                    Katalog yüklenemedi veya boş.
                  </td>
                </tr>
              ) : (
                catalog.map((fk) => {
                  const u = usageByTool[fk] ?? { rows: 0, operations: 0 };
                  return (
                    <tr key={fk} className="border-b border-white/[0.04]">
                      <td className="px-3 py-2 text-slate-200">{pdfToolLabelTr(fk)}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{fk}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">{u.rows}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">{u.operations}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {planDefinitions && planDefinitions.length > 0 ? (
        <section className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.05] p-4">
          <h3 className="text-sm font-semibold text-sky-100">Planlara göre izinli araçlar (canlı çözümlenmiş)</h3>
          <ul className="mt-2 space-y-2 text-xs text-slate-300">
            {planDefinitions.map((p) => (
              <li key={p.plan} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                <span className="font-semibold text-white">{p.plan}</span>
                <span className="text-slate-500">
                  {" "}
                  · günlük limit: {p.dailyLimit === null ? "yok" : p.dailyLimit}
                </span>
                <p className="mt-1 font-mono text-[10px] leading-relaxed text-slate-500">{p.allowedFeatures.join(", ")}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {postLimitNote ? (
        <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-slate-400">{postLimitNote}</p>
      ) : null}

      <section className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
        <h3 className="text-sm font-semibold text-violet-100">Hızlı alanlar (sunucudaki mevcut değerler)</h3>
        <label className="mt-3 block text-xs text-slate-400">
          notes (iç not)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-violet-400/40"
          />
        </label>
        <label className="mt-3 block text-xs text-slate-400">
          conversion.upgradeCtaLabel → API&apos;deki yükselt düğmesi etiketi
          <input
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-violet-400/40"
            placeholder="Örn. Pro'ya geç"
          />
        </label>
        <label className="mt-3 block text-xs text-slate-400">
          conversion.upgradeCtaSubtitle → kısa açıklama (API yanıtlarında gömülü)
          <textarea
            value={ctaSubtitle}
            onChange={(e) => setCtaSubtitle(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-violet-400/40"
            placeholder="Örn. Anında işlem, tam kalite, sınırsız günlük kullanım."
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              const next = mergeToolsQuickForm(full, notes, ctaLabel, ctaSubtitle);
              await putAdminToolsConfig(accessToken, next);
              setFull(next);
              setRawText(JSON.stringify(next, null, 2));
              setMsg("tools.config kaydedildi. Değişiklik birkaç saniye içinde canlıya yansır.");
              void reload();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
            } finally {
              setBusy(false);
            }
          }}
          className="mt-4 rounded-xl bg-violet-500/30 px-5 py-2.5 text-sm font-semibold text-violet-50 disabled:opacity-40"
        >
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </section>

      <div className="rounded-2xl border border-white/[0.08] bg-black/20">
        <button
          type="button"
          onClick={() => {
            if (!rawOpen) {
              setRawText(JSON.stringify(full, null, 2));
            }
            setRawOpen((o) => !o);
            setRawErr(null);
          }}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-200"
        >
          Gelişmiş: tam tools.config JSON
          <span>{rawOpen ? "▼" : "▶"}</span>
        </button>
        {rawOpen ? (
          <div className="space-y-2 border-t border-white/[0.06] p-4">
            {rawErr ? <p className="text-xs text-red-300">{rawErr}</p> : null}
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={12}
              className="w-full rounded-xl border border-white/[0.1] bg-black/40 p-3 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(rawText) as Record<string, unknown>;
                    setFull(parsed);
                    setNotes(String(parsed.notes ?? ""));
                    const conv = readConversion(parsed);
                    setCtaLabel(String(conv.upgradeCtaLabel ?? ""));
                    setCtaSubtitle(String(conv.upgradeCtaSubtitle ?? ""));
                    setRawErr(null);
                    setMsg("JSON uygulandı (yerel). Üstteki Kaydet veya JSON’dan kaydet kullanın.");
                  } catch {
                    setRawErr("Geçersiz JSON");
                  }
                }}
                className="rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-semibold text-slate-200"
              >
                JSON’u forma uygula
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setMsg(null);
                  try {
                    const parsed = JSON.parse(rawText) as Record<string, unknown>;
                    await putAdminToolsConfig(accessToken, parsed);
                    setFull(parsed);
                    setNotes(String(parsed.notes ?? ""));
                    const conv = readConversion(parsed);
                    setCtaLabel(String(conv.upgradeCtaLabel ?? ""));
                    setCtaSubtitle(String(conv.upgradeCtaSubtitle ?? ""));
                    setMsg("tools.config (JSON) kaydedildi.");
                    void reload();
                  } catch (e) {
                    setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-xl bg-violet-500/30 px-4 py-2 text-xs font-semibold text-violet-50 disabled:opacity-40"
              >
                JSON’dan kaydet
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {msg ? <p className="text-sm text-slate-400">{msg}</p> : null}
    </div>
  );
}

function ContentTab({ accessToken }: { accessToken: string }) {
  const [cms, setCms] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [rawOpen, setRawOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [rawErr, setRawErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const c = (await fetchAdminCms(accessToken)) as Record<string, unknown>;
    setCms(c);
    setRawText(JSON.stringify(c, null, 2));
    setMsg(null);
    setRawErr(null);
  }, [accessToken]);

  useEffect(() => {
    void reload().catch(() => setMsg("CMS yüklenemedi"));
  }, [reload]);

  const previewSrc = typeof window !== "undefined" ? `${window.location.origin}/` : "/";

  const patch = (fn: (prev: Record<string, unknown>) => Record<string, unknown>) => {
    setCms((prev) => {
      if (!prev) return prev;
      return fn(prev);
    });
  };

  if (!cms) {
    return <p className="text-slate-400">İçerik yükleniyor…</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
      <div className="space-y-6">
        <AdminImpactCard title="Bu sekmede ne değişir?">
          <p>
            Kaydettiğinizde <code className="text-slate-200">cms.content</code> güncellenir. Metin ve görseller{" "}
            <strong className="text-slate-100">karşılama sayfası</strong>, <strong className="text-slate-100">uygulama kabuğu</strong> (üst banner, çalışma alanı şeridi, araç şeridi) ve{" "}
            <strong className="text-slate-100">CMS ile birleştirilen</strong> alanlarda görünür. <code className="text-slate-200">assets.*</code> URL’leri doğrudan bu formlarda kullanılır; dosyayı önce Medya sekmesinden yükleyip URL’yi yapıştırın.
          </p>
        </AdminImpactCard>
        <p className="text-sm text-slate-400">
          Formlar <code className="text-slate-300">cms.content</code> kaydını günceller. Medya URL’leri için{" "}
          <strong className="text-slate-200">Medya kütüphanesinden</strong> kopyalayın.
        </p>

        <section className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
          <h3 className="text-sm font-semibold text-white">Ana sayfa (homepage)</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">
              heroTitle
              <input
                className={cmsInputClass}
                value={cmsGetStr(cms, ["homepage", "heroTitle"])}
                onChange={(e) => patch((p) => cmsSetStr(p, ["homepage", "heroTitle"], e.target.value))}
              />
            </label>
            <label className="block text-xs text-slate-400 sm:col-span-2">
              heroSubtitle
              <input
                className={cmsInputClass}
                value={cmsGetStr(cms, ["homepage", "heroSubtitle"])}
                onChange={(e) => patch((p) => cmsSetStr(p, ["homepage", "heroSubtitle"], e.target.value))}
              />
            </label>
            <label className="block text-xs text-slate-400">
              primaryCta
              <input
                className={cmsInputClass}
                value={cmsGetStr(cms, ["homepage", "primaryCta"])}
                onChange={(e) => patch((p) => cmsSetStr(p, ["homepage", "primaryCta"], e.target.value))}
              />
            </label>
            <label className="block text-xs text-slate-400">
              secondaryCta
              <input
                className={cmsInputClass}
                value={cmsGetStr(cms, ["homepage", "secondaryCta"])}
                onChange={(e) => patch((p) => cmsSetStr(p, ["homepage", "secondaryCta"], e.target.value))}
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
          <h3 className="text-sm font-semibold text-white">Araç şeridi ve üst banner</h3>
          <label className="mt-3 block text-xs text-slate-400">
            toolsStrip.headline
            <input
              className={cmsInputClass}
              value={cmsGetStr(cms, ["toolsStrip", "headline"])}
              onChange={(e) => patch((p) => cmsSetStr(p, ["toolsStrip", "headline"], e.target.value))}
            />
          </label>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={cmsGetBool(cms, ["banner", "enabled"])}
              onChange={(e) => patch((p) => cmsSetBool(p, ["banner", "enabled"], e.target.checked))}
              className="h-4 w-4 rounded border-white/20 bg-black/40"
            />
            banner.enabled
          </label>
          <label className="mt-2 block text-xs text-slate-400">
            banner.text
            <textarea
              className={`${cmsInputClass} min-h-[72px]`}
              value={cmsGetStr(cms, ["banner", "text"])}
              onChange={(e) => patch((p) => cmsSetStr(p, ["banner", "text"], e.target.value))}
            />
          </label>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
          <h3 className="text-sm font-semibold text-white">Çalışma alanı şeridi</h3>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={cmsGetBool(cms, ["workspace", "bannerEnabled"])}
              onChange={(e) => patch((p) => cmsSetBool(p, ["workspace", "bannerEnabled"], e.target.checked))}
              className="h-4 w-4 rounded border-white/20 bg-black/40"
            />
            workspace.bannerEnabled
          </label>
          <label className="mt-2 block text-xs text-slate-400">
            workspace.bannerText
            <textarea
              className={`${cmsInputClass} min-h-[64px]`}
              value={cmsGetStr(cms, ["workspace", "bannerText"])}
              onChange={(e) => patch((p) => cmsSetStr(p, ["workspace", "bannerText"], e.target.value))}
            />
          </label>
        </section>

        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
          <h3 className="text-sm font-semibold text-emerald-100">Medya URL</h3>
          <label className="mt-3 block text-xs text-slate-400">
            assets.heroImageUrl
            <input
              className={cmsInputClass}
              value={cmsGetStr(cms, ["assets", "heroImageUrl"])}
              onChange={(e) => patch((p) => cmsSetStr(p, ["assets", "heroImageUrl"], e.target.value))}
            />
          </label>
          <label className="mt-2 block text-xs text-slate-400">
            assets.logoUrl
            <input
              className={cmsInputClass}
              value={cmsGetStr(cms, ["assets", "logoUrl"])}
              onChange={(e) => patch((p) => cmsSetStr(p, ["assets", "logoUrl"], e.target.value))}
            />
          </label>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
          <h3 className="text-sm font-semibold text-white">Modal</h3>
          <label className="mt-3 block text-xs text-slate-400">
            modals.upgradeTeaser
            <textarea
              className={`${cmsInputClass} min-h-[64px]`}
              value={cmsGetStr(cms, ["modals", "upgradeTeaser"])}
              onChange={(e) => patch((p) => cmsSetStr(p, ["modals", "upgradeTeaser"], e.target.value))}
            />
          </label>
        </section>

        {(["en", "tr"] as const).map((lang) => (
          <section key={lang} className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.05] p-4">
            <h3 className="text-sm font-semibold text-sky-100">Karşılama — {lang.toUpperCase()}</h3>
            <p className="mt-1 text-[11px] text-slate-500">İsteğe bağlı navbar / hero / footer / finalCta üzerine yazma.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-400">
                navbar.productLabel
                <input
                  className={cmsInputClass}
                  value={cmsGetStr(cms, ["landing", lang, "navbar", "productLabel"])}
                  onChange={(e) => patch((p) => cmsSetStr(p, ["landing", lang, "navbar", "productLabel"], e.target.value))}
                />
              </label>
              <label className="block text-xs text-slate-400">
                hero.kicker
                <input
                  className={cmsInputClass}
                  value={cmsGetStr(cms, ["landing", lang, "hero", "kicker"])}
                  onChange={(e) => patch((p) => cmsSetStr(p, ["landing", lang, "hero", "kicker"], e.target.value))}
                />
              </label>
              <label className="block text-xs text-slate-400 sm:col-span-2">
                hero.headline
                <input
                  className={cmsInputClass}
                  value={cmsGetStr(cms, ["landing", lang, "hero", "headline"])}
                  onChange={(e) => patch((p) => cmsSetStr(p, ["landing", lang, "hero", "headline"], e.target.value))}
                />
              </label>
              <label className="block text-xs text-slate-400 sm:col-span-2">
                footer.description
                <textarea
                  className={`${cmsInputClass} min-h-[56px]`}
                  value={cmsGetStr(cms, ["landing", lang, "footer", "description"])}
                  onChange={(e) => patch((p) => cmsSetStr(p, ["landing", lang, "footer", "description"], e.target.value))}
                />
              </label>
              <label className="block text-xs text-slate-400 sm:col-span-2">
                finalCta.title
                <input
                  className={cmsInputClass}
                  value={cmsGetStr(cms, ["landing", lang, "finalCta", "title"])}
                  onChange={(e) => patch((p) => cmsSetStr(p, ["landing", lang, "finalCta", "title"], e.target.value))}
                />
              </label>
            </div>
          </section>
        ))}

        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await putAdminCms(accessToken, cms);
              setPreviewKey((k) => k + 1);
              setRawText(JSON.stringify(cms, null, 2));
              setMsg("CMS kaydedildi.");
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-xl bg-emerald-500/30 px-5 py-2.5 text-sm font-semibold text-emerald-50 disabled:opacity-40"
        >
          {busy ? "Kaydediliyor…" : "Formları sunucuya kaydet"}
        </button>

        <div className="rounded-2xl border border-white/[0.08] bg-black/20">
          <button
            type="button"
            onClick={() => {
              if (!rawOpen) {
                setRawText(JSON.stringify(cms, null, 2));
              }
              setRawOpen((o) => !o);
              setRawErr(null);
            }}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-200"
          >
            Gelişmiş: tam CMS JSON
            <span>{rawOpen ? "▼" : "▶"}</span>
          </button>
          {rawOpen ? (
            <div className="space-y-2 border-t border-white/[0.06] p-4">
              {rawErr ? <p className="text-xs text-red-300">{rawErr}</p> : null}
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={14}
                className="w-full rounded-xl border border-white/[0.1] bg-black/40 p-3 font-mono text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(rawText) as Record<string, unknown>;
                      setCms(parsed);
                      setRawErr(null);
                      setMsg("JSON forma uygulandı (yerel). Sunucuya göndermek için üstteki kaydet.");
                    } catch {
                      setRawErr("Geçersiz JSON");
                    }
                  }}
                  className="rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-semibold text-slate-200"
                >
                  JSON’u forma uygula
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setMsg(null);
                    try {
                      const parsed = JSON.parse(rawText) as Record<string, unknown>;
                      await putAdminCms(accessToken, parsed);
                      setCms(parsed);
                      setPreviewKey((k) => k + 1);
                      setMsg("Tam JSON sunucuya kaydedildi.");
                    } catch (e) {
                      setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="rounded-xl bg-emerald-500/30 px-4 py-2 text-xs font-semibold text-emerald-50 disabled:opacity-40"
                >
                  JSON’dan doğrudan kaydet
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {msg ? <p className="text-sm text-slate-400">{msg}</p> : null}
      </div>
      <div className="flex min-h-[320px] flex-col rounded-2xl border border-white/[0.08] bg-black/30 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Canlı site önizlemesi</p>
          <button
            type="button"
            onClick={() => setPreviewKey((k) => k + 1)}
            className="rounded-lg border border-white/[0.12] px-2 py-1 text-[11px] text-slate-200"
          >
            Yenile
          </button>
        </div>
        <iframe
          key={previewKey}
          title="Karşılama önizlemesi"
          src={previewSrc}
          className="min-h-[280px] flex-1 w-full rounded-xl border border-white/[0.06] bg-white"
        />
      </div>
    </div>
  );
}

function SettingsTab({ accessToken }: { accessToken: string }) {
  const fullRef = useRef<Record<string, unknown>>({ ...DEFAULT_SITE_SETTINGS });
  const [theme, setTheme] = useState("dark");
  const [defaultLanguage, setDefaultLanguage] = useState("en");
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [freeDailyLimitDisplay, setFreeDailyLimitDisplay] = useState(5);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [rawErr, setRawErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const all = await fetchAdminSettings(accessToken);
      const cur = all["site.settings"];
      const merged =
        cur && typeof cur === "object"
          ? { ...DEFAULT_SITE_SETTINGS, ...(cur as Record<string, unknown>) }
          : { ...DEFAULT_SITE_SETTINGS };
      fullRef.current = merged;
      setTheme(String(merged.theme ?? "dark"));
      setDefaultLanguage(String(merged.defaultLanguage ?? "en"));
      setAnalyticsEnabled(merged.analyticsEnabled !== false);
      setFreeDailyLimitDisplay(Number(merged.freeDailyLimitDisplay ?? 5));
      setRawText(JSON.stringify(merged, null, 2));
      setMsg(null);
    })();
  }, [accessToken]);

  return (
    <div className="space-y-6">
      <AdminImpactCard title="Bu sekmede ne değişir?">
        <p>
          <code className="text-slate-200">analyticsEnabled</code> ve tema / dil ayarları{" "}
          <code className="text-slate-200">/api/public/site-config</code> ile ön yüke gider; analitik çerezi onaylandığında bile kapalıysa izleme gönderilmez.{" "}
          <code className="text-slate-200">freeDailyLimitDisplay</code> ayarı veritabanında tutulur; ön yüzde henüz sabit kullanılıyorsa bu alan görünmez (ileride metinlerde kullanılabilir). Gerçek günlük kota <strong className="text-slate-100">plan tanımındadır</strong>.
        </p>
      </AdminImpactCard>
      <p className="text-sm text-slate-400">
        <code className="text-slate-300">site.settings</code> — <code className="text-slate-300">analyticsEnabled</code>{" "}
        <code className="text-slate-300">/api/public/site-config</code> üzerinden okunur.
      </p>

      <section className="grid gap-4 rounded-2xl border border-white/[0.08] bg-black/25 p-4 sm:grid-cols-2">
        <label className="block text-xs text-slate-400">
          Tema
          <select value={theme} onChange={(e) => setTheme(e.target.value)} className={cmsInputClass}>
            <option value="dark">dark</option>
            <option value="light">light</option>
          </select>
        </label>
        <label className="block text-xs text-slate-400">
          Varsayılan dil
          <select value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value)} className={cmsInputClass}>
            <option value="en">en</option>
            <option value="tr">tr</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300 sm:col-span-2">
          <input
            type="checkbox"
            checked={analyticsEnabled}
            onChange={(e) => setAnalyticsEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-black/40"
          />
          analyticsEnabled (oturumlu sayfa analitiği)
        </label>
        <label className="block text-xs text-slate-400">
          freeDailyLimitDisplay
          <input
            type="number"
            min={1}
            className={cmsInputClass}
            value={freeDailyLimitDisplay}
            onChange={(e) => setFreeDailyLimitDisplay(Number(e.target.value))}
          />
        </label>
      </section>

      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const payload = {
            ...fullRef.current,
            theme,
            defaultLanguage,
            analyticsEnabled,
            freeDailyLimitDisplay,
          };
          try {
            await putAdminSettingsPatches(accessToken, { "site.settings": payload });
            fullRef.current = payload;
            setRawText(JSON.stringify(payload, null, 2));
            setMsg("Site ayarları kaydedildi.");
          } catch (e) {
            setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-xl bg-violet-500/30 px-5 py-2.5 text-sm font-semibold text-violet-50 disabled:opacity-40"
      >
        {busy ? "Kaydediliyor…" : "Kaydet"}
      </button>

      <div className="rounded-2xl border border-white/[0.08] bg-black/20">
        <button
          type="button"
          onClick={() => {
            if (!rawOpen) {
              setRawText(JSON.stringify(fullRef.current, null, 2));
            }
            setRawOpen((o) => !o);
            setRawErr(null);
          }}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-200"
        >
          Gelişmiş: tam site.settings JSON (betaFeatures vb.)
          <span>{rawOpen ? "▼" : "▶"}</span>
        </button>
        {rawOpen ? (
          <div className="space-y-2 border-t border-white/[0.06] p-4">
            {rawErr ? <p className="text-xs text-red-300">{rawErr}</p> : null}
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={12}
              className="w-full rounded-xl border border-white/[0.1] bg-black/40 p-3 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(rawText) as Record<string, unknown>;
                    fullRef.current = { ...DEFAULT_SITE_SETTINGS, ...parsed };
                    setTheme(String(fullRef.current.theme ?? "dark"));
                    setDefaultLanguage(String(fullRef.current.defaultLanguage ?? "en"));
                    setAnalyticsEnabled(fullRef.current.analyticsEnabled !== false);
                    setFreeDailyLimitDisplay(Number(fullRef.current.freeDailyLimitDisplay ?? 5));
                    setRawErr(null);
                    setMsg("JSON forma uygulandı (yerel).");
                  } catch {
                    setRawErr("Geçersiz JSON");
                  }
                }}
                className="rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-semibold text-slate-200"
              >
                JSON’u forma uygula
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setMsg(null);
                  try {
                    const parsed = JSON.parse(rawText) as Record<string, unknown>;
                    await putAdminSettingsPatches(accessToken, { "site.settings": parsed });
                    fullRef.current = parsed;
                    setMsg("site.settings (JSON) kaydedildi.");
                  } catch (e) {
                    setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-xl bg-violet-500/30 px-4 py-2 text-xs font-semibold text-violet-50 disabled:opacity-40"
              >
                JSON’dan kaydet
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {msg ? <p className="text-sm text-slate-400">{msg}</p> : null}
    </div>
  );
}

function AnalyticsTab({ accessToken, overview }: { accessToken: string; overview: AdminOverview | null }) {
  const [series, setSeries] = useState<{ date: string; totalOperations: number }[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const t = new Date();
    const f = new Date(t);
    f.setUTCDate(f.getUTCDate() - 30);
    setTo(t.toISOString().slice(0, 10));
    setFrom(f.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    void (async () => {
      const { series: s } = await fetchAdminUsageSeries(accessToken, 30);
      setSeries(s);
    })();
  }, [accessToken]);

  const pvDay = overview?.pageViewsByDay ?? [];
  const pvHour = overview?.pageViewsTodayByHourUtc ?? [];
  const funnel = overview?.conversionFunnel;

  return (
    <div className="space-y-6">
      <AdminImpactCard title="Bu sekmede ne değişir?">
        <p>
          Grafikler ve huni <strong className="text-slate-100">salt okunur</strong> raporlardır. Dönüşüm metinlerini değiştirmek için{" "}
          <strong className="text-slate-100">Araçlar / Özellikler</strong> sekmesindeki <code className="text-slate-200">conversion.*</code> alanlarını kullanın.
        </p>
      </AdminImpactCard>
      {funnel ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-300">Ücretsiz kota aşımı (tüm zamanlar)</p>
            <p className="mt-1 text-2xl font-bold text-amber-200">{funnel.freeTierEverHitLimit}</p>
            <p className="mt-1 text-[11px] text-slate-400">Kota sınırını en az bir kez aşmış kullanıcılar</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-300">Tamamlanan ödeme (benzersiz kullanıcı)</p>
            <p className="mt-1 text-2xl font-bold text-emerald-300">{funnel.usersWithCompletedCheckout}</p>
            <p className="mt-1 text-[11px] text-slate-400">Ödemesi tamamlanmış farklı kullanıcı sayısı</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-300">Kayıtlı kullanıcılar</p>
            <p className="mt-1 text-2xl font-bold text-slate-100">{funnel.totalUsers}</p>
            <p className="mt-1 text-[11px] text-slate-400">Huni bağlamı (özet)</p>
          </div>
        </section>
      ) : null}
      {overview ? (
        <section>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-200">Haftalık eğilim (günlük özet)</h3>
          <BarTrend data={overview.usageByDay.slice(-14)} />
        </section>
      ) : null}
      {pvDay.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-200">Sayfa görüntülemeleri (son ~30 gün)</h3>
          <PageViewBarTrend data={pvDay} />
        </section>
      ) : null}
      {pvHour.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-200">Bugünkü sayfa görüntülemeleri (UTC saat)</h3>
          <HourBarTrend data={pvHour} />
        </section>
      ) : null}
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-200">Kullanım serisi (API)</h3>
        <BarTrend data={series} />
      </section>
      <section className="rounded-2xl border border-white/[0.08] p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-200">CSV dışa aktarma</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-white/[0.1] bg-black/40 px-2 py-1.5 text-xs font-semibold text-slate-100"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-white/[0.1] bg-black/40 px-2 py-1.5 text-xs font-semibold text-slate-100"
          />
          <button
            type="button"
            onClick={async () => {
              await downloadUsageExport(accessToken, from, to);
            }}
            className="rounded-lg bg-sky-500/25 px-3 py-1.5 text-xs font-semibold"
          >
            Kullanım CSV indir
          </button>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
          Satırlar: kullanıcı başına günlük kullanım, işlem sayıları ve son kullanılan araç. Excel’de e-posta veya tarihe göre süzebilirsiniz.
        </p>
      </section>
    </div>
  );
}

function GlobalElementsTab({ accessToken }: { accessToken: string }) {
  const [headerTagline, setHeaderTagline] = useState("");
  const [footerNote, setFooterNote] = useState("");
  const [tooltipsJson, setTooltipsJson] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [rawText, setRawText] = useState("{}");
  const [rawErr, setRawErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const all = await fetchAdminSettings(accessToken);
      const g = all["global.elements"];
      const o =
        g && typeof g === "object"
          ? (g as { headerTagline?: string; footerNote?: string; tooltips?: unknown })
          : { headerTagline: "", footerNote: "", tooltips: {} };
      setHeaderTagline(String(o.headerTagline ?? ""));
      setFooterNote(String(o.footerNote ?? ""));
      try {
        setTooltipsJson(JSON.stringify(o.tooltips && typeof o.tooltips === "object" ? o.tooltips : {}, null, 2));
      } catch {
        setTooltipsJson("{}");
      }
      const full = { headerTagline: o.headerTagline ?? "", footerNote: o.footerNote ?? "", tooltips: o.tooltips ?? {} };
      setRawText(JSON.stringify(full, null, 2));
      setMsg(null);
    })();
  }, [accessToken]);

  return (
    <div className="space-y-6">
      <AdminImpactCard title="Bu sekmede ne değişir?">
        <p>
          Değerler <code className="text-slate-200">global.elements</code> olarak saklanır. Bu projede ön yüke <strong className="text-slate-100">henüz bağlı değildir</strong>; yani headerTagline / footerNote şu an sitede otomatik görünmez. İleride ortak layout veya tema bileşenlerine bağlanabilir. JSON’u yine de yedek / hazırlık için düzenleyebilirsiniz.
        </p>
      </AdminImpactCard>
      <p className="text-sm text-slate-400">
        Genel metinler <code className="text-slate-300">global.elements</code>. Ayrıntılı yapı için gelişmiş JSON’u kullanın.
      </p>

      <section className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
        <h3 className="text-sm font-semibold text-white">Hızlı alanlar</h3>
        <label className="mt-3 block text-xs text-slate-400">
          headerTagline
          <input
            className={cmsInputClass}
            value={headerTagline}
            onChange={(e) => setHeaderTagline(e.target.value)}
          />
        </label>
        <label className="mt-2 block text-xs text-slate-400">
          footerNote
          <textarea className={`${cmsInputClass} min-h-[64px]`} value={footerNote} onChange={(e) => setFooterNote(e.target.value)} />
        </label>
        <label className="mt-2 block text-xs text-slate-400">
          tooltips (JSON nesnesi)
          <textarea
            className={`${cmsInputClass} min-h-[100px] font-mono text-xs`}
            value={tooltipsJson}
            onChange={(e) => setTooltipsJson(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              let tooltips: unknown = {};
              try {
                tooltips = JSON.parse(tooltipsJson) as unknown;
              } catch {
                throw new Error("tooltips geçerli bir JSON nesnesi olmalı.");
              }
              const payload = { headerTagline, footerNote, tooltips };
              await putAdminSettingsPatches(accessToken, { "global.elements": payload });
              setRawText(JSON.stringify(payload, null, 2));
              setMsg("global.elements kaydedildi.");
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
            } finally {
              setBusy(false);
            }
          }}
          className="mt-4 rounded-xl bg-violet-500/30 px-5 py-2.5 text-sm font-semibold text-violet-50 disabled:opacity-40"
        >
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </section>

      <div className="rounded-2xl border border-white/[0.08] bg-black/20">
        <button
          type="button"
          onClick={() => {
            if (!rawOpen) {
              setRawText(
                JSON.stringify(
                  {
                    headerTagline,
                    footerNote,
                    tooltips: (() => {
                      try {
                        return JSON.parse(tooltipsJson) as unknown;
                      } catch {
                        return {};
                      }
                    })(),
                  },
                  null,
                  2,
                ),
              );
            }
            setRawOpen((o) => !o);
            setRawErr(null);
          }}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-200"
        >
          Gelişmiş: tam global.elements JSON
          <span>{rawOpen ? "▼" : "▶"}</span>
        </button>
        {rawOpen ? (
          <div className="space-y-2 border-t border-white/[0.06] p-4">
            {rawErr ? <p className="text-xs text-red-300">{rawErr}</p> : null}
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={12}
              className="w-full rounded-xl border border-white/[0.1] bg-black/40 p-3 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(rawText) as {
                      headerTagline?: string;
                      footerNote?: string;
                      tooltips?: unknown;
                    };
                    setHeaderTagline(String(parsed.headerTagline ?? ""));
                    setFooterNote(String(parsed.footerNote ?? ""));
                    setTooltipsJson(JSON.stringify(parsed.tooltips && typeof parsed.tooltips === "object" ? parsed.tooltips : {}, null, 2));
                    setRawErr(null);
                    setMsg("JSON forma uygulandı (yerel).");
                  } catch {
                    setRawErr("Geçersiz JSON");
                  }
                }}
                className="rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-semibold text-slate-200"
              >
                JSON’u forma uygula
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setMsg(null);
                  try {
                    const parsed = JSON.parse(rawText) as Record<string, unknown>;
                    await putAdminSettingsPatches(accessToken, { "global.elements": parsed });
                    setMsg("global.elements (JSON) kaydedildi.");
                  } catch (e) {
                    setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-xl bg-violet-500/30 px-4 py-2 text-xs font-semibold text-violet-50 disabled:opacity-40"
              >
                JSON’dan kaydet
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {msg ? <p className="text-sm text-slate-400">{msg}</p> : null}
    </div>
  );
}

function MediaTab({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<AdminMediaItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { items: next } = await fetchAdminMediaList(accessToken);
    setItems(next);
  }, [accessToken]);

  useEffect(() => {
    void reload().catch(() => setMsg("Medya listesi alınamadı"));
  }, [reload]);

  const base = getSaasApiBase().replace(/\/$/, "");

  return (
    <div className="space-y-6">
      <AdminImpactCard title="Bu sekmede ne değişir?">
        <p>
          Yüklediğiniz dosya sunucuda kalır; size bir <strong className="text-slate-100">kalıcı URL</strong> verilir. Bu URL’yi elle{" "}
          <strong className="text-slate-100">İçerik yönetimi</strong> formundaki ilgili alana yapıştırmadıkça sitede hiçbir yerde görünmez (otomatik bağlama yok).
        </p>
        <p className="text-[12px] text-slate-400">
          CMS’te doğrudan kullanılan görsel alanları:{" "}
          <code className="text-slate-300">assets.heroImageUrl</code>, <code className="text-slate-300">assets.logoUrl</code>. Diğer metin alanları (homepage, landing, banner, workspace) yalnızca metindir; görsel eklemek için bu URL’leri uygun yere JSON ile eklemeniz gerekir.
        </p>
      </AdminImpactCard>
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] p-4">
        <h2 className="text-sm font-semibold text-cyan-100">Dosya yükleme</h2>
        <p className="mt-1 text-sm text-slate-400">
          Görsel veya PDF yükleyin; dönen URL’yi <strong className="text-slate-200">İçerik yönetimi</strong> formundaki{" "}
          <code className="text-slate-300">assets.heroImageUrl</code> / <code className="text-slate-300">logoUrl</code> alanlarına yapıştırın. Dosyalar{" "}
          <code className="text-slate-300">/api/media/files/…</code> üzerinden sunulur.
        </p>
      </div>
      <label className="flex max-w-md cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-white/20 bg-black/30 px-4 py-6 text-center text-xs text-slate-400">
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            setMsg(null);
            try {
              await uploadAdminMedia(accessToken, f);
              await reload();
              setMsg("Yüklendi.");
            } catch (err) {
              setMsg(err instanceof Error ? err.message : "Yükleme başarısız");
            } finally {
              setBusy(false);
            }
          }}
        />
        <span className="font-semibold text-slate-200">{busy ? "Yükleniyor…" : "Yüklemek için tıklayın"}</span>
        <span>PNG, JPG, WebP, GIF, SVG, PDF — en fazla 12 MB</span>
      </label>
      {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="border-b border-white/[0.08] text-slate-500">
            <tr>
              <th className="px-3 py-2">Önizleme</th>
              <th className="px-3 py-2">URL</th>
              <th className="px-3 py-2">Boyut</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((a) => {
              const fullUrl = a.url.startsWith("http") ? a.url : `${base}${a.url}`;
              const isImg = a.mimeType.startsWith("image/");
              return (
                <tr key={a.id} className="border-b border-white/[0.05]">
                  <td className="px-3 py-2">
                    {isImg ? (
                      <img src={fullUrl} alt="" className="h-12 w-16 rounded object-cover" />
                    ) : (
                      <span className="text-slate-500">PDF</span>
                    )}
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2 font-mono text-[10px] text-slate-400">{fullUrl}</td>
                  <td className="px-3 py-2 text-slate-500">{Math.round(a.byteSize / 1024)} KB</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(fullUrl)}
                      className="rounded-lg bg-sky-500/20 px-2 py-1 text-[11px] font-semibold text-sky-100"
                    >
                      URL kopyala
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 ? <p className="p-4 text-center text-xs text-slate-500">Henüz dosya yok.</p> : null}
      </div>
    </div>
  );
}
