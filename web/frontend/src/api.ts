const API_BASE = import.meta.env.VITE_API_BASE ?? "";

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

async function ensureOk(response: Response, defaultMessage: string) {
  if (response.ok) {
    return;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { detail?: string };
    throw new Error(payload.detail || defaultMessage);
  }
  const errorText = await response.text();
  throw new Error(errorText || defaultMessage);
}

async function triggerDownloadFromResponse(response: Response, fallbackName: string) {
  const blob = await response.blob();
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
  const response = await fetch(`${API_BASE}/api/capabilities`);
  await ensureOk(response, "API yetenekleri okunamadı.");
  return response.json();
}

export async function inspectPdf(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/api/inspect-pdf`, {
    method: "POST",
    body: formData,
  });
  await ensureOk(response, "PDF bilgisi okunamadı.");
  return response.json() as Promise<{ filename: string; encrypted: boolean; page_count: number | null }>;
}

export async function createMergeJob(formData: FormData) {
  const response = await fetch(`${API_BASE}/api/merge`, {
    method: "POST",
    body: formData,
  });
  await ensureOk(response, "Birleştirme başlatılamadı.");
  return response.json() as Promise<{ job_id: string }>;
}

export async function fetchMergeJob(jobId: string) {
  const response = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  await ensureOk(response, "İşlem durumu okunamadı.");
  return response.json() as Promise<MergeJobStatus>;
}

export async function downloadMergeJob(jobId: string, fallbackName = "birleştirilmiş.pdf") {
  const response = await fetch(`${API_BASE}/api/jobs/${jobId}/download`);
  await ensureOk(response, "Birleştirilmiş dosya indirilemedi.");
  await triggerDownloadFromResponse(response, fallbackName);
}

export async function downloadFromApi(endpoint: string, formData: FormData, fallbackName: string) {
  const response = await fetch(`${API_BASE}/api/${endpoint}`, {
    method: "POST",
    body: formData,
  });
  await ensureOk(response, "İşlem başarısız oldu.");
  await triggerDownloadFromResponse(response, fallbackName);
}

export type { MergeJobStatus };
