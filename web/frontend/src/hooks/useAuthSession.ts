import { useCallback, useEffect, useState } from "react";
import {
  AUTH_ACCESS_TOKEN_STORAGE_KEY,
  changeAuthPassword,
  fetchAuthenticatedUser,
  loginAuthUser,
  logoutAuthUser,
  refreshAuthSession,
  registerAuthUser,
  updateAuthPreferredLanguage,
  updateAuthProfile,
  type AuthUser,
} from "../api/auth";
import { registerSaasSessionSync } from "../api/subscription";
import type { Language } from "../i18n/landing";

export function useAuthSession() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const persistSession = useCallback((nextAccessToken: string, nextUser: AuthUser) => {
    setAccessToken(nextAccessToken);
    setUser(nextUser);
    window.localStorage.setItem(AUTH_ACCESS_TOKEN_STORAGE_KEY, nextAccessToken);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    window.localStorage.removeItem(AUTH_ACCESS_TOKEN_STORAGE_KEY);
  }, []);

  const completeOAuthLogin = useCallback(async (rawToken: string) => {
    const token = rawToken.trim();
    const restoredUser = await fetchAuthenticatedUser(token);
    persistSession(token, restoredUser);
    return restoredUser;
  }, [persistSession]);

  const restoreSession = useCallback(async () => {
    const storedToken = window.localStorage.getItem(AUTH_ACCESS_TOKEN_STORAGE_KEY);

    if (storedToken) {
      try {
        const restoredUser = await fetchAuthenticatedUser(storedToken);
        setAccessToken(storedToken);
        setUser(restoredUser);
        return;
      } catch {
        window.localStorage.removeItem(AUTH_ACCESS_TOKEN_STORAGE_KEY);
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
    registerSaasSessionSync((session) => {
      persistSession(session.accessToken, session.user);
    });
    return () => registerSaasSessionSync(null);
  }, [persistSession]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const url = new URL(window.location.href);
      const path = url.pathname.replace(/\/$/, "") || "/";

      // /login-success: sayfa bileşeni token'ı işler; burada oturum restore etme
      if (path === "/login-success") {
        if (import.meta.env.DEV) {
          console.info("[auth] /login-success route — delegating to LoginSuccessPage");
        }
        if (!cancelled) {
          setIsRestoring(false);
        }
        return;
      }

      if (path === "/login-error") {
        const reason = url.searchParams.get("reason");
        const message = reason
          ? (() => {
              try {
                return decodeURIComponent(reason.replace(/\+/g, " "));
              } catch {
                return reason;
              }
            })()
          : "Google sign-in failed (no details). Typical causes: Google OAuth not configured in web/api/.env, or redirect URI in Google Cloud Console does not match http://localhost:4000/api/auth/google/callback (see APP_BASE_URL).";
        if (import.meta.env.DEV) {
          console.warn("[auth] /login-error", message);
        }
        window.location.replace(`${url.origin}/login?oauth_error=${encodeURIComponent(message)}`);
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
    async (firstName: string, lastName: string, email: string, password: string, preferredLanguage: Language) => {
      return registerAuthUser(firstName, lastName, email, password, preferredLanguage);
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

  const updateProfile = useCallback(
    async (firstName: string, lastName: string) => {
      if (!accessToken) {
        return null;
      }

      const nextUser = await updateAuthProfile(accessToken, { firstName, lastName });
      setUser(nextUser);
      return nextUser;
    },
    [accessToken],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!accessToken) {
        return null;
      }

      const nextUser = await changeAuthPassword(accessToken, { currentPassword, newPassword });
      setUser(nextUser);
      return nextUser;
    },
    [accessToken],
  );

  const refreshSession = useCallback(async () => {
    try {
      const refreshed = await refreshAuthSession();
      if (refreshed) {
        persistSession(refreshed.accessToken, refreshed.user);
        return refreshed;
      }
      return null;
    } catch {
      return null;
    }
  }, [persistSession]);

  return {
    user,
    accessToken,
    isAuthenticated: Boolean(user),
    isRestoring,
    login,
    register,
    logout,
    updatePreferredLanguage,
    updateProfile,
    changePassword,
    completeOAuthLogin,
    clearSession,
    refreshSession,
  };
}
