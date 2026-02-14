export type UserRole = "USER" | "CHAIRMAN";

export interface SessionUser {
  id: number;
  tenantId: number;
  name: string;
  phone: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface SessionState {
  tenantSlug: string;
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

const SESSION_KEY = "snt_portal_session";

export const saveSession = (session: SessionState): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const loadSession = (): SessionState | null => {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionState;
  } catch (_error) {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
};

export const clearSession = (): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
};
