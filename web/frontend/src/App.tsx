// Web uygulamasının kök bileşeni: karşılama, kimlik, yasal sayfalar ve PDF araçları görünümlerini tek state ile yönetir.
// Oturum, abonelik ve dosya yükleme durumunun modüller arasında paylaşılması için tek React ağacında toplanır.
// Bu bileşen parçalanırsa üst düzey hook ve görünüm geçişleri yeniden kablolanmak zorunda kalır.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMergeJob,
  downloadFromApi,
  downloadMergeJob,
  fetchCapabilities,
  fetchMergeJob,
  inspectPdf,
  type MergeJobStatus,
} from "./api";
import { submitContactForm } from "./api/contact";
import { CookieNotice } from "./components/common/CookieNotice";
import { AuthPage } from "./components/auth/AuthPage";
import { LoginSuccessPage } from "./components/auth/LoginSuccessPage";
import { LandingPage } from "./components/landing/LandingPage";
import { LegalPage } from "./components/legal/LegalPage";
import { changePlan, fetchPlans, fetchSubscriptionSummary, recordUsage, type FeatureKey, type PlanDefinition, type SubscriptionSummary } from "./api/subscription";
import { useAnalyticsTracking } from "./hooks/useAnalyticsTracking";
import { useAuthSession } from "./hooks/useAuthSession";
import { useCookieConsent } from "./hooks/useCookieConsent";
import { useErrorLogging } from "./hooks/useErrorLogging";
import { usePreferredLanguage } from "./hooks/usePreferredLanguage";

type FeatureId =
  | "split"
  | "merge"
  | "pdf-to-word"
  | "word-to-pdf"
  | "excel-to-pdf"
  | "pdf-to-excel"
  | "compress"
  | "encrypt";

type NonLegalView = "landing" | "login" | "register" | "web";
type LegalView = "terms" | "privacy";
type AppView = NonLegalView | LegalView;
type ToastType = "success" | "error" | "loading";

type CapabilityResponse = {
  brand: string;
  notes: string[];
  environment: {
    platform: string;
    tesseract_cmd: string;
    poppler_path: string;
  };
};

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
};

type Feature = {
  id: FeatureKey;
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
  }));
}

function validatePagesInput(value: string) {
  // Sayfa aralığı girdisini istemcide hızlı doğrular; kullanıcıyı ağ gecikmesi olmadan uyarır.
  // Sunucu ayrı doğrular; bu katman yalnızca kullanıcı deneyimi içindir, tek başına güvenlik sağlamaz.
  // Kurallar backend ile uyumsuz bırakılırsa aynı girdi için farklı hata mesajları görülebilir.
  const raw = value.trim();
  if (!raw) {
    return "Sayfa numaralarını girmeniz gerekiyor.";
  }

  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return "Geçerli bir sayfa listesi girin.";
  }

  for (const token of parts) {
    if (token.includes("-")) {
      const [start, end] = token.split("-", 2).map((part) => part.trim());
      if (!/^\d+$/.test(start) || !/^\d+$/.test(end)) {
        return `Geçersiz aralık: ${token}`;
      }
      if (Number(start) > Number(end)) {
        return `Başlangıç sayfası bitişten büyük olamaz: ${token}`;
      }
    } else if (!/^\d+$/.test(token)) {
      return `Geçersiz sayfa: ${token}`;
    }
  }

  return "";
}

