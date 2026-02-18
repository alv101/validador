import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch, configureApiClient } from "@/lib/apiClient";
import type { LoginRequest, LoginResponse, MeResponse } from "@/types/auth";

const SESSION_TOKEN_KEY = "validador.accessToken";

type AuthContextValue = {
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  logout: () => void;
  me: MeResponse | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useState<string | null>(() => sessionStorage.getItem(SESSION_TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);

  const logout = useCallback(() => {
    setAccessToken(null);
    setMe(null);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    configureApiClient({
      getToken: () => accessToken,
      onUnauthorized: logout,
    });
  }, [accessToken, logout]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const profile = await apiFetch<MeResponse>("/auth/me", { method: "GET" });
        if (!mounted) return;
        setMe(profile);
      } catch {
        if (!mounted) return;
        logout();
        return;
      }

      if (mounted) {
        setIsLoading(false);
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [accessToken, logout]);

  const login = useCallback(async (payload: LoginRequest) => {
    const response = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setAccessToken(response.accessToken);
    sessionStorage.setItem(SESSION_TOKEN_KEY, response.accessToken);
    setMe({
      user: response.user,
      roles: response.roles,
      username: response.user?.username,
      email: response.user?.email,
    });
    navigate("/scan", { replace: true });
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      isAuthenticated: Boolean(accessToken),
      isLoading,
      login,
      logout,
      me,
    }),
    [accessToken, isLoading, login, logout, me],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
