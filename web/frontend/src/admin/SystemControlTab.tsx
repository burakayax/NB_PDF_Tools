import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminAuditLog,
  fetchAdminControlMeta,
  fetchAdminRevisions,
  fetchAdminSettings,
  postAdminRollbackRevision,
  postAdminSystemReset,
  putAdminSettingsPatches,
  type AdminAuditRow,
  type AdminControlMeta,
  type AdminRevisionRow,
} from "../api/admin";
import { notifyRuntimeRefresh } from "../lib/runtimeRefreshEvents";
import { AdminField, AdminImpactCard, AdminMutedBox, AdminSection, ConfirmModal, adminInputClass } from "./AdminUi";

const REVISION_SCOPE_OPTIONS = [
  { value: "site.settings", label: "Site ayarları (tema, dil, API güvenliği)" },
  { value: "global.flags", label: "Genel bayraklar (bakım modu vb.)" },
  { value: "global.notifications", label: "Bildirimler ve duyuru şeridi" },
  { value: "cms.content", label: "Sayfa içeriği (CMS)" },
  { value: "tools.config", label: "Araç ayarları (monetizasyon dahil)" },
  { value: "packages.config", label: "Paketler ve fiyatlar" },
  { value: "global.elements", label: "Genel site metinleri" },
] as const;

const DEFAULT_NOTIF = {
  enabled: false,
  variant: "info",
  messageEn: "",
  messageTr: "",
  linkUrl: "",
  linkLabelEn: "",
  linkLabelTr: "",
};

function flagsRecord(root: Record<string, unknown>): Record<string, boolean> {
  const ff = root.featureFlags;
  if (ff != null && typeof ff === "object" && !Array.isArray(ff)) {
    const o: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(ff as Record<string, unknown>)) {
      if (typeof v === "boolean") {
        o[k] = v;
      }
    }
    return o;
  }
  return {};
}

function betaRecord(root: Record<string, unknown>): Record<string, boolean> {
  const b = root.betaFeatures;
  if (b != null && typeof b === "object" && !Array.isArray(b)) {
    const o: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
      if (typeof v === "boolean") {
        o[k] = v;
      }
    }
    return o;
  }
  return {};
}

