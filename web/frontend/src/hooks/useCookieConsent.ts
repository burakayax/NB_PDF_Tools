import { useEffect, useState } from "react";

const STORAGE_KEY = "nbpdf-cookie-consent";

export function useCookieConsent() {
  const [hasConsent, setHasConsent] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    setHasConsent(storedValue === "accepted");
    setIsReady(true);
  }, []);

  function acceptConsent() {
    window.localStorage.setItem(STORAGE_KEY, "accepted");
    setHasConsent(true);
  }

  return {
    hasConsent,
    isReady,
    acceptConsent,
  };
}
