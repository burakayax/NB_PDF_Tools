import type { FeatureKey } from "../api/subscription";
import type { Language } from "./landing";

export const SIDEBAR_TOOL_ORDER: FeatureKey[] = [
  "split",
  "merge",
  "pdf-to-word",
  "compress",
  "word-to-pdf",
  "excel-to-pdf",
  "pdf-to-excel",
  "encrypt",
];

const SB: Record<FeatureKey, { tr: string; en: string }> = {
  split: { tr: "PDF Ayır", en: "Split PDF" },
  merge: { tr: "PDF Birleştir", en: "Merge PDF" },
  "pdf-to-word": { tr: "PDF → Word", en: "PDF → Word" },
  "word-to-pdf": { tr: "Word → PDF", en: "Word → PDF" },
  "excel-to-pdf": { tr: "Excel → PDF", en: "Excel → PDF" },
  "pdf-to-excel": { tr: "PDF → Excel", en: "PDF → Excel" },
  compress: { tr: "PDF Sıkıştır", en: "Compress PDF" },
  encrypt: { tr: "PDF Şifrele", en: "Encrypt PDF" },
};

export function sidebarToolLabel(id: FeatureKey, lang: Language): string {
  return SB[id][lang];
}

export function ws(lang: Language) {
  const tr = lang === "tr";
  return {
    planNav: tr ? "Planım" : "My plan",
    homeNav: tr ? "Ana Sayfa" : "Home",
    langSection: tr ? "Dil" : "Language",
    emptyStateTitle: tr ? "Henüz işlem yapılmadı" : "Nothing here yet",
    emptyStateHint: tr
      ? "İşlem başlatmak için yukarıdan dosya seçin. Dosya eklendiğinde burada listelenir."
      : "Choose a file above to start. Selected files appear here.",
    mergeReorderHint: tr
      ? "Dosya satırını sürükleyerek sırayı değiştirin veya okları kullanın. Liste uzunsa sürüklerken kenara yaklaştığınızda liste kayar. Birleştirme bu sıraya göre yapılır."
      : "Drag a file row to reorder, or use the arrows. Near the top or bottom edge of the list, the list scrolls while you drag. Merge follows this order.",
    mergeDragHandle: tr ? "Sırayı değiştirmek için sürükleyin" : "Drag to reorder",
    proGateTitle: tr ? "Ücretli plan özelliği" : "Paid plan feature",
    proGateBody: tr
      ? "Bu sayfa yalnızca Basic veya Pro üyeler içindir. Planınızı yükseltmek için devam edin."
      : "This tool is available on Basic or Pro plans. Upgrade to unlock it.",
    proGateCta: tr ? "Plan değiştir" : "Change plan",
    lockedFeatureTooltip: tr
      ? "Bu araç mevcut aboneliğinizde kapalıdır"
      : "This tool is not included in your current subscription",
    filePick: tr ? "Dosya Seç" : "Choose file",
    fileAdd: tr ? "Dosya Ekle" : "Add file",
    selectedFiles: tr ? "Seçilen dosyalar" : "Selected files",
    remove: tr ? "Kaldır" : "Remove",
    up: tr ? "Yukarı" : "Up",
    down: tr ? "Aşağı" : "Down",
    pagesLabel: tr ? "Sayfa numaraları" : "Page numbers",
    pagesPlaceholder: tr ? "Örn: 1,2,3 veya 1-4,7" : "e.g. 1,2,3 or 1-4,7",
    splitModeLabel: tr ? "Ayırma modu" : "Split mode",
    splitModeSingle: tr ? "Tek PDF'de birleştir" : "Single merged PDF",
    splitModeSeparate: tr ? "Ayrı ayrı kaydet (ZIP)" : "Separate files (ZIP)",
    sourcePassword: tr ? "Kaynak PDF şifresi" : "Source PDF password",
    sourcePasswordHint: tr
      ? "PDF şifreliyse açmak için parola gerekir."
      : "Required if the PDF is password-protected.",
    newPdfPassword: tr ? "Yeni PDF şifresi" : "New PDF password",
    newPdfPasswordPh: tr ? "Yeni parola girin" : "Enter new password",
    perFilePassword: tr ? "Bu dosyanın şifresi" : "Password for this file",
    perFilePasswordPh: tr ? "PDF parolasını girin" : "Enter PDF password",
    mergeEncryptedAlert: tr
      ? "Bu dosya şifre korumalı. Birleştirme için aşağıya PDF parolasını girin."
      : "This file is password-protected. Enter the PDF password below to include it in the merge.",
    mergeClearAll: tr ? "Tüm dosyaları temizle" : "Clear all files",
    mergeDuplicateFileTitle: tr ? "Dosya zaten listede" : "File already added",
    mergeDuplicateFileDetail: tr
      ? "Seçtiğiniz PDF bu birleştirme listesinde zaten yer almaktadır; aynı dosya iki kez eklenmez."
      : "This PDF is already in the merge list; duplicate files are not added.",
    mergePasswordConfirm: tr ? "Parolayı doğrula" : "Verify password",
    mergePasswordVerifying: tr ? "Doğrulanıyor…" : "Verifying…",
    mergePasswordWrong: tr
      ? "Girdiğiniz parola bu PDF için geçerli değildir. Lütfen dosya sahibi tarafından tanımlanan parolayı kontrol edin."
      : "The password entered is not valid for this PDF. Please check the document password and try again.",
    mergePasswordOk: tr ? "Parola doğrulandı" : "Password verified",
    usageRemainingShort: tr ? "Kalan günlük işlem" : "Daily operations left",
    usageUnlimited: tr ? "Sınırsız" : "Unlimited",
    usageDailyHeading: tr ? "Günlük kullanım" : "Daily usage",
    usageUsedTodayLine: (used: number, limit: number) =>
      tr ? `Bugün kullanılan: ${used} / ${limit} işlem` : `Used today: ${used} / ${limit} operations`,
    /** Free plan without a hard daily cap (soft friction after `fastRuns` fast operations). */
    usageSoftTierLine: (used: number, fastRuns: number) =>
      tr
        ? `Bugün: ${used} işlem (ilk ${fastRuns} işlem en hızlı)`
        : `Today: ${used} operations (first ${fastRuns} are fastest)`,
    usageCountOfLimit: (used: number, limit: number) =>
      tr ? `${used} / ${limit} işlem` : `${used} / ${limit} ops`,
    usageRemainingLine: (n: number) => (tr ? `Kalan işlem: ${n}` : `Remaining: ${n}`),
    usageNoDailyCapLine: tr ? "Günlük işlem üst sınırı yok" : "No daily operation cap",
    usageUpgradeCta: tr ? "Sınırsız kullanım için PRO'ya geç" : "Upgrade to PRO for unlimited usage",
    /** Üst menüdeki kısa yükseltme düğmesi */
    navbarUpgrade: tr ? "Yükselt" : "Upgrade",
    usageLimitReachedTitle: tr ? "Günlük limit doldu" : "Daily limit reached",
    usageLimitReachedDetail: tr
      ? "Abonelik sayfası açıldı. Sınırsız kullanım için PRO planına geçebilirsiniz."
      : "The subscription page is open. Upgrade to PRO for unlimited usage.",
    usageQuotaExhaustedBanner: tr
      ? "Bugünkü ücretsiz işlem hakkınızı kullandınız. Devam etmek için plan yükseltin."
      : "You've used your free daily operations for today. Upgrade to continue.",
    usageSoftFrictionBanner: tr
      ? "Ücretsiz planda ek işlemler kısa bir bekleme ile devam eder. Anında işlem ve öncelik için PRO'ya geçin."
      : "Additional runs on Free may include a short wait. Upgrade to Pro for instant, priority processing.",
    proBenefitsKicker: tr ? "PRO değer önerisi" : "PRO value",
    proBenefitsTitle: tr
      ? "Daha hızlı işlem, tutarlı kalite, sınırsız kullanım"
      : "Faster processing, dependable quality, unlimited usage",
    proBenefitsIntro: tr
      ? "Ücretsiz plan denemek ve hafif kullanım için uygundur. Belge hacmi arttığında veya tüm araçlara ihtiyaç duyduğunuzda PRO, üretkenliği sürdürülebilir kılan doğal yükseltmedir."
      : "Free is great for trying the product and light workloads. When volume grows or you need the full toolkit, PRO is the natural upgrade to keep productivity sustainable.",
    proBenefitTagSpeed: tr ? "Hız" : "Speed",
    proBenefitSpeed: tr
      ? "Öncelikli işlem ve daha akıcı çalışma — kuyrukta daha az bekleme, yoğun saatlerde daha öngörülebilir süreler."
      : "Priority handling and smoother runs — less queue friction and more predictable turnaround when it matters.",
    proBenefitTagQuality: tr ? "Kalite" : "Quality",
    proBenefitQuality: tr
      ? "Tam PDF araç seti ve tutarlı çıktı — dönüştürme, birleştirme, sıkıştırma ve şifrelemede profesyonel sonuçlar."
      : "The full PDF toolkit with dependable output across convert, merge, compress, and protect workflows.",
    proBenefitTagUnlimited: tr ? "Sınırsız" : "Unlimited",
    proBenefitUnlimited: tr
      ? "Günlük kota üst sınırı yok — limit dolunca durmak yerine aynı gün içinde işinize devam edersiniz."
      : "No daily quota ceiling — keep working through busy days instead of stopping when a counter hits zero.",
    proBenefitTagAccess: tr ? "Tam erişim" : "Full access",
    proBenefitFullAccess: tr
      ? "Ücretsiz planda yalnızca Pro ile sunulan ileri modüllere tam erişim — tek abonelikte tüm yetenekler."
      : "Full access to advanced modules that remain gated on Free — one subscription, every capability unlocked.",
    validationPagesNeedPassword: tr
      ? "Sayfa sınırını doğrulamak için önce PDF parolasını girin."
      : "Enter the PDF password first to validate page numbers against the document.",
    inspectFailedTitle: tr ? "PDF ön kontrolü başarısız" : "PDF preview failed",
    inspectFailedDetail: tr
      ? "Sunucuya bağlanılamıyor veya dosya okunamadı. API adresini ve sunucuyu kontrol edin."
      : "Could not reach the server or read the file. Check API URL and that the backend is running.",
    inspecting: tr ? "PDF kontrol ediliyor…" : "Checking PDF…",
    encryptedBadge: tr ? "Şifreli PDF" : "Encrypted PDF",
    ready: tr ? "Hazır" : "Ready",
    compressEstimateLine: (minPct: number, maxPct: number) =>
      tr
        ? `Tahmini boyut düşüşü: ~%${minPct}–${maxPct} (tipik)`
        : `Est. size reduction: ~${minPct}–${maxPct}% (typical)`,
    compressEstimateTooltip: tr
      ? "Yaklaşık tahmin; gerçek sonuç PDF içeriğine göre değişir."
      : "Approximate; actual savings depend on PDF content.",
    notesTitle: tr ? "Web sürümü notları" : "Web edition notes",
    platform: tr ? "Platform" : "Platform",
    tesseract: tr ? "Tesseract" : "Tesseract",
    notConfigured: tr ? "yapılandırılmadı" : "not configured",
    processing: tr ? "İŞLEM SÜRÜYOR…" : "PROCESSING…",
    processingQueued: tr ? "SIRA / İŞLEM…" : "QUEUED / WORKING…",
    processingPremium: tr ? "ÖNCELİKLİ İŞLEM…" : "PRIORITY PROCESSING…",
    subscriptionWarn: tr
      ? "Bu modül mevcut planınızda yok. Plan yükselterek kullanabilirsiniz."
      : "This tool is not on your current plan. Upgrade to use it.",
    mergeProgressPreparing: tr ? "Dosyalar hazırlanıyor…" : "Preparing files…",
    mergeProgressStarting: tr ? "İstek gönderiliyor…" : "Sending request…",
    mergeProgressQueueFree: tr
      ? "Sıra ve sunucu onayı — yoğun kullanımda kısa sürebilir…"
      : "Queue and server check — may take a moment when busy…",
    mergeProgressQueuePremium: tr
      ? "Öncelikli hat — birleştirme başlatılıyor…"
      : "Priority lane — starting merge…",
    toolProgressSub: tr ? "Tamamlanınca dosya indirilecek." : "The file will download when ready.",
    toolProgressSubQueueFree: tr
      ? "Ücretsiz planda sıra ve işlem süresi dosya boyutuna ve araç türüne göre değişir."
      : "On Free, queue and processing time vary by file size and tool type.",
    toolProgressSubPremium: tr
      ? "Basic/Pro: ücretli planda öncelikli işlem ve tam kalite; ücretsiz sıra gecikmesi yok."
      : "Basic/Pro: priority processing and full quality on paid plans — no free-tier queue delays.",
    toolProgressPhaseQueueFree: tr
      ? "Sırada / sunucuya bağlanılıyor…"
      : "In queue / connecting to server…",
    toolProgressPhaseHandoff: tr ? "İşlem sunucuda başlatılıyor…" : "Starting work on the server…",
    toolProgressPhaseAnalyzing: tr ? "Dosya analiz ediliyor…" : "Analyzing file…",
    toolProgressPhaseCompressing: tr ? "Sıkıştırma uygulanıyor…" : "Applying compression…",
    toolProgressPhaseProcessing: tr ? "İşlem uygulanıyor…" : "Processing…",
    toolProgressPhaseFinishing: tr ? "Son işlemler…" : "Finalizing…",
    toolProgressPhaseMerging: tr ? "PDF'ler birleştiriliyor…" : "Merging PDFs…",
    toolProgressSuccessTitle: tr ? "İşlem tamamlandı" : "Completed",
    toolDownloadAgain: tr ? "Tekrar indir" : "Download again",
    toolProgressDismiss: tr ? "Kapat" : "Dismiss",
    toolProgressNativeDownloadHint: tr
      ? "İndirme tarayıcıya bırakıldı; tekrar için indirilenler klasörünü kontrol edin."
      : "Download was handed off to the browser; check your Downloads folder.",
    toolProgressLargeFileHint: (mb: number) =>
      tr
        ? `Dosya büyük (~${mb.toFixed(1)} MB); sunucuda işlem uzun sürebilir.`
        : `Large file (~${mb.toFixed(1)} MB); server processing may take longer.`,
    toolProgressElapsed: (sec: number) =>
      tr ? `Geçen süre: ${sec} sn` : `Elapsed: ${sec}s`,
    mergeStatus: tr ? "Durum" : "Status",
    mergeEtaLine: (totalSec: number) => {
      const s = Math.max(0, Math.round(totalSec));
      if (!tr) {
        if (s < 60) {
          return `Est. ~${s}s remaining`;
        }
        return `Est. ~${Math.floor(s / 60)}m ${s % 60}s remaining`;
      }
      if (s < 60) {
        return `Tahmini kalan: ~${s} sn`;
      }
      return `Tahmini kalan: ~${Math.floor(s / 60)} dk ${s % 60} sn`;
    },
    mergeToastFailedTitle: tr ? "Birleştirme başarısız" : "Merge failed",
    mergeToastFailedGeneric: tr ? "PDF birleştirme sırasında hata oluştu." : "An error occurred while merging PDFs.",
    mergeToastQueued: tr ? "Birleştirme sırası oluşturuldu" : "Merge job queued",
    mergeToastRunning: tr ? "Birleştirme sürüyor" : "Merging…",
    mergeToastSuccessTitle: tr ? "İşlem tamamlandı" : "Done",
    mergeToastSuccessBody: tr ? "Birleştirilen PDF indirildi." : "Merged PDF downloaded.",
    mergeToastPollErrorTitle: tr ? "İlerleme bilgisi alınamadı" : "Could not read progress",
    mergeToastPollErrorDetail: tr ? "Birleştirme durumu alınamadı." : "Merge status could not be loaded.",
    mergeToastDownloadErrorTitle: tr ? "İndirme tamamlanamadı" : "Download failed",
    mergeButtonHintInspecting: tr
      ? "Ön kontrol tamamlanana kadar birleştirme kapalı — tüm satırlarda Hazır görün."
      : "Merge unlocks after the quick check — every row should show Ready.",
    mergeButtonHintPassword: tr
      ? "Şifreli dosyalarda önce Parolayı doğrula — ardından birleştirme açılır."
      : "For locked files, use Verify password first — then merge enables.",
    validationPagesRequired: tr ? "Sayfa numaralarını girin." : "Enter page numbers.",
    validationPagesInvalid: tr ? "Geçerli bir sayfa listesi girin." : "Enter a valid page list.",
    validationRangeInvalid: (token: string) =>
      tr ? `Geçersiz aralık: ${token}` : `Invalid range: ${token}`,
    validationRangeOrder: (token: string) =>
      tr ? `Başlangıç bitişten büyük olamaz: ${token}` : `Start cannot exceed end: ${token}`,
    validationPageInvalid: (token: string) =>
      tr ? `Geçersiz sayfa: ${token}` : `Invalid page: ${token}`,
    validationPageTooHigh: (max: number) =>
      tr
        ? `PDF yalnızca ${max} sayfa içeriyor; girdiğiniz sayfalar bu sınırı aşıyor.`
        : `This PDF has only ${max} page(s); your selection exceeds that.`,
    filePickNoteSingle: tr ? "Tek dosya seçerek devam edin." : "Select a single file to continue.",
    filePickNoteMulti: tr ? "Birden fazla dosya seçebilirsiniz." : "You can select multiple files.",
    filePickNoteAppend: tr ? "Yeni seçilen dosyalar listenin sonuna eklenir." : "New files are appended to the list.",
    upgradeNudgeAria: tr ? "Plan yükseltme önerisi" : "Upgrade suggestion",
    /** Behavioral nudges after soft limit (1), repeated use (2), multiple queued delays (3). */
    upgradeNudgeTierBody: (tier: 1 | 2 | 3) => {
      if (tier === 1) {
        return tr
          ? "Ücretsiz limit doldu. İşlem daha yavaş sürebilir."
          : "Free limit reached. Processing may be slower.";
      }
      if (tier === 2) {
        return tr
          ? "Bu aracı sık kullanıyorsunuz. Premium kullanıcılar anında sonuç alır."
          : "You are using this tool frequently. Premium users get instant results.";
      }
      return tr
        ? "Beklemeyi kaldırmak ve tam hıza geçmek için yükseltin."
        : "Upgrade to remove waiting and unlock full speed.";
    },
    upgradeNudgeContinueFree: tr ? "Beklemeden devam et" : "Continue without waiting",
    upgradeNudgeUpgradeInstant: tr ? "Anında işlem için yükselt" : "Upgrade for instant processing",
    /** Shown while a free-tier job is in progress (queue / server delay monetization). */
    delayMonetizationDuringBody: tr
      ? "Ücretsiz planda işlemler daha yavaş sürebilir."
      : "Free users may experience slower processing.",
    delayMonetizationInstantCta: tr ? "Anında işlem için yükselt" : "Upgrade for instant processing",
    /** Subtle reminder after a run that used free-tier queue / delay. */
    delayMonetizationAfterHint: tr
      ? "Sonraki işlemlerde beklemeden devam etmek ister misiniz? Öncelikli hattı açın."
      : "Want instant processing on your next run? Unlock the priority lane.",
    delayMonetizationAfterDismiss: tr ? "Gizle" : "Hide",
  };
}

