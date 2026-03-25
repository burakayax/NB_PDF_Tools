// Web uygulamasının kök bileşeni: karşılama, kimlik, yasal sayfalar ve PDF araçları görünümlerini tek state ile yönetir.
// Oturum, abonelik ve dosya yükleme durumunun modüller arasında paylaşılması için tek React ağacında toplanır.
// Bu bileşen parçalanırsa üst düzey hook ve görünüm geçişleri yeniden kablolanmak zorunda kalır.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMergeJob,
  downloadFromApi,
  downloadMergeJob,
  fetchMergeJob,
  inspectPdf,
  type MergeJobStatus,
} from "./api";
import { submitContactForm } from "./api/contact";
import { CookieNotice } from "./components/common/CookieNotice";
import { DashboardSidebar, DashboardSidebarMobileRail, type SidebarToolId } from "./components/dashboard/DashboardSidebar";
import { DashboardTopNav } from "./components/dashboard/DashboardTopNav";
import { ChangePasswordModal } from "./components/dashboard/ChangePasswordModal";
import { UserProfilePanel } from "./components/dashboard/UserProfilePanel";
import { userGreetingLine } from "./components/dashboard/userDisplayName";
import { AuthPage } from "./components/auth/AuthPage";
import { LoginSuccessPage } from "./components/auth/LoginSuccessPage";
import { LandingPage } from "./components/landing/LandingPage";
import { LegalPage } from "./components/legal/LegalPage";
import {
  assertFeatureBeforeAction,
  fetchPlans,
  fetchSubscriptionSummary,
  recordUsage,
  type FeatureKey,
  type PlanDefinition,
  type SubscriptionSummary,
} from "./api/subscription";
import { translateAuthApiMessage } from "./i18n/auth";
import { localizedPlanDescription, localizedPlanDisplayName } from "./i18n/plans";
import {
  featureCopy,
  validatePagesFormat,
  validatePagesMax,
  ws,
} from "./i18n/workspace";
import { useAnalyticsTracking } from "./hooks/useAnalyticsTracking";
import { useAuthSession } from "./hooks/useAuthSession";
import { useCookieConsent } from "./hooks/useCookieConsent";
import { useErrorLogging } from "./hooks/useErrorLogging";
import { usePreferredLanguage } from "./hooks/usePreferredLanguage";

type FeatureId = FeatureKey;

type NonLegalView = "landing" | "login" | "register" | "web";
type LegalView = "terms" | "privacy";
type AppView = NonLegalView | LegalView;
type ToastType = "success" | "error" | "loading" | "info";

type ContentPanel = "tool" | "subscription" | "profile";

type ToastState = {
  type: ToastType;
  title: string;
  detail: string;
};

type UploadItem = {
  id: string;
  file: File;
  encrypted: boolean;
  inspecting: boolean;
  password: string;
  pageCount: number | null;
  /** Birleştirme: şifreli dosyada parola sunucuda doğrulandı mı */
  mergePasswordVerified: boolean;
};

type Feature = {
  id: FeatureId;
  title: string;
  icon: string;
  description: string;
  endpoint: string;
  buttonText: string;
  accept: string;
  multiple?: boolean;
  fallbackFilename: string;
};

// PDF ön incelemesi (şifreli mi) gerektiren modül kimlikleri; inspect isteği bu listeye göre tetiklenir.
// Parola alanlarının görünürlüğü modül bazında olduğundan hangi işlemlerin inceleme istediği açıkça seçilmelidir.
// Liste backend veya UI ile senkron bozulursa şifreli dosyada parola alanı çıkmaz veya gereksiz istek atılır.
const pdfInspectionFeatures: FeatureId[] = ["split", "merge", "pdf-to-word", "pdf-to-excel", "compress", "encrypt"];
const windowsDownloadUrl = "#";

// Ana menüdeki PDF özellik kartlarının tek veri kaynağı; metinler ve API endpoint buradan beslenir.
// Yeni araç eklemek veya kopyayı güncellemek için öncelikle bu dizi düzenlenmelidir.
// endpoint değeri backend rotasıyla eşleşmezse form gönderimi 404 veya hatalı işleme düşer.
const features: Feature[] = [
  {
    id: "split",
    title: "SAYFA AYIR",
    icon: "📄",
    description: "Seçilen PDF içinden istediğiniz sayfaları düzenli ve güvenli biçimde ayırır.",
    endpoint: "split",
    buttonText: "SAYFALARI AYIR",
    accept: ".pdf,application/pdf",
    fallbackFilename: "ayrılan-sayfalar.pdf",
  },
  {
    id: "merge",
    title: "PDF BİRLEŞTİR",
    icon: "🗂",
    description: "Birden fazla PDF dosyasını istediğiniz sıraya göre tek dosyada birleştirir.",
    endpoint: "merge",
    buttonText: "PDF'LERİ BİRLEŞTİR",
    accept: ".pdf,application/pdf",
    multiple: true,
    fallbackFilename: "birleştirilmiş.pdf",
  },
  {
    id: "pdf-to-word",
    title: "PDF -> WORD",
    icon: "📝",
    description: "PDF dosyasını düzenlenebilir Word belgesine dönüştürür.",
    endpoint: "pdf-to-word",
    buttonText: "WORD DOSYASINI İNDİR",
    accept: ".pdf,application/pdf",
    fallbackFilename: "çıktı.docx",
  },
  {
    id: "word-to-pdf",
    title: "WORD -> PDF",
    icon: "🧾",
    description: "Word belgesini PDF biçiminde dışa aktarır.",
    endpoint: "word-to-pdf",
    buttonText: "PDF OLARAK İNDİR",
    accept: ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fallbackFilename: "çıktı.pdf",
  },
  {
    id: "excel-to-pdf",
    title: "EXCEL -> PDF",
    icon: "📊",
    description: "Excel tablolarını PDF biçimine dönüştürür.",
    endpoint: "excel-to-pdf",
    buttonText: "PDF OLARAK İNDİR",
    accept: ".xlsx,.xlsm,.xltx,.xltm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fallbackFilename: "çıktı.pdf",
  },
  {
    id: "pdf-to-excel",
    title: "PDF -> EXCEL",
    icon: "📈",
    description: "PDF tablo yapısını korumaya odaklanarak Excel çıktısı oluşturur.",
    endpoint: "pdf-to-excel",
    buttonText: "EXCEL DOSYASINI İNDİR",
    accept: ".pdf,application/pdf",
    fallbackFilename: "çıktı.xlsx",
  },
  {
    id: "compress",
    title: "PDF SIKIŞTIR",
    icon: "🗜",
    description: "PDF akışını optimize ederek dosya boyutunu küçültmeye çalışır.",
    endpoint: "compress",
    buttonText: "SIKIŞTIRILMIŞ PDF İNDİR",
    accept: ".pdf,application/pdf",
    fallbackFilename: "sıkıştırılmış.pdf",
  },
  {
    id: "encrypt",
    title: "PDF ŞİFRELE",
    icon: "🔒",
    description: "PDF dosyasına güvenli bir açılış parolası uygular.",
    endpoint: "encrypt",
    buttonText: "ŞİFRELİ PDF İNDİR",
    accept: ".pdf,application/pdf",
    fallbackFilename: "şifreli.pdf",
  },
];