export function SystemControlTab({ accessToken }: { accessToken: string }) {
  const [meta, setMeta] = useState<AdminControlMeta | null>(null);
  const [flagsRoot, setFlagsRoot] = useState<Record<string, unknown>>({});
  const [featureMap, setFeatureMap] = useState<Record<string, boolean>>({});
  const [betaMap, setBetaMap] = useState<Record<string, boolean>>({});
  const [notif, setNotif] = useState(DEFAULT_NOTIF);
  const [audit, setAudit] = useState<AdminAuditRow[]>([]);
  const [revScope, setRevScope] = useState<string>("site.settings");
  const [revisions, setRevisions] = useState<AdminRevisionRow[]>([]);
  const [resetPick, setResetPick] = useState<Record<string, boolean>>({});
  const [confirmReset, setConfirmReset] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const reloadFlagsAndNotif = useCallback(async () => {
    const all = await fetchAdminSettings(accessToken);
    const fr = all["global.flags"];
    const root =
      fr && typeof fr === "object" && fr !== null && !Array.isArray(fr) ? { ...(fr as Record<string, unknown>) } : {};
    setFlagsRoot(root);
    const frMap = flagsRecord(root);
    const brMap = betaRecord(root);
    if (meta) {
      setFeatureMap(
        Object.fromEntries(meta.featureFlagCatalog.map((f) => [f.key, frMap[f.key] !== false])),
      );
      setBetaMap(Object.fromEntries(meta.betaFlagCatalog.map((f) => [f.key, brMap[f.key] !== false])));
    }

    const n = all["global.notifications"];
    if (n && typeof n === "object" && !Array.isArray(n)) {
      const o = n as Record<string, unknown>;
      setNotif({
        enabled: o.enabled === true,
        variant: typeof o.variant === "string" ? o.variant : "info",
        messageEn: typeof o.messageEn === "string" ? o.messageEn : "",
        messageTr: typeof o.messageTr === "string" ? o.messageTr : "",
        linkUrl: typeof o.linkUrl === "string" ? o.linkUrl : "",
        linkLabelEn: typeof o.linkLabelEn === "string" ? o.linkLabelEn : "",
        linkLabelTr: typeof o.linkLabelTr === "string" ? o.linkLabelTr : "",
      });
    } else {
      setNotif({ ...DEFAULT_NOTIF });
    }
  }, [accessToken, meta]);

  const reloadAudit = useCallback(async () => {
    const { items } = await fetchAdminAuditLog(accessToken, 150);
    setAudit(items);
  }, [accessToken]);

  const reloadRevisions = useCallback(async () => {
    const { items } = await fetchAdminRevisions(accessToken, revScope, 50);
    setRevisions(items);
  }, [accessToken, revScope]);

  useEffect(() => {
    void (async () => {
      try {
        const m = await fetchAdminControlMeta(accessToken);
        setMeta(m);
        const scopes: Record<string, boolean> = {};
        for (const s of m.resettableScopes) {
          scopes[s] = false;
        }
        setResetPick(scopes);
      } catch {
        setMsg("Kontrol meta verisi yüklenemedi.");
      }
    })();
  }, [accessToken]);

  useEffect(() => {
    if (!meta) {
      return;
    }
    void reloadFlagsAndNotif().catch(() => setMsg("Ayarlar yüklenemedi."));
  }, [reloadFlagsAndNotif, meta]);

  useEffect(() => {
    void reloadAudit().catch(() => setMsg("Denetim günlüğü yüklenemedi."));
  }, [reloadAudit]);

  useEffect(() => {
    void reloadRevisions().catch(() => setMsg("Geçmiş yüklenemedi."));
  }, [reloadRevisions]);

  const patchFeature = (key: string, on: boolean) => {
    setFeatureMap((prev) => ({ ...prev, [key]: on }));
  };

  const patchBeta = (key: string, on: boolean) => {
    setBetaMap((prev) => ({ ...prev, [key]: on }));
  };

  const saveFlagsAndNotifications = async () => {
    if (!meta) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const prevFf = flagsRecord(flagsRoot);
      const prevBf = betaRecord(flagsRoot);
      const mergedFf = { ...prevFf };
      const mergedBf = { ...prevBf };
      for (const f of meta.featureFlagCatalog) {
        mergedFf[f.key] = featureMap[f.key] === true;
      }
      for (const f of meta.betaFlagCatalog) {
        mergedBf[f.key] = betaMap[f.key] === true;
      }
      const nextFlags = {
        ...flagsRoot,
        featureFlags: mergedFf,
        betaFeatures: mergedBf,
      };
      await putAdminSettingsPatches(accessToken, {
        "global.flags": nextFlags,
        "global.notifications": notif,
      });
      setFlagsRoot(nextFlags);
      setMsg("Bayraklar ve sistem bildirimi kaydedildi.");
      notifyRuntimeRefresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Kayıt başarısız");
    } finally {
      setBusy(false);
    }
  };

  const doRollback = async () => {
    if (!rollbackId) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await postAdminRollbackRevision(accessToken, rollbackId);
      setRollbackId(null);
      setMsg("Seçilen sürüme geri alındı.");
      notifyRuntimeRefresh();
      void reloadFlagsAndNotif();
      void reloadAudit();
      void reloadRevisions();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Geri alma başarısız");
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    const scopes = Object.entries(resetPick)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (scopes.length === 0) {
      setMsg("En az bir kapsam seçin.");
      setResetOpen(false);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await postAdminSystemReset(accessToken, scopes);
      setConfirmReset("");
      setResetOpen(false);
      setMsg("Seçilen kapsamlar varsayılana sıfırlandı.");
      notifyRuntimeRefresh();
      void reloadFlagsAndNotif();
      void reloadAudit();
      void reloadRevisions();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sıfırlama başarısız");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminImpactCard title="Bu sekmede ne değişir?">
        <p>
          <strong className="text-slate-100">Özellik / beta bayrakları</strong> ve <strong className="text-slate-100">sistem bildirimi</strong> doğrudan{" "}
          <code className="text-slate-200">global.flags</code> ve <code className="text-slate-200">global.notifications</code> üzerinden yayınlanır.{" "}
          <strong className="text-slate-100">Bakım modu</strong> hâlâ <strong className="text-slate-100">Site ayarları</strong> sekmesindedir.
        </p>
        <p>
          <strong className="text-slate-100">Denetim günlüğü</strong> yönetici eylemlerini kaydeder. <strong className="text-slate-100">Sürüm geçmişi</strong> her kayıttan önceki JSON anlık görüntüsünü saklar; geri al ile o hâle dönersiniz.
        </p>
      </AdminImpactCard>

      <AdminSection title="Sistem bildirimi (tüm site)" description="Üstte sabit ince duyuru; ziyaretçi diline göre EN veya TR metin gösterilir." variant="sky">
        <AdminField label="Duyuruyu göster">
          <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={notif.enabled}
              onChange={(e) => setNotif((n) => ({ ...n, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-white/20 bg-black/40"
            />
            Etkin
          </label>
        </AdminField>
        <AdminField label="Görünüm" description="info, warning, error veya success">
          <select
            value={notif.variant}
            onChange={(e) => setNotif((n) => ({ ...n, variant: e.target.value }))}
            className={adminInputClass}
          >
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
            <option value="success">success</option>
          </select>
        </AdminField>
        <AdminField label="Metin (English)">
          <textarea className={`${adminInputClass} min-h-[56px]`} value={notif.messageEn} onChange={(e) => setNotif((n) => ({ ...n, messageEn: e.target.value }))} />
        </AdminField>
        <AdminField label="Metin (Türkçe)">
          <textarea className={`${adminInputClass} min-h-[56px]`} value={notif.messageTr} onChange={(e) => setNotif((n) => ({ ...n, messageTr: e.target.value }))} />
        </AdminField>
        <AdminField label="Bağlantı URL (isteğe bağlı)">
          <input className={adminInputClass} value={notif.linkUrl} onChange={(e) => setNotif((n) => ({ ...n, linkUrl: e.target.value }))} />
        </AdminField>
        <div className="grid gap-5 sm:grid-cols-2">
          <AdminField label="Bağlantı etiketi (EN)">
            <input className={adminInputClass} value={notif.linkLabelEn} onChange={(e) => setNotif((n) => ({ ...n, linkLabelEn: e.target.value }))} />
          </AdminField>
          <AdminField label="Bağlantı etiketi (TR)">
            <input className={adminInputClass} value={notif.linkLabelTr} onChange={(e) => setNotif((n) => ({ ...n, linkLabelTr: e.target.value }))} />
          </AdminField>
        </div>
      </AdminSection>

      <AdminSection title="Özellik bayrakları" description="İstemci bu anahtarları okuyarak davranışı açıp kapatabilir (ör. iletişim formu)." variant="emerald">
        {meta ? (
          <div className="space-y-3">
            {meta.featureFlagCatalog.map((f) => (
              <label key={f.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={featureMap[f.key] === true}
                  onChange={(e) => patchFeature(f.key, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40"
                />
                <span>
                  <span className="font-semibold text-white">{f.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{f.description}</span>
                  <code className="mt-1 block text-[10px] text-slate-500">{f.key}</code>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Katalog yükleniyor…</p>
        )}
      </AdminSection>

      <AdminSection title="Beta özellikleri" description="Deneysel işlevler; kullanıcılar için ayrıntılı açıklama ekleyin." variant="violet">
        {meta ? (
          <div className="space-y-3">
            {meta.betaFlagCatalog.map((f) => (
              <label key={f.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={betaMap[f.key] === true}
                  onChange={(e) => patchBeta(f.key, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40"
                />
                <span>
                  <span className="font-semibold text-white">{f.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{f.description}</span>
                  <code className="mt-1 block text-[10px] text-slate-500">{f.key}</code>
                </span>
              </label>
            ))}
          </div>
        ) : null}
      </AdminSection>

      <button
        type="button"
        disabled={busy}
        onClick={() => void saveFlagsAndNotifications()}
        className="rounded-xl bg-violet-600/75 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Kaydediliyor…" : "Bayrakları ve bildirimi kaydet"}
      </button>

      <AdminSection title="Denetim günlüğü" description="Kim, hangi ayarı veya kullanıcıyı değiştirdi.">
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full min-w-[720px] text-left text-[11px]">
            <thead className="border-b border-white/[0.08] text-slate-500">
              <tr>
                <th className="px-2 py-2">Zaman</th>
                <th className="px-2 py-2">Yönetici</th>
                <th className="px-2 py-2">Eylem</th>
                <th className="px-2 py-2">Hedef</th>
                <th className="px-2 py-2">Özet</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row) => (
                <tr key={row.id} className="border-b border-white/[0.04] text-slate-300">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px]">{new Date(row.createdAt).toLocaleString("tr-TR")}</td>
                  <td className="max-w-[140px] truncate px-2 py-1.5">{row.userEmail}</td>
                  <td className="px-2 py-1.5">{row.action}</td>
                  <td className="max-w-[120px] truncate px-2 py-1.5 font-mono text-[10px]">{row.targetKey ?? "—"}</td>
                  <td className="max-w-[280px] truncate px-2 py-1.5">{row.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() => void reloadAudit()}
          className="mt-2 rounded-lg border border-white/[0.12] px-3 py-1.5 text-xs font-semibold text-slate-200"
        >
          Listeyi yenile
        </button>
      </AdminSection>

      <AdminSection title="Ayar geçmişi ve geri al" description="Her kayıttan önceki değer saklanır; geri alınca o JSON tekrar yazılır.">
        <AdminField label="Kapsam">
          <select value={revScope} onChange={(e) => setRevScope(e.target.value)} className={adminInputClass}>
            {REVISION_SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </AdminField>
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full min-w-[560px] text-left text-[11px]">
            <thead className="border-b border-white/[0.08] text-slate-500">
              <tr>
                <th className="px-2 py-2">Zaman</th>
                <th className="px-2 py-2">Kim</th>
                <th className="px-2 py-2">Not</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {revisions.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.04] text-slate-300">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px]">{new Date(r.createdAt).toLocaleString("tr-TR")}</td>
                  <td className="px-2 py-1.5">{r.userEmail}</td>
                  <td className="max-w-[240px] truncate px-2 py-1.5">{r.summary ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => setRollbackId(r.id)}
                      className="rounded-lg bg-amber-500/25 px-2 py-1 text-[10px] font-semibold text-amber-100"
                    >
                      Bu sürüme dön
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() => void reloadRevisions()}
          className="mt-2 rounded-lg border border-white/[0.12] px-3 py-1.5 text-xs font-semibold text-slate-200"
        >
          Geçmişi yenile
        </button>
      </AdminSection>

      <AdminSection title="Varsayılana sıfırla" description="Dikkat: seçilen kapsamlar anında fabrika varsayılanına döner. Onay için RESET yazın." variant="amber">
        <AdminMutedBox>
          <code className="text-slate-300">packages.config</code> sıfırlanınca plan / fiyat birleşik kaydı boş nesneye döner; ardından planları yeniden yapılandırın.
        </AdminMutedBox>
        {meta ? (
          <div className="space-y-2">
            {meta.resettableScopes.map((scope) => (
              <label key={scope} className="flex cursor-pointer items-center gap-3 text-sm text-amber-50/95">
                <input
                  type="checkbox"
                  checked={resetPick[scope] === true}
                  onChange={(e) => setResetPick((p) => ({ ...p, [scope]: e.target.checked }))}
                  className="h-4 w-4 rounded border-amber-400/40 bg-black/40"
                />
                <code className="text-xs">{scope}</code>
              </label>
            ))}
          </div>
        ) : null}
        <AdminField label="Onay (büyük harfle RESET yazın)" description="Yanlışlıkla tıklamayı önlemek için.">
          <input className={adminInputClass} value={confirmReset} onChange={(e) => setConfirmReset(e.target.value)} placeholder="RESET" />
        </AdminField>
        <button
          type="button"
          disabled={busy || confirmReset !== "RESET"}
          onClick={() => setResetOpen(true)}
          className="rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-100 disabled:opacity-40"
        >
          Seçilenleri sıfırla
        </button>
      </AdminSection>

      {msg ? <p className="text-sm text-slate-400">{msg}</p> : null}

      <ConfirmModal
        open={Boolean(rollbackId)}
        title="Geri al"
        message="Bu sürümdeki kayıtlı önceki JSON uygulanacak. Mevcut (kaydedilmemiş) form değişiklikleriniz etkilenmez; canlı ayar hemen güncellenir."
        confirmLabel="Geri al"
        variant="danger"
        busy={busy}
        onClose={() => setRollbackId(null)}
        onConfirm={async () => {
          await doRollback();
        }}
      />

      <ConfirmModal
        open={resetOpen}
        title="Varsayılana sıfırlama"
        message="Seçili tüm kapsamlar fabrika varsayılanına dönecek. Bu işlem geri alınabilir (yeni bir sürüm satırı oluşur) ancak kısa süreli kesinti yaratabilir."
        confirmLabel="Sıfırla"
        variant="danger"
        busy={busy}
        onClose={() => setResetOpen(false)}
        onConfirm={async () => {
          await doReset();
        }}
      />
    </div>
  );
}
