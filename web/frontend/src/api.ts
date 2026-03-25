/**
 * PDF API kök adresi.
 * - `npm run dev`: boş string → istekler `/api/...` (Vite aynı origin + proxy → :8000). Tarayıcı doğrudan :8000’e gitmez, CORS gerekmez.
 * - `vite build` / önizleme: VITE_API_BASE (ör. tam URL) veya boş → göreli /api (aynı site ters proxy).
 */
function getPdfApiBase(): string {
  if (import.meta.env.DEV) {
    return "";
  }
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    const p = window.location.port;
    if ((h === "localhost" || h === "127.0.0.1") && p === "4173") {
      return "";
    }
  }
  const raw = import.meta.env.VITE_API_BASE;
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.replace(/\/$/, "");
  }
  return "";
}

const API_BASE = getPdfApiBase();

/** Geliştirmede Vite proxy takılırsa aynı yolu doğrudan PDF API köküne denemek için (örn. 127.0.0.1:8000). */
function devPdfApiDirectOrigin(): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  const raw = import.meta.env.VITE_PDF_PROXY_TARGET || "http://127.0.0.1:8000";
  return raw.replace(/\/$/, "");
}

/** Ağ hatası (Failed to fetch) için anlaşılır mesaj üretir. */
async function pdfFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    const baseHint =
      API_BASE === ""
        ? import.meta.env.DEV
          ? "Geliştirmede Vite /api → 127.0.0.1:8000. Proje kökünde `npm run dev` veya `node scripts/run-pdf-api.mjs` çalıştırın; yalnızca `web/frontend` içindeki `npm run dev` PDF API’yi başlatmaz."
          : "Üretimde aynı sitede /api yoksa derlemede VITE_API_BASE ile PDF sunucu adresini verin."
        : `Beklenen PDF API: ${API_BASE}`;
    const msg =
      e instanceof TypeError
        ? `PDF sunucusuna ulaşılamadı. ${baseHint} FastAPI’nin çalıştığından emin olun.`
        : e instanceof Error
          ? e.message
          : String(e);
    throw new Error(msg);
  }
}

/** Ağ kopması / geçici proxy hatalarında (Failed to fetch) birkaç kez dener; dev’de proxy sonrası doğrudan PDF API. */
async function pdfFetchWithRetry(
  url: string,
  init?: RequestInit,
  retries = 4,
  baseDelayMs = 380,
): Promise<Response> {
  const direct = devPdfApiDirectOrigin();
  const candidates: string[] = [url];
  if (direct && url.startsWith("/")) {
    candidates.push(`${direct}${url}`);
  }

  let last: unknown;
  for (const candidate of candidates) {
    const isCrossOrigin = /^https?:\/\//i.test(candidate);
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await pdfFetch(candidate, {
          cache: "no-store",
          mode: isCrossOrigin ? "cors" : "same-origin",
          ...init,
        });
      } catch (e) {
        last = e;
        if (attempt < retries - 1) {
          await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
        }
      }
    }
  }
  throw last;
}

type MergeJobStatus = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  message: string;
  where: string;
  current: number;
  total: number;
  percent: number;
  elapsed_seconds: number;
  error?: string | null;
  ready: boolean;
};

function extractFilename(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1]);
  }
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? fallback;
}

function detailToMessage(detail: unknown): string {
  if (detail == null) {
    return "";
  }
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: string }).msg);
        }
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join("; ");
  }
  if (typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    if (typeof o.msg === "string") {
      return o.msg;
    }
    if (typeof o.message === "string") {
      return o.message;
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail);
}

/** Vite proxy 502 vb. boş/HTML gövde; kullanıcıya gerçek nedeni söyler. */
function gatewayUnreachableHint(status: number): string {
  if (status !== 502 && status !== 503 && status !== 504) {
    return "";
  }
  return "PDF API kapalı veya 127.0.0.1:8000 yanıt vermiyor. Önerilen: proje kökünde (NB_PDF_Tools) `npm run dev` veya `node scripts/run-pdf-api.mjs`. Alternatif: `cd web\\backend` → `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.";
}

async function ensureOk(response: Response, defaultMessage: string) {
  if (response.ok) {
    return;
  }
  const status = response.status;
  const hint = gatewayUnreachableHint(status);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let payload: { detail?: unknown };
    try {
      payload = (await response.json()) as { detail?: unknown };
    } catch {
      throw new Error(hint || defaultMessage);
    }
    const msg = detailToMessage(payload.detail);
    throw new Error(msg || hint || defaultMessage);
  }
  const errorText = (await response.text()).trim();
  const looksLikeHtml = errorText.startsWith("<") || errorText.toLowerCase().includes("<!doctype");
  if (!errorText || looksLikeHtml) {
    throw new Error(hint || defaultMessage);
  }
  throw new Error(errorText);
}

