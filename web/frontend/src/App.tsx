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
import { SystemNotificationBanner } from "./components/common/SystemNotificationBanner";
import { DashboardSidebar, DashboardSidebarMobileRail, type SidebarToolId } from "./components/dashboard/DashboardSidebar";
import { DashboardTopNav } from "./components/dashboard/DashboardTopNav";
import { ChangePasswordModal } from "./components/dashboard/ChangePasswordModal";
import { AdminPanel } from "./admin/AdminPanel";
import { DelayConversionBanner } from "./components/dashboard/DelayConversionBanner";
import { ConversionUpgradeModal } from "./components/dashboard/ConversionUpgradeModal";
import { UpgradeModal } from "./components/dashboard/UpgradeModal";
import { UserProfilePanel } from "./components/dashboard/UserProfilePanel";
import { userGreetingLine } from "./components/dashboard/userDisplayName";
import { AuthPage } from "./components/auth/AuthPage";
import { ForgotPasswordPage } from "./components/auth/ForgotPasswordPage";
import { LoginSuccessPage } from "./components/auth/LoginSuccessPage";
import { LandingPage } from "./components/landing/LandingPage";
import { LegalPage } from "./components/legal/LegalPage";
import { createPaymentCheckout } from "./api/payment";
import {
  fetchSubscriptionStatus,
  fetchSubscriptionSummary,
  type FeatureKey,
  type PlanDefinition,
  type SubscriptionStatus,
  type SaasFrictionPayload,
  type SubscriptionSummary,
} from "./api/subscription";
import {
  canAutoShowConversionModal,
  conversionModalAutoQualifies,
  conversionModalClickThroughRate,
  CONV_MODAL_HEAVY_DELAY_MS,
  CONV_MODAL_SNOOZE_MS,
  CONV_MODAL_SNOOZE_UNTIL_KEY,
  HEAVY_CONVERSION_FEATURES,
  pushConversionModalAnalytics,
  recordConversionModalDismiss,
  recordConversionModalPrimaryClick,
  recordConversionModalShown,
  type ConversionFrictionSignal,
} from "./lib/conversionModalTriggers";
import { translateAuthApiMessage } from "./i18n/auth";
import { localizedPlanDescription, localizedPlanDisplayName } from "./i18n/plans";
import {
  computeUpgradeNudgeTierWeb,
  featureCopy,
  sidebarToolLabel,
  validatePagesFormat,
  validatePagesMax,
  ws,
} from "./i18n/workspace";
import { getCmsWorkspaceBanner } from "./lib/landingCmsMerge";
import { buildWorkspaceFeaturesFromCms, type WorkspaceFeatureUi } from "./lib/workspaceFeatures";
import { useAnalyticsTracking } from "./hooks/useAnalyticsTracking";
import { useAuthSession } from "./hooks/useAuthSession";
import { useSettings } from "./hooks/useSettings";
import { formatRegionalPlanPrice } from "./lib/formatRegionalPrice";
import { useCookieConsent } from "./hooks/useCookieConsent";
import { useErrorLogging } from "./hooks/useErrorLogging";
import { usePreferredLanguage } from "./hooks/usePreferredLanguage";

type FeatureId = FeatureKey;

type NonLegalView = "landing" | "login" | "register" | "forgot_password" | "web" | "admin";
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

type Feature = WorkspaceFeatureUi;

// PDF ön incelemesi (şifreli mi) gerektiren modül kimlikleri; inspect isteği bu listeye göre tetiklenir.
// Parola alanlarının görünürlüğü modül bazında olduğundan hangi işlemlerin inceleme istediği açıkça seçilmelidir.
// Liste backend veya UI ile senkron bozulursa şifreli dosyada parola alanı çıkmaz veya gereksiz istek atılır.
const pdfInspectionFeatures: FeatureId[] = ["split", "merge", "pdf-to-word", "pdf-to-excel", "compress", "encrypt"];

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

function formatFileSize(bytes: number): string {
  const n = Math.max(0, bytes);
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

/** UI-only heuristic for typical PDF recompression bands (not a server guarantee). */
function compressEstimatePercentRange(bytes: number): { min: number; max: number } {
  if (bytes < 80 * 1024) return { min: 5, max: 18 };
  if (bytes < 512 * 1024) return { min: 10, max: 28 };
  if (bytes < 5 * 1024 * 1024) return { min: 15, max: 38 };
  return { min: 18, max: 45 };
}

function genericToolPhaseLabel(
  featureId: FeatureId,
  percent: number,
  indeterminate: boolean,
  W: ReturnType<typeof ws>,
  freeQueuePhase: boolean,
): string {
  if (freeQueuePhase) {
    if (indeterminate) {
      return W.toolProgressPhaseQueueFree;
    }
    if (percent < 22) {
      return W.toolProgressPhaseHandoff;
    }
  }
  if (indeterminate) {
    return W.toolProgressPhaseAnalyzing;
  }
  if (percent < 30) {
    return W.toolProgressPhaseAnalyzing;
  }
  if (percent < 82) {
    if (featureId === "compress") {
      return W.toolProgressPhaseCompressing;
    }
    return W.toolProgressPhaseProcessing;
  }
  return W.toolProgressPhaseFinishing;
}

function UpgradeNudgeInline({
  tier,
  W,
  onContinueFree,
  onUpgrade,
}: {
  tier: 1 | 2 | 3;
  W: ReturnType<typeof ws>;
  onContinueFree: () => void;
  onUpgrade: () => void;
}) {
  return (
    <div
      className="mt-3 rounded-xl border border-cyan-500/25 bg-gradient-to-br from-cyan-950/45 to-nb-bg-elevated/35 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      role="region"
      aria-label={W.upgradeNudgeAria}
    >
      <p className="text-[12px] font-medium leading-relaxed text-cyan-100/90">{W.upgradeNudgeTierBody(tier)}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="nb-transition rounded-lg border border-white/12 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-nb-muted hover:border-cyan-500/35 hover:bg-cyan-500/10 hover:text-cyan-100"
          onClick={onContinueFree}
        >
          {W.upgradeNudgeContinueFree}
        </button>
        <button
          type="button"
          className="nb-transition rounded-lg border border-cyan-400/40 bg-cyan-500/12 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-cyan-50 hover:bg-cyan-500/22"
          onClick={onUpgrade}
        >
          {W.upgradeNudgeUpgradeInstant}
        </button>
      </div>
    </div>
  );
}

function mergeToolPhaseLabel(job: MergeJobStatus, indeterminate: boolean, W: ReturnType<typeof ws>): string {
  if (job.status === "failed") {
    return "";
  }
  if (indeterminate) {
    return W.toolProgressPhaseAnalyzing;
  }
  const p = job.percent;
  if (p < 32) {
    return W.toolProgressPhaseAnalyzing;
  }
  if (p < 78) {
    return W.toolProgressPhaseMerging;
  }
  return W.toolProgressPhaseFinishing;
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
    case "forgot_password":
      return "auth-forgot-password";
    case "terms":
      return "legal-terms";
    case "privacy":
      return "legal-privacy";
    case "web":
      return "workspace";
    case "admin":
      return "admin-panel";
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
    case "forgot_password":
      return "/forgot-password";
    case "terms":
      return "/terms";
    case "privacy":
      return "/privacy";
    case "web":
      return "/workspace";
    case "admin":
      return "/admin";
    default:
      return "/";
  }
}

/** İlk paint'te URL ile aynı ekranı göstermek için (ör. /login, /workspace, ?view=register). */
function getInitialViewFromLocation(): AppView {
  if (typeof window === "undefined") {
    return "landing";
  }
  const rawPath = window.location.pathname.replace(/\/$/, "") || "/";
  if (rawPath === "/login-success" || rawPath === "/login-error") {
    return "landing";
  }
  switch (rawPath) {
    case "/login":
      return "login";
    case "/register":
      return "register";
    case "/forgot-password":
      return "forgot_password";
    case "/terms":
      return "terms";
    case "/privacy":
      return "privacy";
    case "/workspace":
      return "web";
    case "/admin":
      return "admin";
    default:
      break;
  }
  const requestedView = new URLSearchParams(window.location.search).get("view");
  if (
    requestedView === "login" ||
    requestedView === "register" ||
    requestedView === "forgot_password" ||
    requestedView === "web" ||
    requestedView === "admin" ||
    requestedView === "terms" ||
    requestedView === "privacy"
  ) {
    return requestedView;
  }
  return "landing";
}