export type UpgradeNudgeTierWeb = 0 | 1 | 2 | 3;

/** Free tier: 0 = none, 1 = past soft ops, 2 = repeated daily use, 3 = multiple server delays today. */
export function computeUpgradeNudgeTierWeb(input: {
  planIsFree: boolean;
  softFrictionAfterOps: number;
  usedToday: number;
  throttleEventsToday: number;
  /** Account lifetime delayed asserts (stronger nudges for heavy friction users). */
  lifetimeThrottleEvents?: number;
  /** Account lifetime completed ops. */
  lifetimeTotalOps?: number;
}): UpgradeNudgeTierWeb {
  if (!input.planIsFree) {
    return 0;
  }
  const soft = Math.max(1, Math.floor(input.softFrictionAfterOps));
  const lt = input.lifetimeThrottleEvents ?? 0;
  const lo = input.lifetimeTotalOps ?? 0;

  let tier: UpgradeNudgeTierWeb = 0;
  if (input.usedToday < soft) {
    tier = 0;
  } else if (input.throttleEventsToday >= 2) {
    tier = 3;
  } else if (input.usedToday >= soft + 3) {
    tier = 2;
  } else {
    tier = 1;
  }

  if (tier === 0 && (lt >= 12 || lo >= 80)) {
    tier = 1;
  }
  if (lt >= 12) {
    tier = Math.max(tier, 2) as UpgradeNudgeTierWeb;
  }
  if (lt >= 22 || lo >= 160) {
    tier = Math.max(tier, 3) as UpgradeNudgeTierWeb;
  }

  return Math.min(3, tier) as UpgradeNudgeTierWeb;
}

