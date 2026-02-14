"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { saveSession } from "@/lib/session";

interface RequestOtpResponse {
  ok: boolean;
  debugCode?: string;
}

interface AuthResponse {
  user: {
    id: number;
    tenantId: number;
    name: string;
    phone: string;
    role: "USER" | "CHAIRMAN";
  };
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
}

type Mode = "otp" | "password";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("otp");
  const [tenantSlug, setTenantSlug] = useState("rassvet");
  const [phone, setPhone] = useState("+79990001122");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizeError = (requestError: unknown, fallback: string) => {
    if (!(requestError instanceof ApiRequestError)) {
      return fallback;
    }

    if (requestError.payload?.code === "USER_NOT_REGISTERED") {
      return "Вас еще не добавил председатель";
    }

    if (requestError.payload?.code === "INVALID_CREDENTIALS") {
      return "Неверный логин или пароль";
    }

    return requestError.message;
  };

  const persistSession = (response: AuthResponse) => {
    saveSession({
      tenantSlug,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: {
        ...response.user,
        mustChangePassword: response.mustChangePassword,
      },
    });

    if (response.mustChangePassword) {
      router.replace("/change-password");
      return;
    }

    router.replace("/dashboard");
  };

  const requestOtp = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<RequestOtpResponse>("/auth/request-otp", {
        method: "POST",
        tenantSlug,
        body: {
          phone,
          purpose: "LOGIN",
        },
      });

      setDebugCode(response.debugCode ?? null);
      setStep("verify");
    } catch (requestError) {
      setError(normalizeError(requestError, "Ошибка запроса OTP"));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<AuthResponse>("/auth/verify-otp", {
        method: "POST",
        tenantSlug,
        body: {
          phone,
          code,
        },
      });

      persistSession(response);
    } catch (requestError) {
      setError(normalizeError(requestError, "Ошибка подтверждения OTP"));
    } finally {
      setLoading(false);
    }
  };

  const loginWithPassword = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        tenantSlug,
        body: {
          phone,
          password,
        },
      });

      persistSession(response);
    } catch (requestError) {
      setError(normalizeError(requestError, "Ошибка входа"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Вход в портал</h1>
        <p>Доступ только для пользователей, добавленных председателем.</p>

        <div className="auth-actions">
          <button
            type="button"
            className={mode === "otp" ? "primary-button" : "secondary-button"}
            onClick={() => {
              setMode("otp");
              setStep("request");
              setError(null);
            }}
          >
            OTP
          </button>
          <button
            type="button"
            className={mode === "password" ? "primary-button" : "secondary-button"}
            onClick={() => {
              setMode("password");
              setError(null);
            }}
          >
            Логин/пароль
          </button>
        </div>

        {error ? <div className="error">{error}</div> : null}
        {debugCode ? <div className="notice">Dev OTP: {debugCode}</div> : null}

        {mode === "otp" ? (
          step === "request" ? (
            <form className="auth-form" onSubmit={requestOtp}>
              <label>
                Tenant slug
                <input value={tenantSlug} onChange={(event) => setTenantSlug(event.target.value)} />
              </label>

              <label>
                Телефон
                <input value={phone} onChange={(event) => setPhone(event.target.value)} />
              </label>

              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? "Отправка..." : "Запросить OTP"}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={verifyOtp}>
              <label>
                Код
                <input value={code} onChange={(event) => setCode(event.target.value)} />
              </label>

              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? "Проверка..." : "Подтвердить"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setStep("request");
                  setCode("");
                }}
              >
                Назад
              </button>
            </form>
          )
        ) : (
          <form className="auth-form" onSubmit={loginWithPassword}>
            <label>
              Tenant slug
              <input value={tenantSlug} onChange={(event) => setTenantSlug(event.target.value)} />
            </label>

            <label>
              Телефон
              <input value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>

            <label>
              Пароль
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? "Вход..." : "Войти"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
