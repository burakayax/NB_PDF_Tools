import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchPublicRuntime,
  type PublicPricingPayload,
  type PublicRuntimePayload,
  type SystemNotificationsPayload,
} from "../api/public";
import { isCmsPreviewActive, readCmsPreviewDraft } from "../lib/cmsPreview";
import { RUNTIME_REFRESH_EVENT } from "../lib/runtimeRefreshEvents";

const defaultNotifications: SystemNotificationsPayload = {
  enabled: false,
  variant: "info",
  messageEn: "",
  messageTr: "",
  linkUrl: "",
  linkLabelEn: "",
  linkLabelTr: "",
};

const defaultPricing: PublicPricingPayload = {
  pricingRegion: "INTL",
  detectedCountry: null,
  checkoutCurrency: "TRY",
  tryPrices: { businessMonthly: "79.00", proMonthly: "129.00", proAnnual: "799.00" },
  usdDisplay: { basicMonthly: "4.99", proMonthly: "9.99", proAnnual: "59.99" },
  annualSavePercent: 50,
  internationalCheckoutNote: {
    en: "Checkout is processed in Turkish Lira (TRY) via our payment partner; your bank may show an equivalent in your currency.",
    tr: "Ödeme, ödeme ortağımız üzerinden Türk Lirası (TRY) ile tahsil edilir; bankanız kendi para biriminizde bir karşılık gösterebilir.",
  },
};

const defaultPayload: PublicRuntimePayload = {
  cms: {},
  site: {
    analyticsEnabled: true,
    theme: "dark",
    defaultLanguage: "en",
    freeDailyLimitDisplay: 5,
    maintenanceMode: false,
    betaFeatures: {},
    featureFlags: {},
    notifications: defaultNotifications,
  },
  plans: [],
  PLARTFORMPublic: { disabledFeatures: [], displayFreeDailyLimit: null },
  pricing: defaultPricing,
  flags: { maintenanceMode: false, betaFeatures: {}, featureFlags: {} },
  notifications: defaultNotifications,
};

type SettingsContextValue = PublicRuntimePayload & {
  loading: boolean;
  error: string | null;
  revision: number;
  refresh: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<PublicRuntimePayload>(defaultPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublicRuntime();
      setPayload(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Runtime config failed");
      setPayload(defaultPayload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  useEffect(() => {
    const onRefresh = () => setRevision((r) => r + 1);
    window.addEventListener(RUNTIME_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(RUNTIME_REFRESH_EVENT, onRefresh);
  }, []);

  const refresh = useCallback(async () => {
    setRevision((r) => r + 1);
  }, []);

  const value = useMemo<SettingsContextValue>(() => {
    let cms = payload.cms;
    if (isCmsPreviewActive()) {
      const draft = readCmsPreviewDraft();
      if (draft) {
        cms = draft;
      }
    }
    return {
      ...payload,
      cms,
      loading,
      error,
      revision,
      refresh,
    };
  }, [payload, loading, error, revision, refresh]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
