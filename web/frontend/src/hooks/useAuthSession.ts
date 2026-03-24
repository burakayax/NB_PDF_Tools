import { useCallback, useEffect, useState } from "react";
import {
  fetchAuthenticatedUser,
  loginAuthUser,
  logoutAuthUser,
  refreshAuthSession,
  registerAuthUser,
  updateAuthPreferredLanguage,
  type AuthUser,
} from "../api/auth";
import type { Language } from "../i18n/landing";

const STORAGE_KEY = "nbpdf-access-token";

export function useAuthSession() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const persistSession = useCallback((nextAccessToken: string, nextUser: AuthUser) => {
    setAccessToken(nextAccessToken);
    setUser(nextUser);
    window.localStorage.setItem(STORAGE_KEY, nextAccessToken);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const restoreSession = useCallback(async () => {
    const storedToken = window.localStorage.getItem(STORAGE_KEY);

    if (storedToken) {
      try {
        const restoredUser = await fetchAuthenticatedUser(storedToken);
        setAccessToken(storedToken);
        setUser(restoredUser);
        return;
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    try {
      const refreshed = await refreshAuthSession();
      if (refreshed) {
        persistSession(refreshed.accessToken, refreshed.user);
      }
    } catch {
      clearSession();
    }
  }, [clearSession, persistSession]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const url = new URL(window.location.href);
      const oauthComplete = url.searchParams.get("oauth") === "complete";

      if (oauthComplete) {
        url.searchParams.delete("oauth");
        const qs = url.searchParams.toString();
        window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);

        try {
          const refreshed = await refreshAuthSession();
          if (!cancelled && refreshed) {
            persistSession(refreshed.accessToken, refreshed.user);
          } else if (!cancelled) {
            clearSession();
          }
        } catch {
          if (!cancelled) {
            clearSession();
          }
        } finally {
          if (!cancelled) {
            setIsRestoring(false);
          }
        }
        return;
      }

      await restoreSession();
      if (!cancelled) {
        setIsRestoring(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [clearSession, persistSession, restoreSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await loginAuthUser(email, password);
      persistSession(session.accessToken, session.user);
      return session.user;
    },
    [persistSession],
  );

  const register = useCallback(
    async (email: string, password: string, preferredLanguage: Language) => {
      return registerAuthUser(email, password, preferredLanguage);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await logoutAuthUser();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const updatePreferredLanguage = useCallback(
    async (preferredLanguage: Language) => {
      if (!accessToken) {
        return null;
      }

      const nextUser = await updateAuthPreferredLanguage(accessToken, preferredLanguage);
      setUser(nextUser);
      return nextUser;
    },
    [accessToken],
  );

  return {
    user,
    accessToken,
    isAuthenticated: Boolean(user),
    isRestoring,
    login,
    register,
    logout,
    updatePreferredLanguage,
  };
}