export function featureCopy(id: FeatureKey, lang: Language): { title: string; description: string; button: string } {
  const tr = lang === "tr";
  const map: Record<FeatureKey, { title: string; description: string; button: string }> = {
    split: {
      title: tr ? "SAYFA AYIR" : "SPLIT PAGES",
      description: tr
        ? "Seçilen PDF içinden istediğiniz sayfaları düzenli ve güvenli biçimde ayırır."
        : "Extract selected pages from your PDF safely.",
      button: tr ? "SAYFALARI AYIR" : "SPLIT PAGES",
    },
    merge: {
      title: tr ? "PDF BİRLEŞTİR" : "MERGE PDF",
      description: tr
        ? "Birden fazla PDF dosyasını istediğiniz sıraya göre tek dosyada birleştirir."
        : "Combine multiple PDFs in your chosen order.",
      button: tr ? "PDF'LERİ BİRLEŞTİR" : "MERGE PDFS",
    },
    "pdf-to-word": {
      title: tr ? "PDF → WORD" : "PDF → WORD",
      description: tr
        ? "PDF dosyasını düzenlenebilir Word belgesine dönüştürür (metin tabanlı PDF'ler)."
        : "Convert PDF to an editable Word document (text-based PDFs).",
      button: tr ? "WORD İNDİR" : "DOWNLOAD WORD",
    },
    "word-to-pdf": {
      title: tr ? "WORD → PDF" : "WORD → PDF",
      description: tr ? "Word belgesini PDF biçiminde dışa aktarır." : "Export a Word document to PDF.",
      button: tr ? "PDF İNDİR" : "DOWNLOAD PDF",
    },
    "excel-to-pdf": {
      title: tr ? "EXCEL → PDF" : "EXCEL → PDF",
      description: tr ? "Excel tablolarını PDF biçimine dönüştürür." : "Convert Excel spreadsheets to PDF.",
      button: tr ? "PDF İNDİR" : "DOWNLOAD PDF",
    },
    "pdf-to-excel": {
      title: tr ? "PDF → EXCEL" : "PDF → EXCEL",
      description: tr
        ? "PDF tablo yapısını korumaya odaklanarak Excel çıktısı oluşturur."
        : "Build an Excel file while preserving table structure where possible.",
      button: tr ? "EXCEL İNDİR" : "DOWNLOAD EXCEL",
    },
    compress: {
      title: tr ? "PDF SIKIŞTIR" : "COMPRESS PDF",
      description: tr
        ? "PDF akışını optimize ederek dosya boyutunu küçültmeye çalışır."
        : "Optimize the PDF stream to reduce file size.",
      button: tr ? "SIKIŞTIRILMIŞ PDF İNDİR" : "DOWNLOAD COMPRESSED PDF",
    },
    encrypt: {
      title: tr ? "PDF ŞİFRELE" : "ENCRYPT PDF",
      description: tr ? "PDF dosyasına güvenli bir açılış parolası uygular." : "Apply an open password to protect the PDF.",
      button: tr ? "ŞİFRELİ PDF İNDİR" : "DOWNLOAD ENCRYPTED PDF",
    },
  };
  return map[id];
}