function formatElapsed(seconds: number) {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

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
    completeOAuthLogin,
    clearSession,
  } = useAuthSession();
  const { hasConsent, isReady: isCookieConsentReady, acceptConsent } = useCookieConsent();
  const [view, setView] = useState<AppView>("landing");
  const [legalBackView, setLegalBackView] = useState<NonLegalView>("landing");
  const [selectedFeatureId, setSelectedFeatureId] = useState<FeatureId>("split");
  const [capabilities, setCapabilities] = useState<CapabilityResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [registrationSuccessBanner, setRegistrationSuccessBanner] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [subscriptionSummary, setSubscriptionSummary] = useState<SubscriptionSummary | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [planChangeLoading, setPlanChangeLoading] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [password, setPassword] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [pagesText, setPagesText] = useState("");
  const [pagesError, setPagesError] = useState("");
  const [splitMode, setSplitMode] = useState("single");
  const [outputPassword, setOutputPassword] = useState("");
  const [mergeJob, setMergeJob] = useState<MergeJobStatus | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactWebsite, setContactWebsite] = useState("");
  const [contactError, setContactError] = useState("");
  const [contactSuccess, setContactSuccess] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inspectRunRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);

  const navigateToDashboardAfterOAuth = useCallback(() => {
    setSelectedFeatureId("split");
    setView("web");
    window.history.replaceState({}, "", "/?view=web");
  }, []);

  const selectedFeature = useMemo(
    () => features.find((feature) => feature.id === selectedFeatureId) ?? features[0],
    [selectedFeatureId],
  );
  const primaryUpload = uploads[0] ?? null;
  const currentPdfIsEncrypted = Boolean(primaryUpload?.encrypted);
  const shouldInspectCurrentFeature = pdfInspectionFeatures.includes(selectedFeatureId);
  const allowedFeatures = subscriptionSummary?.allowedFeatures ?? [];
  const selectedFeatureAllowed = subscriptionSummary ? allowedFeatures.includes(selectedFeatureId) : true;
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
    setDraggingId(null);
    if (clearInputValue && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function setUploadPassword(targetId: string, value: string) {
    setUploads((current) =>
      current.map((item) => (item.id === targetId ? { ...item, password: value } : item)),
    );
  }

  function removeUpload(targetId: string) {
    setUploads((current) => current.filter((item) => item.id !== targetId));
    setPagesError("");
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
    void fetchCapabilities()
      .then((data) => {
        setCapabilities(data);
      })
      .catch(() => {
        showToast("error", "Backend bağlantısı kurulamadı", "Önce FastAPI sunucusunu başlatın, sonra sayfayı yenileyin.");
      });
  }, []);

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
    if (selectedFeatureId !== "merge" || !mergeJob?.id) {
      return;
    }

    let active = true;
    let finished = false;

    const tick = async () => {
      if (!active || finished) {
        return;
      }

      try {
        const nextStatus = await fetchMergeJob(mergeJob.id);
        if (!active) {
          return;
        }

        setMergeJob(nextStatus);

        if (nextStatus.status === "failed") {
          showToast("error", "Birleştirme başarısız", nextStatus.error || "PDF birleştirme sırasında hata oluştu.");
          setSubmitting(false);
          finished = true;
          return;
        }

        showToast(
          "loading",
          nextStatus.status === "queued" ? "Birleştirme sırası oluşturuldu" : "Birleştirme sürüyor",
          `${nextStatus.where || "Dosyalar hazırlanıyor"} | Süre: ${formatElapsed(nextStatus.elapsed_seconds)}`,
        );

        if (nextStatus.status === "completed") {
          finished = true;
          await downloadMergeJob(nextStatus.id, selectedFeature.fallbackFilename);
          if (!active) {
            return;
          }
          await syncUsageAfterSuccess("merge");
          showToast("success", "İşlem tamamlandı", "Birleştirilen PDF başarıyla indirildi.");
          resetForm(true);
          setSubmitting(false);
          setMergeJob(null);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        const detail = error instanceof Error ? error.message : "Birleştirme durumu alınamadı.";
        showToast("error", "İlerleme bilgisi alınamadı", detail);
        setSubmitting(false);
        finished = true;
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
  }, [mergeJob?.id, selectedFeatureId, selectedFeature.fallbackFilename]);

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

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    if (user.preferredLanguage !== language) {
      setLanguage(user.preferredLanguage);
    }
  }, [isAuthenticated, language, setLanguage, user]);

  const splitModeDescription =
    splitMode === "single"
      ? "Seçtiğiniz sayfalar tek bir PDF dosyası içinde birleştirilerek indirilecektir."
      : "Seçtiğiniz sayfalar ayrı PDF dosyaları olarak hazırlanıp toplu indirme şeklinde sunulacaktır.";

  const introText = "Kurumsal web sürümüne hoş geldiniz. İstediğiniz modülü seçip işlemlerinizi güvenle başlatabilirsiniz.";
  const showSplitPasswordField =
    ["split", "pdf-to-word", "pdf-to-excel", "compress"].includes(selectedFeature.id) &&
    uploads.length > 0 &&
    currentPdfIsEncrypted;
  const showEncryptSourcePasswordField = selectedFeature.id === "encrypt" && uploads.length > 0 && currentPdfIsEncrypted;
  const mergeHasMissingPasswords = selectedFeature.id === "merge" && uploads.some((item) => item.encrypted && !item.password.trim());
  const splitInputDisabled = uploads.length === 0;
  const submitDisabled =
    submitting ||
    uploads.length === 0 ||
    !selectedFeatureAllowed ||
    (selectedFeature.id === "split" && (!!pagesError || !pagesText.trim())) ||
    (showSplitPasswordField && !password.trim()) ||
    (showEncryptSourcePasswordField && !inputPassword.trim()) ||
    (selectedFeature.id === "encrypt" && (!outputPassword.trim() || uploads.length === 0)) ||
    mergeHasMissingPasswords;
  const pickerButtonText = selectedFeature.multiple && uploads.length > 0 ? "Dosya Ekle" : "Dosya Seç";

  function openLegalPage(target: LegalView) {
    if (view === "landing" || view === "login" || view === "register" || view === "web") {
      setLegalBackView(view);
    }
    setView(target);
  }

  function openContactModal() {
    setContactError("");
    setContactSuccess("");
    setContactModalOpen(true);
  }

  function closeContactModal() {
    setContactModalOpen(false);
  }

  async function handleContactModalSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setContactError("");
    setContactSuccess("");

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

    try {
      setContactSubmitting(true);
      await submitContactForm({
        name: contactName.trim(),
        email: contactEmail.trim(),
        message: contactMessage.trim(),
        website: contactWebsite.trim(),
      });
      setContactSuccess(tr ? "Mesajınız başarıyla gönderildi" : "Your message has been sent successfully");
      setContactName("");
      setContactEmail("");
      setContactMessage("");
      setContactWebsite("");
    } catch (error) {
      setContactError(error instanceof Error ? error.message : tr ? "Gönderilemedi." : "Could not send.");
    } finally {
      setContactSubmitting(false);
    }
  }

  function closeLegalPage() {
    setView(legalBackView);
  }

  function openWorkspace() {
    setSelectedFeatureId("split");
    setAuthError("");
    setView(isAuthenticated ? "web" : "login");
  }

  async function handleAuthSubmit(payload: { email: string; password: string }) {
    try {
      setAuthSubmitting(true);
      setAuthError("");

      if (view === "register") {
        const registerResult = await register(payload.email, payload.password, language);
        setRegistrationSuccessBanner(registerResult.message);
        setView("login");
        return;
      } else {
        const loggedInUser = await login(payload.email, payload.password);
        setLanguage(loggedInUser.preferredLanguage || detectInitialLanguage());
        showToast("success", "Giriş başarılı", "Çalışma alanına yönlendiriliyorsunuz.");
      }

      setSelectedFeatureId("split");
      setView("web");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Kimlik doğrulama işlemi başarısız oldu.");
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
    setLanguage(nextLanguage);

    if (!isAuthenticated) {
      return;
    }

    try {
      await updatePreferredLanguage(nextLanguage);
    } catch (error) {
      showToast("error", "Dil tercihi kaydedilemedi", error instanceof Error ? error.message : "Dil tercihi senkronize edilemedi.");
    }
  }

  async function handlePlanChange(plan: PlanDefinition["name"]) {
    if (!accessToken) {
      showToast("error", "Oturum bulunamadı", "Plan değişikliği için yeniden giriş yapın.");
      return;
    }

    try {
      setPlanChangeLoading(plan);
      await changePlan(accessToken, plan);
      await refreshSubscriptionState();
      showToast("success", "Plan güncellendi", `${plan} planı hesabınıza uygulandı.`);
    } catch (error) {
      showToast("error", "Plan değiştirilemedi", error instanceof Error ? error.message : "Plan güncellemesi başarısız oldu.");
    } finally {
      setPlanChangeLoading(null);
    }
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

    const pageValidation = selectedFeature.id === "split" ? validatePagesInput(pagesText) : "";
    setPagesError(pageValidation);
    if (pageValidation) {
      showToast("error", "Sayfa numaraları geçersiz", pageValidation);
      return;
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
      showToast("error", "Şifre gerekli", "Şifreli PDF dosyaları için ilgili parola alanlarını doldurun.");
      return;
    }

    if (!selectedFeatureAllowed) {
      showToast("error", "Plan yükseltme gerekli", "Bu özellik mevcut planınızda bulunmuyor. Devam etmek için planınızı yükseltin.");
      return;
    }

    if (subscriptionSummary && subscriptionSummary.usage.dailyLimit !== null && subscriptionSummary.usage.remainingToday === 0) {
      showToast("error", "Günlük limit doldu", "Bugünkü işlem hakkınızı kullandınız. Devam etmek için planınızı yükseltin.");
      return;
    }

    try {
      setSubmitting(true);
      clearToast();

      if (selectedFeature.id === "merge") {
        const formData = new FormData();
        const passwordMap: Record<string, string> = {};
        uploads.forEach((item) => {
          formData.append("files", item.file);
          if (item.password.trim()) {
            passwordMap[item.file.name] = item.password.trim();
          }
        });
        formData.append("passwords_json", JSON.stringify(passwordMap));

        const { job_id } = await createMergeJob(formData);
        setMergeJob({
          id: job_id,
          status: "queued",
          message: "Sıraya alındı.",
          where: "",
          current: 0,
          total: 1,
          percent: 0,
          elapsed_seconds: 0,
          error: null,
          ready: false,
        });
        return;
      }

      showToast("loading", "İşlem başladı", "Lütfen bekleyin. Dosya boyutuna göre işlem süresi değişebilir.");

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

  async function handleNewFiles(fileList: File[]) {
    const incomingItems = createUploadItems(fileList);
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
          };
        } catch {
          return {
            ...item,
            encrypted: false,
            inspecting: false,
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
          authEmail={user?.email}
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
        <div className="min-h-screen bg-[#0f172a] px-6 py-12 font-sans text-slate-100 antialiased">
          <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-[28px] border border-white/[0.07] bg-slate-900/55 px-10 py-16 text-center shadow-[0_50px_100px_-24px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">NB PDF TOOLS</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">Oturum doğrulanıyor</h1>
            <p className="mt-4 text-base leading-8 text-slate-300">Güvenli erişim bilgileriniz kontrol ediliyor. Lütfen bekleyin.</p>
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
              {contactSuccess ? <p className="contact-modal__success">{contactSuccess}</p> : null}
              <button className="primary-action" type="submit" disabled={contactSubmitting}>
                {contactSubmitting ? contactCopy.submitting : contactCopy.submit}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={`toast toast--${toast.type}`}>
          <div className="toast__title">{toast.title}</div>
          <div className="toast__detail">{toast.detail}</div>
        </div>
      ) : null}

      <main className="page">
        <header className="hero-card">
          <div className="hero-inner">
            <h1>NB PDF TOOLS</h1>
            <p className="hero-subtitle">PDF SUITE BY NB GLOBAL STUDIO</p>
            <p className="hero-description">{introText}</p>
          </div>
          <div className="hero-actions">
            {user ? <span className="back-link">{`${user.email} | ${subscriptionSummary?.currentPlan.displayName ?? user.plan}`}</span> : null}
            <button type="button" className="back-link" onClick={() => void handleLogout()}>
              OTURUMU KAPAT
            </button>
            <button type="button" className="back-link back-link--primary" onClick={() => setView("landing")}>
              ← KURUMSAL KARŞILAMA EKRANI
            </button>
          </div>
        </header>

        <section className="subscription-card">
          <div className="subscription-card__header">
            <div>
              <p className="section-kicker">ABONELİK DURUMU</p>
              <h2>Planınızı ve kullanım hakkınızı buradan yönetin.</h2>
            </div>
            {subscriptionSummary ? (
              <div className="subscription-badge-group">
                <span className="subscription-badge subscription-badge--active">{subscriptionSummary.currentPlan.displayName}</span>
                <span className="subscription-badge">
                  {subscriptionSummary.usage.dailyLimit === null
                    ? "Sınırsız kullanım"
                    : `${subscriptionSummary.usage.usedToday}/${subscriptionSummary.usage.dailyLimit} işlem`}
                </span>
              </div>
            ) : null}
          </div>

          {subscriptionLoading ? (
            <p className="muted-text">Abonelik bilgileri yükleniyor...</p>
          ) : subscriptionSummary ? (
            <>
              <div className="subscription-stats">
                <div className="subscription-stat">
                  <span>Aktif plan</span>
                  <strong>{subscriptionSummary.currentPlan.displayName}</strong>
                </div>
                <div className="subscription-stat">
                  <span>Bugünkü kullanım</span>
                  <strong>
                    {subscriptionSummary.usage.dailyLimit === null
                      ? "Sınırsız"
                      : `${subscriptionSummary.usage.usedToday} / ${subscriptionSummary.usage.dailyLimit}`}
                  </strong>
                </div>
                <div className="subscription-stat">
                  <span>Kalan hak</span>
                  <strong>
                    {subscriptionSummary.usage.remainingToday === null ? "Sınırsız" : subscriptionSummary.usage.remainingToday}
                  </strong>
                </div>
              </div>

              <div className="subscription-plan-grid">
                {plans.map((plan) => {
                  const isCurrent = subscriptionSummary.currentPlan.name === plan.name;
                  return (
                    <article key={plan.name} className={`subscription-plan ${isCurrent ? "subscription-plan--active" : ""}`}>
                      <div className="subscription-plan__top">
                        <div>
                          <h3>{plan.displayName}</h3>
                          <p>{plan.description}</p>
                        </div>
                        {isCurrent ? <span className="subscription-badge subscription-badge--active">Aktif</span> : null}
                      </div>
                      <div className="subscription-plan__meta">
                        <span>{plan.dailyLimit === null ? "Limitsiz işlem" : `Günlük ${plan.dailyLimit} işlem`}</span>
                        <span>{plan.multiUser ? "Çok kullanıcılı yapı" : "Tek kullanıcı"}</span>
                      </div>
                      <button
                        type="button"
                        className="subscription-plan__action"
                        disabled={isCurrent || planChangeLoading === plan.name}
                        onClick={() => void handlePlanChange(plan.name)}
                      >
                        {isCurrent ? "Mevcut plan" : planChangeLoading === plan.name ? "Güncelleniyor..." : "Bu plana geç"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="muted-text">Abonelik özeti henüz yüklenemedi.</p>
          )}
        </section>

        <section className="menu-grid">
          {features.map((feature) => (
            <button
              key={feature.id}
              type="button"
              className={`menu-card ${selectedFeatureId === feature.id ? "active" : ""} ${
                subscriptionSummary && !allowedFeatures.includes(feature.id) ? "menu-card--locked" : ""
              }`}
              onClick={() => {
                if (subscriptionSummary && !allowedFeatures.includes(feature.id)) {
                  showToast("error", "Premium özellik", "Bu modül mevcut planınızda aktif değil. Yükseltme yaparak erişebilirsiniz.");
                  return;
                }
                setSelectedFeatureId(feature.id);
              }}
            >
              <span className="menu-card__icon">{feature.icon}</span>
              <span className="menu-card__title">{feature.title}</span>
              {subscriptionSummary && !allowedFeatures.includes(feature.id) ? <span className="menu-card__badge">PRO</span> : null}
            </button>
          ))}
        </section>

        <section className="workspace-card">
          <div className="workspace-card__header">
            <div>
              <p className="section-kicker">{selectedFeature.title}</p>
              <h2>{selectedFeature.description}</h2>
              {subscriptionSummary && !selectedFeatureAllowed ? (
                <p className="subscription-warning">Bu modül mevcut planınızda bulunmuyor. Devam etmek için planınızı yükseltin.</p>
              ) : null}
            </div>
          </div>

          {selectedFeature.id === "merge" && mergeJob ? (
            <div className="progress-panel">
              <div className="progress-panel__top">
                <strong>{mergeJob.where || "Dosyalar hazırlanıyor..."}</strong>
                <span>%{mergeJob.percent}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar__fill" style={{ width: `${mergeJob.percent}%` }} />
              </div>
              <div className="progress-panel__meta">
                <span>
                  Durum: {mergeJob.current}/{mergeJob.total}
                </span>
                <span>Süre: {formatElapsed(mergeJob.elapsed_seconds)}</span>
              </div>
            </div>
          ) : null}

          <form className="tool-form" onSubmit={submitCurrentFeature}>
            <label className="field">
              <span>Dosya Seç</span>
              <div className="file-picker-row">
                <button className="file-picker-button" type="button" onClick={triggerFilePicker}>
                  {pickerButtonText}
                </button>
                <span className="file-picker-note">
                  {selectedFeature.multiple
                    ? uploads.length > 0
                      ? "Yeni seçtiğiniz dosyalar mevcut listenin sonuna eklenir."
                      : "Birden fazla dosya seçebilirsiniz."
                    : "Tek dosya seçerek devam edin."}
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
                  <span>Sayfa Numaraları</span>
                  <input
                    type="text"
                    value={pagesText}
                    disabled={splitInputDisabled}
                    onKeyDown={(event) => {
                      const allowedKeys = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", ",", "-", "Home", "End"];
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
                      setPagesError(validatePagesInput(sanitized));
                    }}
                    placeholder="Örn: 1,2,3 veya 1-4,7"
                  />
                  {pagesError ? <span className="field-error">{pagesError}</span> : null}
                </label>

                <label className="field">
                  <span>Ayırma Modu (Tek PDF veya Ayrı Ayrı Kaydet)</span>
                  <select value={splitMode} onChange={(event) => setSplitMode(event.target.value)}>
                    <option value="single">Tek PDF'de Birleştir</option>
                    <option value="separate">Ayrı Ayrı Kaydet</option>
                  </select>
                  <span className="field-hint">{splitModeDescription}</span>
                </label>
              </>
            ) : null}

            {showSplitPasswordField ? (
              <label className="field">
                <span>Kaynak PDF Şifresi</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Seçilen PDF şifreli, parola girin"
                />
                <span className="field-hint">Seçtiğiniz PDF daha önce şifrelendiği için kaynak parolayı girmeniz gerekiyor.</span>
              </label>
            ) : null}

            {selectedFeature.id === "encrypt" ? (
              <>
                {showEncryptSourcePasswordField ? (
                  <label className="field field--full">
                    <span>Kaynak PDF Şifresi</span>
                    <input
                      type="password"
                      value={inputPassword}
                      onChange={(event) => setInputPassword(event.target.value)}
                      placeholder="Seçilen PDF şifreli, kaynak şifreyi girin"
                    />
                    <span className="field-hint">Bu PDF zaten şifreli. Devam etmek için önce mevcut şifreyi girin.</span>
                  </label>
                ) : null}

                <label className="field field--full">
                  <span>Yeni PDF Şifresi</span>
                  <input
                    type="password"
                    value={outputPassword}
                    disabled={uploads.length === 0}
                    onChange={(event) => setOutputPassword(event.target.value)}
                    placeholder={uploads.length === 0 ? "" : "Yeni parola girin"}
                  />
                </label>
              </>
            ) : null}

            <div className="selected-files">
              <div className="selected-files__header">
                <p>Seçilen Dosyalar</p>
                {selectedFeature.id === "merge" && uploads.length > 0 ? (
                  <span className="selected-files__info">
                    Dosyaları sürükleyip bırakarak sıralayabilirsiniz. Birleştirme işlemi bu sıraya göre yapılır.
                  </span>
                ) : null}
              </div>

              {uploads.length === 0 ? (
                <span className="muted-text">Henüz dosya seçilmedi.</span>
              ) : (
                <div className="selected-files__list">
                  {uploads.map((item, index) => (
                    <div
                      key={item.id}
                      className={`selected-file-card ${selectedFeature.id === "merge" ? "draggable" : ""} ${draggingId === item.id ? "dragging" : ""}`}
                      draggable={selectedFeature.id === "merge"}
                      onDragStart={(event) => {
                        if (selectedFeature.id !== "merge") {
                          return;
                        }
                        const ghost = document.createElement("canvas");
                        ghost.width = 1;
                        ghost.height = 1;
                        event.dataTransfer.setDragImage(ghost, 0, 0);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", item.id);
                        setDraggingId(item.id);
                      }}
                      onDragOver={(event) => {
                        if (selectedFeature.id !== "merge") {
                          return;
                        }
                        event.preventDefault();
                        const sourceId = event.dataTransfer.getData("text/plain");
                        const fromIndex = uploads.findIndex((upload) => upload.id === sourceId);
                        moveUpload(fromIndex, index);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      onDropCapture={() => setDraggingId(null)}
                    >
                      <div className="selected-file-card__main">
                        <div className="selected-file-card__text">
                          <strong>{item.file.name}</strong>
                          <div className="selected-file-card__meta">
                            {item.inspecting ? <span>PDF durumu kontrol ediliyor...</span> : null}
                            {!item.inspecting && item.encrypted ? <span className="warning-text">Şifreli PDF</span> : null}
                            {!item.inspecting && !item.encrypted ? <span>Hazır</span> : null}
                          </div>
                        </div>
                        <button type="button" className="remove-button" onClick={() => removeUpload(item.id)}>
                          Kaldır
                        </button>
                      </div>

                      {selectedFeature.id === "merge" && item.encrypted ? (
                        <label className="inline-password-field">
                          <span>Bu dosyanın şifresi</span>
                          <input
                            type="password"
                            value={item.password}
                            onChange={(event) => setUploadPassword(item.id, event.target.value)}
                            placeholder="PDF parolasını girin"
                          />
                        </label>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button className="primary-action" type="submit" disabled={submitDisabled}>
              {submitting ? "İŞLEM SÜRÜYOR..." : selectedFeature.buttonText}
            </button>
          </form>
        </section>

        <section className="notes-card">
          <h3>Web Sürümü Notları</h3>
          <ul>
            {(capabilities?.notes ?? []).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <div className="environment-line">
            <span>Platform: {capabilities?.environment.platform ?? "-"}</span>
            <span>Tesseract: {capabilities?.environment.tesseract_cmd || "yapılandırılmadı"}</span>
          </div>
        </section>
      </main>

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