function App() {
  const { language, setLanguage, detectInitialLanguage } = usePreferredLanguage();
  const {
    user,
    accessToken,
    isAuthenticated,
    isRestoring,
    logout,
    login,
    register,
    updatePreferredLanguage,
    updateProfile,
    changePassword,
    setInitialPassword,
    completeOAuthLogin,
    clearSession,
    refreshSession,
  } = useAuthSession();
  const { hasConsent, isReady: isCookieConsentReady, acceptConsent } = useCookieConsent();
  const { cms, site, plans, TOOLSPublic, flags, pricing } = useSettings();
  const [view, setView] = useState<AppView>(getInitialViewFromLocation);
  const [legalBackView, setLegalBackView] = useState<NonLegalView>("landing");
  const [selectedFeatureId, setSelectedFeatureId] = useState<FeatureId>("split");
  const [contentPanel, setContentPanel] = useState<ContentPanel>("tool");
  const [activeSidebar, setActiveSidebar] = useState<SidebarToolId>("split");
  const [submitting, setSubmitting] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [registrationSuccessBanner, setRegistrationSuccessBanner] = useState<string | null>(null);
  const [subscriptionSummary, setSubscriptionSummary] = useState<SubscriptionSummary | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [password, setPassword] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [pagesText, setPagesText] = useState("");
  const [pagesError, setPagesError] = useState("");
  const [splitMode, setSplitMode] = useState("single");
  const [outputPassword, setOutputPassword] = useState("");
  const [mergeJob, setMergeJob] = useState<MergeJobStatus | null>(null);
  /** Birleştirme dışı araçlarda ETA / süre göstergesi için başlangıç zamanı ve dosya boyutu. */
  const [toolRunStartedAt, setToolRunStartedAt] = useState<number | null>(null);
  const [toolRunFileBytes, setToolRunFileBytes] = useState(0);
  const [toolRunClock, setToolRunClock] = useState(0);
  const [toolProgressSuccess, setToolProgressSuccess] = useState<{
    filename: string;
    featureTitle: string;
    replay?: () => void;
  } | null>(null);
  const toolProgressDisposeRef = useRef<(() => void) | null>(null);
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
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [conversionUpgradeModalOpen, setConversionUpgradeModalOpen] = useState(false);
  const [delayConversionFriction, setDelayConversionFriction] = useState<SaasFrictionPayload | null>(null);
  const conversionFrictionSignalRef = useRef<ConversionFrictionSignal | null>(null);
  const conversionModalShowSourceRef = useRef<"auto" | "manual">("manual");
  const [upgradeNudgeLoadingHidden, setUpgradeNudgeLoadingHidden] = useState(false);
  const [upgradeNudgePostSuccessHidden, setUpgradeNudgePostSuccessHidden] = useState(false);
  const [postRunUpgradeHintVisible, setPostRunUpgradeHintVisible] = useState(false);
  const [postRunUpgradeHintDismissed, setPostRunUpgradeHintDismissed] = useState(false);
  const frictionConversionFollowUpRef = useRef(false);
  const subscriptionSummaryRef = useRef<SubscriptionSummary | null>(null);
  const userRef = useRef(user);
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
    const url = new URL(window.location.href);
    url.pathname = "/workspace";
    url.searchParams.delete("token");
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
    setSelectedFeatureId("split");
    setActiveSidebar("split");
    setContentPanel("tool");
    setView("web");
  }, []);

  const workspaceFeatures = useMemo(
    () => buildWorkspaceFeaturesFromCms(language, cms, TOOLSPublic.disabledFeatures),
    [language, cms, TOOLSPublic.disabledFeatures],
  );

  const selectedFeature = useMemo((): Feature => {
    const hit =
      workspaceFeatures.find((feature) => feature.id === selectedFeatureId) ?? workspaceFeatures[0];
    if (hit) {
      return hit;
    }
    const fb = featureCopy(selectedFeatureId, language);
    return {
      id: selectedFeatureId,
      title: fb.title,
      icon: "📄",
      description: fb.description,
      endpoint: selectedFeatureId,
      buttonText: fb.button,
      accept: ".pdf,application/pdf",
      fallbackFilename: "çıktı.pdf",
    };
  }, [workspaceFeatures, selectedFeatureId, language]);

  const lockedFeatures = useMemo(() => {
    const next = new Set<FeatureKey>();
    if (!isAuthenticated || !subscriptionSummary || subscriptionLoading) {
      return next;
    }
    if (subscriptionSummary.currentPlan.name === "FREE") {
      return next;
    }
    for (const f of workspaceFeatures) {
      if (!subscriptionSummary.allowedFeatures.includes(f.id)) {
        next.add(f.id);
      }
    }
    return next;
  }, [isAuthenticated, subscriptionSummary, subscriptionLoading, workspaceFeatures]);

  const enabledToolIds = useMemo(() => workspaceFeatures.map((f) => f.id), [workspaceFeatures]);
  const resolveToolLabel = useCallback(
    (id: FeatureKey) => workspaceFeatures.find((f) => f.id === id)?.title ?? sidebarToolLabel(id, language),
    [workspaceFeatures, language],
  );

  const proTryLine = useMemo(() => formatRegionalPlanPrice(pricing, "proMonthly", language), [pricing, language]);
  const businessTryLine = useMemo(() => formatRegionalPlanPrice(pricing, "basicMonthly", language), [pricing, language]);
  const proAnnualLine = useMemo(() => formatRegionalPlanPrice(pricing, "proAnnual", language), [pricing, language]);

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
    if (subscriptionSummary.currentPlan.name === "FREE") {
      return true;
    }
    return subscriptionSummary.allowedFeatures.includes(selectedFeatureId);
  }, [isAuthenticated, subscriptionLoading, subscriptionSummary, selectedFeatureId]);
  const shouldShowCookieNotice = isCookieConsentReady && !hasConsent;
  const trackedView = getTrackedViewName(view);
  const trackedPath = getTrackedPath(view);
  const workspaceBanner = useMemo(() => getCmsWorkspaceBanner(cms), [cms]);
  const serverAnalyticsEnabled = site.analyticsEnabled !== false;

  useEffect(() => {
    if (workspaceFeatures.length === 0) {
      return;
    }
    if (!workspaceFeatures.some((f) => f.id === selectedFeatureId)) {
      const first = workspaceFeatures[0]!.id;
      setSelectedFeatureId(first);
      setActiveSidebar(first);
    }
  }, [workspaceFeatures, selectedFeatureId]);

  useEffect(() => {
    setDelayConversionFriction(null);
  }, [selectedFeatureId]);

  useAnalyticsTracking({
    enabled: hasConsent,
    serverAnalyticsEnabled,
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

  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const disposeToolProgressSuccess = useCallback(() => {
    toolProgressDisposeRef.current?.();
    toolProgressDisposeRef.current = null;
    setToolProgressSuccess(null);
  }, []);

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
      const result = await inspectPdf(item.file, pwd, accessToken);
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

  const refreshSubscriptionState = useCallback(async () => {
    if (!accessToken || !isAuthenticated) {
      return;
    }

    const [summary, status] = await Promise.all([
      fetchSubscriptionSummary(accessToken),
      fetchSubscriptionStatus(accessToken),
    ]);
    setSubscriptionSummary(summary);
    setSubscriptionStatus(status);
  }, [accessToken, isAuthenticated]);

  const openConversionUpgradeModalManual = useCallback(() => {
    conversionModalShowSourceRef.current = "manual";
    setConversionUpgradeModalOpen(true);
  }, []);

  const applySaasFriction = useCallback((friction: SaasFrictionPayload, featureId: FeatureKey) => {
    frictionConversionFollowUpRef.current = true;
    setDelayConversionFriction(friction);
    const dm = friction.delayMs ?? 0;
    if (dm >= CONV_MODAL_HEAVY_DELAY_MS || HEAVY_CONVERSION_FEATURES.has(featureId)) {
      conversionFrictionSignalRef.current = { at: Date.now(), featureId, delayMs: dm };
    }
  }, []);

  useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    if (path === "/login-error") {
      return;
    }
    /** OAuth tamamlandıktan sonra view=web iken /login-success’ten /workspace’e geçişe izin ver. */
    if (path === "/login-success" && view !== "web") {
      return;
    }
    if (view === "web" && (!isAuthenticated || isRestoring)) {
      return;
    }
    if (view === "admin" && (!isAuthenticated || isRestoring || user?.role !== "ADMIN")) {
      return;
    }
    const next = view === "admin" ? "/admin" : getTrackedPath(view);
    const current = path;
    const normalizedNext = next.replace(/\/$/, "") || "/";
    if (current !== normalizedNext) {
      const sp = new URLSearchParams(window.location.search);
      const keep = new URLSearchParams();
      for (const key of ["payment", "oauth_error", "email_verified"] as const) {
        const v = sp.get(key);
        if (v !== null) {
          keep.set(key, v);
        }
      }
      const qs = keep.toString();
      window.history.replaceState(
        {},
        "",
        `${next}${qs ? `?${qs}` : ""}${window.location.hash}`,
      );
    }
  }, [view, isAuthenticated, isRestoring, user?.role]);

  useEffect(() => {
    if (view !== "admin" || isRestoring || !isAuthenticated) {
      return;
    }
    if (user?.role !== "ADMIN") {
      setView("web");
      window.history.replaceState({}, "", "/workspace");
    }
  }, [view, isRestoring, isAuthenticated, user?.role]);

  useEffect(() => {
    if (!isAuthenticated || isRestoring || !accessToken) {
      return;
    }
    const url = new URL(window.location.href);
    const payment = url.searchParams.get("payment");
    if (!payment) {
      return;
    }
    url.searchParams.delete("payment");
    window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams.toString()}` : "") + url.hash);

    if (payment === "success") {
      void (async () => {
        await refreshSession();
        await refreshSubscriptionState();
        showToast(
          "success",
          language === "tr" ? "Ödeme tamamlandı" : "Payment complete",
          language === "tr" ? "Planınız güncellendi." : "Your plan has been updated.",
        );
      })();
      return;
    }

    if (payment === "failed") {
      showToast(
        "error",
        language === "tr" ? "Ödeme başarısız" : "Payment failed",
        language === "tr"
          ? "İşlem tamamlanamadı veya iptal edildi."
          : "The transaction could not be completed or was cancelled.",
      );
    }
  }, [isAuthenticated, isRestoring, accessToken, refreshSession, refreshSubscriptionState, language]);

  useEffect(() => {
    if (view === "register") {
      setRegistrationSuccessBanner(null);
    }
  }, [view]);

  useEffect(() => {
    resetForm(true);
    setMergeJob(null);
    setSubmitting(false);
    setToolRunStartedAt(null);
    setToolRunFileBytes(0);
    clearToast();
    disposeToolProgressSuccess();
  }, [selectedFeatureId, disposeToolProgressSuccess]);

  useEffect(() => {
    subscriptionSummaryRef.current = subscriptionSummary;
  }, [subscriptionSummary]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const offerPostRunMonetizationHintAfterSuccess = useCallback(() => {
    const sum = subscriptionSummaryRef.current;
    const ur = userRef.current;
    if (!sum || ur?.role === "ADMIN" || sum.currentPlan.name !== "FREE") {
      frictionConversionFollowUpRef.current = false;
      return;
    }
    const u = sum.usage;
    const usageFrictionActive = Boolean(u.conversionTracking?.freeLimitExceeded);
    const fq = usageFrictionActive || u.usedToday >= (u.softFrictionAfterOps ?? 5);
    const hadFriction = frictionConversionFollowUpRef.current;
    frictionConversionFollowUpRef.current = false;
    if (hadFriction || fq) {
      setPostRunUpgradeHintVisible(true);
      setPostRunUpgradeHintDismissed(false);
    }
  }, []);

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
        const nextStatus = await fetchMergeJob(jobId, accessToken);
        if (!active || mergePollHandledRef.current) {
          return;
        }

        setMergeJob(nextStatus);

        if (nextStatus.status === "failed") {
          frictionConversionFollowUpRef.current = false;
          showToast("error", M.mergeToastFailedTitle, nextStatus.error || M.mergeToastFailedGeneric);
          setSubmitting(false);
          mergePollHandledRef.current = true;
          return;
        }

        if (nextStatus.status === "completed") {
          mergePollHandledRef.current = true;
          try {
            const dl = await downloadMergeJob(jobId, fallbackName, accessToken);
            if (!active) {
              return;
            }
            void refreshSubscriptionState();
            showToast("success", M.mergeToastSuccessTitle, M.mergeToastSuccessBody);
            resetForm(true);
            setSubmitting(false);
            setMergeJob(null);
            disposeToolProgressSuccess();
            if (dl.dispose) {
              toolProgressDisposeRef.current = dl.dispose;
            }
            setToolProgressSuccess({
              filename: fallbackName,
              featureTitle: selectedFeature.title,
              replay: dl.replay,
            });
            offerPostRunMonetizationHintAfterSuccess();
          } catch (downloadErr) {
            if (!active) {
              return;
            }
            frictionConversionFollowUpRef.current = false;
            setSubmitting(false);
            const detail =
              downloadErr instanceof Error ? downloadErr.message : M.mergeToastPollErrorDetail;
            showToast("error", M.mergeToastDownloadErrorTitle, detail);
            return;
          }
        }
      } catch (error) {
        if (!active) {
          return;
        }
        const detail = error instanceof Error ? error.message : M.mergeToastPollErrorDetail;
        frictionConversionFollowUpRef.current = false;
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
  }, [
    mergeJob?.id,
    selectedFeatureId,
    selectedFeature.fallbackFilename,
    selectedFeature.title,
    language,
    disposeToolProgressSuccess,
    accessToken,
    offerPostRunMonetizationHintAfterSuccess,
  ]);

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
      void inspectPdf(primary.file, pwd, accessToken).then((result) => {
        setUploads((cur) =>
          cur.map((u, i) => (i === 0 ? { ...u, pageCount: result.page_count ?? null } : u)),
        );
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [password, selectedFeatureId, uploads[0]?.id, uploads[0]?.encrypted, language, accessToken]);

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
    setUpgradeModalOpen(false);
    setConversionUpgradeModalOpen(false);
  }, [view]);

  const dismissConversionUpgradeModal = useCallback(() => {
    recordConversionModalDismiss();
    setConversionUpgradeModalOpen(false);
  }, []);

  const snoozeConversionUpgradeModal = useCallback(() => {
    recordConversionModalDismiss();
    try {
      localStorage.setItem(CONV_MODAL_SNOOZE_UNTIL_KEY, String(Date.now() + CONV_MODAL_SNOOZE_MS));
    } catch {
      /* private mode */
    }
    setConversionUpgradeModalOpen(false);
  }, []);

  const prevConversionModalOpenRef = useRef(false);
  useEffect(() => {
    const open = conversionUpgradeModalOpen;
    if (open && !prevConversionModalOpenRef.current) {
      const source = conversionModalShowSourceRef.current;
      const stats = recordConversionModalShown(source);
      conversionFrictionSignalRef.current = null;
      pushConversionModalAnalytics("nb_conversion_modal_shown", {
        source,
        shown_total: stats.shownTotal,
        auto_shows_today: stats.autoShowsToday,
        dismiss_total: stats.dismissTotal,
        ctr_pct: conversionModalClickThroughRate(stats),
      });
    }
    prevConversionModalOpenRef.current = open;
  }, [conversionUpgradeModalOpen]);

  useEffect(() => {
    if (view !== "web" || !isAuthenticated || subscriptionLoading || !subscriptionSummary) {
      return;
    }
    if (subscriptionSummary.currentPlan.name !== "FREE") {
      return;
    }
    if (conversionUpgradeModalOpen || upgradeModalOpen) {
      return;
    }
    const now = Date.now();
    const signal = conversionFrictionSignalRef.current;
    if (!conversionModalAutoQualifies(subscriptionSummary, signal, now)) {
      return;
    }
    if (!canAutoShowConversionModal(now)) {
      return;
    }
    conversionModalShowSourceRef.current = "auto";
    setConversionUpgradeModalOpen(true);
  }, [
    view,
    isAuthenticated,
    subscriptionLoading,
    subscriptionSummary,
    conversionUpgradeModalOpen,
    upgradeModalOpen,
    delayConversionFriction,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !user || !accessToken) {
      setSubscriptionSummary(null);
      setSubscriptionStatus(null);
      return;
    }

    const authToken = accessToken;
    const authUser = user;

    let cancelled = false;
    let intervalId: number | undefined;

    async function loadSubscriptionBlock() {
      setSubscriptionLoading(true);
      try {
        const [summary, status] = await Promise.all([
          fetchSubscriptionSummary(authToken),
          fetchSubscriptionStatus(authToken),
        ]);
        if (cancelled) {
          return;
        }
        setSubscriptionSummary(summary);
        setSubscriptionStatus(status);

        const adminProNavbar = authUser.role === "ADMIN" && status.plan === "PRO";
        const needsJwtRefresh =
          Boolean(status.plan_downgraded) || (!adminProNavbar && status.plan !== authUser.plan);
        if (needsJwtRefresh) {
          const refreshed = await refreshSession();
          if (cancelled || !refreshed) {
            return;
          }
          const [nextSummary, nextStatus] = await Promise.all([
            fetchSubscriptionSummary(refreshed.accessToken),
            fetchSubscriptionStatus(refreshed.accessToken),
          ]);
          if (!cancelled) {
            setSubscriptionSummary(nextSummary);
            setSubscriptionStatus(nextStatus);
          }
        }
      } catch (error) {
        if (!cancelled) {
          showToast(
            "error",
            "Abonelik bilgisi alınamadı",
            error instanceof Error ? error.message : "Plan bilgileri yüklenemedi.",
          );
        }
      } finally {
        if (!cancelled) {
          setSubscriptionLoading(false);
        }
      }
    }

    void loadSubscriptionBlock();
    intervalId = window.setInterval(() => {
      void loadSubscriptionBlock();
    }, 60_000);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [accessToken, isAuthenticated, refreshSession, user?.id, user?.plan, user?.role]);

  useEffect(() => {
    if (!subscriptionSummary?.usage) return;
    const u = subscriptionSummary.usage;

    const code = u.usageWarningCode;
    const strong = u.strongUsageWarning;
    const soft = u.softUsageWarning;
    if (!code || (!strong && !soft)) return;

    if (typeof sessionStorage === "undefined") return;

    const k = `nb-usage-toast-${u.date}-${code}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");

    const detail = (strong ?? soft) as string;
    const isStrong = Boolean(strong);
    showToastRef.current(
      "info",
      language === "tr"
        ? isStrong
          ? "Günlük ücretsiz kota"
          : "Kota uyarısı"
        : isStrong
          ? "Free daily limit"
          : "Usage reminder",
      detail,
    );
  }, [subscriptionSummary, language]);

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
    user?.role !== "ADMIN" && subscriptionSummary && subscriptionSummary.currentPlan.name === "FREE";
  const usageFrictionActive = Boolean(subscriptionSummary?.usage.conversionTracking?.freeLimitExceeded);
  const freeQueueLikely =
    Boolean(showUsageQuota && subscriptionSummary) &&
    (usageFrictionActive ||
      subscriptionSummary!.usage.usedToday >= (subscriptionSummary!.usage.softFrictionAfterOps ?? 5));
  const premiumProcessingLane = Boolean(
    user?.role === "ADMIN" ||
      (subscriptionSummary &&
        (subscriptionSummary.usage.processingTier === "premium" ||
          subscriptionSummary.usage.priorityProcessing === true ||
          subscriptionSummary.currentPlan.name === "PRO" ||
          subscriptionSummary.currentPlan.name === "BUSINESS")),
  );

  const mergeProgressActive =
    Boolean(mergeJob && selectedFeatureId === "merge" && mergeJob.status !== "completed");
  const genericToolProgressActive =
    submitting && selectedFeatureId !== "merge" && view === "web" && contentPanel === "tool";
  const TOOLSuccessBarActive = Boolean(toolProgressSuccess && view === "web" && contentPanel === "tool");
  const bottomToolProgressActive =
    mergeProgressActive || genericToolProgressActive || TOOLSuccessBarActive;
  /** Free tier: in-flight strip when no server friction banner (avoids duplicate copy with DelayConversionBanner). */
  const freeDuringProcessingMonetization = Boolean(
    showUsageQuota &&
      !delayConversionFriction &&
      (submitting || mergeProgressActive || genericToolProgressActive),
  );
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

  useEffect(() => {
    if (!genericToolProgressActive || toolRunStartedAt == null) {
      return;
    }
    const id = window.setInterval(() => setToolRunClock((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, [genericToolProgressActive, toolRunStartedAt]);

  const genericToolElapsedSec = useMemo(() => {
    if (toolRunStartedAt == null) {
      return 0;
    }
    return Math.floor((Date.now() - toolRunStartedAt) / 1000);
  }, [toolRunStartedAt, toolRunClock]);

  const genericToolEstimateSec = useMemo(() => {
    if (toolRunFileBytes <= 0) {
      return 90;
    }
    const mb = toolRunFileBytes / (1024 * 1024);
    const k =
      selectedFeatureId === "compress"
        ? 5.2
        : selectedFeatureId === "pdf-to-word" || selectedFeatureId === "pdf-to-excel"
          ? 4.0
          : selectedFeatureId === "split"
            ? 2.4
            : selectedFeatureId === "encrypt"
              ? 3.2
              : 3.0;
    const estimateBase = Math.max(40, Math.min(1800, Math.round(mb * k + 22)));
    if (premiumProcessingLane) {
      return Math.max(35, Math.round(estimateBase * 0.85));
    }
    return estimateBase;
  }, [toolRunFileBytes, selectedFeatureId, premiumProcessingLane]);

  const genericToolFileMb = toolRunFileBytes / (1024 * 1024);
  const genericToolRemainingSec = Math.max(0, genericToolEstimateSec - genericToolElapsedSec);
  const genericToolPercent = Math.min(
    97,
    Math.max(2, Math.round((genericToolElapsedSec / Math.max(genericToolEstimateSec, 1)) * 100)),
  );
  const genericProgressIndeterminate =
    genericToolProgressActive &&
    (freeQueueLikely
      ? genericToolElapsedSec < 20 || genericToolPercent < 14
      : premiumProcessingLane
        ? genericToolElapsedSec < 4 || genericToolPercent < 5
        : genericToolElapsedSec < 5 || genericToolPercent < 6);

  const upgradeNudgeTier = useMemo(() => {
    if (!subscriptionSummary || user?.role === "ADMIN" || subscriptionSummary.currentPlan.name !== "FREE") {
      return 0 as const;
    }
    const u = subscriptionSummary.usage;
    return computeUpgradeNudgeTierWeb({
      planIsFree: true,
      softFrictionAfterOps: u.softFrictionAfterOps ?? 5,
      usedToday: u.usedToday,
      throttleEventsToday:
        u.postLimitThrottleEventsToday ?? u.conversionTracking?.postLimitThrottleEventsToday ?? 0,
      lifetimeThrottleEvents: u.behaviorMonetization?.totalThrottleEventsLifetime,
      lifetimeTotalOps: u.behaviorMonetization?.totalOperationsLifetime,
    });
  }, [subscriptionSummary, user?.role]);

  useEffect(() => {
    if (submitting) {
      setUpgradeNudgeLoadingHidden(false);
    }
  }, [submitting]);

  useEffect(() => {
    if (toolProgressSuccess) {
      setUpgradeNudgePostSuccessHidden(false);
    }
  }, [toolProgressSuccess]);

  const showUpgradeNudgeOnLoading =
    upgradeNudgeTier >= 1 &&
    !upgradeNudgeLoadingHidden &&
    showUsageQuota &&
    (genericToolProgressActive ||
      (mergeProgressActive && mergeJob && mergeJob.status !== "failed"));

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

  async function handleUpgradeCheckout(plan: "PRO" | "BUSINESS" = "PRO", billing: "monthly" | "annual" = "monthly") {
    if (!accessToken) {
      showToast(
        "error",
        language === "tr" ? "Oturum gerekli" : "Sign-in required",
        language === "tr" ? "Ödeme için giriş yapın." : "Please sign in to continue to payment.",
      );
      return;
    }

    try {
      const session = await createPaymentCheckout(accessToken, plan, plan === "PRO" ? billing : "monthly");
      if (session.paymentPageUrl) {
        window.location.href = session.paymentPageUrl;
        return;
      }
      if (session.checkoutFormContent) {
        const w = window.open("", "_blank", "noopener,noreferrer");
        if (!w) {
          showToast(
            "error",
            language === "tr" ? "Açılır pencere engellendi" : "Popup blocked",
            language === "tr"
              ? "Ödeme formu için tarayıcıda açılır pencerelere izin verin."
              : "Allow pop-ups for this site to open the payment form.",
          );
          return;
        }
        w.document.open();
        w.document.write(session.checkoutFormContent);
        w.document.close();
        return;
      }
      showToast(
        "error",
        language === "tr" ? "Ödeme başlatılamadı" : "Could not start payment",
        language === "tr" ? "Sunucu yanıtı geçersiz." : "Invalid response from server.",
      );
    } catch (error) {
      showToast(
        "error",
        language === "tr" ? "Ödeme başlatılamadı" : "Could not start payment",
        error instanceof Error ? error.message : language === "tr" ? "Bilinmeyen hata." : "Unknown error.",
      );
    }
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
    if (id !== "subscription" && lockedFeatures.has(id)) {
      setUpgradeModalOpen(true);
      return;
    }
    setActiveSidebar(id);
    if (id === "subscription") {
      setContentPanel("subscription");
      return;
    }
    setContentPanel("tool");
    setSelectedFeatureId(id);
  }

  function handleDashboardLogoClick() {
    if (view === "admin") {
      setView("web");
      window.history.replaceState({}, "", "/workspace");
      return;
    }
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
      }

      const loggedInUser = await login(payload.email, payload.password);
      if (loggedInUser.preferredLanguage && loggedInUser.preferredLanguage !== language) {
        setLanguage(loggedInUser.preferredLanguage);
      }
      setSelectedFeatureId("split");
      setActiveSidebar("split");
      setContentPanel("tool");
      setView("web");
    } catch (error) {
      const fallback =
        language === "tr" ? "Kimlik doğrulama işlemi başarısız oldu." : "Authentication failed.";
      const raw = error instanceof Error ? error.message : fallback;
      setAuthError(translateAuthApiMessage(raw, language));
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

    if (!accessToken) {
      showToast("error", "Oturum gerekli", "İşlem için yeniden giriş yapın.");
      return;
    }

    try {
      disposeToolProgressSuccess();
      setSubmitting(true);
      clearToast();
      setDelayConversionFriction(null);
      setPostRunUpgradeHintVisible(false);
      conversionFrictionSignalRef.current = null;
      if (selectedFeature.id !== "merge") {
        setToolRunStartedAt(Date.now());
        setToolRunFileBytes(uploads[0]?.file.size ?? 0);
        setToolRunClock(0);
      }

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
          const mergeRes = await createMergeJob(formData, accessToken);
          const { job_id, saasFriction } = mergeRes;
          if (
            saasFriction &&
            ((saasFriction.delayMs ?? 0) > 0 ||
              saasFriction.upgradeCta ||
              (typeof saasFriction.message === "string" && saasFriction.message.trim()) ||
              (typeof saasFriction.usageSummary === "string" && saasFriction.usageSummary.trim()))
          ) {
            applySaasFriction(saasFriction, "merge");
          }
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

      const dl = await downloadFromApi(selectedFeature.endpoint, formData, selectedFeature.fallbackFilename, accessToken);
      if (
        dl.saasFriction &&
        ((dl.saasFriction.delayMs ?? 0) > 0 ||
          dl.saasFriction.upgradeCta ||
          (typeof dl.saasFriction.message === "string" && dl.saasFriction.message.trim()) ||
          (typeof dl.saasFriction.usageSummary === "string" && dl.saasFriction.usageSummary.trim()))
      ) {
        applySaasFriction(dl.saasFriction, selectedFeature.id);
      }
      showToast("success", "İşlem tamamlandı", "Çıktı dosyası başarıyla indirildi.");
      resetForm(true);
      disposeToolProgressSuccess();
      if (dl.dispose) {
        toolProgressDisposeRef.current = dl.dispose;
      }
      setToolProgressSuccess({
        filename: selectedFeature.fallbackFilename,
        featureTitle: selectedFeature.title,
        replay: dl.replay,
      });
      offerPostRunMonetizationHintAfterSuccess();
      void refreshSubscriptionState();
    } catch (error) {
      frictionConversionFollowUpRef.current = false;
      const detail = error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu.";
      showToast("error", "İşlem başarısız", detail);
    } finally {
      if (selectedFeature.id !== "merge") {
        setSubmitting(false);
        setToolRunStartedAt(null);
        setToolRunFileBytes(0);
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
          const result = await inspectPdf(item.file, undefined, accessToken);
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

  if (view === "forgot_password") {
    return (
      <>
        <SystemNotificationBanner language={language} />
        <ForgotPasswordPage
        language={language}
        onBackToLogin={() => {
          setAuthError("");
          setView("login");
        }}
        onCompleted={(successMessage) => {
          setAuthError("");
          setView("login");
          showToast(
            "success",
            language === "tr" ? "Şifre sıfırlandı" : "Password reset",
            successMessage,
          );
        }}
      />
      </>
    );
  }

  if (view === "landing") {
    return (
      <>
        <SystemNotificationBanner language={language} />
        <LandingPage
          language={language}
          pricing={pricing}
          onLanguageChange={handleLanguageChange}
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
        <SystemNotificationBanner language={language} />
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
          onForgotPassword={() => {
            setAuthError("");
            setView("forgot_password");
          }}
          onOpenTerms={() => openLegalPage("terms")}
          onOpenPrivacy={() => openLegalPage("privacy")}
        />
        {toast ? (
          <div className={`toast toast--${toast.type}`}>
            <div className="toast__title">{toast.title}</div>
            <div className="toast__detail">{toast.detail}</div>
          </div>
        ) : null}
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
        <SystemNotificationBanner language={language} />
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
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">NB PDF TOOLS</p>
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
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">NB PDF TOOLS</p>
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

  if (view === "admin") {
    if (user.role !== "ADMIN" || !accessToken) {
      return (
        <>
          <div className="min-h-screen bg-nb-bg px-6 py-16 text-center text-nb-muted">
            <p className="text-lg font-semibold text-nb-text">Yönetici erişimi gerekli</p>
            <p className="mt-2 text-sm">Yetkili bir yönetici hesabıyla giriş yapın.</p>
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
      <>
        <SystemNotificationBanner language={language} />
        {toast ? (
          <div className={`toast toast--${toast.type}`}>
            <div className="toast__title">{toast.title}</div>
            <div className="toast__detail">{toast.detail}</div>
          </div>
        ) : null}
        <CookieNotice
          language={language}
          visible={shouldShowCookieNotice}
          onAccept={acceptConsent}
          onOpenPrivacy={() => openLegalPage("privacy")}
        />
        <AdminPanel
          accessToken={accessToken}
          onExit={() => {
            setView("web");
            window.history.replaceState({}, "", "/workspace");
          }}
          onLogout={() => void handleLogout()}
        />
      </>
    );
  }

  return (
    <div className="app-shell">
      <SystemNotificationBanner language={language} />
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
        setInitialPassword={setInitialPassword}
        showToast={showToast}
      />

      <UpgradeModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        language={language}
        pricing={pricing}
        onSelectBasic={() => {
          setUpgradeModalOpen(false);
          void handleUpgradeCheckout("BUSINESS");
        }}
        onSelectPro={() => {
          setUpgradeModalOpen(false);
          void handleUpgradeCheckout("PRO", "monthly");
        }}
        onSelectProAnnual={() => {
          setUpgradeModalOpen(false);
          void handleUpgradeCheckout("PRO", "annual");
        }}
      />

      <ConversionUpgradeModal
        open={conversionUpgradeModalOpen}
        onClose={dismissConversionUpgradeModal}
        onContinueWithoutWaiting={() => {
          const stats = recordConversionModalPrimaryClick();
          pushConversionModalAnalytics("nb_conversion_modal_primary_click", {
            shown_total: stats.shownTotal,
            primary_total: stats.primaryClicksTotal,
            ctr_pct: conversionModalClickThroughRate(stats),
          });
          setConversionUpgradeModalOpen(false);
          void handleUpgradeCheckout("PRO");
        }}
        onMaybeLater={snoozeConversionUpgradeModal}
        language={language}
        operationsToday={subscriptionSummary?.usage.usedToday ?? 0}
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
        subscriptionStatus={subscriptionStatus}
        onLogoClick={handleDashboardLogoClick}
        onProfile={handleNavProfile}
        onPassword={handleNavPassword}
        onLogout={() => void handleLogout()}
        onUpgradeClick={() => {
          if (!subscriptionSummary || subscriptionSummary.currentPlan.name === "FREE") {
            openConversionUpgradeModalManual();
          } else {
            setUpgradeModalOpen(true);
          }
        }}
        showAdminEntry={user?.role === "ADMIN"}
        onOpenAdmin={() => {
          setView("admin");
          window.history.replaceState({}, "", "/admin");
        }}
      />
      {workspaceBanner.enabled ? (
        <div className="border-b border-cyan-500/30 bg-cyan-950/50 px-4 py-2 text-center text-xs font-medium text-cyan-100 md:text-sm">
          {workspaceBanner.text}
        </div>
      ) : null}
      {flags.maintenanceMode ? (
        <div className="border-b border-amber-500/35 bg-amber-950/55 px-4 py-2 text-center text-xs font-medium text-amber-100 md:text-sm">
          {language === "tr"
            ? "Bakım modu etkin — işlemler kısıtlanabilir. Yönetim panelinden kapatılabilir."
            : "Maintenance mode is on — some actions may be limited. Disable it from the admin panel."}
        </div>
      ) : null}
      <DashboardSidebar
        active={activeSidebar}
        onSelect={handleSidebarSelect}
        language={language}
        onLanguageChange={(lang) => void handleLanguageChange(lang)}
        onGoHome={goToLandingFromDashboard}
        lockedFeatures={lockedFeatures}
        subscriptionSummary={subscriptionSummary}
        userRole={user?.role}
        onUsageUpgradeClick={() => {
          if (!subscriptionSummary || subscriptionSummary.currentPlan.name === "FREE") {
            openConversionUpgradeModalManual();
          } else {
            setUpgradeModalOpen(true);
          }
        }}
        enabledToolIds={enabledToolIds}
        resolveToolLabel={resolveToolLabel}
        onOpenAdminDashboard={
          user?.role === "ADMIN"
            ? () => {
                setView("admin");
                window.history.replaceState({}, "", "/admin");
              }
            : undefined
        }
      />
      {showUsageQuota && !bottomToolProgressActive ? (
        <div className="pointer-events-none fixed bottom-4 left-4 z-30 max-w-[calc(100vw-2rem)] md:hidden">
          <div
            className={`pointer-events-auto rounded-xl border px-3 py-2.5 text-xs shadow-lg backdrop-blur-md ${
              usageFrictionActive
                ? "border-amber-500/45 bg-gradient-to-b from-amber-950/50 to-nb-bg-elevated/98"
                : "border-white/[0.1] bg-nb-bg-elevated/95"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-nb-muted">{W.usageDailyHeading}</p>
            <p className="mt-1 text-[13px] font-semibold leading-snug text-nb-text">
              {subscriptionSummary!.usage.dailyLimit != null
                ? W.usageUsedTodayLine(subscriptionSummary!.usage.usedToday, subscriptionSummary!.usage.dailyLimit)
                : W.usageSoftTierLine(
                    subscriptionSummary!.usage.usedToday,
                    subscriptionSummary!.usage.softFrictionAfterOps ?? 5,
                  )}
            </p>
            <p
              className={`mt-0.5 text-[11px] font-semibold tabular-nums ${
                usageFrictionActive ? "text-amber-200" : "text-cyan-300/95"
              }`}
            >
              {subscriptionSummary!.usage.dailyLimit != null
                ? W.usageRemainingLine(subscriptionSummary!.usage.remainingToday ?? 0)
                : W.usageNoDailyCapLine}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/35">
              <div
                className={`h-full rounded-full ${
                  usageFrictionActive
                    ? "bg-gradient-to-r from-amber-600 to-amber-400"
                    : "bg-gradient-to-r from-nb-primary to-nb-secondary"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    subscriptionSummary!.usage.dailyLimit != null &&
                      (subscriptionSummary!.usage.dailyLimit ?? 0) > 0
                      ? (subscriptionSummary!.usage.usedToday / (subscriptionSummary!.usage.dailyLimit ?? 1)) * 100
                      : ((subscriptionSummary!.usage.softFrictionAfterOps ?? 5) > 0
                          ? subscriptionSummary!.usage.usedToday / (subscriptionSummary!.usage.softFrictionAfterOps ?? 5)
                          : 0) * 100,
                  )}%`,
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => openConversionUpgradeModalManual()}
              className="nb-transition mt-2.5 w-full rounded-lg border border-amber-400/45 bg-amber-500/15 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.05em] text-amber-50 hover:bg-amber-500/25"
            >
              {W.usageUpgradeCta}
            </button>
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
          userRole={user?.role}
          enabledToolIds={enabledToolIds}
          resolveToolLabel={resolveToolLabel}
          onOpenAdminDashboard={
            user?.role === "ADMIN"
              ? () => {
                  setView("admin");
                  window.history.replaceState({}, "", "/admin");
                }
              : undefined
          }
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
                  <span>{W.usageDailyHeading}</span>
                  <strong className="tabular-nums">
                    {subscriptionSummary.usage.dailyLimit === null
                      ? W.usageUnlimited
                      : W.usageCountOfLimit(
                          subscriptionSummary.usage.usedToday,
                          subscriptionSummary.usage.dailyLimit,
                        )}
                  </strong>
                </div>
                <div className="subscription-stat">
                  <span>{language === "tr" ? "Kalan hak" : "Remaining"}</span>
                  <strong className="tabular-nums">
                    {subscriptionSummary.usage.remainingToday === null
                      ? W.usageUnlimited
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

              <section className="pro-value-card" aria-labelledby="pro-value-title">
                <p className="pro-value-card__kicker">{W.proBenefitsKicker}</p>
                <h3 id="pro-value-title" className="pro-value-card__title">
                  {W.proBenefitsTitle}
                </h3>
                <p className="pro-value-card__intro">{W.proBenefitsIntro}</p>
                <ul className="pro-value-card__list">
                  <li className="pro-value-card__item">
                    <span className="pro-value-card__check" aria-hidden>
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <div className="pro-value-card__body">
                      <span className="pro-value-card__tag pro-value-card__tag--speed">{W.proBenefitTagSpeed}</span>
                      <p className="pro-value-card__text">{W.proBenefitSpeed}</p>
                    </div>
                  </li>
                  <li className="pro-value-card__item">
                    <span className="pro-value-card__check" aria-hidden>
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <div className="pro-value-card__body">
                      <span className="pro-value-card__tag pro-value-card__tag--quality">{W.proBenefitTagQuality}</span>
                      <p className="pro-value-card__text">{W.proBenefitQuality}</p>
                    </div>
                  </li>
                  <li className="pro-value-card__item">
                    <span className="pro-value-card__check" aria-hidden>
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <div className="pro-value-card__body">
                      <span className="pro-value-card__tag pro-value-card__tag--unlimited">{W.proBenefitTagUnlimited}</span>
                      <p className="pro-value-card__text">{W.proBenefitUnlimited}</p>
                    </div>
                  </li>
                  <li className="pro-value-card__item">
                    <span className="pro-value-card__check" aria-hidden>
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <div className="pro-value-card__body">
                      <span className="pro-value-card__tag">{W.proBenefitTagAccess}</span>
                      <p className="pro-value-card__text">{W.proBenefitFullAccess}</p>
                    </div>
                  </li>
                </ul>
              </section>

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
                    onClick={() => void handleUpgradeCheckout("BUSINESS")}
                  >
                    {language === "tr"
                      ? businessTryLine
                        ? `Basic (${businessTryLine})`
                        : "Basic"
                      : businessTryLine
                        ? `Basic (${businessTryLine})`
                        : "Basic"}
                  </button>
                  <button
                    type="button"
                    className="subscription-plan__action subscription-plan__action--upgrade"
                    onClick={() => void handleUpgradeCheckout("PRO", "monthly")}
                  >
                    {language === "tr"
                      ? proTryLine
                        ? `Pro (${proTryLine})`
                        : "Pro"
                      : proTryLine
                        ? `Pro (${proTryLine})`
                        : "Pro"}
                  </button>
                  <button
                    type="button"
                    className="subscription-plan__action subscription-plan__action--upgrade"
                    onClick={() => void handleUpgradeCheckout("PRO", "annual")}
                  >
                    {language === "tr"
                      ? proAnnualLine
                        ? `Pro yıllık (${proAnnualLine})`
                        : "Pro yıllık"
                      : proAnnualLine
                        ? `Pro annual (${proAnnualLine})`
                        : "Pro annual"}
                  </button>
                  <span className="text-sm text-nb-muted">
                    {language === "tr"
                      ? "Ödeme TRY üzerinden güvenli ödeme ortağında işlenir. Tüm planları yükseltme penceresinden de görebilirsiniz."
                      : "Checkout is in TRY via our payment partner. Open the upgrade modal to compare all plans."}
                  </span>
                </div>
              ) : null}

              {subscriptionSummary.currentPlan.name === "BUSINESS" ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    className="subscription-plan__action subscription-plan__action--upgrade"
                    onClick={() => void handleUpgradeCheckout("PRO", "monthly")}
                  >
                    {language === "tr"
                      ? proTryLine
                        ? `Pro'ya yükselt (${proTryLine})`
                        : "Pro'ya yükselt"
                      : proTryLine
                        ? `Upgrade to Pro (${proTryLine})`
                        : "Upgrade to Pro"}
                  </button>
                  <button
                    type="button"
                    className="subscription-plan__action subscription-plan__action--upgrade"
                    onClick={() => void handleUpgradeCheckout("PRO", "annual")}
                  >
                    {language === "tr"
                      ? proAnnualLine
                        ? `Pro yıllık (${proAnnualLine})`
                        : "Pro yıllık"
                      : proAnnualLine
                        ? `Pro annual (${proAnnualLine})`
                        : "Pro annual"}
                  </button>
                </div>
              ) : null}

              {subscriptionSummary.currentPlan.name === "PRO" ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    className="subscription-plan__action subscription-plan__action--upgrade"
                    onClick={() => void handleUpgradeCheckout("BUSINESS")}
                  >
                    {language === "tr"
                      ? businessTryLine
                        ? `Basic'e geç (${businessTryLine})`
                        : "Basic'e geç"
                      : businessTryLine
                        ? `Switch to Basic (${businessTryLine})`
                        : "Switch to Basic"}
                  </button>
                  <span className="text-sm text-nb-muted">
                    {language === "tr"
                      ? "Ek lisans veya kurumsal teklif için iletişim formundan da yazabilirsiniz."
                      : "For extra licenses or enterprise quotes, you can also use the contact form."}
                  </span>
                </div>
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
              setInitialPassword={setInitialPassword}
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

          {showUsageQuota && subscriptionSummary && usageFrictionActive ? (
            <div className="border-b border-amber-500/25 bg-gradient-to-r from-amber-950/45 via-amber-950/25 to-transparent px-4 py-3 md:px-6">
              <p className="text-sm font-medium leading-snug text-amber-50/95">
                {subscriptionSummary.usage.dailyLimit != null
                  ? W.usageQuotaExhaustedBanner
                  : W.usageSoftFrictionBanner}
              </p>
              <button
                type="button"
                onClick={() => openConversionUpgradeModalManual()}
                className="nb-transition mt-3 inline-flex min-h-[40px] items-center justify-center rounded-xl border border-amber-400/45 bg-amber-500/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-amber-50 shadow-[0_0_24px_-10px_rgba(245,158,11,0.5)] hover:bg-amber-500/25"
              >
                {W.usageUpgradeCta}
              </button>
            </div>
          ) : null}

          {delayConversionFriction ? (
            <div className="border-b border-cyan-500/15 px-4 pb-4 pt-2 md:px-6">
              <DelayConversionBanner
                language={language}
                friction={delayConversionFriction}
                onDismiss={() => setDelayConversionFriction(null)}
                onUpgradeClick={() => {
                  openConversionUpgradeModalManual();
                  setDelayConversionFriction(null);
                }}
              />
            </div>
          ) : null}

          {freeDuringProcessingMonetization ? (
            <div
              className="border-b border-indigo-500/20 bg-gradient-to-r from-cyan-950/35 via-nb-panel/40 to-indigo-950/25 px-4 py-3 md:px-6"
              role="status"
              aria-live="polite"
            >
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="min-w-0 text-sm font-medium leading-snug text-slate-200">{W.delayMonetizationDuringBody}</p>
                <button
                  type="button"
                  className="nb-transition shrink-0 rounded-xl bg-gradient-to-b from-cyan-400 to-cyan-500 px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-950 shadow-[0_8px_24px_-10px_rgba(34,211,238,0.45)] hover:brightness-105"
                  onClick={() => openConversionUpgradeModalManual()}
                >
                  {W.delayMonetizationInstantCta}
                </button>
              </div>
            </div>
          ) : null}

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
                    const compressEst =
                      selectedFeature.id === "compress" && !item.inspecting
                        ? compressEstimatePercentRange(item.file.size)
                        : null;
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
                        <div className="selected-file-card__lead">
                          <div className="selected-file-card__icon" aria-hidden>
                            <svg viewBox="0 0 24 24" fill="none" className="selected-file-card__icon-svg">
                              <path
                                d="M14 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8l-6-6Z"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M14 2v6h6"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M8 14h8M8 18h5"
                                stroke="currentColor"
                                strokeWidth="1.25"
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>
                          <div className="selected-file-card__text">
                            <strong>{item.file.name}</strong>
                            <div className="selected-file-card__meta">
                              <span className="selected-file-card__size">{formatFileSize(item.file.size)}</span>
                              {compressEst ? (
                                <span className="selected-file-card__compress" title={W.compressEstimateTooltip}>
                                  {W.compressEstimateLine(compressEst.min, compressEst.max)}
                                </span>
                              ) : null}
                              {item.inspecting ? <span>{W.inspecting}</span> : null}
                              {!item.inspecting && item.encrypted ? <span className="warning-text">{W.encryptedBadge}</span> : null}
                              {!item.inspecting && !item.encrypted ? <span>{W.ready}</span> : null}
                            </div>
                          </div>
                        </div>
                        <div className="selected-file-card__actions flex shrink-0 items-center gap-1">
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
                            aria-label={`${W.remove}: ${item.file.name}`}
                          >
                            <svg className="remove-button__glyph" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path
                                d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span>{W.remove}</span>
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
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/45 bg-cyan-950/40 text-cyan-300"
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
              {submitting
                ? freeQueueLikely
                  ? W.processingQueued
                  : premiumProcessingLane
                    ? W.processingPremium
                    : W.processing
                : selectedFeature.buttonText}
            </button>
          </form>
            </div>
            {!selectedFeatureAllowed ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-nb-bg/70 px-5 text-center backdrop-blur-sm">
                <p className="text-base font-semibold text-nb-text">{W.proGateTitle}</p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-nb-muted">{W.proGateBody}</p>
                <button type="button" className="primary-action mt-5" onClick={() => setUpgradeModalOpen(true)}>
                  {W.proGateCta}
                </button>
              </div>
            ) : null}
          </div>
        </section>
            </>
          ) : null}
        </div>
        {TOOLSuccessBarActive && toolProgressSuccess ? (
          <div className="merge-progress-fixed merge-progress-fixed--success" role="status" aria-live="polite">
            <div className="merge-progress-fixed__inner">
              <div className="merge-progress-fixed__head">
                <div className="merge-progress-fixed__titles">
                  <strong className="merge-progress-fixed__title merge-progress-fixed__title--success">
                    {W.toolProgressSuccessTitle}
                  </strong>
                  <p className="merge-progress-fixed__phase merge-progress-fixed__phase--success">
                    {toolProgressSuccess.featureTitle} · {toolProgressSuccess.filename}
                  </p>
                </div>
                <span className="merge-progress-fixed__pct merge-progress-fixed__pct--success" aria-hidden>
                  %100
                </span>
              </div>
              <div
                className="progress-bar progress-bar--merge progress-bar--success"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={100}
                aria-label={W.toolProgressSuccessTitle}
              >
                <div className="progress-bar__fill progress-bar__fill--success" style={{ width: "100%" }} />
              </div>
              {showUsageQuota && postRunUpgradeHintVisible && !postRunUpgradeHintDismissed ? (
                <div className="mt-3 flex flex-col gap-2 rounded-xl border border-indigo-500/20 bg-indigo-950/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[12px] leading-relaxed text-slate-400">{W.delayMonetizationAfterHint}</p>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="nb-transition text-[11px] font-semibold text-cyan-300 hover:text-cyan-200"
                      onClick={() => openConversionUpgradeModalManual()}
                    >
                      {W.delayMonetizationInstantCta}
                    </button>
                    <button
                      type="button"
                      className="nb-transition text-[11px] text-slate-500 hover:text-slate-400"
                      onClick={() => setPostRunUpgradeHintDismissed(true)}
                    >
                      {W.delayMonetizationAfterDismiss}
                    </button>
                  </div>
                </div>
              ) : null}
              {upgradeNudgeTier >= 1 && showUsageQuota && !upgradeNudgePostSuccessHidden ? (
                <UpgradeNudgeInline
                  tier={upgradeNudgeTier as 1 | 2 | 3}
                  W={W}
                  onContinueFree={() => setUpgradeNudgePostSuccessHidden(true)}
                  onUpgrade={() => {
                    openConversionUpgradeModalManual();
                    setUpgradeNudgePostSuccessHidden(true);
                  }}
                />
              ) : null}
              <div className="merge-progress-fixed__success-actions">
                {toolProgressSuccess.replay ? (
                  <button
                    type="button"
                    className="merge-progress-fixed__download"
                    onClick={() => toolProgressSuccess.replay?.()}
                  >
                    {W.toolDownloadAgain}
                  </button>
                ) : (
                  <p className="merge-progress-fixed__native-hint">{W.toolProgressNativeDownloadHint}</p>
                )}
                <button type="button" className="merge-progress-fixed__dismiss" onClick={disposeToolProgressSuccess}>
                  {W.toolProgressDismiss}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {TOOLSuccessBarActive ? null : mergeProgressActive && mergeJob ? (
          <div className="merge-progress-fixed" role="status" aria-live="polite">
            <div className="merge-progress-fixed__inner">
              <div className="merge-progress-fixed__head">
                <div className="merge-progress-fixed__titles">
                  <strong className="merge-progress-fixed__title">
                    {mergeJob.status === "failed"
                      ? language === "tr"
                        ? "Birleştirme başarısız"
                        : "Merge failed"
                      : selectedFeature.title}
                  </strong>
                  {mergeJob.status !== "failed" ? (
                    <p className="merge-progress-fixed__phase">
                      {mergeJob.id === MERGE_JOB_PENDING_ID
                        ? freeQueueLikely
                          ? W.mergeProgressQueueFree
                          : premiumProcessingLane
                            ? W.mergeProgressQueuePremium
                            : W.mergeProgressStarting
                        : mergeToolPhaseLabel(mergeJob, mergeProgressIndeterminate, W)}
                    </p>
                  ) : null}
                </div>
                <span className="merge-progress-fixed__pct">
                  {mergeProgressIndeterminate ? "…" : `%${mergeJob.percent}`}
                </span>
              </div>
              <div
                className={`progress-bar progress-bar--merge progress-bar--gradient ${mergeProgressIndeterminate ? "progress-bar--indeterminate" : ""} ${mergeJob.status === "failed" ? "progress-bar--failed" : ""}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  mergeProgressIndeterminate ? undefined : mergeJob.status === "failed" ? 100 : mergeJob.percent
                }
                aria-label={mergeToolPhaseLabel(mergeJob, mergeProgressIndeterminate, W) || selectedFeature.title}
              >
                {mergeProgressIndeterminate ? (
                  <div className="progress-bar__fill progress-bar__fill--indeterminate" />
                ) : (
                  <div
                    className="progress-bar__fill progress-bar__fill--gradient"
                    style={{
                      width: `${mergeJob.status === "failed" ? 100 : Math.max(mergeJob.percent, 2)}%`,
                    }}
                  />
                )}
              </div>
              <div className="merge-progress-fixed__meta">
                <span>
                  {W.mergeStatus}: {mergeJob.current}/{mergeJob.total}
                  {mergeJob.where ? ` · ${mergeJob.where}` : ""}
                </span>
                {mergeEtaSeconds !== null && mergeJob.status === "running" && !mergeProgressIndeterminate ? (
                  <span className="merge-progress-fixed__eta">{W.mergeEtaLine(mergeEtaSeconds)}</span>
                ) : null}
              </div>
              {showUpgradeNudgeOnLoading && mergeProgressActive ? (
                <UpgradeNudgeInline
                  tier={upgradeNudgeTier as 1 | 2 | 3}
                  W={W}
                  onContinueFree={() => setUpgradeNudgeLoadingHidden(true)}
                  onUpgrade={() => {
                    openConversionUpgradeModalManual();
                    setUpgradeNudgeLoadingHidden(true);
                  }}
                />
              ) : null}
              {mergeJob.status === "failed" && mergeJob.error ? (
                <p className="merge-progress-fixed__err">{mergeJob.error}</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {TOOLSuccessBarActive ? null : genericToolProgressActive ? (
          <div className="merge-progress-fixed merge-progress-fixed--generic" role="status" aria-live="polite">
            <div className="merge-progress-fixed__inner">
              <div className="merge-progress-fixed__head">
                <div className="merge-progress-fixed__titles">
                  <strong className="merge-progress-fixed__title">{selectedFeature.title}</strong>
                  <p className="merge-progress-fixed__phase">
                    {genericToolPhaseLabel(
                      selectedFeatureId,
                      genericToolPercent,
                      genericProgressIndeterminate,
                      W,
                      freeQueueLikely,
                    )}
                  </p>
                </div>
                <span className="merge-progress-fixed__pct">
                  {genericProgressIndeterminate ? "…" : `%${genericToolPercent}`}
                </span>
              </div>
              <div
                className={`progress-bar progress-bar--merge progress-bar--gradient ${genericProgressIndeterminate ? "progress-bar--indeterminate" : ""}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={genericProgressIndeterminate ? undefined : genericToolPercent}
                aria-label={genericToolPhaseLabel(
                  selectedFeatureId,
                  genericToolPercent,
                  genericProgressIndeterminate,
                  W,
                  freeQueueLikely,
                )}
              >
                {genericProgressIndeterminate ? (
                  <div className="progress-bar__fill progress-bar__fill--indeterminate" />
                ) : (
                  <div
                    className="progress-bar__fill progress-bar__fill--gradient"
                    style={{ width: `${genericToolPercent}%` }}
                  />
                )}
              </div>
              <div className="merge-progress-fixed__meta merge-progress-fixed__meta--generic">
                <span>
                  {freeQueueLikely
                    ? W.toolProgressSubQueueFree
                    : premiumProcessingLane
                      ? W.toolProgressSubPremium
                      : W.toolProgressSub}
                </span>
                {genericToolFileMb >= 5 ? (
                  <span className="merge-progress-fixed__eta">{W.toolProgressLargeFileHint(genericToolFileMb)}</span>
                ) : null}
                {genericToolElapsedSec >= 1 ? (
                  <span className="merge-progress-fixed__eta">{W.toolProgressElapsed(genericToolElapsedSec)}</span>
                ) : null}
                {genericToolRemainingSec > 0 && genericToolElapsedSec >= 4 ? (
                  <span className="merge-progress-fixed__eta">{W.mergeEtaLine(genericToolRemainingSec)}</span>
                ) : null}
              </div>
              {showUpgradeNudgeOnLoading && genericToolProgressActive ? (
                <UpgradeNudgeInline
                  tier={upgradeNudgeTier as 1 | 2 | 3}
                  W={W}
                  onContinueFree={() => setUpgradeNudgeLoadingHidden(true)}
                  onUpgrade={() => {
                    openConversionUpgradeModalManual();
                    setUpgradeNudgeLoadingHidden(true);
                  }}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <footer className="footer-bar">
        <span>NB PDF TOOLS</span>
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