function EmptyStateIllustration() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function EmptyState({ title, hint, compact = false }: { title: string; hint: string; compact?: boolean }) {
  return (
    <div
      className={`nb-empty-state${compact ? " nb-empty-state--compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="nb-empty-state__icon">
        <EmptyStateIllustration />
      </div>
      <p className="nb-empty-state__title">{title}</p>
      <p className="nb-empty-state__hint">{hint}</p>
    </div>
  );
}

function createUploadItems(fileList: File[]) {
  // Tarayıcı File listesini arayüz state modeline çevirir; her öğeye kararlı id ve şifre alanı ekler.
  // Birleştirme sırası ve liste render'ı bu yapı üzerinden yürüdüğünden tutarlı şema gereklidir.
  // Id üretimi zayıflarsa React anahtarları çakışır; sürükle-bırak ve güncelleme davranışı bozulabilir.
  return fileList.map((file) => ({
    id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    encrypted: false,
    inspecting: false,
    password: "",
    pageCount: null,
    mergePasswordVerified: false,
  }));
}

function formatElapsed(seconds: number) {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

/** Birleştirme listesinde imleç Y konumuna göre hedef satır indeksi (yer değiştirme önizlemesi için). */
function mergePointerYToIndex(clientY: number, container: HTMLElement | null): number {
  if (!container) {
    return 0;
  }
  const cards = [...container.querySelectorAll("[data-merge-row-index]")] as HTMLElement[];
  if (cards.length === 0) {
    return 0;
  }
  for (let i = 0; i < cards.length; i++) {
    const br = cards[i].getBoundingClientRect();
    if (clientY >= br.top && clientY <= br.bottom) {
      return i;
    }
  }
  const first = cards[0].getBoundingClientRect();
  if (clientY < first.top) {
    return 0;
  }
  const last = cards[cards.length - 1].getBoundingClientRect();
  if (clientY > last.bottom) {
    return cards.length - 1;
  }
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < cards.length; i++) {
    const br = cards[i].getBoundingClientRect();
    const mid = br.top + br.height / 2;
    const d = Math.abs(clientY - mid);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Sürüklerken diğer satırların kayarak ara açılmasını sağlar (kaynak ve hedef indeks arası). */
function getReorderPreviewOffset(index: number, from: number, to: number, slot: number): number {
  if (from < 0 || from === to || slot <= 0) {
    return 0;
  }
  if (from < to) {
    if (index > from && index <= to) {
      return -slot;
    }
  } else if (from > to) {
    if (index >= to && index < from) {
      return slot;
    }
  }
  return 0;
}

/** createMergeJob yanıtı gelene kadar UI’da anında gösterilen yer tutucu iş kimliği. */
const MERGE_JOB_PENDING_ID = "__merge_pending__";

function getTrackedViewName(view: AppView) {
  switch (view) {
    case "landing":
      return "landing";
    case "login":
      return "auth-login";
    case "register":
      return "auth-register";
    case "terms":
      return "legal-terms";
    case "privacy":
      return "legal-privacy";
    case "web":
      return "workspace";
    default:
      return "landing";
  }
}

function getTrackedPath(view: AppView) {
  switch (view) {
    case "landing":
      return "/";
    case "login":
      return "/login";
    case "register":
      return "/register";
    case "terms":
      return "/terms";
    case "privacy":
      return "/privacy";
    case "web":
      return "/workspace";
    default:
      return "/";
  }
}

function App() {
  const { language, setLanguage, detectInitialLanguage } = usePreferredLanguage();
  const {
    user,
    accessToken,
    isAuthenticated,
    isRestoring,
    login,
    logout,
    register,
    updatePreferredLanguage,
    updateProfile,
    changePassword,
    completeOAuthLogin,
    clearSession,
  } = useAuthSession();
  const { hasConsent, isReady: isCookieConsentReady, acceptConsent } = useCookieConsent();
  const [view, setView] = useState<AppView>("landing");
  const [legalBackView, setLegalBackView] = useState<NonLegalView>("landing");
  const [selectedFeatureId, setSelectedFeatureId] = useState<FeatureId>("split");
  const [contentPanel, setContentPanel] = useState<ContentPanel>("tool");
  const [activeSidebar, setActiveSidebar] = useState<SidebarToolId>("split");
  const [submitting, setSubmitting] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [registrationSuccessBanner, setRegistrationSuccessBanner] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [subscriptionSummary, setSubscriptionSummary] = useState<SubscriptionSummary | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [password, setPassword] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [pagesText, setPagesText] = useState("");
  const [pagesError, setPagesError] = useState("");
  const [splitMode, setSplitMode] = useState("single");
  const [outputPassword, setOutputPassword] = useState("");
  const [mergeJob, setMergeJob] = useState<MergeJobStatus | null>(null);
  const [mergePointerDraggingId, setMergePointerDraggingId] = useState<string | null>(null);
  const [mergeDragOverIndex, setMergeDragOverIndex] = useState<number | null>(null);
  const [mergeDragSlotPx, setMergeDragSlotPx] = useState(140);
  const mergePointerActiveRef = useRef<{
    sourceIndex: number;
    itemId: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    ghost: HTMLElement;
    cardEl: HTMLDivElement;
  } | null>(null);
  const mergeDragHoverIndexRef = useRef<number | null>(null);
  const mergePollHandledRef = useRef(false);
  const mergePollInFlightRef = useRef(false);
  const mergeListScrollRef = useRef<HTMLDivElement | null>(null);
  const [mergeVerifyingId, setMergeVerifyingId] = useState<string | null>(null);
  const [mergeSnapId, setMergeSnapId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactWebsite, setContactWebsite] = useState("");
  const [contactError, setContactError] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inspectRunRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const contactSubmitInFlightRef = useRef(false);

  const navigateToDashboardAfterOAuth = useCallback(() => {
    setSelectedFeatureId("split");
    setActiveSidebar("split");
    setContentPanel("tool");
    setView("web");
    window.history.replaceState({}, "", "/?view=web");
  }, []);

  const selectedFeature = useMemo(() => {
    const base = features.find((feature) => feature.id === selectedFeatureId) ?? features[0];
    const c = featureCopy(base.id, language);
    return { ...base, title: c.title, description: c.description, buttonText: c.button };
  }, [selectedFeatureId, language]);

  const lockedFeatures = useMemo(() => {
    const next = new Set<FeatureKey>();
    if (!isAuthenticated || !subscriptionSummary || subscriptionLoading) {
      return next;
    }
    for (const f of features) {
      if (!subscriptionSummary.allowedFeatures.includes(f.id)) {
        next.add(f.id);
      }
    }
    return next;
  }, [isAuthenticated, subscriptionSummary, subscriptionLoading]);
  const primaryUpload = uploads[0] ?? null;
  const currentPdfIsEncrypted = Boolean(primaryUpload?.encrypted);
  const shouldInspectCurrentFeature = pdfInspectionFeatures.includes(selectedFeatureId);
  const selectedFeatureAllowed = useMemo(() => {
    if (!isAuthenticated) {
      return true;
    }
    if (subscriptionLoading || !subscriptionSummary) {
      return true;
    }
    return subscriptionSummary.allowedFeatures.includes(selectedFeatureId);
  }, [isAuthenticated, subscriptionLoading, subscriptionSummary, selectedFeatureId]);
  const shouldShowCookieNotice = isCookieConsentReady && !hasConsent;
  const trackedView = getTrackedViewName(view);
  const trackedPath = getTrackedPath(view);

  useAnalyticsTracking({
    enabled: hasConsent,
    view: trackedView,
    path: trackedPath,
    language,
    accessToken,
  });

  useErrorLogging({
    language,
    accessToken,
  });

  function showToast(type: ToastType, title: string, detail: string) {
    // Global toast ile mesajı viewport'ta sabit katmanda gösterir; scroll konumundan bağımsızdır.
    // Uzun işlemlerde yükleme, başarı ve hata geri bildiriminin tek giriş noktasıdır.
    // Otomatik kapanma süresi veya temizleme eksik kalırsa kullanıcı eski uyarıda takılı kalabilir.
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ type, title, detail });
    if (type !== "loading") {
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
      }, 4200);
    }
  }

  function clearToast() {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }

  function resetForm(clearInputValue: boolean) {
    // Modül değişimi veya işlem sonrası dosya listesi, parola ve sayfa metnini tek yerden sıfırlar.
    // Önceki seçimlerin yeni modüle sızmasını önlemek için merkezi sıfırlama gerekir.
    // Alanlar eksik temizlenirse kullanıcı yanlış modülde eski dosya ile gönderim deneyebilir.
    setUploads([]);
    setPassword("");
    setInputPassword("");
    setPagesText("");
    setPagesError("");
    setSplitMode("single");
    setOutputPassword("");
    setMergePointerDraggingId(null);
    setMergeDragOverIndex(null);
    mergeDragHoverIndexRef.current = null;
    const pst = mergePointerActiveRef.current;
    if (pst?.ghost.parentNode) {
      pst.ghost.parentNode.removeChild(pst.ghost);
    }
    mergePointerActiveRef.current = null;
    if (clearInputValue && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function setUploadPassword(targetId: string, value: string) {
    setUploads((current) =>
      current.map((item) =>
        item.id === targetId ? { ...item, password: value, mergePasswordVerified: false } : item,
      ),
    );
  }

  async function verifyMergeFilePassword(itemId: string) {
    const item = uploads.find((u) => u.id === itemId);
    if (!item?.encrypted) {
      return;
    }
    const pwd = item.password.trim();
    const L = ws(language);
    if (!pwd) {
      showToast(
        "error",
        language === "tr" ? "Parola gerekli" : "Password required",
        language === "tr" ? "Önce bu dosya için parolayı girin." : "Enter the password for this file first.",
      );
      return;
    }
    setMergeVerifyingId(itemId);
    try {
      const result = await inspectPdf(item.file, pwd);
      const ok = result.page_count !== null && !result.inspect_error;
      setUploads((cur) =>
        cur.map((u) => (u.id === itemId ? { ...u, mergePasswordVerified: ok } : u)),
      );
      if (!ok) {
        showToast("error", language === "tr" ? "Parola doğrulanamadı" : "Invalid password", L.mergePasswordWrong);
      }
    } catch (err) {
      setUploads((cur) => cur.map((u) => (u.id === itemId ? { ...u, mergePasswordVerified: false } : u)));
      showToast(
        "error",
        language === "tr" ? "Parola doğrulanamadı" : "Invalid password",
        err instanceof Error ? err.message : L.mergePasswordWrong,
      );
    } finally {
      setMergeVerifyingId(null);
    }
  }

  function removeUpload(targetId: string) {
    setUploads((current) => current.filter((item) => item.id !== targetId));
    setPagesError("");
  }

  function clearAllUploads() {
    setUploads([]);
    setPagesError("");
    setMergePointerDraggingId(null);
    setMergeDragOverIndex(null);
    mergeDragHoverIndexRef.current = null;
    const st = mergePointerActiveRef.current;
    if (st?.ghost.parentNode) {
      st.ghost.parentNode.removeChild(st.ghost);
    }
    mergePointerActiveRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function moveUploadUp(index: number) {
    if (index <= 0) {
      return;
    }
    const id = uploads[index]?.id;
    moveUpload(index, index - 1);
    if (id) {
      setMergeSnapId(id);
      window.setTimeout(() => setMergeSnapId(null), 420);
    }
  }

  function moveUploadDown(index: number) {
    if (index < 0 || index >= uploads.length - 1) {
      return;
    }
    const id = uploads[index]?.id;
    moveUpload(index, index + 1);
    if (id) {
      setMergeSnapId(id);
      window.setTimeout(() => setMergeSnapId(null), 420);
    }
  }

  function moveUpload(fromIndex: number, toIndex: number) {
    // Birleştirme modunda dosya sırasını yeniden düzenler; API'ye giden sıra bu diziyle aynıdır.
    // Yanlış sıra yanlış PDF birleşimine yol açtığından mutasyon tek yardımcıda toplanır.
    // İndeks kontrolleri kaldırılırsa boş dizide splice hatası veya öğe kaybı oluşabilir.
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return;
    }
    setUploads((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleMergeRowPointerDown(event: React.PointerEvent<HTMLDivElement>, index: number, itemId: string) {
    if (selectedFeature.id !== "merge") {
      return;
    }
    const el = event.target as HTMLElement;
    if (el.closest("button, input, textarea, a, select")) {
      return;
    }
    event.preventDefault();
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    setMergeDragSlotPx(Math.round(rect.height + 12));
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.style.boxSizing = "border-box";
    ghost.style.position = "fixed";
    ghost.style.left = `${event.clientX - offsetX}px`;
    ghost.style.top = `${event.clientY - offsetY}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.zIndex = "10000";
    ghost.style.pointerEvents = "none";
    ghost.style.opacity = "0.96";
    ghost.style.boxShadow = "0 22px 56px rgba(0, 0, 0, 0.52)";
    ghost.querySelectorAll("button, input").forEach((node) => {
      (node as HTMLElement).style.visibility = "hidden";
    });
    document.body.appendChild(ghost);
    mergePointerActiveRef.current = {
      sourceIndex: index,
      itemId,
      pointerId: event.pointerId,
      offsetX,
      offsetY,
      ghost,
      cardEl: card as HTMLDivElement,
    };
    mergeDragHoverIndexRef.current = index;
    setMergeDragOverIndex(index);
    setMergePointerDraggingId(itemId);
    try {
      (card as HTMLDivElement).setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    const onMove = (ev: PointerEvent) => {
      const st = mergePointerActiveRef.current;
      if (!st || ev.pointerId !== st.pointerId) {
        return;
      }
      ev.preventDefault();
      st.ghost.style.left = `${ev.clientX - st.offsetX}px`;
      st.ghost.style.top = `${ev.clientY - st.offsetY}px`;
      const listEl = mergeListScrollRef.current;
      if (listEl) {
        const r = listEl.getBoundingClientRect();
        const margin = 56;
        if (ev.clientY < r.top + margin) {
          listEl.scrollTop = Math.max(0, listEl.scrollTop - 16);
        } else if (ev.clientY > r.bottom - margin) {
          listEl.scrollTop = Math.min(listEl.scrollHeight - listEl.clientHeight, listEl.scrollTop + 16);
        }
      }
      const hover = mergePointerYToIndex(ev.clientY, mergeListScrollRef.current);
      mergeDragHoverIndexRef.current = hover;
      setMergeDragOverIndex(hover);
    };

    const onUp = (ev: PointerEvent) => {
      const st = mergePointerActiveRef.current;
      if (!st || ev.pointerId !== st.pointerId) {
        return;
      }
      try {
        st.cardEl.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (st.ghost.parentNode) {
        st.ghost.parentNode.removeChild(st.ghost);
      }
      mergePointerActiveRef.current = null;
      const to = mergeDragHoverIndexRef.current ?? st.sourceIndex;
      mergeDragHoverIndexRef.current = null;
      setMergeDragOverIndex(null);
      setMergePointerDraggingId(null);
      if (to !== st.sourceIndex && to >= 0) {
        moveUpload(st.sourceIndex, to);
        setMergeSnapId(st.itemId);
        window.setTimeout(() => setMergeSnapId(null), 420);
      }
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  async function onFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    await handleNewFiles(selectedFiles);
    event.currentTarget.value = "";
  }

  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  async function refreshSubscriptionState() {
    if (!accessToken || !isAuthenticated) {
      return;
    }

    const summary = await fetchSubscriptionSummary(accessToken);
    setSubscriptionSummary(summary);
  }

  async function syncUsageAfterSuccess(featureKey: FeatureKey) {
    if (!accessToken) {
      return;
    }

    await recordUsage(accessToken, featureKey);
    await refreshSubscriptionState();
  }

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (
      requestedView === "login" ||
      requestedView === "register" ||
      requestedView === "web" ||
      requestedView === "terms" ||
      requestedView === "privacy"
    ) {
      setView(requestedView);
    }
  }, []);

  useEffect(() => {
    if (view === "register") {
      setRegistrationSuccessBanner(null);
    }
  }, [view]);

  useEffect(() => {
    void fetchPlans()
      .then((data) => {
        setPlans(data);
      })
      .catch(() => {
        setPlans([]);
      });
  }, []);

  useEffect(() => {
    resetForm(true);
    setMergeJob(null);
    setSubmitting(false);
    clearToast();
  }, [selectedFeatureId]);

  useEffect(() => {
    if (selectedFeatureId !== "merge" || !mergeJob?.id || mergeJob.id === MERGE_JOB_PENDING_ID) {
      return;
    }

    let active = true;
    mergePollHandledRef.current = false;
    const jobId = mergeJob.id;
    const fallbackName = selectedFeature.fallbackFilename;

    const tick = async () => {
      if (!active || mergePollHandledRef.current || mergePollInFlightRef.current) {
        return;
      }

      const M = ws(language);
      mergePollInFlightRef.current = true;
      try {
        const nextStatus = await fetchMergeJob(jobId);
        if (!active || mergePollHandledRef.current) {
          return;
        }

        setMergeJob(nextStatus);

        if (nextStatus.status === "failed") {
          showToast("error", M.mergeToastFailedTitle, nextStatus.error || M.mergeToastFailedGeneric);
          setSubmitting(false);
          mergePollHandledRef.current = true;
          return;
        }

        if (nextStatus.status === "completed") {
          mergePollHandledRef.current = true;
          try {
            await downloadMergeJob(jobId, fallbackName);
          } catch (downloadErr) {
            if (!active) {
              return;
            }
            setSubmitting(false);
            const detail =
              downloadErr instanceof Error ? downloadErr.message : M.mergeToastPollErrorDetail;
            showToast("error", M.mergeToastDownloadErrorTitle, detail);
            return;
          }
          if (!active) {
            return;
          }
          await syncUsageAfterSuccess("merge");
          showToast("success", M.mergeToastSuccessTitle, M.mergeToastSuccessBody);
          resetForm(true);
          setSubmitting(false);
          setMergeJob(null);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        const detail = error instanceof Error ? error.message : M.mergeToastPollErrorDetail;
        showToast("error", M.mergeToastPollErrorTitle, detail);
        setSubmitting(false);
        mergePollHandledRef.current = true;
      } finally {
        mergePollInFlightRef.current = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 700);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [mergeJob?.id, selectedFeatureId, selectedFeature.fallbackFilename, language]);

  useEffect(() => {
    if (selectedFeatureId !== "split") {
      return;
    }
    const primary = uploads[0];
    if (!primary?.file || !primary.encrypted) {
      return;
    }
    const pwd = password.trim();
    if (!pwd) {
      setUploads((cur) => {
        if (!cur[0]) {
          return cur;
        }
        if (cur[0].pageCount === null) {
          return cur;
        }
        return cur.map((u, i) => (i === 0 ? { ...u, pageCount: null } : u));
      });
      return;
    }
    const timer = window.setTimeout(() => {
      void inspectPdf(primary.file, pwd).then((result) => {
        setUploads((cur) =>
          cur.map((u, i) => (i === 0 ? { ...u, pageCount: result.page_count ?? null } : u)),
        );
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [password, selectedFeatureId, uploads[0]?.id, uploads[0]?.encrypted, language]);

  useEffect(() => {
    return () => {
      clearToast();
    };
  }, []);

  useEffect(() => {
    if (!isRestoring && view === "web" && !isAuthenticated) {
      setView("login");
    }
  }, [isAuthenticated, isRestoring, view]);

  useEffect(() => {
    if (!isAuthenticated || !user || !accessToken) {
      setSubscriptionSummary(null);
      return;
    }

    setSubscriptionLoading(true);
    void fetchSubscriptionSummary(accessToken)
      .then((data) => {
        setSubscriptionSummary(data);
      })
      .catch((error) => {
        showToast("error", "Abonelik bilgisi alınamadı", error instanceof Error ? error.message : "Plan bilgileri yüklenemedi.");
      })
      .finally(() => {
        setSubscriptionLoading(false);
      });
  }, [accessToken, isAuthenticated, user?.id]);

  const W = ws(language);
  const splitModeDescription =
    splitMode === "single"
      ? language === "tr"
        ? "Seçtiğiniz sayfalar tek bir PDF dosyası içinde birleştirilerek indirilecektir."
        : "Selected pages are merged into one downloadable PDF."
      : language === "tr"
        ? "Seçtiğiniz sayfalar ayrı PDF dosyaları olarak hazırlanıp ZIP ile indirilir."
        : "Selected pages are saved as separate PDFs inside a ZIP download.";

  const showSplitPasswordField =
    ["split", "pdf-to-word", "pdf-to-excel", "compress"].includes(selectedFeature.id) &&
    uploads.length > 0 &&
    currentPdfIsEncrypted;
  const showEncryptSourcePasswordField = selectedFeature.id === "encrypt" && uploads.length > 0 && currentPdfIsEncrypted;
  const mergeHasMissingPasswords =
    selectedFeature.id === "merge" &&
    uploads.some((item) => item.encrypted && (!item.password.trim() || !item.mergePasswordVerified));
  const toolFilesStillInspecting =
    uploads.length > 0 &&
    uploads.some((u) => u.inspecting) &&
    pdfInspectionFeatures.includes(selectedFeatureId);
  const showUsageQuota =
    user?.role !== "ADMIN" &&
    subscriptionSummary &&
    subscriptionSummary.usage.dailyLimit !== null;
  const mergeProgressActive =
    Boolean(mergeJob && selectedFeatureId === "merge" && mergeJob.status !== "completed");
  const genericToolProgressActive =
    submitting && selectedFeatureId !== "merge" && view === "web" && contentPanel === "tool";
  const bottomToolProgressActive = mergeProgressActive || genericToolProgressActive;
  const mergeProgressIndeterminate = Boolean(
    mergeJob &&
      (mergeJob.id === MERGE_JOB_PENDING_ID ||
        mergeJob.status === "queued" ||
        (mergeJob.status === "running" && mergeJob.percent < 1)),
  );
  const mergeEtaSeconds =
    mergeJob &&
    mergeJob.status === "running" &&
    mergeJob.percent >= 3 &&
    mergeJob.elapsed_seconds >= 2
      ? Math.round((mergeJob.elapsed_seconds / mergeJob.percent) * (100 - mergeJob.percent))
      : null;
  const splitInputDisabled = uploads.length === 0;
  const submitDisabled =
    submitting ||
    uploads.length === 0 ||
    !selectedFeatureAllowed ||
    (selectedFeature.id === "split" && (!!pagesError || !pagesText.trim())) ||
    (showSplitPasswordField && !password.trim()) ||
    (showEncryptSourcePasswordField && !inputPassword.trim()) ||
    (selectedFeature.id === "encrypt" && (!outputPassword.trim() || uploads.length === 0)) ||
    mergeHasMissingPasswords ||
    toolFilesStillInspecting;
  const pickerButtonText = selectedFeature.multiple && uploads.length > 0 ? W.fileAdd : W.filePick;

  function openLegalPage(target: LegalView) {
    if (view === "landing" || view === "login" || view === "register" || view === "web") {
      setLegalBackView(view);
    }
    setView(target);
  }

  function openContactModal() {
    setContactError("");
    setContactModalOpen(true);
  }

  function closeContactModal() {
    setContactModalOpen(false);
  }

  async function handleContactModalSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (contactSubmitInFlightRef.current) {
      return;
    }

    setContactError("");

    const tr = language === "tr";
    if (!contactName.trim()) {
      setContactError(tr ? "Ad soyad gerekli." : "Name is required.");
      return;
    }
    if (contactName.trim().length < 2) {
      setContactError(tr ? "Ad soyad en az 2 karakter olmalı." : "Name must be at least 2 characters.");
      return;
    }
    if (!contactEmail.trim()) {
      setContactError(tr ? "E-posta gerekli." : "Email is required.");
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(contactEmail.trim())) {
      setContactError(tr ? "Geçerli bir e-posta girin." : "Enter a valid email address.");
      return;
    }
    if (!contactMessage.trim()) {
      setContactError(tr ? "Mesaj gerekli." : "Message is required.");
      return;
    }
    if (contactMessage.trim().length < 10) {
      setContactError(tr ? "Mesaj en az 10 karakter olmalı." : "Message must be at least 10 characters.");
      return;
    }

    contactSubmitInFlightRef.current = true;
    setContactSubmitting(true);
    try {
      await submitContactForm({
        name: contactName.trim(),
        email: contactEmail.trim(),
        message: contactMessage.trim(),
        website: contactWebsite.trim(),
      });
      setContactName("");
      setContactEmail("");
      setContactMessage("");
      setContactWebsite("");
      setContactError("");
      closeContactModal();
      showToast(
        "success",
        tr ? "İletişim" : "Contact",
        tr ? "Mesajınız başarıyla gönderildi" : "Your message has been sent successfully",
      );
    } catch (error) {
      setContactError(error instanceof Error ? error.message : tr ? "Gönderilemedi." : "Could not send.");
    } finally {
      contactSubmitInFlightRef.current = false;
      setContactSubmitting(false);
    }
  }

  function closeLegalPage() {
    setView(legalBackView);
  }

  function openWorkspace() {
    setSelectedFeatureId("split");
    setActiveSidebar("split");
    setContentPanel("tool");
    setAuthError("");
    if (isAuthenticated && user?.preferredLanguage) {
      setLanguage(user.preferredLanguage);
    }
    setView(isAuthenticated ? "web" : "login");
  }

  function handleSidebarSelect(id: SidebarToolId) {
    setActiveSidebar(id);
    if (id === "subscription") {
      setContentPanel("subscription");
      return;
    }
    setContentPanel("tool");
    setSelectedFeatureId(id);
  }

  function handleDashboardLogoClick() {
    setContentPanel("tool");
    setActiveSidebar("split");
    setSelectedFeatureId("split");
  }

  function handleNavProfile() {
    setContentPanel("profile");
  }

  function handleNavPassword() {
    setChangePasswordModalOpen(true);
  }

  async function handleAuthSubmit(payload: { email: string; password: string; firstName?: string; lastName?: string }) {
    try {
      setAuthSubmitting(true);
      setAuthError("");

      if (view === "register") {
        const firstName = payload.firstName?.trim() ?? "";
        const lastName = payload.lastName?.trim() ?? "";
        if (!firstName || !lastName) {
          const msg = language === "tr" ? "Ad ve soyad gereklidir." : "First and last name are required.";
          setAuthError(msg);
          throw new Error(msg);
        }
        const registerResult = await register(firstName, lastName, payload.email, payload.password, language);
        setRegistrationSuccessBanner(
          language === "tr"
            ? "Kayıt başarılı. Doğrulama e-postası gönderildi; giriş yapmadan önce e-postanızı doğrulayın."
            : registerResult.message,
        );
        setView("login");
        return;
      } else {
        const loggedInUser = await login(payload.email, payload.password);
        setLanguage(loggedInUser.preferredLanguage || detectInitialLanguage());
        showToast("success", "Giriş başarılı", "Çalışma alanına yönlendiriliyorsunuz.");
      }

      setSelectedFeatureId("split");
      setActiveSidebar("split");
      setContentPanel("tool");
      setView("web");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Kimlik doğrulama işlemi başarısız oldu.");
      throw error;
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
    setAuthError("");
    setLanguage(detectInitialLanguage());
    setView("landing");
    showToast("success", "Oturum kapatıldı", "Hesabınızdan güvenli şekilde çıkış yapıldı.");
  }

  async function handleLanguageChange(nextLanguage: "tr" | "en") {
    if (!isAuthenticated) {
      setLanguage(nextLanguage);
      return;
    }

    const previous = language;
    setLanguage(nextLanguage);
    try {
      await updatePreferredLanguage(nextLanguage);
    } catch (error) {
      setLanguage(previous);
      const title = previous === "tr" ? "Dil tercihi kaydedilemedi" : "Could not save language";
      const detail =
        error instanceof Error ? error.message : previous === "tr" ? "Sunucuya bağlanılamadı veya oturum süresi doldu." : "Network error or session expired.";
      showToast("error", title, detail);
    }
  }

  function goToLandingFromDashboard() {
    setView("landing");
    window.history.replaceState({}, "", "/");
  }

  function goSubscriptionFromTool() {
    setContentPanel("subscription");
    setActiveSidebar("subscription");
  }

  async function submitCurrentFeature(event: React.FormEvent<HTMLFormElement>) {
    // Seçili PDF özelliği için gönderimi işler; istemci doğrulaması, kota ve doğru API çağrısını birleştirir.
    // Tüm modüllerin tek submit boru hattı olması bakım ve hata ayıklamayı sadeleştirir.
    // Bu akış bölünürse kota veya dosya kontrolü atlanırsa sunucu hataları veya tutarsız UX oluşur.
    event.preventDefault();

    if (uploads.length === 0) {
      showToast("error", "Dosya seçilmedi", "Lütfen önce işlenecek dosyayı seçin.");
      return;
    }

    if (selectedFeature.id === "split") {
      const fmt = validatePagesFormat(pagesText, language);
      const maxP = uploads[0]?.pageCount ?? null;
      let over = validatePagesMax(pagesText, maxP, language);
      if (
        !fmt &&
        !over &&
        Boolean(uploads[0]?.encrypted) &&
        maxP === null &&
        pagesText.trim()
      ) {
        over = W.validationPagesNeedPassword;
      }
      const pageValidation = fmt || over || (!pagesText.trim() ? W.validationPagesRequired : "");
      setPagesError(pageValidation);
      if (pageValidation) {
        showToast("error", language === "tr" ? "Sayfa numaraları geçersiz" : "Invalid page numbers", pageValidation);
        return;
      }
    }

    if (showSplitPasswordField && !password.trim()) {
      showToast("error", "Kaynak PDF şifresi gerekli", "Seçilen PDF şifreli olduğu için şifre alanını doldurmanız gerekiyor.");
      return;
    }

    if (showEncryptSourcePasswordField && !inputPassword.trim()) {
      showToast("error", "Kaynak PDF şifresi gerekli", "Seçilen PDF şifreli olduğu için kaynak PDF şifresini girin.");
      return;
    }

    if (selectedFeature.id === "encrypt" && !outputPassword.trim()) {
      showToast("error", "Yeni PDF şifresi gerekli", "Şifreli PDF oluşturmak için yeni parola alanını doldurun.");
      return;
    }

    if (mergeHasMissingPasswords) {
      showToast(
        "error",
        language === "tr" ? "Şifre doğrulaması gerekli" : "Password verification required",
        language === "tr"
          ? "Şifreli PDF’ler için parolayı girin ve her dosyanın yanındaki «Parolayı doğrula» ile onaylayın."
          : "For password-protected PDFs, enter the password and tap «Verify password» next to each file.",
      );
      return;
    }

    if (subscriptionSummary && subscriptionSummary.usage.dailyLimit !== null && subscriptionSummary.usage.remainingToday === 0) {
      showToast("error", "Günlük limit doldu", "Bugünkü işlem hakkınızı kullandınız. Devam etmek için planınızı yükseltin.");
      return;
    }

    if (!accessToken) {
      showToast("error", "Oturum gerekli", "İşlem için yeniden giriş yapın.");
      return;
    }

    try {
      await assertFeatureBeforeAction(accessToken, selectedFeature.id);
    } catch (error) {
      showToast("error", "İşlem reddedildi", error instanceof Error ? error.message : "Plan veya günlük limit doğrulanamadı.");
      return;
    }

    try {
      setSubmitting(true);
      clearToast();

      if (selectedFeature.id === "merge") {
        const formData = new FormData();
        const passwordList: string[] = [];
        uploads.forEach((item) => {
          formData.append("files", item.file);
          passwordList.push(item.password.trim());
        });
        formData.append("passwords_json", JSON.stringify(passwordList));

        setMergeJob({
          id: MERGE_JOB_PENDING_ID,
          status: "queued",
          message: "",
          where: "",
          current: 0,
          total: 1,
          percent: 0,
          elapsed_seconds: 0,
          error: null,
          ready: false,
        });
        try {
          const { job_id } = await createMergeJob(formData);
          setMergeJob((prev) =>
            prev && prev.id === MERGE_JOB_PENDING_ID ? { ...prev, id: job_id, message: "Sıraya alındı." } : prev,
          );
        } catch (error) {
          setMergeJob(null);
          setSubmitting(false);
          showToast(
            "error",
            language === "tr" ? "Birleştirme başlatılamadı" : "Could not start merge",
            error instanceof Error ? error.message : language === "tr" ? "İstek gönderilemedi." : "Request failed.",
          );
        }
        return;
      }

      const formData = new FormData();
      formData.append("file", uploads[0].file);

      switch (selectedFeature.id) {
        case "split":
          formData.append("pages_text", pagesText.trim());
          formData.append("mode", splitMode);
          formData.append("password", password.trim());
          break;
        case "pdf-to-word":
        case "pdf-to-excel":
        case "compress":
          formData.append("password", password.trim());
          break;
        case "encrypt":
          formData.append("input_password", inputPassword.trim());
          formData.append("user_password", outputPassword.trim());
          break;
        default:
          break;
      }

      await downloadFromApi(selectedFeature.endpoint, formData, selectedFeature.fallbackFilename);
      await syncUsageAfterSuccess(selectedFeature.id);
      showToast("success", "İşlem tamamlandı", "Çıktı dosyası başarıyla indirildi.");
      resetForm(true);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu.";
      showToast("error", "İşlem başarısız", detail);
    } finally {
      if (selectedFeature.id !== "merge") {
        setSubmitting(false);
      }
    }
  }

  function fileIdentityKey(file: File) {
    return `${file.name}::${file.size}`;
  }

  async function handleNewFiles(fileList: File[]) {
    const rawFiles = Array.from(fileList);
    const L = ws(language);
    const existingKeys = new Set(uploads.map((u) => fileIdentityKey(u.file)));
    const duplicates = rawFiles.filter((f) => existingKeys.has(fileIdentityKey(f)));
    const freshFiles = rawFiles.filter((f) => !existingKeys.has(fileIdentityKey(f)));

    if (selectedFeature.multiple && duplicates.length > 0) {
      showToast("info", L.mergeDuplicateFileTitle, L.mergeDuplicateFileDetail);
    }

    if (freshFiles.length === 0) {
      return;
    }

    const incomingItems = createUploadItems(freshFiles);
    const nextItems = selectedFeature.multiple ? [...uploads, ...incomingItems] : incomingItems;
    setUploads(nextItems);
    setPagesError("");
    clearToast();

    if (incomingItems.length === 0) {
      return;
    }

    if (!shouldInspectCurrentFeature) {
      return;
    }

    const token = inspectRunRef.current + 1;
    inspectRunRef.current = token;
    const withLoading = nextItems.map((item) =>
      incomingItems.some((incoming) => incoming.id === item.id) ? { ...item, inspecting: true } : item,
    );
    setUploads(withLoading);

    const inspectedNewItems = await Promise.all(
      incomingItems.map(async (item) => {
        try {
          const result = await inspectPdf(item.file);
          return {
            ...item,
            encrypted: Boolean(result.encrypted),
            inspecting: false,
            pageCount: result.page_count ?? null,
            mergePasswordVerified: false,
          };
        } catch (err) {
          const L2 = ws(language);
          showToast("error", L2.inspectFailedTitle, err instanceof Error ? err.message : L2.inspectFailedDetail);
          return {
            ...item,
            encrypted: false,
            inspecting: false,
            pageCount: null,
            mergePasswordVerified: false,
          };
        }
      }),
    );

    if (inspectRunRef.current !== token) {
      return;
    }

    setUploads((current) =>
      current.map((item) => inspectedNewItems.find((inspected) => inspected.id === item.id) ?? item),
    );
  }

  const pathname = typeof window !== "undefined" ? window.location.pathname.replace(/\/$/, "") || "/" : "/";
  const isLoginSuccessRoute = pathname === "/login-success";

  if (isLoginSuccessRoute) {
    return (
      <LoginSuccessPage
        completeOAuthLogin={completeOAuthLogin}
        clearSession={clearSession}
        onNavigateToDashboard={navigateToDashboardAfterOAuth}
      />
    );
  }

  if (view === "landing") {
    return (
      <>
        <LandingPage
          language={language}
          onLanguageChange={handleLanguageChange}
          windowsDownloadUrl={windowsDownloadUrl}
          onUseWebApp={openWorkspace}
          isAuthenticated={isAuthenticated}
          authGreeting={user ? userGreetingLine(user, language) : undefined}
          onLogin={() => {
            setAuthError("");
            setView("login");
          }}
          onRegister={() => {
            setAuthError("");
            setView("register");
          }}
          onOpenTerms={() => openLegalPage("terms")}
          onOpenPrivacy={() => openLegalPage("privacy")}
        />
        <CookieNotice
          language={language}
          visible={shouldShowCookieNotice}
          onAccept={acceptConsent}
          onOpenPrivacy={() => openLegalPage("privacy")}
        />
      </>
    );
  }

  if (view === "login" || view === "register") {
    return (
      <>
        <AuthPage
          mode={view}
          language={language}
          submitting={authSubmitting || isRestoring}
          serverError={authError}
          registrationSuccessBanner={registrationSuccessBanner}
          onDismissRegistrationSuccess={() => setRegistrationSuccessBanner(null)}
          onBack={() => {
            setAuthError("");
            setRegistrationSuccessBanner(null);
            setView("landing");
          }}
          onModeChange={(nextMode) => {
            setAuthError("");
            setView(nextMode);
          }}
          onSubmit={handleAuthSubmit}
          onOpenTerms={() => openLegalPage("terms")}
          onOpenPrivacy={() => openLegalPage("privacy")}
        />
        <CookieNotice
          language={language}
          visible={shouldShowCookieNotice}
          onAccept={acceptConsent}
          onOpenPrivacy={() => openLegalPage("privacy")}
        />
      </>
    );
  }

  if (view === "terms" || view === "privacy") {
    return (
      <>
        <LegalPage language={language} documentKey={view} onBack={closeLegalPage} />
        <CookieNotice
          language={language}
          visible={shouldShowCookieNotice}
          onAccept={acceptConsent}
          onOpenPrivacy={() => openLegalPage("privacy")}
        />
      </>
    );
  }

  if (isRestoring) {
    return (
      <>
        <div className="min-h-screen bg-nb-bg px-6 py-12 font-sans text-nb-text antialiased">
          <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-[28px] border border-white/[0.08] bg-nb-panel/55 px-10 py-16 text-center shadow-[0_50px_100px_-24px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">NB PDF TOOLS</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">Oturum doğrulanıyor</h1>
            <p className="mt-4 text-base leading-8 text-nb-muted">Güvenli erişim bilgileriniz kontrol ediliyor. Lütfen bekleyin.</p>
          </div>
        </div>
        <CookieNotice
          language={language}
          visible={shouldShowCookieNotice}
          onAccept={acceptConsent}
          onOpenPrivacy={() => openLegalPage("privacy")}
        />
      </>
    );
  }

  const contactCopy =
    language === "tr"
      ? {
          title: "İletişim",
          name: "Ad soyad",
          email: "E-posta",
          message: "Mesaj",
          submit: "Gönder",
          submitting: "Gönderiliyor…",
          close: "Kapat",
        }
      : {
          title: "Contact",
          name: "Name",
          email: "Email",
          message: "Message",
          submit: "Send",
          submitting: "Sending…",
          close: "Close",
        };

  if (!user) {
    return (
      <>
        <div className="min-h-screen bg-nb-bg px-6 py-12 font-sans text-nb-text antialiased">
          <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-nb-panel/55 px-10 py-16 text-center shadow-xl backdrop-blur-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">NB PDF TOOLS</p>
            <p className="mt-4 text-base text-nb-muted">Oturum bilgileri yükleniyor…</p>
          </div>
        </div>
        <CookieNotice
          language={language}
          visible={shouldShowCookieNotice}
          onAccept={acceptConsent}
          onOpenPrivacy={() => openLegalPage("privacy")}
        />
      </>
    );
  }

  return (
    <div className="app-shell">
      {contactModalOpen ? (
        <div
          className="contact-modal-backdrop"
          role="presentation"
          onClick={closeContactModal}
        >
          <div
            className="contact-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="contact-modal__header">
              <h2 id="contact-modal-title">{contactCopy.title}</h2>
              <button type="button" className="contact-modal__close" onClick={closeContactModal} aria-label={contactCopy.close}>
                ×
              </button>
            </div>
            <form className="contact-modal__form" onSubmit={handleContactModalSubmit}>
              <label className="field">
                <span>{contactCopy.name}</span>
                <input
                  type="text"
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  autoComplete="name"
                  disabled={contactSubmitting}
                />
              </label>
              <label className="field">
                <span>{contactCopy.email}</span>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  autoComplete="email"
                  disabled={contactSubmitting}
                />
              </label>
              <label className="field field--full">
                <span>{contactCopy.message}</span>
                <textarea
                  value={contactMessage}
                  onChange={(event) => setContactMessage(event.target.value)}
                  rows={5}
                  disabled={contactSubmitting}
                />
              </label>
              <label className="contact-modal__honeypot" aria-hidden="true">
                <span>Website</span>
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={contactWebsite}
                  onChange={(event) => setContactWebsite(event.target.value)}
                />
              </label>
              {contactError ? <p className="field-error">{contactError}</p> : null}
              <button className="primary-action" type="submit" disabled={contactSubmitting}>
                {contactSubmitting ? contactCopy.submitting : contactCopy.submit}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <ChangePasswordModal
        open={changePasswordModalOpen}
        onClose={() => setChangePasswordModalOpen(false)}
        user={user}
        language={language}
        changePassword={changePassword}
        showToast={showToast}
      />

      {toast ? (
        <div className={`toast toast--${toast.type}`}>
          <div className="toast__title">{toast.title}</div>
          <div className="toast__detail">{toast.detail}</div>
        </div>
      ) : null}

      <DashboardTopNav
        user={user}
        language={language}
        onLogoClick={handleDashboardLogoClick}
        onProfile={handleNavProfile}
        onPassword={handleNavPassword}
        onLogout={() => void handleLogout()}
      />
      <DashboardSidebar
        active={activeSidebar}
        onSelect={handleSidebarSelect}
        language={language}
        onLanguageChange={(lang) => void handleLanguageChange(lang)}
        onGoHome={goToLandingFromDashboard}
        lockedFeatures={lockedFeatures}
        subscriptionSummary={subscriptionSummary}
        userRole={user?.role}
      />
      {showUsageQuota && !bottomToolProgressActive ? (
        <div className="pointer-events-none fixed bottom-4 left-4 z-30 md:hidden">
          <div className="pointer-events-auto rounded-xl border border-white/[0.1] bg-nb-bg-elevated/95 px-3 py-2 text-xs shadow-lg backdrop-blur-md">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-nb-muted">{ws(language).usageRemainingShort}</p>
            <p className="mt-0.5 font-semibold tabular-nums text-nb-accent">
              {subscriptionSummary!.usage.remainingToday ?? "—"} / {subscriptionSummary!.usage.dailyLimit}
            </p>
          </div>
        </div>
      ) : null}
      <div
        className={`min-h-screen bg-nb-bg pt-14 md:pl-60 ${bottomToolProgressActive ? "pb-32 md:pb-36" : "pb-10"}`}
      >
        <DashboardSidebarMobileRail
          active={activeSidebar}
          onSelect={handleSidebarSelect}
          language={language}
          onLanguageChange={(lang) => void handleLanguageChange(lang)}
          onGoHome={goToLandingFromDashboard}
          lockedFeatures={lockedFeatures}
        />
        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
          {contentPanel === "subscription" ? (
        <section className="subscription-card">
          <div className="subscription-card__header">
            <div>
              <p className="section-kicker">{language === "tr" ? "ABONELİK DURUMU" : "SUBSCRIPTION"}</p>
              <h2>
                {language === "tr"
                  ? "Planınızı ve kullanım hakkınızı buradan yönetin."
                  : "Manage your plan and daily usage here."}
              </h2>
            </div>
            {subscriptionSummary ? (
              <div className="subscription-badge-group">
                <span className="subscription-badge subscription-badge--active">
                  {localizedPlanDisplayName(subscriptionSummary.currentPlan.name, language)}
                </span>
                <span className="subscription-badge">
                  {subscriptionSummary.usage.dailyLimit === null
                    ? language === "tr"
                      ? "Sınırsız kullanım"
                      : "Unlimited"
                    : language === "tr"
                      ? `${subscriptionSummary.usage.usedToday}/${subscriptionSummary.usage.dailyLimit} işlem`
                      : `${subscriptionSummary.usage.usedToday}/${subscriptionSummary.usage.dailyLimit} ops`}
                </span>
              </div>
            ) : null}
          </div>

          {subscriptionLoading ? (
            <p className="muted-text">{language === "tr" ? "Abonelik bilgileri yükleniyor..." : "Loading subscription..."}</p>
          ) : subscriptionSummary ? (
            <>
              <div className="subscription-stats">
                <div className="subscription-stat">
                  <span>{language === "tr" ? "Aktif plan" : "Active plan"}</span>
                  <strong>{localizedPlanDisplayName(subscriptionSummary.currentPlan.name, language)}</strong>
                </div>
                <div className="subscription-stat">
                  <span>{language === "tr" ? "Bugünkü kullanım" : "Today's usage"}</span>
                  <strong>
                    {subscriptionSummary.usage.dailyLimit === null
                      ? language === "tr"
                        ? "Sınırsız"
                        : "Unlimited"
                      : `${subscriptionSummary.usage.usedToday} / ${subscriptionSummary.usage.dailyLimit}`}
                  </strong>
                </div>
                <div className="subscription-stat">
                  <span>{language === "tr" ? "Kalan hak" : "Remaining"}</span>
                  <strong>
                    {subscriptionSummary.usage.remainingToday === null
                      ? language === "tr"
                        ? "Sınırsız"
                        : "Unlimited"
                      : subscriptionSummary.usage.remainingToday}
                  </strong>
                </div>
              </div>

              {subscriptionSummary.usage.usedToday === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    compact
                    title={language === "tr" ? "Bugün kullanım yok" : "No usage today"}
                    hint={
                      language === "tr"
                        ? "Bugün henüz bir PDF işlemi çalıştırmadınız. Sol menüden araç seçerek başlayabilirsiniz."
                        : "You have not run a PDF operation today. Pick a tool from the menu to get started."
                    }
                  />
                </div>
              ) : null}

              <div className="subscription-plan-grid">
                {plans.map((plan) => {
                  const isCurrent = subscriptionSummary.currentPlan.name === plan.name;
                  return (
                    <article key={plan.name} className={`subscription-plan ${isCurrent ? "subscription-plan--active" : ""}`}>
                      <div className="subscription-plan__top">
                        <div>
                          <h3>{localizedPlanDisplayName(plan.name, language)}</h3>
                          <p>{localizedPlanDescription(plan.name, language)}</p>
                        </div>
                        {isCurrent ? (
                          <span className="subscription-badge subscription-badge--active">{language === "tr" ? "Aktif" : "Current"}</span>
                        ) : null}
                      </div>
                      <div className="subscription-plan__meta">
                        <span>
                          {plan.dailyLimit === null
                            ? language === "tr"
                              ? "Limitsiz işlem"
                              : "Unlimited operations"
                            : language === "tr"
                              ? `Günlük ${plan.dailyLimit} işlem`
                              : `${plan.dailyLimit} ops/day`}
                        </span>
                        <span>
                          {plan.multiUser
                            ? language === "tr"
                              ? "Çok kullanıcılı yapı"
                              : "Multi-user"
                            : language === "tr"
                              ? "Tek kullanıcı"
                              : "Single user"}
                        </span>
                      </div>
                      <p className="subscription-plan__note muted-text text-sm">
                        {isCurrent
                          ? language === "tr"
                            ? "Mevcut planınız."
                            : "Your current plan."
                          : language === "tr"
                            ? "Plan değişikliği yalnızca ödeme veya satış ekibi üzerinden yapılır; buradan seçilemez."
                            : "Plan changes are handled via billing or sales; not selectable here."}
                      </p>
                    </article>
                  );
                })}
              </div>

              {subscriptionSummary.currentPlan.name === "FREE" ? (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    className="subscription-plan__action subscription-plan__action--upgrade"
                    onClick={() => {
                      const href = (import.meta.env.VITE_UPGRADE_URL as string | undefined)?.trim() ?? "";
                      if (href) {
                        window.open(href, "_blank", "noopener,noreferrer");
                      } else {
                        showToast(
                          "info",
                          language === "tr" ? "Ödeme yakında" : "Payment coming soon",
                          language === "tr"
                            ? "Pro satın alma bağlantısı henüz yapılandırılmadı. İletişim formundan bize yazabilirsiniz."
                            : "Pro checkout is not configured yet. You can reach us via the contact form.",
                        );
                        openContactModal();
                      }
                    }}
                  >
                    {language === "tr" ? "Pro'ya yükselt" : "Upgrade to Pro"}
                  </button>
                  <span className="text-sm text-nb-muted">
                    {language === "tr"
                      ? "Plan yükseltmek için ödeme sayfasına gidin; manuel plan seçimi devre dışıdır."
                      : "Go to the billing page to upgrade; manual plan picking is disabled."}
                  </span>
                </div>
              ) : null}

              {subscriptionSummary.currentPlan.name === "PRO" ? (
                <p className="mt-4 text-sm text-nb-muted">
                  {language === "tr"
                    ? "İşletme (Business) planı veya ek lisanslar için iletişim formundan satış ekibine ulaşın."
                    : "For Business or extra licenses, contact sales via the contact form."}
                </p>
              ) : null}
            </>
          ) : (
            <p className="muted-text">
              {language === "tr" ? "Abonelik özeti henüz yüklenemedi." : "Subscription summary could not be loaded."}
            </p>
          )}
        </section>
          ) : null}

          {contentPanel === "profile" ? (
            <UserProfilePanel
              user={user}
              language={language}
              updateProfile={updateProfile}
              showToast={showToast}
              onOpenChangePassword={() => setChangePasswordModalOpen(true)}
            />
          ) : null}

          {contentPanel === "tool" ? (
            <>
              <section className="workspace-card relative overflow-x-hidden">
          <div className="workspace-card__header">
            <div>
              <p className="section-kicker">{selectedFeature.title}</p>
              <h2>{selectedFeature.description}</h2>
            </div>
          </div>

          <div className="relative min-h-[280px]">
            <div
              className={
                !selectedFeatureAllowed
                  ? "pointer-events-none blur-[3px] transition-[filter] duration-200"
                  : undefined
              }
            >
              <form className="tool-form" onSubmit={submitCurrentFeature}>
            <label className="field">
              <span>{W.filePick}</span>
              <div className="file-picker-row flex-wrap">
                <button className="file-picker-button" type="button" onClick={triggerFilePicker}>
                  {pickerButtonText}
                </button>
                <span className="file-picker-note">
                  {selectedFeature.multiple
                    ? uploads.length > 0
                      ? W.filePickNoteAppend
                      : W.filePickNoteMulti
                    : W.filePickNoteSingle}
                </span>
              </div>
              <input
                key={selectedFeatureId}
                ref={fileInputRef}
                className="hidden-file-input"
                type="file"
                accept={selectedFeature.accept}
                multiple={Boolean(selectedFeature.multiple)}
                onChange={onFilesChange}
              />
            </label>

            {selectedFeature.id === "split" ? (
              <>
                <label className="field">
                  <span>{W.pagesLabel}</span>
                  <input
                    type="text"
                    value={pagesText}
                    disabled={splitInputDisabled}
                    onKeyDown={(event) => {
                      const allowedKeys = [
                        "Backspace",
                        "Delete",
                        "ArrowLeft",
                        "ArrowRight",
                        "Tab",
                        ",",
                        "-",
                        " ",
                        "Home",
                        "End",
                      ];
                      if (allowedKeys.includes(event.key)) {
                        return;
                      }
                      if (!/^\d$/.test(event.key)) {
                        event.preventDefault();
                      }
                    }}
                    onChange={(event) => {
                      const sanitized = event.target.value.replace(/[^\d,\-\s]/g, "");
                      setPagesText(sanitized);
                      const fmt = validatePagesFormat(sanitized, language);
                      const maxP = uploads[0]?.pageCount ?? null;
                      let over = validatePagesMax(sanitized, maxP, language);
                      if (
                        !fmt &&
                        !over &&
                        Boolean(uploads[0]?.encrypted) &&
                        maxP === null &&
                        sanitized.trim()
                      ) {
                        over = W.validationPagesNeedPassword;
                      }
                      setPagesError(fmt || over);
                    }}
                    placeholder={W.pagesPlaceholder}
                  />
                  {pagesError ? <span className="field-error">{pagesError}</span> : null}
                </label>

                <label className="field">
                  <span>{W.splitModeLabel}</span>
                  <select value={splitMode} onChange={(event) => setSplitMode(event.target.value)}>
                    <option value="single">{W.splitModeSingle}</option>
                    <option value="separate">{W.splitModeSeparate}</option>
                  </select>
                  <span className="field-hint">{splitModeDescription}</span>
                </label>
              </>
            ) : null}

            {showSplitPasswordField ? (
              <label className="field">
                <span>{W.sourcePassword}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={language === "tr" ? "PDF parolası" : "PDF password"}
                />
                <span className="field-hint">{W.sourcePasswordHint}</span>
              </label>
            ) : null}

            {selectedFeature.id === "encrypt" ? (
              <>
                {showEncryptSourcePasswordField ? (
                  <label className="field field--full">
                    <span>{W.sourcePassword}</span>
                    <input
                      type="password"
                      value={inputPassword}
                      onChange={(event) => setInputPassword(event.target.value)}
                      placeholder={language === "tr" ? "Mevcut PDF parolası" : "Current PDF password"}
                    />
                    <span className="field-hint">{W.sourcePasswordHint}</span>
                  </label>
                ) : null}

                <label className="field field--full">
                  <span>{W.newPdfPassword}</span>
                  <input
                    type="password"
                    value={outputPassword}
                    disabled={uploads.length === 0}
                    onChange={(event) => setOutputPassword(event.target.value)}
                    placeholder={uploads.length === 0 ? "" : W.newPdfPasswordPh}
                  />
                </label>
              </>
            ) : null}

            <div className="selected-files">
              <div className="selected-files__header">
                <div className="selected-files__title-row">
                  <p>{W.selectedFiles}</p>
                  {selectedFeature.id === "merge" && uploads.length > 0 ? (
                    <button
                      type="button"
                      className="nb-transition shrink-0 rounded-xl border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-200/95 hover:border-rose-400/55 hover:bg-rose-950/50 sm:text-sm"
                      onClick={clearAllUploads}
                    >
                      {W.mergeClearAll}
                    </button>
                  ) : null}
                </div>
                {selectedFeature.id === "merge" && uploads.length > 0 ? (
                  <span className="selected-files__info">{W.mergeReorderHint}</span>
                ) : null}
              </div>
              {uploads.length === 0 ? (
                <EmptyState title={W.emptyStateTitle} hint={W.emptyStateHint} />
              ) : (
                <div ref={mergeListScrollRef} className="selected-files__list">
                  {uploads.map((item, index) => {
                    const dragFromIdx =
                      mergePointerDraggingId !== null ? uploads.findIndex((u) => u.id === mergePointerDraggingId) : -1;
                    const dragToIdx = mergeDragOverIndex ?? dragFromIdx;
                    const previewOff =
                      mergePointerDraggingId && dragFromIdx >= 0
                        ? getReorderPreviewOffset(index, dragFromIdx, dragToIdx, mergeDragSlotPx)
                        : 0;
                    return (
                    <div
                      key={item.id}
                      data-merge-row-index={index}
                      className={`selected-file-card ${selectedFeature.id === "merge" ? "draggable merge-row-pointer" : ""} ${
                        mergePointerDraggingId === item.id ? "selected-file-card--drag-source" : ""
                      } ${
                        mergeDragOverIndex === index &&
                        mergePointerDraggingId &&
                        mergePointerDraggingId !== item.id
                          ? "selected-file-card--drop-target"
                          : ""
                      } ${mergeSnapId === item.id ? "selected-file-card--snap" : ""}`}
                      style={
                        mergePointerDraggingId && dragFromIdx >= 0
                          ? {
                              transform: `translateY(${previewOff}px)`,
                              transition:
                                index === dragFromIdx
                                  ? "none"
                                  : "transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
                            }
                          : undefined
                      }
                      onPointerDown={(e) => handleMergeRowPointerDown(e, index, item.id)}
                    >
                      <div className="selected-file-card__main">
                        <div className="selected-file-card__text">
                          <strong>{item.file.name}</strong>
                          <div className="selected-file-card__meta">
                            {item.inspecting ? <span>{W.inspecting}</span> : null}
                            {!item.inspecting && item.encrypted ? <span className="warning-text">{W.encryptedBadge}</span> : null}
                            {!item.inspecting && !item.encrypted ? <span>{W.ready}</span> : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {selectedFeature.id === "merge" ? (
                            <>
                              <button
                                type="button"
                                draggable={false}
                                className="nb-transition rounded-lg border border-white/[0.12] bg-nb-panel/80 px-2 py-1 text-xs font-semibold text-nb-text hover:border-nb-primary/40 disabled:opacity-35"
                                disabled={index === 0}
                                onClick={() => moveUploadUp(index)}
                                aria-label={W.up}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                draggable={false}
                                className="nb-transition rounded-lg border border-white/[0.12] bg-nb-panel/80 px-2 py-1 text-xs font-semibold text-nb-text hover:border-nb-primary/40 disabled:opacity-35"
                                disabled={index >= uploads.length - 1}
                                onClick={() => moveUploadDown(index)}
                                aria-label={W.down}
                              >
                                ↓
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            draggable={false}
                            className="remove-button"
                            onClick={() => removeUpload(item.id)}
                          >
                            {W.remove}
                          </button>
                        </div>
                      </div>

                      {selectedFeature.id === "merge" && item.encrypted ? (
                        <div className="mt-3 rounded-xl border border-white/[0.1] bg-nb-panel/50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-nb-muted">
                            {language === "tr" ? "Şifre gerekli" : "Password required"}
                          </p>
                          <p className="mt-1 text-sm leading-snug text-nb-text/90">{W.mergeEncryptedAlert}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <input
                              type="password"
                              className="min-w-[180px] flex-1 rounded-lg border border-white/12 bg-nb-bg/90 px-3 py-2.5 text-sm text-nb-text shadow-sm placeholder:text-nb-muted focus:border-nb-primary/45 focus:outline-none focus:ring-2 focus:ring-nb-primary/25"
                              value={item.password}
                              onChange={(event) => setUploadPassword(item.id, event.target.value)}
                              placeholder={W.perFilePasswordPh}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              className="nb-transition rounded-lg border border-nb-primary/35 bg-nb-primary/15 px-3 py-2.5 text-sm font-semibold text-nb-accent hover:bg-nb-primary/25 disabled:opacity-45"
                              disabled={mergeVerifyingId === item.id || !item.password.trim()}
                              onClick={() => void verifyMergeFilePassword(item.id)}
                            >
                              {mergeVerifyingId === item.id ? W.mergePasswordVerifying : W.mergePasswordConfirm}
                            </button>
                            {item.mergePasswordVerified ? (
                              <span
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/45 bg-emerald-950/40 text-emerald-300"
                                title={W.mergePasswordOk}
                                aria-label={W.mergePasswordOk}
                              >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                  />
                                </svg>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedFeature.id === "merge" && uploads.length > 0 && (toolFilesStillInspecting || mergeHasMissingPasswords) ? (
              <div className="merge-hint-banner" role="note">
                <span className="merge-hint-banner__dot" aria-hidden />
                <p className="merge-hint-banner__text">
                  {toolFilesStillInspecting ? W.mergeButtonHintInspecting : W.mergeButtonHintPassword}
                </p>
              </div>
            ) : null}

            <button className="primary-action" type="submit" disabled={submitDisabled}>
              {submitting ? W.processing : selectedFeature.buttonText}
            </button>
          </form>
            </div>
            {!selectedFeatureAllowed ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-nb-bg/70 px-5 text-center backdrop-blur-sm">
                <p className="text-base font-semibold text-nb-text">{W.proGateTitle}</p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-nb-muted">{W.proGateBody}</p>
                <button type="button" className="primary-action mt-5" onClick={goSubscriptionFromTool}>
                  {W.proGateCta}
                </button>
              </div>
            ) : null}
          </div>
        </section>
            </>
          ) : null}
        </div>
        {mergeProgressActive && mergeJob ? (
          <div className="merge-progress-fixed" role="status" aria-live="polite">
            <div className="merge-progress-fixed__inner">
              <div className="merge-progress-fixed__head">
                <strong className="merge-progress-fixed__title">
                  {mergeJob.status === "failed"
                    ? language === "tr"
                      ? "Birleştirme başarısız"
                      : "Merge failed"
                    : mergeJob.id === MERGE_JOB_PENDING_ID
                      ? W.mergeProgressStarting
                      : mergeJob.where || W.mergeProgressPreparing}
                </strong>
                <span className="merge-progress-fixed__pct">
                  {mergeProgressIndeterminate ? "…" : `%${mergeJob.percent}`}
                </span>
              </div>
              <div
                className={`progress-bar progress-bar--merge ${mergeProgressIndeterminate ? "progress-bar--indeterminate" : ""} ${mergeJob.status === "failed" ? "progress-bar--failed" : ""}`}
              >
                {mergeProgressIndeterminate ? (
                  <div className="progress-bar__fill progress-bar__fill--indeterminate" />
                ) : (
                  <div
                    className="progress-bar__fill"
                    style={{
                      width: `${mergeJob.status === "failed" ? 100 : Math.max(mergeJob.percent, 2)}%`,
                    }}
                  />
                )}
              </div>
              <div className="merge-progress-fixed__meta">
                <span>
                  {W.mergeStatus}: {mergeJob.current}/{mergeJob.total}
                </span>
                {mergeEtaSeconds !== null && mergeJob.status === "running" && !mergeProgressIndeterminate ? (
                  <span className="merge-progress-fixed__eta">{W.mergeEtaLine(mergeEtaSeconds)}</span>
                ) : null}
              </div>
              {mergeJob.status === "failed" && mergeJob.error ? (
                <p className="merge-progress-fixed__err">{mergeJob.error}</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {genericToolProgressActive ? (
          <div className="merge-progress-fixed merge-progress-fixed--generic" role="status" aria-live="polite">
            <div className="merge-progress-fixed__inner">
              <div className="merge-progress-fixed__head">
                <strong className="merge-progress-fixed__title">{selectedFeature.title}</strong>
                <span className="merge-progress-fixed__pct">…</span>
              </div>
              <div className="progress-bar progress-bar--merge progress-bar--indeterminate">
                <div className="progress-bar__fill progress-bar__fill--indeterminate" />
              </div>
              <div className="merge-progress-fixed__meta merge-progress-fixed__meta--generic">
                <span>{W.toolProgressSub}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="footer-bar">
        <span>NB PDF Tools</span>
        <span>by NB Global Studio</span>
        <div className="footer-bar__right">
          <span>Web Edition</span>
          <button type="button" onClick={() => openLegalPage("terms")}>
            {language === "tr" ? "HİZMET ŞARTLARI" : "TERMS OF SERVICE"}
          </button>
          <button type="button" onClick={() => openLegalPage("privacy")}>
            {language === "tr" ? "GİZLİLİK POLİTİKASI" : "PRIVACY POLICY"}
          </button>
          <button type="button" onClick={openContactModal}>
            {language === "tr" ? "İLETİŞİM" : "CONTACT"}
          </button>
        </div>
      </footer>

      <CookieNotice
        language={language}
        visible={shouldShowCookieNotice}
        onAccept={acceptConsent}
        onOpenPrivacy={() => openLegalPage("privacy")}
      />
    </div>
  );
}

export default App;
