import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { hasPermission, primaryRole } from "@edumanage/shared";
import { api, setAccessToken } from "../lib/api";
import { applyPrimary } from "../lib/format";

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  schoolId: string | null;
  roles: string[];
  permissions: string[];
  themePreference: "light" | "dark" | "system" | string;
  sidebarCollapsed: boolean;
  notifyInApp: boolean;
  notifyEmail: boolean;
  school: {
    id: string;
    name: string;
    code: string;
    motto: string | null;
    logoUrl: string | null;
    primaryColor: string;
    timezone: string;
    isDemo: boolean;
  } | null;
};

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  schoolId: string | null;
  setSchoolId: (id: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolIdState] = useState<string | null>(localStorage.getItem("schoolId"));

  function setSchoolId(id: string | null) {
    setSchoolIdState(id);
    if (id) localStorage.setItem("schoolId", id);
    else localStorage.removeItem("schoolId");
  }

  async function refreshUser() {
    const next = await api<SessionUser>("/api/auth/me");
    setUser(next);
    if (next.school?.id) setSchoolId(next.school.id);
    applyPrimary(next.school?.primaryColor);
  }

  useEffect(() => {
    api<{ accessToken: string; user: SessionUser }>("/api/auth/refresh", { method: "POST" }, false)
      .then((result) => {
        setAccessToken(result.accessToken);
        setUser(result.user);
        if (!localStorage.getItem("schoolId") && result.user.school?.id) setSchoolId(result.user.school.id);
        applyPrimary(result.user.school?.primaryColor);
      })
      .catch(() => setAccessToken(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    schoolId: user?.roles.includes("SUPER_ADMIN") ? schoolId : user?.schoolId ?? null,
    setSchoolId,
    can: (permission) => Boolean(user && hasPermission(user.permissions, permission)),
    login: async (email, password) => {
      const result = await api<{ accessToken: string; user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAccessToken(result.accessToken);
      setUser(result.user);
      if (result.user.school?.id) setSchoolId(result.user.school.id);
      applyPrimary(result.user.school?.primaryColor);
    },
    logout: async () => {
      await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
      setAccessToken(null);
      setUser(null);
    },
    refreshUser,
  }), [user, loading, schoolId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}

export function useRole() {
  const { user } = useAuth();
  return primaryRole(user?.roles ?? []);
}