/** Boş veya sadece format; max sayfa sınırı ayrı kontrol edilir. */
export function validatePagesFormat(value: string, lang: Language): string {
  const raw = value.trim();
  const L = ws(lang);
  if (!raw) {
    return "";
  }
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return L.validationPagesInvalid;
  }
  for (const token of parts) {
    if (token.includes("-")) {
      const [start, end] = token.split("-", 2).map((x) => x.trim());
      if (!/^\d+$/.test(start) || !/^\d+$/.test(end)) {
        return L.validationRangeInvalid(token);
      }
      if (Number(start) > Number(end)) {
        return L.validationRangeOrder(token);
      }
    } else if (!/^\d+$/.test(token)) {
      return L.validationPageInvalid(token);
    }
  }
  return "";
}

export function maxPageInSelection(value: string): number | null {
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  let maxP = 0;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  for (const token of parts) {
    if (token.includes("-")) {
      const [a, b] = token.split("-", 2).map((x) => x.trim());
      if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) {
        return null;
      }
      maxP = Math.max(maxP, Number(a), Number(b));
    } else if (/^\d+$/.test(token)) {
      maxP = Math.max(maxP, Number(token));
    } else {
      return null;
    }
  }
  return maxP || null;
}

export function validatePagesMax(value: string, maxPage: number | null, lang: Language): string {
  if (!maxPage || maxPage < 1) {
    return "";
  }
  const fmt = validatePagesFormat(value, lang);
  if (fmt) {
    return fmt;
  }
  const hi = maxPageInSelection(value);
  if (hi === null) {
    return "";
  }
  if (hi > maxPage) {
    return ws(lang).validationPageTooHigh(maxPage);
  }
  return "";
}
