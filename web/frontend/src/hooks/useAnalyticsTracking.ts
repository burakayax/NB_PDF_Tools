import { useEffect, useRef } from "react";
import { trackPageView } from "../api/analytics";
import type { Language } from "../i18n/landing";

type AnalyticsTrackingOptions = {
  enabled: boolean;
  view: string;
  path: string;
  language: Language;
  accessToken?: string | null;
};

export function useAnalyticsTracking({ enabled, view, path, language, accessToken }: AnalyticsTrackingOptions) {
  const lastTrackedRef = useRef("");

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const signature = `${view}:${path}:${language}`;
    if (lastTrackedRef.current === signature) {
      return;
    }

    lastTrackedRef.current = signature;
    void trackPageView(
      {
        view,
        path,
        language,
        referrer: document.referrer || undefined,
      },
      accessToken,
    ).catch(() => {
      // Sayfa görüntüleme kaydı başarısız olsa bile akış kesilmez; analitik isteğe bağlıdır.
      // Ağ veya sunucu hatalarında kullanıcı etkileşimi bloke edilmemelidir.
      // Hata yukarı sızdırılırsa gereksiz uyarılar veya yeniden render tetiklenebilir.
    });
  }, [accessToken, enabled, language, path, view]);
}