function buildToolApiUrl(endpoint: string): string {
  const ep = endpoint.replace(/^\/+/, "");
  const base = API_BASE.replace(/\/$/, "");
  if (base === "") {
    return `/api/${ep}`;
  }
  return `${base}/api/${ep}`;
}

function shouldUseBrowserNativeDownload(urlPathOrFull: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (urlPathOrFull.startsWith("/")) {
    return true;
  }
  try {
    return new URL(urlPathOrFull).origin === window.location.origin;
  } catch {
    return false;
  }
}

function parsePossibleJsonError(text: string): string | null {
  const t = text.trim();
  if (!t.startsWith("{") || (t.length > 8000 && !t.startsWith('{"'))) {
    return null;
  }
  try {
    const o = JSON.parse(t) as { detail?: unknown; message?: string };
    if (typeof o.message === "string" && o.message.trim()) {
      return o.message.trim();
    }
    if (o.detail != null) {
      if (typeof o.detail === "string") {
        return o.detail;
      }
      if (Array.isArray(o.detail) && o.detail[0] && typeof o.detail[0] === "object" && "msg" in o.detail[0]) {
        return String((o.detail[0] as { msg: string }).msg);
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** iframe içinde API/HTTP hata sayfası var mı (başarılı dosya indirmesinde genelde boş veya ikili). */
function probeIframeForError(doc: Document | null | undefined): string | null {
  try {
    if (!doc?.body) {
      return null;
    }
    const text = doc.body.innerText?.trim() ?? "";
    if (text.length === 0 || text.length >= 12_000) {
      return null;
    }
    const errMsg = parsePossibleJsonError(text);
    if (errMsg) {
      return errMsg;
    }
    if (
      text.includes("502 Bad Gateway") ||
      text.includes("503 Service Unavailable") ||
      text.includes("504 Gateway Timeout")
    ) {
      return gatewayUnreachableHint(502) || "PDF API geçici olarak yanıt vermiyor.";
    }
    if (/internal\s+server\s+error/i.test(text) || /\b500\b\s+Internal\s+Server\s+Error/i.test(text)) {
      return "Sunucu hatası (500). PDF API günlüklerini veya sunucu bağımlılıklarını kontrol edin.";
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * POST sonucu dosyayı fetch+blob yerine iframe + form ile alır; büyük PDF çıktılarında akışın kesilmesini önler.
 * Content-Disposition: attachment ile bazı tarayıcılarda iframe `load` hiç tetiklenmez; PerformanceObserver ile tamamlanma yakalanır.
 */
function postFormDataForFileDownload(actionPath: string, formData: FormData): Promise<void> {
  const actionUrl = actionPath.startsWith("http")
    ? actionPath
    : `${window.location.origin}${actionPath.startsWith("/") ? actionPath : `/${actionPath}`}`;

  const target = new URL(actionUrl, window.location.href);
  const targetKey = `${target.origin}${target.pathname}`;

  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    const frameName = `nbpdf-dl-${Date.now()}`;
    iframe.name = frameName;
    iframe.setAttribute("name", frameName);
    iframe.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
    iframe.setAttribute("aria-hidden", "true");

    let settled = false;
    let perfObs: PerformanceObserver | null = null;
    let responseFinalizeScheduled = false;

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve();
      }
    }, 900_000);

    function cleanup() {
      window.clearTimeout(timer);
      try {
        perfObs?.disconnect();
      } catch {
        /* ignore */
      }
      perfObs = null;
      iframe.removeEventListener("load", onBlankReady);
      iframe.removeEventListener("load", onResponseLoad);
      window.setTimeout(() => iframe.remove(), 90_000);
    }

    function finishReject(msg: string) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error(msg));
    }

    function finishOk() {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    }

    function finalizeAfterResponse() {
      if (settled || responseFinalizeScheduled) {
        return;
      }
      responseFinalizeScheduled = true;
      window.setTimeout(() => {
        if (settled) {
          return;
        }
        const err = probeIframeForError(iframe.contentDocument ?? undefined);
        if (err) {
          finishReject(err);
          return;
        }
        finishOk();
      }, 120);
    }

    function onResponseLoad() {
      if (settled) {
        return;
      }
      try {
        const err = probeIframeForError(iframe.contentDocument ?? undefined);
        if (err) {
          finishReject(err);
          return;
        }
      } catch {
        /* boş gövde: başarılı indirme */
      }
      finishOk();
    }

    function buildSubmitForm(): HTMLFormElement {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = actionUrl;
      form.target = frameName;
      form.enctype = "multipart/form-data";
      form.style.display = "none";

      for (const [key, value] of formData.entries()) {
        if (typeof value === "string") {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = key;
          input.value = value;
          form.appendChild(input);
        } else {
          const input = document.createElement("input");
          input.type = "file";
          input.name = key;
          const dt = new DataTransfer();
          dt.items.add(value);
          input.files = dt.files;
          form.appendChild(input);
        }
      }
      return form;
    }

    function onBlankReady() {
      iframe.removeEventListener("load", onBlankReady);
      iframe.addEventListener("load", onResponseLoad);

      try {
        perfObs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.entryType !== "resource") {
              continue;
            }
            const r = e as PerformanceResourceTiming;
            if (r.responseEnd <= 0) {
              continue;
            }
            let nameUrl: URL;
            try {
              nameUrl = new URL(r.name);
            } catch {
              continue;
            }
            const key = `${nameUrl.origin}${nameUrl.pathname}`;
            if (key !== targetKey) {
              continue;
            }
            finalizeAfterResponse();
          }
        });
        perfObs.observe({ type: "resource", buffered: true } as PerformanceObserverInit);
      } catch {
        /* PerformanceObserver yoksa yalnızca load + uzun zaman aşımı */
      }

      const form = buildSubmitForm();
      document.body.appendChild(form);
      form.submit();
      form.remove();
    }

    iframe.addEventListener("load", onBlankReady);
    document.body.appendChild(iframe);
    iframe.src = "about:blank";
  });
}

