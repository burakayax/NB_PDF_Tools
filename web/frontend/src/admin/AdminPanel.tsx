import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
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
  fetchAdminPLARTFORM,
  fetchAdminUsageSeries,
  fetchAdminUsers,
  patchAdminUser,
  postAdminBlockedEmail,
  putAdminCms,
  putAdminPackagesMarketing,
  putAdminPlanPricing,
  putAdminPlansOverride,
  putAdminSettingsPatches,
  putAdminPLARTFORMConfig,
  uploadAdminMedia,
  type AdminMediaItem,
  type AdminOverview,
  type AdminUserRow,
  type BlockedEmailRow,
} from "../api/admin";
import { saasAuthorizedFetch } from "../api/subscription";
import { AUTH_ACCESS_TOKEN_STORAGE_KEY } from "../api/auth";
import { getSaasApiBase } from "../api/saasBase";
import { CMS_PREVIEW_QUERY, postAdminPreviewHighlight, writeCmsPreviewDraft } from "../lib/cmsPreview";
import { WORKSPACE_TOOL_IDS } from "../lib/workspaceFeatures";
import { resolveCmsAssetUrl } from "../lib/landingCmsMerge";
import { notifyRuntimeRefresh } from "../lib/runtimeRefreshEvents";
import {
  AdminField,
  AdminImpactCard,
  AdminMutedBox,
  AdminSaveStrip,
  AdminSection,
  AdminSidebarNav,
  ConfirmModal,
  adminInputClass,
  type AdminSaveStripState,
} from "./AdminUi";
import type { NavGroup } from "./AdminUi";
import { SystemControlTab } from "./SystemControlTab";

type AdminTabId = "dashboard" | "users" | "packages" | "PLARTFORM" | "content" | "media" | "settings" | "analytics";

export type AdminUiMode = "simple" | "advanced";

const ADMIN_UI_MODE_STORAGE_KEY = "nb-admin-ui-mode";

function readStoredAdminUiMode(): AdminUiMode {
  if (typeof window === "undefined") {
    return "simple";
  }
  try {
    return window.localStorage.getItem(ADMIN_UI_MODE_STORAGE_KEY) === "advanced" ? "advanced" : "simple";
  } catch {
    return "simple";
  }
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Panel",
    items: [
      { id: "dashboard", label: "Genel bakış", hint: "Özet istatistikler" },
      { id: "users", label: "Kullanıcılar", hint: "Hesaplar" },
      { id: "packages", label: "Paketler", hint: "Fiyat ve planlar" },
      { id: "PLARTFORM", label: "Araçlar", hint: "Araçlar · monetizasyon (SiteSetting)" },
      { id: "content", label: "İçerik", hint: "Sayfa metinleri ve görseller" },
      { id: "media", label: "Medya", hint: "Görseller" },
      { id: "settings", label: "Ayarlar", hint: "Site, güvenlik, sistem" },
      { id: "analytics", label: "Analitik", hint: "Raporlar ve dışa aktarma" },
    ],
  },
];

function adminTabLabel(id: AdminTabId): string {
  for (const g of NAV_GROUPS) {
    const f = g.items.find((i) => i.id === id);
    if (f) return f.label;
  }
  return id;
}

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
            className="w-full rounded-t bg-cyan-500/50"
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
  /** İleride moderatör rolü için; şimdilik yalnızca tam yönetici paneli. */
  viewerRole?: "ADMIN" | "STAFF";
};

type CmsMediaBindSlot = "hero" | "logo" | "screenshot1" | "screenshot2";

function CmsPreviewAnchor({
  iframeRef,
  section,
  children,
}: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  section: string;
  children: React.ReactNode;
}) {
  const ping = () => postAdminPreviewHighlight(iframeRef.current?.contentWindow, section);
  return (
    <div onFocusCapture={ping} onChangeCapture={ping}>
      {children}
    </div>
  );
}

export function AdminPanel({ accessToken, onExit, onLogout, viewerRole = "ADMIN" }: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTabId>("dashboard");
  const [uiMode, setUiMode] = useState<AdminUiMode>(() => readStoredAdminUiMode());
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pendingCmsMediaBind, setPendingCmsMediaBind] = useState<{
    slot: CmsMediaBindSlot;
    url: string;
  } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(ADMIN_UI_MODE_STORAGE_KEY, uiMode);
    } catch {
      /* ignore quota / private mode */
    }
  }, [uiMode]);

  const queueCmsMediaBind = useCallback((slot: CmsMediaBindSlot, url: string) => {
    setPendingCmsMediaBind({ slot, url });
    setTab("content");
  }, []);

  const clearPendingCmsMediaBind = useCallback(() => setPendingCmsMediaBind(null), []);

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
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-white/[0.08] bg-[#080d18] md:w-[280px]">
        <div className="border-b border-white/[0.08] px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/90">Yönetim paneli</p>
          <p className="mt-1 text-base font-semibold text-white">NB PDF PLARTFORM</p>
          <p className="mt-2 text-[11px] leading-snug text-slate-500">Kod bilgisi gerekmez; alanların altındaki açıklamalara bakın.</p>
        </div>
        <AdminSidebarNav groups={NAV_GROUPS} activeId={tab} onSelect={(id) => setTab(id as AdminTabId)} />
        <div className="border-t border-white/[0.08] px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Görünüm</p>
          <div className="mt-2 flex rounded-xl border border-white/[0.1] bg-black/35 p-0.5">
            <button
              type="button"
              onClick={() => setUiMode("simple")}
              className={`flex-1 rounded-lg px-2 py-2 text-center text-[11px] font-semibold transition-colors ${
                uiMode === "simple" ? "bg-violet-500/35 text-violet-50 shadow-sm" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Basit
            </button>
            <button
              type="button"
              onClick={() => setUiMode("advanced")}
              className={`flex-1 rounded-lg px-2 py-2 text-center text-[11px] font-semibold transition-colors ${
                uiMode === "advanced" ? "bg-violet-500/35 text-violet-50 shadow-sm" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Gelişmiş
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-slate-500">
            {uiMode === "simple" ? "Yalnız temel alanlar; çoğu iş için yeterli." : "Tüm alanlar ve teknik seçenekler."}
          </p>
        </div>
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
          <div>
            <h1 className="text-lg font-semibold text-white">{adminTabLabel(tab)}</h1>
            <p className="mt-0.5 text-[12px] text-slate-500">Değişiklikler kaydedildiğinde site birkaç saniye içinde güncellenir.</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                uiMode === "simple"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                  : "border-amber-500/35 bg-amber-500/10 text-amber-100"
              }`}
            >
              {uiMode === "simple" ? "Basit mod" : "Gelişmiş mod"}
            </span>
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-200">
              Yönetici
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          {loadErr && tab === "dashboard" ? (
            <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{loadErr}</p>
          ) : null}

          {tab === "dashboard" ? <DashboardTab overview={overview} uiMode={uiMode} /> : null}
          {tab === "users" ? <UsersTab accessToken={accessToken} uiMode={uiMode} /> : null}
          {tab === "packages" ? <PackagesTab accessToken={accessToken} uiMode={uiMode} /> : null}
          {tab === "PLARTFORM" ? <PLARTFORMTab accessToken={accessToken} uiMode={uiMode} /> : null}
          {tab === "content" ? (
            <ContentTab
              accessToken={accessToken}
              uiMode={uiMode}
              pendingMediaBind={pendingCmsMediaBind}
              onConsumePendingMediaBind={clearPendingCmsMediaBind}
              onOpenMediaLibrary={() => setTab("media")}
            />
          ) : null}
          {tab === "media" ? <MediaTab accessToken={accessToken} onBindToCms={queueCmsMediaBind} /> : null}
          {tab === "settings" ? (
            <SettingsTab accessToken={accessToken} uiMode={uiMode} showSystemPLARTFORM={viewerRole === "ADMIN"} />
          ) : null}
          {tab === "analytics" ? <AnalyticsTab accessToken={accessToken} overview={overview} uiMode={uiMode} /> : null}
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

function DashboardTab({ overview, uiMode }: { overview: AdminOverview | null; uiMode: AdminUiMode }) {
  if (!overview) {
    return <p className="text-slate-500">Özet yükleniyor…</p>;
  }
  const advanced = uiMode === "advanced";
  const updatedAt = new Date(overview.generatedAt).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
  return (
    <div className="space-y-6">
      {advanced ? (
        <AdminImpactCard title="Bu sekmede ne değişir?">
          <p>
            Özet kartları ve grafikler <strong className="text-slate-100">salt okunur</strong> istatistiktir; kullanıcı davranışını veya site metnini buradan değiştirmezsiniz. Metin ve görseller için{" "}
            <strong className="text-slate-100">İçerik</strong> / <strong className="text-slate-100">Ayarlar</strong> / <strong className="text-slate-100">Araçlar</strong> sekmelerini kullanın.
          </p>
        </AdminImpactCard>
      ) : (
        <AdminMutedBox>Bu sayfa özet sayılar gösterir; düzenleme yapılmaz. Metin ve görseller için <strong className="text-slate-200">İçerik</strong> sekmesine gidin.</AdminMutedBox>
      )}
      <p className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.08] px-4 py-3 text-sm text-slate-200">
        <span className="font-semibold text-cyan-100">Bilgi:</span> Veriler yaklaşık 12 saniyede bir yenilenir.{" "}
        <span className="font-mono text-[13px] font-semibold text-white">Son güncelleme: {updatedAt}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Kayıtlı kullanıcılar">
          <p className="text-3xl font-bold tabular-nums text-white">{overview.totalUsers}</p>
        </StatCard>
        <StatCard title="Bugün işlem yapan kullanıcı">
          <p className="text-3xl font-bold tabular-nums text-cyan-300">{overview.activeUsersToday}</p>
          <p className="mt-1 text-[12px] text-slate-400">Bugün en az bir PDF işlemi yapan hesap sayısı</p>
        </StatCard>
        <StatCard title="Bugün toplam işlem">
          <p className="text-3xl font-bold tabular-nums text-cyan-300/90">{overview.todayTotalOperations}</p>
          <p className="mt-1 text-[12px] text-slate-400">UTC güne göre tüm kullanıcılar</p>
        </StatCard>
        <StatCard title={`Şu an sitede (son ${overview.presenceWindowMinutes} dk)`}>
          <p className="text-3xl font-bold tabular-nums text-violet-200">{overview.distinctSessionsActiveNow}</p>
          {advanced ? (
            <>
              <p className="mt-1 text-[11px] text-slate-500">Benzersiz tarayıcı oturumu (sayfa görüntülemesi)</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-medium text-slate-300">
                <span>Kayıtlı hesap: {overview.registeredUsersActiveNow}</span>
                <span>Ziyaretçi oturumu: {overview.anonymousSessionsActiveNow}</span>
              </div>
            </>
          ) : (
            <p className="mt-1 text-[12px] text-slate-400">Aktif oturum sayısı</p>
          )}
        </StatCard>
        <StatCard title="Ziyaretçi oturumları (anonim, bugün)">
          <p className="text-3xl font-bold tabular-nums text-amber-200/90">{overview.anonymousSessionsToday}</p>
        </StatCard>
        <StatCard title="Kayıtlı oturumlar (bugün)">
          <p className="text-3xl font-bold tabular-nums text-emerald-300/90">{overview.registeredSessionsToday}</p>
        </StatCard>
      </div>
      {advanced ? (
      <div className="grid gap-4 lg:grid-cols-2">
        <StatCard title="Paket dağılımı">
          <ul className="space-y-2 text-sm">
            {overview.usagePerPackage.map((p) => (
              <li key={p.plan} className="flex justify-between border-b border-white/[0.06] border-dashed py-1">
                <span>{p.plan}</span>
                <span className="font-mono text-cyan-300">{p.userCount}</span>
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
            {overview.mostUsedPLARTFORMAllTimeFallback
              ? "Son 30 günde veri yok; tüm zamanların toplamı gösteriliyor. İşlem sayısı günlük satırlarındaki son araç alanına göre dağıtılır."
              : "Son 30 gün, günlük kullanım kayıtlarına göre (işlem sayısı o günkü son araç alanına yazılır)."}
          </p>
          {overview.mostUsedPLARTFORM.length === 0 ? (
            <p className="text-sm text-slate-500">
              Henüz araç kullanımı yok veya <code className="text-slate-400">lastFeatureKey</code> dolu kayıt bulunmuyor. PDF işlemi yaptıktan sonra burası dolacaktır.
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {overview.mostUsedPLARTFORM.map((t) => (
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
      ) : null}
      {advanced ? (
      <StatCard title="Günlük işlemler (son 30 gün, UTC)">
        <BarTrend data={overview.usageByDay} h={120} />
      </StatCard>
      ) : null}
      {advanced ? (
      <p className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-slate-300">
        Anonim sayfa görüntülemeleri (bugün: <span className="font-mono font-semibold text-white">{overview.anonymousPageViewsToday}</span>) ve ödeme akışı. Tam dışa aktarma:{" "}
        <strong className="text-cyan-200">Analitik</strong> sekmesinde.
      </p>
      ) : null}
    </div>
  );
}

function UsersTab({ accessToken, uiMode }: { accessToken: string; uiMode: AdminUiMode }) {
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
  const [confirmDlg, setConfirmDlg] = useState<{
    title: string;
    message: string;
    action: () => Promise<void>;
    confirmLabel?: string;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const advanced = uiMode === "advanced";

  const requestDangerConfirm = useCallback(
    (opts: { title: string; message: string; confirmLabel?: string; action: () => Promise<void> }) => {
      setConfirmDlg(opts);
    },
    [],
  );

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
    <div className="space-y-6">
      <ConfirmModal
        open={!!confirmDlg}
        title={confirmDlg?.title ?? ""}
        message={confirmDlg?.message ?? ""}
        confirmLabel={confirmDlg?.confirmLabel ?? "Onayla"}
        cancelLabel="Vazgeç"
        variant="danger"
        busy={confirmBusy}
        onClose={() => {
          if (!confirmBusy) setConfirmDlg(null);
        }}
        onConfirm={async () => {
          if (!confirmDlg) return;
          setConfirmBusy(true);
          try {
            await confirmDlg.action();
            setConfirmDlg(null);
          } finally {
            setConfirmBusy(false);
          }
        }}
      />
      {advanced ? (
        <AdminImpactCard title="Bu sekmede ne değişir?">
          <p>
            Plan ve rol güncellemeleri <strong className="text-slate-100">hemen</strong> ilgili kullanıcının oturumunda geçerli olur (bir sonraki API çağrısında). Silme ve e-posta engeli{" "}
            <strong className="text-slate-100">kalıcıdır</strong>; engelli adresle yeni kayıt açılamaz.
          </p>
        </AdminImpactCard>
      ) : (
        <AdminMutedBox>Kullanıcı planını veya rolünü değiştirip Kaydet’e basın. Silme işlemi geri alınamaz.</AdminMutedBox>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          placeholder="E-posta, ad ara…"
          className="min-w-[200px] flex-1 rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/35"
        />
        <button type="button" onClick={() => void load()} className="rounded-xl bg-white/[0.08] px-4 py-2 text-xs font-semibold">
          Ara
        </button>
        <button type="button" onClick={() => setCreateOpen((v) => !v)} className="rounded-xl bg-violet-500/20 px-4 py-2 text-xs font-semibold text-violet-100">
          {createOpen ? "Formu kapat" : "Kullanıcı ekle"}
        </button>
      </div>
      {createOpen ? (
        <AdminSection title="Yeni kullanıcı" description="Test veya davet için hesap oluşturur; e-posta bu panelde otomatik doğrulanmış sayılır.">
          <form
            className="grid gap-5 sm:grid-cols-2"
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
            <AdminField label="E-posta" description="Girişte kullanılacak benzersiz adres.">
              <input required type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={adminInputClass} />
            </AdminField>
            <AdminField label="Şifre" description="En az 8 karakter; kullanıcıya güvenli kanaldan iletin.">
              <input required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={adminInputClass} />
            </AdminField>
            <AdminField label="Ad">
              <input value={newFirst} onChange={(e) => setNewFirst(e.target.value)} className={adminInputClass} />
            </AdminField>
            <AdminField label="Soyad">
              <input value={newLast} onChange={(e) => setNewLast(e.target.value)} className={adminInputClass} />
            </AdminField>
            <button type="submit" className="sm:col-span-2 rounded-xl bg-violet-600/80 py-2.5 text-sm font-semibold text-white">
              Kullanıcıyı oluştur
            </button>
          </form>
        </AdminSection>
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
                <UserRow
                  key={u.id}
                  u={u}
                  accessToken={accessToken}
                  onSaved={load}
                  onBlockedListChange={loadBlocked}
                  requestDangerConfirm={requestDangerConfirm}
                />
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
      {advanced ? (
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
                onClick={() => {
                  requestDangerConfirm({
                    title: "Engeli kaldır",
                    message: `${b.email} adresi engelli listeden çıkarılacak; bu adresle yeni kayıt tekrar mümkün olur.`,
                    confirmLabel: "Engeli kaldır",
                    action: async () => {
                      setErr(null);
                      try {
                        await deleteAdminBlockedEmail(accessToken, b.email);
                        await loadBlocked();
                      } catch (er) {
                        setErr(er instanceof Error ? er.message : "Kaldırılamadı");
                      }
                    },
                  });
                }}
                className="rounded-md border border-white/[0.12] px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/[0.06]"
              >
                Engeli kaldır
              </button>
            </li>
          ))}
        </ul>
      </div>
      ) : null}

      {advanced ? (
      <p className="text-[11px] text-slate-500">
        “Yönetici” API erişimi yapılandırılmış yönetici e-posta kuralına bağlıdır; JWT rolü e-postadan türetilir. Veritabanındaki rol kayıt içindir—e-posta tabanlı yönetici denetimleri politika uyumlu olana kadar bunu aşmaz.
      </p>
      ) : null}
    </div>
  );
}

function UserRow({
  u,
  accessToken,
  onSaved,
  onBlockedListChange,
  requestDangerConfirm,
}: {
  u: AdminUserRow;
  accessToken: string;
  onSaved: () => void;
  onBlockedListChange: () => void;
  requestDangerConfirm: (opts: { title: string; message: string; confirmLabel?: string; action: () => Promise<void> }) => void;
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
            className="rounded-lg bg-cyan-500/20 px-2 py-1 text-[11px] font-semibold text-cyan-100"
          >
            Kaydet
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              requestDangerConfirm({
                title: "Kullanıcıyı sil",
                message: `${u.email} kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
                confirmLabel: "Evet, sil",
                action: async () => {
                  setSaving(true);
                  try {
                    await deleteAdminUser(accessToken, u.id, false);
                    await onSaved();
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : "Silinemedi");
                  } finally {
                    setSaving(false);
                  }
                },
              })
            }
            className="rounded-lg border border-white/[0.12] px-2 py-1 text-[11px] text-slate-300 hover:bg-white/[0.04]"
          >
            Sil
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              requestDangerConfirm({
                title: "Sil ve engelle",
                message: `${u.email} hesabı silinecek ve bu e-posta kara listeye eklenecek; aynı adresle yeni kayıt açılamaz.`,
                confirmLabel: "Sil ve engelle",
                action: async () => {
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
                },
              })
            }
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

