/** Dispatched after admin saves CMS / site / packages / PLARTFORM so the app refetches public runtime without reload. */
export const RUNTIME_REFRESH_EVENT = "nb-runtime-refresh";

export function notifyRuntimeRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(RUNTIME_REFRESH_EVENT));
  }
}
