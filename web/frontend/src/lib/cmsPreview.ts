/** Query flag: landing/runtime reads draft CMS from sessionStorage (admin live preview iframe). */
export const CMS_PREVIEW_QUERY = "nbCmsPreview";

/** sessionStorage key for unsaved CMS JSON (same-origin iframe shares top sessionStorage). */
export const CMS_PREVIEW_SESSION_KEY = "nb.cms.preview.v1";

export function isCmsPreviewActive(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return new URLSearchParams(window.location.search).get(CMS_PREVIEW_QUERY) === "1";
  } catch {
    return false;
  }
}

export function readCmsPreviewDraft(): Record<string, unknown> | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(CMS_PREVIEW_SESSION_KEY);
    if (!raw?.trim()) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function writeCmsPreviewDraft(cms: Record<string, unknown>): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(CMS_PREVIEW_SESSION_KEY, JSON.stringify(cms));
  } catch {
    /* quota / private mode */
  }
}

/** postMessage type: admin iframe asks landing preview to scroll + highlight a section. */
export const ADMIN_PREVIEW_HIGHLIGHT = "nb-admin-preview-highlight";

export function postAdminPreviewHighlight(target: Window | null | undefined, section: string): void {
  if (!target || typeof section !== "string" || !section.trim()) {
    return;
  }
  try {
    if (typeof window === "undefined") {
      return;
    }
    target.postMessage({ type: ADMIN_PREVIEW_HIGHLIGHT, section: section.trim() }, window.location.origin);
  } catch {
    /* ignore */
  }
}
