export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export class ApiRequestError extends Error {
  status: number;
  payload?: ApiErrorPayload;

  constructor(status: number, message: string, payload?: ApiErrorPayload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  token?: string;
  tenantSlug?: string;
  body?: unknown;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  mustChangePassword?: boolean;
}

interface StoredSessionShape {
  tenantSlug: string;
  accessToken: string;
  refreshToken: string;
  user?: {
    mustChangePassword?: boolean;
  };
}

const SESSION_KEY = "snt_portal_session";

const parseStoredSession = (raw: string): StoredSessionShape | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.tenantSlug !== "string") return null;
    if (typeof obj.accessToken !== "string") return null;
    if (typeof obj.refreshToken !== "string") return null;
    return obj as unknown as StoredSessionShape;
  } catch (_error) {
    return null;
  }
};

const updateSessionTokens = (tenantSlug: string | undefined, refresh: RefreshResponse) => {
  if (typeof window === "undefined") return;
  if (!tenantSlug) return;

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return;

  const session = parseStoredSession(raw);
  if (!session) return;
  if (session.tenantSlug !== tenantSlug) return;

  const next: StoredSessionShape = {
    ...session,
    accessToken: refresh.accessToken,
    refreshToken: refresh.refreshToken,
    user:
      typeof refresh.mustChangePassword === "boolean"
        ? {
            ...(session.user ?? {}),
            mustChangePassword: refresh.mustChangePassword,
          }
        : session.user,
  };

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
};

const clearSession = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent("snt:session-invalidated"));
};

const parseApiError = async (response: Response): Promise<ApiRequestError> => {
  let payload: ApiErrorPayload | undefined;
  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch (_error) {
    payload = undefined;
  }

  return new ApiRequestError(
    response.status,
    payload?.message ?? `Request failed (${response.status})`,
    payload
  );
};

const doFetch = async (path: string, options: RequestOptions): Promise<Response> => {
  return fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.tenantSlug ? { "x-tenant-slug": options.tenantSlug } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
};

const tryRefresh = async (tenantSlug: string, refreshToken: string): Promise<RefreshResponse | null> => {
  try {
    const response = await doFetch("/auth/refresh", {
      method: "POST",
      tenantSlug,
      body: {
        refreshToken,
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as RefreshResponse;
  } catch (_error) {
    return null;
  }
};

export const apiRequest = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const initial = await doFetch(path, options);

  if (initial.status !== 401 || !options.tenantSlug) {
    if (!initial.ok) {
      throw await parseApiError(initial);
    }
    return (await initial.json()) as T;
  }

  const refreshToken =
    typeof window !== "undefined"
      ? (() => {
          const raw = window.localStorage.getItem(SESSION_KEY);
          if (!raw) return null;
          const session = parseStoredSession(raw);
          return session?.refreshToken ?? null;
        })()
      : null;

  if (!refreshToken) {
    clearSession();
    throw await parseApiError(initial);
  }

  const refreshed = await tryRefresh(options.tenantSlug, refreshToken);
  if (!refreshed) {
    clearSession();
    throw await parseApiError(initial);
  }

  updateSessionTokens(options.tenantSlug, refreshed);

  const retry = await doFetch(path, {
    ...options,
    token: refreshed.accessToken,
  });

  if (!retry.ok) {
    throw await parseApiError(retry);
  }

  return (await retry.json()) as T;
};