async function triggerDownloadFromResponse(response: Response, fallbackName: string) {
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    try {
      const buf = await response.arrayBuffer();
      const ct = response.headers.get("content-type") || "application/octet-stream";
      blob = new Blob([buf], { type: ct });
    } catch (e) {
      const msg =
        e instanceof TypeError
          ? "İndirme akışı kesildi. PDF API’nin çalıştığını ve ağın stabil olduğunu kontrol edin."
          : e instanceof Error
            ? e.message
            : String(e);
      throw new Error(msg);
    }
  }
  const filename = extractFilename(response, fallbackName);
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

export async function fetchCapabilities() {
  const response = await pdfFetch(`${API_BASE}/api/capabilities`);
  await ensureOk(response, "API yetenekleri okunamadı.");
  return response.json();
}

export async function inspectPdf(file: File, password?: string) {
  const formData = new FormData();
  formData.append("file", file);
  if (password?.trim()) {
    formData.append("password", password.trim());
  }
  const response = await pdfFetch(`${API_BASE}/api/inspect-pdf`, {
    method: "POST",
    body: formData,
  });
  await ensureOk(response, "PDF bilgisi okunamadı.");
  return response.json() as Promise<{
    filename: string;
    encrypted: boolean;
    page_count: number | null;
    inspect_error?: string | null;
  }>;
}

export async function createMergeJob(formData: FormData) {
  const response = await pdfFetch(`${API_BASE}/api/merge`, {
    method: "POST",
    body: formData,
  });
  await ensureOk(response, "Birleştirme başlatılamadı.");
  return response.json() as Promise<{ job_id: string }>;
}

export async function fetchMergeJob(jobId: string) {
  const response = await pdfFetchWithRetry(`${API_BASE}/api/jobs/${jobId}`, undefined, 5, 320);
  await ensureOk(response, "İşlem durumu okunamadı.");
  return response.json() as Promise<MergeJobStatus>;
}

function mergeJobDownloadUrl(jobId: string): string {
  const id = encodeURIComponent(jobId);
  const base = API_BASE.replace(/\/$/, "");
  if (base === "") {
    return `/api/jobs/${id}/download`;
  }
  return `${base}/api/jobs/${id}/download`;
}

function shouldUseNativeMergeDownload(href: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (href.startsWith("/")) {
    return true;
  }
  try {
    return new URL(href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Birleştirilmiş PDF: aynı kökende tarayıcının doğrudan indirmesini kullanır (fetch+blob akışı büyük dosyalarda kesilebiliyor).
 * PDF API farklı kökende ise fetch + blob yedeği kullanılır.
 */
export async function downloadMergeJob(jobId: string, fallbackName = "birleştirilmiş.pdf") {
  const href = mergeJobDownloadUrl(jobId);

  if (shouldUseNativeMergeDownload(href)) {
    const a = document.createElement("a");
    a.href = href;
    a.download = fallbackName;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  const response = await pdfFetchWithRetry(href, undefined, 8, 450);
  await ensureOk(response, "Birleştirilmiş dosya indirilemedi.");
  await triggerDownloadFromResponse(response, fallbackName);
}

export async function downloadFromApi(endpoint: string, formData: FormData, fallbackName: string) {
  const url = buildToolApiUrl(endpoint);
  if (shouldUseBrowserNativeDownload(url)) {
    try {
      await postFormDataForFileDownload(url, formData);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(msg || "İşlem başarısız oldu.");
    }
    return;
  }

  const response = await pdfFetch(url, {
    method: "POST",
    body: formData,
  });
  await ensureOk(response, "İşlem başarısız oldu.");
  await triggerDownloadFromResponse(response, fallbackName);
}

export type { MergeJobStatus };