function PackagesTab({ accessToken, uiMode }: { accessToken: string; uiMode: AdminUiMode }) {
  const [payload, setPayload] = useState<AdminPlansPayload | null>(null);
  const [proPrice, setProPrice] = useState("200.00");
  const [businessPrice, setBusinessPrice] = useState("400.00");
  const [pricingBusy, setPricingBusy] = useState(false);
  const [mkHeadline, setMkHeadline] = useState("");
  const [mkNotes, setMkNotes] = useState("");
  const [mkBusy, setMkBusy] = useState(false);
  const marketingExtraRef = useRef<Record<string, unknown>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  type PlanForm = {
    displayName: string;
    description: string;
    dailyUnlimited: boolean;
    dailyLimit: number;
    features: string[];
    multiUser: boolean;
  };
  const [planForms, setPlanForms] = useState<Record<string, PlanForm> | null>(null);
  const [featureCatalogList, setFeatureCatalogList] = useState<string[]>([]);
  const [planFormsBusy, setPlanFormsBusy] = useState(false);

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
        const mObj =
          m && typeof m === "object" && m !== null ? (m as Record<string, unknown>) : { upgradeCtaHeadline: "", notes: "" };
        setMkHeadline(String(mObj.upgradeCtaHeadline ?? ""));
        setMkNotes(String(mObj.notes ?? ""));
        const { upgradeCtaHeadline: _mh, notes: _mn, ...mRest } = mObj;
        marketingExtraRef.current = mRest;
        const ov = d.plansOverride;
        const ovRec = ov && typeof ov === "object" && !Array.isArray(ov) ? (ov as Record<string, unknown>) : {};
        const keys = Array.from(new Set((d.plans ?? []).flatMap((p) => p.allowedFeatures))).sort();
        setFeatureCatalogList(keys);
        const names = ["FREE", "PRO", "BUSINESS"] as const;
        const next: Record<string, PlanForm> = {};
        for (const name of names) {
          const p = d.plans?.find((x) => x.name === name);
          const o = ovRec[name] as Record<string, unknown> | undefined;
          const rawDl = o && "dailyLimit" in o ? o.dailyLimit : p?.dailyLimit ?? null;
          next[name] = {
            displayName: String(o?.displayName ?? p?.displayName ?? name),
            description: String(o?.description ?? p?.description ?? ""),
            dailyUnlimited: rawDl === null,
            dailyLimit: typeof rawDl === "number" ? rawDl : typeof p?.dailyLimit === "number" ? p.dailyLimit : 5,
            features: Array.isArray(o?.allowedFeatures)
              ? [...(o.allowedFeatures as string[])]
              : [...(p?.allowedFeatures ?? [])],
            multiUser: Boolean(o?.multiUser ?? p?.multiUser),
          };
        }
        setPlanForms(next);
        setMsg(null);
      } catch {
        setMsg("Planlar yüklenemedi");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hist reset + token
  }, [accessToken, loadTick]);

  const advanced = uiMode === "advanced";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Paketler ve ödeme</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            {advanced
              ? "Plan isimleri, açıklamalar, günlük limitler ve aylık fiyatlar buradan yönetilir. Kaydettiğinizde ödeme ekranı ve site birkaç saniye içinde güncellenir."
              : "Aylık fiyatlar ve kısa pazarlama metinleri. Paket kurallarını (limitler, hangi araçlar açık) düzenlemek için Gelişmiş moda geçin."}
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

      {advanced ? (
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
      ) : null}

      {planForms && advanced ? (
        <AdminSection
          title="Paket kuralları (FREE, PRO, Business)"
          description="Görünen ad, açıklama, günlük işlem limiti ve hangi PDF araçlarının açık olduğunu buradan yönetin. Kaydettiğinizde sunucu ve site birkaç saniye içinde güncellenir."
          variant="violet"
        >
          <div className="space-y-8">
            {(["FREE", "PRO", "BUSINESS"] as const).map((planKey) => {
              const f = planForms[planKey];
              return (
                <div key={planKey} className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-violet-300/90">{planKey}</p>
                  <div className="mt-4 grid gap-5 sm:grid-cols-2">
                    <AdminField
                      label="Paket adı (ekranda)"
                      description="Kullanıcının gördüğü kısa isim (ör. Ücretsiz, Pro)."
                    >
                      <input
                        className={adminInputClass}
                        value={f.displayName}
                        onChange={(e) =>
                          setPlanForms((prev) =>
                            prev ? { ...prev, [planKey]: { ...prev[planKey], displayName: e.target.value } } : prev,
                          )
                        }
                      />
                    </AdminField>
                    <AdminField
                      label="Çoklu kullanıcı (Business)"
                      description="İş hesapları için; tek kullanıcı paketlerinde kapalı tutun."
                    >
                      <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          checked={f.multiUser}
                          onChange={(e) =>
                            setPlanForms((prev) =>
                              prev ? { ...prev, [planKey]: { ...prev[planKey], multiUser: e.target.checked } } : prev,
                            )
                          }
                          className="h-4 w-4 rounded border-white/25 bg-black/50"
                        />
                        Bu pakette çoklu kullanıcı yapısı
                      </label>
                    </AdminField>
                    <AdminField
                      label="Açıklama"
                      description="Abonelik veya plan seçim ekranında gösterilen kısa metin."
                      htmlFor={`desc-${planKey}`}
                    >
                      <textarea
                        id={`desc-${planKey}`}
                        rows={3}
                        className={adminInputClass}
                        value={f.description}
                        onChange={(e) =>
                          setPlanForms((prev) =>
                            prev ? { ...prev, [planKey]: { ...prev[planKey], description: e.target.value } } : prev,
                          )
                        }
                      />
                    </AdminField>
                    <AdminField
                      label="Günlük işlem limiti"
                      description="Ücretsiz planda günlük kaç işlem yapılabileceği. Pro/Business için «Sınırsız» seçin."
                    >
                      <label className="mb-3 flex cursor-pointer items-center gap-3 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          checked={f.dailyUnlimited}
                          onChange={(e) =>
                            setPlanForms((prev) =>
                              prev
                                ? { ...prev, [planKey]: { ...prev[planKey], dailyUnlimited: e.target.checked } }
                                : prev,
                            )
                          }
                          className="h-4 w-4 rounded border-white/25 bg-black/50"
                        />
                        Sınırsız (günlük limit yok)
                      </label>
                      {!f.dailyUnlimited ? (
                        <input
                          type="number"
                          min={1}
                          className={adminInputClass}
                          value={f.dailyLimit}
                          onChange={(e) =>
                            setPlanForms((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    [planKey]: { ...prev[planKey], dailyLimit: Math.max(1, Number(e.target.value) || 1) },
                                  }
                                : prev,
                            )
                          }
                        />
                      ) : null}
                    </AdminField>
                  </div>
                  <AdminField
                    label="İzin verilen araçlar"
                    description="İşaretli her özellik bu pakette kullanılabilir. Kapalı olanlar uygulamada gizlenir veya engellenir."
                  >
                    <div className="mt-2 flex flex-wrap gap-2">
                      {featureCatalogList.map((fk) => (
                        <label
                          key={`${planKey}-${fk}`}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[12px] text-slate-200"
                        >
                          <input
                            type="checkbox"
                            checked={f.features.includes(fk)}
                            onChange={() => {
                              setPlanForms((prev) => {
                                if (!prev) return prev;
                                const cur = prev[planKey];
                                const set = new Set(cur.features);
                                if (set.has(fk)) set.delete(fk);
                                else set.add(fk);
                                return { ...prev, [planKey]: { ...cur, features: [...set] } };
                              });
                            }}
                            className="h-3.5 w-3.5 rounded border-white/25"
                          />
                          <span>{pdfToolLabelTr(fk)}</span>
                        </label>
                      ))}
                    </div>
                  </AdminField>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            disabled={planFormsBusy}
            onClick={async () => {
              if (!planForms || !payload) return;
              setPlanFormsBusy(true);
              setMsg(null);
              try {
                const existing =
                  payload.plansOverride && typeof payload.plansOverride === "object" && !Array.isArray(payload.plansOverride)
                    ? { ...(payload.plansOverride as Record<string, unknown>) }
                    : {};
                for (const name of ["FREE", "PRO", "BUSINESS"] as const) {
                  const pf = planForms[name];
                  existing[name] = {
                    displayName: pf.displayName,
                    description: pf.description,
                    dailyLimit: pf.dailyUnlimited ? null : pf.dailyLimit,
                    allowedFeatures: pf.features,
                    multiUser: pf.multiUser,
                  };
                }
                await putAdminPlansOverride(accessToken, existing);
                setMsg("Plan tanımları kaydedildi.");
                notifyRuntimeRefresh();
                setLoadTick((t) => t + 1);
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
              } finally {
                setPlanFormsBusy(false);
              }
            }}
            className="rounded-xl bg-violet-600/70 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-40"
          >
            {planFormsBusy ? "Kaydediliyor…" : "Paket kurallarını kaydet"}
          </button>
        </AdminSection>
      ) : null}

      <AdminSection
        title="Aylık abonelik fiyatları (TRY, KDV hariç)"
        description="Ondalık için nokta kullanın (örn. 199.99). Yeni ödeme oturumları bu tutarlarla açılır."
        variant="emerald"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="PRO — aylık fiyat" description="Pro paketinin kartta ve ödeme adımında görünen tutarı.">
            <input
              value={proPrice}
              onChange={(e) => setProPrice(e.target.value)}
              className={`${adminInputClass} font-mono`}
            />
          </AdminField>
          <AdminField label="Business — aylık fiyat" description="İş paketi için aylık tutar.">
            <input
              value={businessPrice}
              onChange={(e) => setBusinessPrice(e.target.value)}
              className={`${adminInputClass} font-mono`}
            />
          </AdminField>
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
              notifyRuntimeRefresh();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
            } finally {
              setPricingBusy(false);
            }
          }}
          className="rounded-xl bg-emerald-600/70 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
        >
          {pricingBusy ? "Kaydediliyor…" : "Fiyatları kaydet"}
        </button>
      </AdminSection>

      <AdminSection
        title="Pazarlama metinleri"
        description="Ücretsiz kota veya gecikme sonrası kullanıcıya gösterilen kısa yükseltme başlığı ve notlar."
        variant="violet"
      >
        <div className="grid gap-5">
          <AdminField label="Yükseltme başlığı" description="Kısa, dikkat çekici CTA metni (örn. Pro’ya geçin).">
            <input value={mkHeadline} onChange={(e) => setMkHeadline(e.target.value)} className={adminInputClass} />
          </AdminField>
          <AdminField label="Notlar" description="Alt açıklama; API yanıtlarında ve dönüşüm metinlerinde kullanılabilir.">
            <textarea value={mkNotes} onChange={(e) => setMkNotes(e.target.value)} rows={3} className={adminInputClass} />
          </AdminField>
        </div>
        <button
          type="button"
          disabled={mkBusy}
          onClick={async () => {
            setMkBusy(true);
            setMsg(null);
            try {
              const merged = { ...marketingExtraRef.current, upgradeCtaHeadline: mkHeadline, notes: mkNotes };
              await putAdminPackagesMarketing(accessToken, merged);
              const { upgradeCtaHeadline: _u, notes: _n, ...rest } = merged as Record<string, unknown>;
              marketingExtraRef.current = rest;
              setMsg("Pazarlama metinleri kaydedildi.");
              notifyRuntimeRefresh();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
            } finally {
              setMkBusy(false);
            }
          }}
          className="rounded-xl bg-violet-600/70 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {mkBusy ? "Kaydediliyor…" : "Pazarlama metnini kaydet"}
        </button>
      </AdminSection>

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

function applyCmsMediaBindSlot(
  prev: Record<string, unknown>,
  slot: CmsMediaBindSlot,
  url: string,
): Record<string, unknown> {
  switch (slot) {
    case "hero":
      return cmsSetStr(prev, ["assets", "heroImageUrl"], url);
    case "logo":
      return cmsSetStr(prev, ["assets", "logoUrl"], url);
    case "screenshot1":
      return cmsSetStr(prev, ["assets", "screenshot1Url"], url);
    case "screenshot2":
      return cmsSetStr(prev, ["assets", "screenshot2Url"], url);
  }
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

function cmsGetToolField(root: Record<string, unknown>, toolId: string, field: "title" | "description" | "button"): string {
  const ws = root.workspace as Record<string, unknown> | undefined;
  const PLARTFORM = ws?.PLARTFORM as Record<string, Record<string, unknown>> | undefined;
  const row = PLARTFORM?.[toolId];
  if (!row) {
    return "";
  }
  if (field === "button") {
    const b = row.button ?? row.buttonText;
    return typeof b === "string" ? b : "";
  }
  const v = row[field];
  return typeof v === "string" ? v : "";
}

function cmsSetToolField(
  root: Record<string, unknown>,
  toolId: string,
  field: "title" | "description" | "button",
  value: string,
): Record<string, unknown> {
  const next = cmsDeepClone(root);
  let ws = next.workspace as Record<string, unknown> | undefined;
  if (!ws || typeof ws !== "object" || Array.isArray(ws)) {
    next.workspace = {};
    ws = next.workspace as Record<string, unknown>;
  }
  let PLARTFORM = ws.PLARTFORM as Record<string, Record<string, unknown>> | undefined;
  if (!PLARTFORM || typeof PLARTFORM !== "object" || Array.isArray(PLARTFORM)) {
    ws.PLARTFORM = {};
    PLARTFORM = ws.PLARTFORM as Record<string, Record<string, unknown>>;
  }
  const cur = { ...(PLARTFORM[toolId] ?? {}) };
  if (field === "button") {
    cur.button = value;
    delete cur.buttonText;
  } else {
    cur[field] = value;
  }
  PLARTFORM[toolId] = cur;
  return next;
}

function cmsGetFeatureItemField(
  root: Record<string, unknown>,
  lang: "en" | "tr",
  index: number,
  field: "title" | "benefit",
): string {
  const land = root.landing as Record<string, unknown> | undefined;
  const L = land?.[lang] as Record<string, unknown> | undefined;
  const feat = L?.features as Record<string, unknown> | undefined;
  const items = feat?.items;
  if (!Array.isArray(items)) {
    return "";
  }
  const row = items[index] as Record<string, unknown> | undefined;
  if (!row) {
    return "";
  }
  const v = row[field];
  return typeof v === "string" ? v : "";
}

function cmsSetFeatureItemField(
  root: Record<string, unknown>,
  lang: "en" | "tr",
  index: number,
  field: "title" | "benefit",
  value: string,
): Record<string, unknown> {
  const next = cmsDeepClone(root);
  if (!next.landing || typeof next.landing !== "object" || Array.isArray(next.landing)) {
    next.landing = {};
  }
  const land = next.landing as Record<string, unknown>;
  if (!land[lang] || typeof land[lang] !== "object" || Array.isArray(land[lang])) {
    land[lang] = {};
  }
  const L = land[lang] as Record<string, unknown>;
  if (!L.features || typeof L.features !== "object" || Array.isArray(L.features)) {
    L.features = {};
  }
  const feat = L.features as Record<string, unknown>;
  let items = feat.items;
  if (!Array.isArray(items)) {
    items = [];
    feat.items = items;
  }
  const arr = items as Array<Record<string, unknown>>;
  while (arr.length <= index) {
    arr.push({ icon: "merge", title: "", benefit: "" });
  }
  const prevRow = (arr[index] as Record<string, unknown>) ?? {};
  const icon = typeof prevRow.icon === "string" && prevRow.icon.trim() ? prevRow.icon : "merge";
  arr[index] = { ...prevRow, icon, [field]: value };
  return next;
}

const cmsInputClass = adminInputClass;

type AdminPLARTFORMApiPayload = {
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

function mergePLARTFORMQuickForm(
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

type DelayTierEditorRow = { minNextOp: number; maxNextOp: number; minMs: number; maxMs: number };

const MONETIZATION_DELAY_TIER_DEFAULTS: DelayTierEditorRow[] = [
  { minNextOp: 6, maxNextOp: 6, minMs: 2000, maxMs: 4000 },
  { minNextOp: 7, maxNextOp: 7, minMs: 4000, maxMs: 7000 },
  { minNextOp: 8, maxNextOp: 999_999, minMs: 8000, maxMs: 15000 },
];

function monetizationNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

type MonetizationEditorState = {
  delaysEnabled: boolean;
  freeOpsBeforeThrottle: number;
  delayCapMs: number;
  delayFloorMs: number;
  delayTiers: DelayTierEditorRow[];
  strongThrottleMessageMinEvents: number;
  strongRecordMessageMinThrottle: number;
  strongRecordMessageMinPostLimitExtra: number;
};

function loadMonetizationFromPLARTFORMRoot(o: Record<string, unknown>): MonetizationEditorState {
  let delaysEnabled = true;
  let freeOpsBeforeThrottle = 5;
  let delayCapMs = 30_000;
  let delayFloorMs = 900;
  let delayTiers = MONETIZATION_DELAY_TIER_DEFAULTS.map((r) => ({ ...r }));

  const plt = o.postLimitThrottle;
  if (plt != null && typeof plt === "object" && !Array.isArray(plt)) {
    const p = plt as Record<string, unknown>;
    delaysEnabled = p.delaysEnabled !== false;
    if (typeof p.freeOpsBeforeThrottle === "number" && Number.isFinite(p.freeOpsBeforeThrottle)) {
      freeOpsBeforeThrottle = Math.max(0, Math.floor(p.freeOpsBeforeThrottle));
    }
    if (typeof p.delayCapMs === "number" && Number.isFinite(p.delayCapMs)) {
      delayCapMs = Math.max(100, Math.floor(p.delayCapMs));
    }
    if (typeof p.delayFloorMs === "number" && Number.isFinite(p.delayFloorMs)) {
      delayFloorMs = Math.max(0, Math.floor(p.delayFloorMs));
    }
    const rawTiers = p.delayTiers;
    if (Array.isArray(rawTiers) && rawTiers.length > 0) {
      const parsed: DelayTierEditorRow[] = [];
      for (const row of rawTiers) {
        if (row == null || typeof row !== "object" || Array.isArray(row)) {
          continue;
        }
        const t = row as Record<string, unknown>;
        parsed.push({
          minNextOp: Math.floor(monetizationNum(t.minNextOp, 0)),
          maxNextOp: Math.floor(monetizationNum(t.maxNextOp, 0)),
          minMs: Math.max(0, Math.floor(monetizationNum(t.minMs, 0))),
          maxMs: Math.max(0, Math.floor(monetizationNum(t.maxMs, 0))),
        });
      }
      if (parsed.length > 0) {
        delayTiers = parsed;
      }
    }
  }

  let strongThrottleMessageMinEvents = 2;
  let strongRecordMessageMinThrottle = 2;
  let strongRecordMessageMinPostLimitExtra = 2;
  const cm = o.conversionMessaging;
  if (cm != null && typeof cm === "object" && !Array.isArray(cm)) {
    const c = cm as Record<string, unknown>;
    const pickN = (raw: unknown, d: number) =>
      typeof raw === "number" && Number.isFinite(raw) ? Math.min(1000, Math.max(1, Math.floor(raw))) : d;
    strongThrottleMessageMinEvents = pickN(c.strongThrottleMessageMinEvents, strongThrottleMessageMinEvents);
    strongRecordMessageMinThrottle = pickN(c.strongRecordMessageMinThrottle, strongRecordMessageMinThrottle);
    strongRecordMessageMinPostLimitExtra = pickN(c.strongRecordMessageMinPostLimitExtra, strongRecordMessageMinPostLimitExtra);
  }

  return {
    delaysEnabled,
    freeOpsBeforeThrottle,
    delayCapMs,
    delayFloorMs,
    delayTiers,
    strongThrottleMessageMinEvents,
    strongRecordMessageMinThrottle,
    strongRecordMessageMinPostLimitExtra,
  };
}

function mergeMonetizationIntoPLARTFORMConfig(
  base: Record<string, unknown>,
  mon: MonetizationEditorState,
): Record<string, unknown> {
  const prevPlt =
    base.postLimitThrottle != null && typeof base.postLimitThrottle === "object" && !Array.isArray(base.postLimitThrottle)
      ? { ...(base.postLimitThrottle as Record<string, unknown>) }
      : {};
  const nextPlt: Record<string, unknown> = {
    ...prevPlt,
    delaysEnabled: mon.delaysEnabled,
    freeOpsBeforeThrottle: mon.freeOpsBeforeThrottle,
    delayCapMs: mon.delayCapMs,
    delayFloorMs: mon.delayFloorMs,
    delayTiers: mon.delayTiers.map((r) => ({ ...r })),
  };
  const prevCm =
    base.conversionMessaging != null &&
    typeof base.conversionMessaging === "object" &&
    !Array.isArray(base.conversionMessaging)
      ? { ...(base.conversionMessaging as Record<string, unknown>) }
      : {};
  const nextCm: Record<string, unknown> = {
    ...prevCm,
    strongThrottleMessageMinEvents: mon.strongThrottleMessageMinEvents,
    strongRecordMessageMinThrottle: mon.strongRecordMessageMinThrottle,
    strongRecordMessageMinPostLimitExtra: mon.strongRecordMessageMinPostLimitExtra,
  };
  return { ...base, postLimitThrottle: nextPlt, conversionMessaging: nextCm };
}

function PLARTFORMTab({ accessToken, uiMode }: { accessToken: string; uiMode: AdminUiMode }) {
  const [full, setFull] = useState<Record<string, unknown>>({ notes: "" });
  const [notes, setNotes] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaSubtitle, setCtaSubtitle] = useState("");
  const [catalog, setCatalog] = useState<string[]>([]);
  const [planDefinitions, setPlanDefinitions] = useState<AdminPLARTFORMApiPayload["planDefinitions"]>([]);
  const [usageByTool, setUsageByTool] = useState<Record<string, { rows: number; operations: number }>>({});
  const [postLimitNote, setPostLimitNote] = useState<string | null>(null);
  const [monetization, setMonetization] = useState<MonetizationEditorState>(() => loadMonetizationFromPLARTFORMRoot({}));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadErr(null);
    try {
      const d = (await fetchAdminPLARTFORM(accessToken)) as AdminPLARTFORMApiPayload;
      const o = d.overrides && typeof d.overrides === "object" ? { ...(d.overrides as Record<string, unknown>) } : { notes: "" };
      setFull(o);
      setMonetization(loadMonetizationFromPLARTFORMRoot(o));
      setNotes(String(o.notes ?? ""));
      const conv = readConversion(o);
      setCtaLabel(String(conv.upgradeCtaLabel ?? ""));
      setCtaSubtitle(String(conv.upgradeCtaSubtitle ?? ""));
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

  const advanced = uiMode === "advanced";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Araçlar ve limitler</h2>
          <p className="mt-1 text-sm text-slate-500">
            {advanced
              ? "Hangi araçların kapalı olacağı ve yükseltme mesajları buradan yönetilir."
              : "Kota dolduğunda gösterilen yükseltme metinleri. Bakım için araç kapatma ve istatistikler Gelişmiş moddadır."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-xl border border-white/[0.12] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.05]"
        >
          Sunucudan yenile
        </button>
      </div>

      <AdminMutedBox>
        Hangi aracın hangi planda açık olduğu <strong className="text-slate-200">Paketler</strong> sekmesindedir; burada bakım için araç kapatma, yükseltme mesajları ve kullanım özeti yönetilir.
      </AdminMutedBox>

      <AdminSection
        title="Monetizasyon (FREE gecikme)"
        description="Kayıt: SiteSetting `PLARTFORM.config` — kod değişikliği gerekmez. Ücretsiz planda sunucu gecikmesi, yumuşak kota eşiği ve mesaj eşikleri buradan yönetilir."
        variant="emerald"
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={monetization.delaysEnabled}
            onChange={() => setMonetization((m) => ({ ...m, delaysEnabled: !m.delaysEnabled }))}
            className="h-4 w-4 rounded border-white/30"
          />
          FREE sunucu gecikme sistemi açık (kapalıyken bekleme uygulanmaz; kota kuralları Paketler’den devam eder)
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <AdminField
            label="Yumuşak limit (gecikmesiz işlem sayısı)"
            description="Bugünkü işlem numarası bu değere kadar (dahil) sunucu gecikmesi uygulanmaz; sonrası delayTiers devreye girer."
          >
            <input
              type="number"
              min={0}
              className={adminInputClass}
              value={monetization.freeOpsBeforeThrottle}
              onChange={(e) =>
                setMonetization((m) => ({
                  ...m,
                  freeOpsBeforeThrottle: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                }))
              }
            />
          </AdminField>
          <AdminField
            label="Gecikme tabanı / tavan (ms)"
            description="Rastgele gecikme bu aralığa sıkıştırılır (sunucu hesabı)."
          >
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                min={0}
                className={`${adminInputClass} min-w-[120px]`}
                placeholder="Taban"
                value={monetization.delayFloorMs}
                onChange={(e) =>
                  setMonetization((m) => ({
                    ...m,
                    delayFloorMs: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  }))
                }
              />
              <input
                type="number"
                min={100}
                className={`${adminInputClass} min-w-[120px]`}
                placeholder="Tavan"
                value={monetization.delayCapMs}
                onChange={(e) =>
                  setMonetization((m) => ({
                    ...m,
                    delayCapMs: Math.max(100, Math.floor(Number(e.target.value) || 100)),
                  }))
                }
              />
            </div>
          </AdminField>
        </div>
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gecikme aralıkları (işlem #)</h4>
            <button
              type="button"
              className="rounded-lg border border-white/[0.12] px-2 py-1 text-[11px] text-slate-300 hover:bg-white/[0.05]"
              onClick={() =>
                setMonetization((m) => ({
                  ...m,
                  delayTiers: [...m.delayTiers, { minNextOp: 1, maxNextOp: 1, minMs: 1000, maxMs: 2000 }],
                }))
              }
            >
              Satır ekle
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/[0.12] px-2 py-1 text-[11px] text-slate-300 hover:bg-white/[0.05]"
              onClick={() => setMonetization((m) => ({ ...m, delayTiers: MONETIZATION_DELAY_TIER_DEFAULTS.map((r) => ({ ...r })) }))}
            >
              Varsayılan sıralamaya dön
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="border-b border-white/[0.08] text-slate-500">
                <tr>
                  <th className="px-2 py-2">min işlem #</th>
                  <th className="px-2 py-2">max işlem #</th>
                  <th className="px-2 py-2">min ms</th>
                  <th className="px-2 py-2">max ms</th>
                  <th className="px-2 py-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {monetization.delayTiers.map((row, idx) => (
                  <tr key={idx} className="border-b border-white/[0.04]">
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className={adminInputClass}
                        value={row.minNextOp}
                        onChange={(e) => {
                          const v = Math.floor(Number(e.target.value) || 0);
                          setMonetization((m) => {
                            const next = [...m.delayTiers];
                            next[idx] = { ...next[idx]!, minNextOp: v };
                            return { ...m, delayTiers: next };
                          });
                        }}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className={adminInputClass}
                        value={row.maxNextOp}
                        onChange={(e) => {
                          const v = Math.floor(Number(e.target.value) || 0);
                          setMonetization((m) => {
                            const next = [...m.delayTiers];
                            next[idx] = { ...next[idx]!, maxNextOp: v };
                            return { ...m, delayTiers: next };
                          });
                        }}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className={adminInputClass}
                        value={row.minMs}
                        onChange={(e) => {
                          const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setMonetization((m) => {
                            const next = [...m.delayTiers];
                            next[idx] = { ...next[idx]!, minMs: v };
                            return { ...m, delayTiers: next };
                          });
                        }}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className={adminInputClass}
                        value={row.maxMs}
                        onChange={(e) => {
                          const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setMonetization((m) => {
                            const next = [...m.delayTiers];
                            next[idx] = { ...next[idx]!, maxMs: v };
                            return { ...m, delayTiers: next };
                          });
                        }}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        className="text-red-300 hover:underline"
                        onClick={() =>
                          setMonetization((m) => ({
                            ...m,
                            delayTiers: m.delayTiers.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <AdminField
            label="Güçlü throttle metni (kaç gecikmeden sonra)"
            description="Aynı gün bu kadar gecikmeli istekten sonra daha sert metin."
          >
            <input
              type="number"
              min={1}
              max={1000}
              className={adminInputClass}
              value={monetization.strongThrottleMessageMinEvents}
              onChange={(e) =>
                setMonetization((m) => ({
                  ...m,
                  strongThrottleMessageMinEvents: Math.min(1000, Math.max(1, Math.floor(Number(e.target.value) || 1))),
                }))
              }
            />
          </AdminField>
          <AdminField
            label="Güçlü kayıt metni — gecikme sayısı"
            description="Gün içi gecikme olayı bu eşiğe ulaşınca kayıt sonrası mesaj sertleşir."
          >
            <input
              type="number"
              min={1}
              max={1000}
              className={adminInputClass}
              value={monetization.strongRecordMessageMinThrottle}
              onChange={(e) =>
                setMonetization((m) => ({
                  ...m,
                  strongRecordMessageMinThrottle: Math.min(1000, Math.max(1, Math.floor(Number(e.target.value) || 1))),
                }))
              }
            />
          </AdminField>
          <AdminField
            label="Güçlü kayıt metni — kota sonrası işlem"
            description="Günlük kota sonrası tamamlanan işlem sayısı bu eşiğe ulaşınca sert mesaj."
          >
            <input
              type="number"
              min={1}
              max={1000}
              className={adminInputClass}
              value={monetization.strongRecordMessageMinPostLimitExtra}
              onChange={(e) =>
                setMonetization((m) => ({
                  ...m,
                  strongRecordMessageMinPostLimitExtra: Math.min(1000, Math.max(1, Math.floor(Number(e.target.value) || 1))),
                }))
              }
            />
          </AdminField>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Yükseltme düğmesi metinleri aşağıdaki «Yükseltme mesajları» bölümündedir; kayıt için aynı «Araç ayarlarını kaydet» düğmesini kullanın.
        </p>
      </AdminSection>

      {loadErr ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{loadErr}</p> : null}

      {advanced ? (
      <section className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
        <h3 className="text-sm font-semibold text-white">Günlük kullanım özeti</h3>
        <p className="mt-1 text-[12px] text-slate-500">Her araç için bugüne yakın dönemde kayıtlı işlem ve kullanıcı-gün satırı sayısı (salt okunur).</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full min-w-[400px] text-left text-xs">
            <thead className="border-b border-white/[0.08] text-slate-500">
              <tr>
                <th className="px-3 py-2">Araç</th>
                <th className="px-3 py-2 text-right">Aktif kullanıcı-gün</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {catalog.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-slate-500">
                    Katalog yüklenemedi veya boş.
                  </td>
                </tr>
              ) : (
                catalog.map((fk) => {
                  const u = usageByTool[fk] ?? { rows: 0, operations: 0 };
                  return (
                    <tr key={fk} className="border-b border-white/[0.04]">
                      <td className="px-3 py-2 text-slate-200">{pdfToolLabelTr(fk)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">{u.rows}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">{u.operations}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {advanced && planDefinitions && planDefinitions.length > 0 ? (
        <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.05] p-4">
          <h3 className="text-sm font-semibold text-cyan-100">Planlara göre izinli araçlar (canlı çözümlenmiş)</h3>
          <ul className="mt-2 space-y-2 text-xs text-slate-300">
            {planDefinitions.map((p) => (
              <li key={p.plan} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                <span className="font-semibold text-white">{p.plan}</span>
                <span className="text-slate-500">
                  {" "}
                  · günlük limit: {p.dailyLimit === null ? "yok" : p.dailyLimit}
                </span>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  {p.allowedFeatures.map((fk) => pdfToolLabelTr(fk)).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {advanced && postLimitNote ? (
        <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-slate-400">{postLimitNote}</p>
      ) : null}

      {advanced ? (
      <AdminSection
        title="Herkese kapatılacak araçlar"
        description="İşaretlediğiniz araç web ve masaüstünde geçici olarak kullanılamaz (bakım veya pilot için). Paket bazlı izinler «Plan ve fiyatlandırma» sekmesindedir."
        variant="amber"
      >
        <div className="flex flex-wrap gap-2">
          {catalog.map((fk) => {
            const dis = Array.isArray(full.disabledFeatures) ? full.disabledFeatures : [];
            const off = dis.includes(fk);
            return (
              <label
                key={fk}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[12px] ${
                  off ? "border-amber-500/40 bg-amber-500/15 text-amber-100" : "border-white/[0.08] bg-black/25 text-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={off}
                  onChange={() => {
                    const set = new Set(dis);
                    if (off) set.delete(fk);
                    else set.add(fk);
                    setFull({ ...full, disabledFeatures: [...set] });
                  }}
                  className="h-3.5 w-3.5 rounded border-white/30"
                />
                {pdfToolLabelTr(fk)}
              </label>
            );
          })}
        </div>
        <AdminField
          label="Ücretsiz günlük kota — sitede gösterilen sayı"
          description="Karşılama / abonelik özetinde görünen rakam. Gerçek kota paket ayarlarıyla da uyumlu olmalıdır (boş bırakırsanız sunucu varsayılanı kullanılır)."
        >
          <input
            type="number"
            min={0}
            className={adminInputClass}
            placeholder="Örn. 5"
            value={typeof full.displayFreeDailyLimit === "number" ? full.displayFreeDailyLimit : ""}
            onChange={(e) => {
              const v = e.target.value;
              const next = { ...full };
              if (v === "") {
                delete next.displayFreeDailyLimit;
              } else {
                next.displayFreeDailyLimit = Number(v);
              }
              setFull(next);
            }}
          />
        </AdminField>
      </AdminSection>
      ) : null}

      <AdminSection
        title="Yükseltme mesajları ve yönetici notu"
        description="Kota dolduğunda veya gecikmeli işlemde API’nin döndürdüğü düğme etiketi ve alt satır (PLARTFORM.config.conversion). Güçlü metin eşikleri yukarıdaki Monetizasyon bölümündedir."
        variant="violet"
      >
        {advanced ? (
          <AdminField label="İç not (yalnız yönetici)" description="Ekibiniz için kısa hatırlatma; uygulamada gösterilmez.">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={adminInputClass} />
          </AdminField>
        ) : null}
        <AdminField label="Yükselt düğmesi etiketi" description="Örn. Pro’ya geç — API ve uygulama bu metni kullanır.">
          <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} className={adminInputClass} placeholder="Örn. Pro'ya geç" />
        </AdminField>
        <AdminField label="Kısa açıklama (alt satır)" description="Hız, kalite veya sınırsız kullanım vurgusu.">
          <textarea
            value={ctaSubtitle}
            onChange={(e) => setCtaSubtitle(e.target.value)}
            rows={2}
            className={adminInputClass}
            placeholder="Örn. Anında işlem, tam kalite, sınırsız günlük kullanım."
          />
        </AdminField>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              if (monetization.delayTiers.length === 0) {
                setMsg("Monetizasyon: en az bir gecikme aralığı satırı gerekli.");
                return;
              }
              const next = mergeMonetizationIntoPLARTFORMConfig(
                mergePLARTFORMQuickForm(full, notes, ctaLabel, ctaSubtitle),
                monetization,
              );
              await putAdminPLARTFORMConfig(accessToken, next);
              setFull(next);
              setMsg("Araç ayarları kaydedildi. Birkaç saniye içinde canlıya yansır.");
              notifyRuntimeRefresh();
              void reload();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-xl bg-violet-600/70 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Kaydediliyor…" : "Araç ayarlarını kaydet"}
        </button>
      </AdminSection>

      {msg ? <p className="text-sm text-slate-400">{msg}</p> : null}
    </div>
  );
}

function ContentTab({
  accessToken,
  uiMode,
  pendingMediaBind,
  onConsumePendingMediaBind,
  onOpenMediaLibrary,
}: {
  accessToken: string;
  uiMode: AdminUiMode;
  pendingMediaBind: { slot: CmsMediaBindSlot; url: string } | null;
  onConsumePendingMediaBind: () => void;
  onOpenMediaLibrary: () => void;
}) {
  const [cms, setCms] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saveStrip, setSaveStrip] = useState<AdminSaveStripState>("idle");
  const [saveDetail, setSaveDetail] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [livePreview, setLivePreview] = useState(true);
  const cmsRef = useRef(cms);
  const undoRef = useRef<Record<string, unknown> | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [hasUndo, setHasUndo] = useState(false);
  cmsRef.current = cms;
  const advanced = uiMode === "advanced";

  const reload = useCallback(async () => {
    setLoadErr(null);
    setSaveStrip("idle");
    setSaveDetail(null);
    try {
      const c = (await fetchAdminCms(accessToken)) as Record<string, unknown>;
      setCms(c);
      undoRef.current = null;
      setHasUndo(false);
    } catch {
      setLoadErr("İçerik sunucudan yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.");
    }
  }, [accessToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!pendingMediaBind || !cms) {
      return;
    }
    const { slot, url } = pendingMediaBind;
    onConsumePendingMediaBind();
    setCms((prev) => {
      if (!prev) {
        return prev;
      }
      undoRef.current = cmsDeepClone(prev);
      return applyCmsMediaBindSlot(prev, slot, url);
    });
    setHasUndo(true);
  }, [pendingMediaBind, cms, onConsumePendingMediaBind]);

  useEffect(() => {
    const c = cmsRef.current;
    if (!c) {
      return;
    }
    if (livePreview) {
      writeCmsPreviewDraft(c);
    }
    setPreviewKey((k) => k + 1);
  }, [livePreview]);

  useEffect(() => {
    if (!livePreview || !cms) {
      return;
    }
    writeCmsPreviewDraft(cms);
    const id = window.setTimeout(() => setPreviewKey((k) => k + 1), 300);
    return () => window.clearTimeout(id);
  }, [cms, livePreview]);

  const previewSrc =
    typeof window !== "undefined"
      ? livePreview
        ? `${window.location.origin}/?${CMS_PREVIEW_QUERY}=1`
        : `${window.location.origin}/`
      : "/";
  const previewOpenSrc = typeof window !== "undefined" ? `${window.location.origin}/` : "/";
  const apiBase = getSaasApiBase();

  const patch = (fn: (prev: Record<string, unknown>) => Record<string, unknown>) => {
    setCms((prev) => {
      if (!prev) {
        return prev;
      }
      undoRef.current = cmsDeepClone(prev);
      return fn(prev);
    });
    setHasUndo(true);
  };

  if (loadErr && !cms) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{loadErr}</p>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-xl border border-white/[0.12] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.06]"
        >
          Yeniden dene
        </button>
      </div>
    );
  }

  if (!cms) {
    return <p className="text-slate-400">Sayfa içeriği yükleniyor…</p>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,46vw)] xl:items-start">
      <div className="space-y-6">
        {loadErr ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
            {loadErr} — formdaki veriler yerel kopyanızdır; kaydetmeden sunucuyu güncellemez.
          </p>
        ) : null}

        <div className="flex flex-col gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-100">Sayfa düzenleyici</p>
              <p className="mt-1 text-[12px] text-slate-400">
                {advanced
                  ? "Solda alanları değiştirin; sağda canlı sayfa güncellenir. Odaklandığınız bölüm önizlemede vurgulanır."
                  : "Başlık, düğmeler ve görseller — hızlı düzenleme. Çok dilli metinler ve araç kartları için Gelişmiş moda geçin."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void reload()}
                className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08]"
              >
                Canlı veriyi geri yükle
              </button>
              {advanced ? (
              <button
                type="button"
                disabled={!hasUndo}
                onClick={() => {
                  const u = undoRef.current;
                  if (!u) {
                    return;
                  }
                  setCms(u);
                  undoRef.current = null;
                  setHasUndo(false);
                  setSaveStrip("idle");
                  setSaveDetail(null);
                }}
                className="rounded-xl border border-white/[0.12] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.06] disabled:opacity-35"
              >
                Son değişikliği geri al
              </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPreviewKey((k) => k + 1)}
                className="rounded-xl bg-emerald-500/35 px-4 py-2 text-xs font-semibold text-emerald-50 ring-1 ring-emerald-400/40 hover:bg-emerald-500/45"
              >
                Önizlemeyi yenile
              </button>
              <button
                type="button"
                onClick={() => window.open(previewOpenSrc, "_blank", "noopener,noreferrer")}
                className="rounded-xl border border-white/[0.12] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.06]"
              >
                Sitede aç
              </button>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-emerald-50/95">
            <input
              type="checkbox"
              checked={livePreview}
              onChange={(e) => setLivePreview(e.target.checked)}
              className="h-4 w-4 rounded border-emerald-400/40 bg-black/40"
            />
            Anlık önizleme (kaydetmeden sağda güncelle)
          </label>
        </div>

        <AdminSaveStrip state={saveStrip} detail={saveDetail} />

        <AdminMutedBox>
          Görselleri <strong className="text-slate-200">Medya</strong> sekmesinden yükleyip burada adrese yapıştırın veya «Medya kütüphanesi» ile doğrudan seçin.
          {!advanced ? " İngilizce / Türkçe ayrı metinler ve özellik kartları Gelişmiş moddadır." : null}
        </AdminMutedBox>

        <CmsPreviewAnchor iframeRef={previewIframeRef} section="hero">
          <AdminSection
            title="Üst bölüm — başlık ve metin"
            description={
              advanced
                ? "Karşılama alanının ana başlığı ve açıklaması. Aşağıda her dil için ince ayar yapabilirsiniz."
                : "Ana sayfanın en görünür başlığı ve kısa açıklaması."
            }
            variant="emerald"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <AdminField
                label="Başlık"
                description="En büyük satır; çoğu ziyaretçi bunu ilk görür."
                hint="Örn. İş belgelerinizi tek yerden yönetin"
              >
                <input
                  className={cmsInputClass}
                  placeholder="Örn. PDF iş akışınızı hızlandırın"
                  value={cmsGetStr(cms, ["homepage", "heroTitle"])}
                  onChange={(e) => patch((p) => cmsSetStr(p, ["homepage", "heroTitle"], e.target.value))}
                />
              </AdminField>
              <AdminField
                label="Alt başlık"
                description="Başlığın hemen altındaki kısa açıklama."
                hint="Ürünün faydasını bir cümlede özetleyin."
                htmlFor="cms-hero-sub"
              >
                <input
                  id="cms-hero-sub"
                  className={cmsInputClass}
                  placeholder="Örn. Birleştir, dönüştür, güvence altına al"
                  value={cmsGetStr(cms, ["homepage", "heroSubtitle"])}
                  onChange={(e) => patch((p) => cmsSetStr(p, ["homepage", "heroSubtitle"], e.target.value))}
                />
              </AdminField>
            </div>
            {advanced
              ? (["tr", "en"] as const).map((lang) => (
                  <div key={lang} className="mt-6 rounded-xl border border-white/[0.06] bg-black/20 p-4">
                    <p className="mb-4 text-[11px] font-bold uppercase tracking-wide text-cyan-300/90">
                      {lang === "tr" ? "Türkçe" : "English"} — üst alan
                    </p>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <AdminField label="Menüde görünen ürün adı" description="Gezinme çubuğundaki kısa etiket.">
                        <input
                          className={cmsInputClass}
                          placeholder={lang === "tr" ? "Örn. NB PDF" : "e.g. NB PDF"}
                          value={cmsGetStr(cms, ["landing", lang, "navbar", "productLabel"])}
                          onChange={(e) => patch((p) => cmsSetStr(p, ["landing", lang, "navbar", "productLabel"], e.target.value))}
                        />
                      </AdminField>
                      <AdminField label="Küçük üst etiket" description="Başlıktan önceki ince satır.">
                        <input
                          className={cmsInputClass}
                          placeholder={lang === "tr" ? "Örn. İş odaklı" : "e.g. Built for teams"}
                          value={cmsGetStr(cms, ["landing", lang, "hero", "kicker"])}
                          onChange={(e) => patch((p) => cmsSetStr(p, ["landing", lang, "hero", "kicker"], e.target.value))}
                        />
                      </AdminField>
                      <AdminField label="Bu dilde ana başlık" description="Doldurursanız genel başlığın üzerine yazar.">
                        <input
                          className={cmsInputClass}
                          placeholder={lang === "tr" ? "Örn. Belgelerinizi hızlıca işleyin" : "e.g. Process documents faster"}
                          value={cmsGetStr(cms, ["landing", lang, "hero", "headline"])}
                          onChange={(e) => patch((p) => cmsSetStr(p, ["landing", lang, "hero", "headline"], e.target.value))}
                        />
                      </AdminField>
                    </div>
                  </div>
                ))
              : null}
          </AdminSection>
        </CmsPreviewAnchor>

        <CmsPreviewAnchor iframeRef={previewIframeRef} section="hero-buttons">
          <AdminSection title="Üst bölüm — düğmeler" description="İki ana eylem düğmesinin metinleri.">
            <div className="grid gap-5 sm:grid-cols-2">
              <AdminField label="Birincil düğme" description="Ana çağrı — örn. Ücretsiz başla.">
                <input
                  className={cmsInputClass}
                  placeholder="Örn. Web sürümünü aç"
                  value={cmsGetStr(cms, ["homepage", "primaryCta"])}
                  onChange={(e) => patch((p) => cmsSetStr(p, ["homepage", "primaryCta"], e.target.value))}
                />
              </AdminField>
              <AdminField label="İkincil düğme" description="Yanındaki ikinci seçenek — örn. Fiyatlar.">
                <input
                  className={cmsInputClass}
                  placeholder="Örn. Fiyatları gör"
                  value={cmsGetStr(cms, ["homepage", "secondaryCta"])}
                  onChange={(e) => patch((p) => cmsSetStr(p, ["homepage", "secondaryCta"], e.target.value))}
                />
              </AdminField>
            </div>
          </AdminSection>
        </CmsPreviewAnchor>

        {advanced ? (
        <CmsPreviewAnchor iframeRef={previewIframeRef} section="features">
          <AdminSection
            title="Öne çıkanlar — bölüm başlığı ve kartlar"
            description="Araçlar ızgarasının üstündeki başlık ve dil bazlı kart metinleri (ilk üç kart)."
            variant="sky"
          >
            <AdminField label="Bölüm başlığı" description="Özellik kartlarının üstündeki ana başlık.">
              <input
                className={cmsInputClass}
                placeholder="Örn. Tüm PDF araçları tek yerde"
                value={cmsGetStr(cms, ["PLARTFORMStrip", "headline"])}
                onChange={(e) => patch((p) => cmsSetStr(p, ["PLARTFORMStrip", "headline"], e.target.value))}
              />
            </AdminField>
            {(["tr", "en"] as const).map((lang) => (
              <div key={lang} className="mt-4 space-y-4 rounded-xl border border-white/[0.06] bg-black/15 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-300/90">
                  {lang === "tr" ? "Türkçe" : "English"} — kartlar
                </p>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
                    <p className="mb-3 text-xs font-semibold text-slate-300">Kart {i + 1}</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <AdminField label="Kart başlığı" description="Kısa ve net bir başlık.">
                        <input
                          className={cmsInputClass}
                          placeholder={lang === "tr" ? "Örn. Hızlı birleştirme" : "e.g. Merge in seconds"}
                          value={cmsGetFeatureItemField(cms, lang, i, "title")}
                          onChange={(e) => patch((p) => cmsSetFeatureItemField(p, lang, i, "title", e.target.value))}
                        />
                      </AdminField>
                      <AdminField label="Açıklama" description="Faydayı anlatan 1–2 cümle.">
                        <textarea
                          className={`${cmsInputClass} min-h-[72px]`}
                          placeholder={lang === "tr" ? "Örn. Raporları tek dosyada toplayın." : "e.g. Combine reports into one file."}
                          value={cmsGetFeatureItemField(cms, lang, i, "benefit")}
                          onChange={(e) => patch((p) => cmsSetFeatureItemField(p, lang, i, "benefit", e.target.value))}
                        />
                      </AdminField>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </AdminSection>
        </CmsPreviewAnchor>
        ) : null}

        {advanced ? (
        <AdminSection
          title="Üst duyuru şeridi"
          description="İsteğe bağlı ince şerit; uygulama üst kısmında duyuru göstermek için."
          variant="violet"
        >
          <AdminField label="Şeridi göster" description="Açıkken ziyaretçiler üstte mesajı görür.">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={cmsGetBool(cms, ["banner", "enabled"])}
                onChange={(e) => patch((p) => cmsSetBool(p, ["banner", "enabled"], e.target.checked))}
                className="h-4 w-4 rounded border-white/20 bg-black/40"
              />
              Üst şerit aktif
            </label>
          </AdminField>
          <AdminField label="Şerit metni" description="Kısa kampanya veya bilgilendirme.">
            <textarea
              className={`${cmsInputClass} min-h-[72px]`}
              placeholder="Örn. Yeni fiyatlandırma — detaylar için iletişime geçin."
              value={cmsGetStr(cms, ["banner", "text"])}
              onChange={(e) => patch((p) => cmsSetStr(p, ["banner", "text"], e.target.value))}
            />
          </AdminField>
        </AdminSection>
        ) : null}

        {advanced ? (
        <AdminSection
          title="Çalışma alanı — üst şerit ve araç metinleri"
          description="Giriş yapmış kullanıcıların PDF araçları ekranındaki şerit ve her araç için özel başlık / açıklama / düğme."
          variant="amber"
        >
          <AdminField label="Çalışma alanı şeridini göster" description="Araç sayfasının üstünde bilgi çubuğu.">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={cmsGetBool(cms, ["workspace", "bannerEnabled"])}
                onChange={(e) => patch((p) => cmsSetBool(p, ["workspace", "bannerEnabled"], e.target.checked))}
                className="h-4 w-4 rounded border-white/20 bg-black/40"
              />
              Şerit gösterilsin
            </label>
          </AdminField>
          <AdminField label="Şerit metni" description="Kullanıcılara kısa yönlendirme.">
            <textarea
              className={`${cmsInputClass} min-h-[64px]`}
              placeholder="Örn. Büyük dosyalar için sıkıştırmayı deneyin."
              value={cmsGetStr(cms, ["workspace", "bannerText"])}
              onChange={(e) => patch((p) => cmsSetStr(p, ["workspace", "bannerText"], e.target.value))}
            />
          </AdminField>
          <div className="space-y-5 border-t border-white/[0.06] pt-5">
            <p className="text-sm font-medium text-slate-200">Araç kartları (uygulama içi)</p>
            <p className="text-[12px] text-slate-500">Boş bıraktığınız alanlarda varsayılan metinler kullanılır.</p>
            {WORKSPACE_TOOL_IDS.map((tid) => (
              <div key={tid} className="rounded-xl border border-white/[0.06] bg-black/25 p-4">
                <p className="mb-3 text-xs font-semibold text-amber-100/90">{pdfToolLabelTr(tid)}</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <AdminField label="Başlık" description="Kartta görünen isim.">
                    <input
                      className={cmsInputClass}
                      placeholder="Örn. PDF birleştir"
                      value={cmsGetToolField(cms, tid, "title")}
                      onChange={(e) => patch((p) => cmsSetToolField(p, tid, "title", e.target.value))}
                    />
                  </AdminField>
                  <AdminField label="Açıklama" description="Kısa alt metin.">
                    <textarea
                      className={`${cmsInputClass} min-h-[56px]`}
                      placeholder="Örn. Birden çok dosyayı tek PDF yapın."
                      value={cmsGetToolField(cms, tid, "description")}
                      onChange={(e) => patch((p) => cmsSetToolField(p, tid, "description", e.target.value))}
                    />
                  </AdminField>
                  <AdminField label="Düğme metni" description="Yükle / İşle gibi eylem etiketi.">
                    <input
                      className={cmsInputClass}
                      placeholder="Örn. Dosya seç"
                      value={cmsGetToolField(cms, tid, "button")}
                      onChange={(e) => patch((p) => cmsSetToolField(p, tid, "button", e.target.value))}
                    />
                  </AdminField>
                </div>
              </div>
            ))}
          </div>
        </AdminSection>
        ) : null}

        <CmsPreviewAnchor iframeRef={previewIframeRef} section="visuals">
          <AdminSection
            title="Görseller ve logo"
            description="Adresi yapıştırın veya Medya sekmesinden seçin; küçük önizleme anında güncellenir."
            variant="emerald"
          >
            {(
              [
                { slot: "hero", label: "Karşılama görseli", path: ["assets", "heroImageUrl"] as const },
                { slot: "logo", label: "Logo", path: ["assets", "logoUrl"] as const },
                { slot: "screenshot1", label: "Ekran görüntüsü 1", path: ["assets", "screenshot1Url"] as const },
                { slot: "screenshot2", label: "Ekran görüntüsü 2", path: ["assets", "screenshot2Url"] as const },
              ] as const
            ).map(({ slot, label, path: pth }) => {
              const raw = cmsGetStr(cms, [...pth]);
              const resolved = resolveCmsAssetUrl(raw.trim() || undefined, apiBase);
              return (
                <AdminField
                  key={slot}
                  label={label}
                  description="Tam https adresi veya sunucudan dönen göreli yol (/api/media/...)."
                  hint="Medya sekmesinden yüklediğiniz dosyanın bağlantısını kullanın."
                >
                  <div className="flex flex-wrap gap-2">
                    <input
                      className={`${cmsInputClass} min-w-[200px] flex-1`}
                      placeholder="https://... veya /api/media/..."
                      value={raw}
                      onChange={(e) => patch((prev) => cmsSetStr(prev, [...pth], e.target.value))}
                    />
                    <button
                      type="button"
                      onClick={() => onOpenMediaLibrary()}
                      className="shrink-0 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
                    >
                      Medya kütüphanesi
                    </button>
                  </div>
                  {resolved ? (
                    <img
                      src={resolved}
                      alt=""
                      className="mt-3 h-24 max-w-full rounded-lg border border-white/10 object-contain object-left"
                    />
                  ) : null}
                </AdminField>
              );
            })}
          </AdminSection>
        </CmsPreviewAnchor>

        {advanced ? (
        <CmsPreviewAnchor iframeRef={previewIframeRef} section="footer">
          <AdminSection title="Alt bilgi" description="Sayfa sonundaki kısa tanıtım metni (dil bazlı).">
            {(["tr", "en"] as const).map((lang) => (
              <AdminField
                key={lang}
                label={lang === "tr" ? "Türkçe — alt metin" : "English — footer text"}
                description="Markanızı veya ürünü kısaca anlatan paragraf."
              >
                <textarea
                  className={`${cmsInputClass} min-h-[72px]`}
                  placeholder={lang === "tr" ? "Örn. İş süreçleri için PDF yazılımı." : "e.g. PDF software for business workflows."}
                  value={cmsGetStr(cms, ["landing", lang, "footer", "description"])}
                  onChange={(e) => patch((p) => cmsSetStr(p, ["landing", lang, "footer", "description"], e.target.value))}
                />
              </AdminField>
            ))}
          </AdminSection>
        </CmsPreviewAnchor>
        ) : null}

        {advanced ? (
        <CmsPreviewAnchor iframeRef={previewIframeRef} section="final-cta">
          <AdminSection title="Son çağrı" description="Sayfanın altındaki harekete geçir bölümü başlığı.">
            {(["tr", "en"] as const).map((lang) => (
              <AdminField
                key={lang}
                label={lang === "tr" ? "Türkçe — başlık" : "English — title"}
                description="Ziyaretçiyi son adıma yönlendiren kısa başlık."
              >
                <input
                  className={cmsInputClass}
                  placeholder={lang === "tr" ? "Örn. Hemen başlayın" : "e.g. Get started today"}
                  value={cmsGetStr(cms, ["landing", lang, "finalCta", "title"])}
                  onChange={(e) => patch((p) => cmsSetStr(p, ["landing", lang, "finalCta", "title"], e.target.value))}
                />
              </AdminField>
            ))}
          </AdminSection>
        </CmsPreviewAnchor>
        ) : null}

        {advanced ? (
        <AdminSection title="Yükseltme mesajı" description="Ücretsiz plandayken gösterilen kısa teşvik.">
          <AdminField label="Kısa metin" description="Aboneliğe yönlendiren bir iki cümle.">
            <textarea
              className={`${cmsInputClass} min-h-[64px]`}
              placeholder="Örn. Sınırsız işlem ve masaüstü erişimi için Pro'yu deneyin."
              value={cmsGetStr(cms, ["modals", "upgradeTeaser"])}
              onChange={(e) => patch((p) => cmsSetStr(p, ["modals", "upgradeTeaser"], e.target.value))}
            />
          </AdminField>
        </AdminSection>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setSaveStrip("saving");
              setSaveDetail(null);
              try {
                await putAdminCms(accessToken, cms);
                setPreviewKey((k) => k + 1);
                undoRef.current = null;
                setHasUndo(false);
                setSaveStrip("saved");
                setLoadErr(null);
                notifyRuntimeRefresh();
                window.setTimeout(() => {
                  setSaveStrip("idle");
                  setSaveDetail(null);
                }, 2800);
              } catch (e) {
                setSaveStrip("error");
                setSaveDetail(e instanceof Error ? e.message : "Kayıt başarısız");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-xl bg-emerald-600/75 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
          </button>
        </div>
      </div>
      <div className="flex min-h-[min(520px,70vh)] flex-col rounded-2xl border border-white/[0.08] bg-black/30 p-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-5rem)]">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Canlı önizleme</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {livePreview ? "Taslak — henüz kaydetmediğiniz değişiklikler" : "Sunucudaki kayıtlı sürüm"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPreviewKey((k) => k + 1)}
            className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-100"
          >
            Yenile
          </button>
        </div>
        <iframe
          key={previewKey}
          ref={previewIframeRef}
          title="Sayfa önizlemesi"
          src={previewSrc}
          className="min-h-[360px] min-w-0 flex-1 w-full rounded-xl border border-white/[0.06] bg-white"
        />
      </div>
    </div>
  );
}


function SettingsTab({
  accessToken,
  showSystemPLARTFORM = false,
  uiMode,
}: {
  accessToken: string;
  showSystemPLARTFORM?: boolean;
  uiMode: AdminUiMode;
}) {
  const fullRef = useRef<Record<string, unknown>>({ ...DEFAULT_SITE_SETTINGS });
  const flagsRef = useRef<Record<string, unknown>>({});
  const tooltipsRef = useRef<Record<string, unknown>>({});
  const [theme, setTheme] = useState("dark");
  const [defaultLanguage, setDefaultLanguage] = useState("en");
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [freeDailyLimitDisplay, setFreeDailyLimitDisplay] = useState(5);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [apiDefaultPerMin, setApiDefaultPerMin] = useState(60);
  const [apiAbuseThreshold, setApiAbuseThreshold] = useState(5);
  const [apiAbuseBlockMin, setApiAbuseBlockMin] = useState(60);
  const [headerTagline, setHeaderTagline] = useState("");
  const [footerNote, setFooterNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saveStrip, setSaveStrip] = useState<AdminSaveStripState>("idle");
  const [saveDetail, setSaveDetail] = useState<string | null>(null);
  const advanced = uiMode === "advanced";

  const reload = useCallback(async () => {
    setLoadErr(null);
    setSaveStrip("idle");
    setSaveDetail(null);
    try {
      const all = await fetchAdminSettings(accessToken);
      const fr = all["global.flags"];
      flagsRef.current =
        fr && typeof fr === "object" && fr !== null && !Array.isArray(fr) ? { ...(fr as Record<string, unknown>) } : {};
      setMaintenanceMode(flagsRef.current.maintenanceMode === true);

      const cur = all["site.settings"];
      const merged: Record<string, unknown> =
        cur && typeof cur === "object"
          ? { ...DEFAULT_SITE_SETTINGS, ...(cur as Record<string, unknown>) }
          : { ...DEFAULT_SITE_SETTINGS };
      fullRef.current = merged;
      setTheme(String(merged.theme ?? "dark"));
      setDefaultLanguage(String(merged.defaultLanguage ?? "en"));
      setAnalyticsEnabled(merged.analyticsEnabled !== false);
      setFreeDailyLimitDisplay(Number(merged.freeDailyLimitDisplay ?? 5));
      const api = merged.apiSecurity;
      if (api && typeof api === "object" && api !== null && !Array.isArray(api)) {
        const a = api as Record<string, unknown>;
        setApiDefaultPerMin(Number(a.defaultPerMinute ?? 60));
        setApiAbuseThreshold(Number(a.abuseThreshold ?? 5));
        setApiAbuseBlockMin(Number(a.abuseBlockMinutes ?? 60));
      } else {
        setApiDefaultPerMin(60);
        setApiAbuseThreshold(5);
        setApiAbuseBlockMin(60);
      }

      const g = all["global.elements"];
      const o =
        g && typeof g === "object"
          ? (g as { headerTagline?: string; footerNote?: string; tooltips?: unknown })
          : { headerTagline: "", footerNote: "", tooltips: {} };
      setHeaderTagline(String(o.headerTagline ?? ""));
      setFooterNote(String(o.footerNote ?? ""));
      const tt = o.tooltips;
      tooltipsRef.current =
        tt != null && typeof tt === "object" && !Array.isArray(tt) ? { ...(tt as Record<string, unknown>) } : {};
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Ayarlar yüklenemedi");
    }
  }, [accessToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      {loadErr ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{loadErr}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08]"
        >
          Canlı veriyi geri yükle
        </button>
      </div>

      <AdminSaveStrip state={saveStrip} detail={saveDetail} />

      <AdminMutedBox>
        {advanced
          ? "Tema, dil, güvenlik sınırları ve genel metinler burada; kaydettiğinizde birkaç saniye içinde uygulanır. Ücretsiz kota gösterimi ile Paketler sekmesindeki gerçek limitlerin uyumlu olmasına dikkat edin."
          : "Tema, dil ve bakım modu. API hız limitleri, ücretsiz kota gösterimi ve sistem araçları Gelişmiş moddadır."}
      </AdminMutedBox>

      <AdminSection title="Görünüm ve dil" description="Ziyaretçilerin ilk gördüğü tema ve dil tercihi.">
        <div className="grid gap-5 sm:grid-cols-2">
          <AdminField label="Tema" description="Koyu veya açık arayüz (uygulama destekliyorsa uygulanır).">
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className={adminInputClass}>
              <option value="dark">Koyu</option>
              <option value="light">Açık</option>
            </select>
          </AdminField>
          <AdminField label="Varsayılan dil" description="İlk ziyarette seçilen site dili.">
            <select value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value)} className={adminInputClass}>
              <option value="en">English</option>
              <option value="tr">Türkçe</option>
            </select>
          </AdminField>
          <AdminField label="Sayfa analitiği" description="Açıksa oturum açmış kullanıcıların sayfa görüntülemeleri raporlanır (çerez onayı gerekir).">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={analyticsEnabled}
                onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-black/40"
              />
              Analitiği etkinleştir
            </label>
          </AdminField>
          {advanced ? (
            <AdminField
              label="Ücretsiz günlük kota (gösterim)"
              description="Sitede ‘günlük X işlem’ gibi metinlerde kullanılır; gerçek kota paket ayarlarından gelir."
            >
              <input
                type="number"
                min={0}
                className={adminInputClass}
                value={freeDailyLimitDisplay}
                onChange={(e) => setFreeDailyLimitDisplay(Number(e.target.value))}
              />
            </AdminField>
          ) : null}
        </div>
      </AdminSection>

      <AdminSection
        title="Bakım modu"
        description="Açıkken ziyaretçilere bakım uyarısı gösterilir; yönetim panelinden kapatılana kadar açık kalır."
        variant="amber"
      >
        <AdminField label="Site bakımda" description="Dikkat: canlı kullanıcı deneyimini etkiler.">
          <label className="flex cursor-pointer items-center gap-3 text-sm text-amber-100">
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={(e) => setMaintenanceMode(e.target.checked)}
              className="h-4 w-4 rounded border-amber-400/50 bg-black/40"
            />
            Bakım modunu aç
          </label>
        </AdminField>
      </AdminSection>

      {advanced ? (
      <AdminSection
        title="API güvenliği (hız sınırı)"
        description="Aynı IP’den dakikada izin verilen istek sayısı ve tekrarlı ihlalde geçici engel. Çok düşük değerler normal kullanıcıları etkileyebilir."
        variant="sky"
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <AdminField label="Varsayılan (dakika başına)" description="Çoğu API yolu için üst sınır.">
            <input
              type="number"
              min={1}
              className={adminInputClass}
              value={apiDefaultPerMin}
              onChange={(e) => setApiDefaultPerMin(Math.max(1, Number(e.target.value) || 1))}
            />
          </AdminField>
          <AdminField label="İhlal eşiği" description="Kaç kez 429 sonrası IP geçici bloklansın.">
            <input
              type="number"
              min={1}
              className={adminInputClass}
              value={apiAbuseThreshold}
              onChange={(e) => setApiAbuseThreshold(Math.max(1, Number(e.target.value) || 1))}
            />
          </AdminField>
          <AdminField label="Blok süresi (dakika)" description="Geçici IP engelinin süresi.">
            <input
              type="number"
              min={1}
              className={adminInputClass}
              value={apiAbuseBlockMin}
              onChange={(e) => setApiAbuseBlockMin(Math.max(1, Number(e.target.value) || 1))}
            />
          </AdminField>
        </div>
      </AdminSection>
      ) : null}

      {advanced ? (
      <AdminSection
        title="Genel site metinleri"
        description="Üst ve alt bilgide veya ortak bileşenlerde kullanılabilecek kısa metinler (tema destekliyorsa görünür)."
        variant="violet"
      >
        <AdminField label="Üst slogan" description="Ürününüzü tek satırda tanıtan kısa ifade." hint="Örn. Güvenli PDF iş akışı">
          <input
            className={cmsInputClass}
            placeholder="Örn. Belgelerinizi güvenle işleyin"
            value={headerTagline}
            onChange={(e) => setHeaderTagline(e.target.value)}
          />
        </AdminField>
        <AdminField label="Alt bilgi notu" description="Yasal uyarı veya ek bilgi için kısa paragraf.">
          <textarea
            className={`${cmsInputClass} min-h-[72px]`}
            placeholder="Örn. © 2026 Şirket Adı — Tüm hakları saklıdır."
            value={footerNote}
            onChange={(e) => setFooterNote(e.target.value)}
          />
        </AdminField>
      </AdminSection>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setSaveStrip("saving");
          setSaveDetail(null);
          const prevApi =
            fullRef.current.apiSecurity && typeof fullRef.current.apiSecurity === "object" && !Array.isArray(fullRef.current.apiSecurity)
              ? { ...(fullRef.current.apiSecurity as Record<string, unknown>) }
              : {};
          const payload = {
            ...fullRef.current,
            theme,
            defaultLanguage,
            analyticsEnabled,
            freeDailyLimitDisplay,
            apiSecurity: {
              ...prevApi,
              defaultPerMinute: apiDefaultPerMin,
              abuseThreshold: apiAbuseThreshold,
              abuseBlockMinutes: apiAbuseBlockMin,
            },
          };
          const nextFlags = { ...flagsRef.current, maintenanceMode };
          const globalElements = {
            headerTagline,
            footerNote,
            tooltips: tooltipsRef.current,
          };
          try {
            await putAdminSettingsPatches(accessToken, {
              "site.settings": payload,
              "global.flags": nextFlags,
              "global.elements": globalElements,
            });
            fullRef.current = payload;
            flagsRef.current = nextFlags;
            setSaveStrip("saved");
            setLoadErr(null);
            notifyRuntimeRefresh();
            window.setTimeout(() => {
              setSaveStrip("idle");
              setSaveDetail(null);
            }, 2800);
          } catch (e) {
            setSaveStrip("error");
            setSaveDetail(e instanceof Error ? e.message : "Kayıt başarısız");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-xl bg-violet-600/75 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Kaydediliyor…" : "Ayarları kaydet"}
      </button>

      {showSystemPLARTFORM && advanced ? (
        <div className="space-y-3 border-t border-white/[0.08] pt-8">
          <h3 className="text-sm font-semibold text-white">Sistem kontrolü</h3>
          <p className="text-[12px] text-slate-500">Yedek sürümler, denetim kaydı ve teknik bayraklar — yalnız tam yönetici.</p>
          <SystemControlTab accessToken={accessToken} />
        </div>
      ) : showSystemPLARTFORM && !advanced ? (
        <AdminMutedBox>Sistem kontrolü (geri alma, denetim) Gelişmiş modda ve yalnız tam yönetici hesabında açılır.</AdminMutedBox>
      ) : (
        <AdminMutedBox>Gelişmiş sistem araçları yalnız tam yönetici hesabında gösterilir.</AdminMutedBox>
      )}
    </div>
  );
}

function AnalyticsTab({
  accessToken,
  overview,
  uiMode,
}: {
  accessToken: string;
  overview: AdminOverview | null;
  uiMode: AdminUiMode;
}) {
  const [series, setSeries] = useState<{ date: string; totalOperations: number }[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const advanced = uiMode === "advanced";

  useEffect(() => {
    const t = new Date();
    const f = new Date(t);
    f.setUTCDate(f.getUTCDate() - 30);
    setTo(t.toISOString().slice(0, 10));
    setFrom(f.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    if (!advanced) {
      return;
    }
    void (async () => {
      const { series: s } = await fetchAdminUsageSeries(accessToken, 30);
      setSeries(s);
    })();
  }, [accessToken, advanced]);

  const pvDay = overview?.pageViewsByDay ?? [];
  const pvHour = overview?.pageViewsTodayByHourUtc ?? [];
  const funnel = overview?.conversionFunnel;

  return (
    <div className="space-y-6">
      <AdminMutedBox>
        Bu sekme <strong className="text-slate-200">salt okunur</strong> raporlardır. Yükseltme düğmesi ve açıklama metinlerini düzenlemek için{" "}
        <strong className="text-slate-200">Araçlar</strong> sekmesindeki yükseltme alanlarını kullanın.
        {!advanced ? " UTC saat grafiği, ham API serisi ve CSV dışa aktarma Gelişmiş moddadır." : null}
      </AdminMutedBox>
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
      {advanced && pvHour.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-200">Bugünkü sayfa görüntülemeleri (UTC saat)</h3>
          <HourBarTrend data={pvHour} />
        </section>
      ) : null}
      {advanced ? (
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-200">Kullanım serisi (API)</h3>
        <BarTrend data={series} />
      </section>
      ) : null}
      {advanced ? (
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
            className="rounded-lg bg-cyan-500/25 px-3 py-1.5 text-xs font-semibold"
          >
            Kullanım CSV indir
          </button>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
          Satırlar: kullanıcı başına günlük kullanım, işlem sayıları ve son kullanılan araç. Excel’de e-posta veya tarihe göre süzebilirsiniz.
        </p>
      </section>
      ) : null}
    </div>
  );
}

function MediaTab({
  accessToken,
  onBindToCms,
}: {
  accessToken: string;
  onBindToCms: (slot: CmsMediaBindSlot, url: string) => void;
}) {
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
      <AdminMutedBox>
        Dosyalar güvenli depoda saklanır; size kalıcı bir bağlantı verilir. <strong className="text-slate-200">İçerik</strong> sekmesindeki görsel alanlarına bağlamak için satırdaki{" "}
        <strong className="text-slate-200">CMS’e bağla</strong> düğmesini kullanın (karşılama görseli, logo, iki ekran görüntüsü).
      </AdminMutedBox>
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] p-4">
        <h2 className="text-sm font-semibold text-cyan-100">Dosya yükleme</h2>
        <p className="mt-1 text-sm text-slate-400">
          Logo veya ekran görüntüsü yükleyin; liste altında adresi kopyalayabilir veya doğrudan sayfa içeriğine bağlayabilirsiniz.
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
                  <td className="max-w-[min(280px,40vw)] truncate px-3 py-2 font-mono text-[10px] text-slate-400">{fullUrl}</td>
                  <td className="px-3 py-2 text-slate-500">{Math.round(a.byteSize / 1024)} KB</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(fullUrl)}
                        className="rounded-lg bg-cyan-500/20 px-2 py-1 text-[11px] font-semibold text-cyan-100"
                      >
                        URL kopyala
                      </button>
                      {isImg ? (
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => onBindToCms("hero", fullUrl)}
                            className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-100"
                          >
                            Hero
                          </button>
                          <button
                            type="button"
                            onClick={() => onBindToCms("logo", fullUrl)}
                            className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-100"
                          >
                            Logo
                          </button>
                          <button
                            type="button"
                            onClick={() => onBindToCms("screenshot1", fullUrl)}
                            className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-100"
                          >
                            Görüntü 1
                          </button>
                          <button
                            type="button"
                            onClick={() => onBindToCms("screenshot2", fullUrl)}
                            className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-100"
                          >
                            Görüntü 2
                          </button>
                        </div>
                      ) : null}
                    </div>
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
