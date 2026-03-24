import { useEffect, useRef } from "react";
import { reportClientError } from "../api/monitoring";
import type { Language } from "../i18n/landing";

type ErrorLoggingOptions = {
  language: Language;
  accessToken?: string | null;
};

export function useErrorLogging({ language, accessToken }: ErrorLoggingOptions) {
  const recentErrorsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    function shouldLog(signature: string) {
      const now = Date.now();
      const lastSeen = recentErrorsRef.current.get(signature) ?? 0;
      if (now - lastSeen < 5000) {
        return false;
      }

      recentErrorsRef.current.set(signature, now);
      return true;
    }

    function sendError(payload: { message: string; source?: string; stack?: string }) {
      const signature = `${payload.source ?? "unknown"}:${payload.message}`;
      if (!shouldLog(signature)) {
        return;
      }

      void reportClientError(
        {
          message: payload.message,
          source: payload.source,
          stack: payload.stack,
          url: window.location.href,
          language,
        },
        accessToken,
      ).catch(() => {
        // İstemci hata raporu başarısız olsa bile sessizce yutulur; arayüz ek hata döngüsüne girmez.
        // Telemetri asıl kullanıcı akışından kopuk olmalıdır.
        // Bu catch kaldırılırsa veya yeniden fırlatılırsa raporlama hatası yeni kırılma noktası olur.
      });
    }

    function handleError(event: ErrorEvent) {
      sendError({
        message: event.message || "Unexpected window error",
        source: event.filename || "window.onerror",
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      if (reason instanceof Error) {
        sendError({
          message: reason.message,
          source: "unhandledrejection",
          stack: reason.stack,
        });
        return;
      }

      sendError({
        message: typeof reason === "string" ? reason : "Unhandled promise rejection",
        source: "unhandledrejection",
      });
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [accessToken, language]);
}
