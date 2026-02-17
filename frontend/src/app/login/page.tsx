"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { saveSession } from "@/lib/session";

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

interface TenantListItem {
  slug: string;
  name: string;
  location?: string | null;
}

interface TenantsResponse {
  items: TenantListItem[];
}

const COUNTRY_CODES = [
  { value: "+7", label: "Россия / Казахстан (+7)" },
  { value: "+374", label: "Армения (+374)" },
  { value: "+375", label: "Беларусь (+375)" },
  { value: "+994", label: "Азербайджан (+994)" },
  { value: "+992", label: "Таджикистан (+992)" },
  { value: "+993", label: "Туркменистан (+993)" },
  { value: "+996", label: "Кыргызстан (+996)" },
  { value: "+998", label: "Узбекистан (+998)" },
  { value: "+995", label: "Грузия (+995)" },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [tenantSlug, setTenantSlug] = useState<string>("");
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string>("+7");
  const [phoneLocal, setPhoneLocal] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullPhone = useMemo(
    () => `${countryCode}${phoneLocal}`,
    [countryCode, phoneLocal]
  );

  useEffect(() => {
    let alive = true;

    const loadTenants = async () => {
      try {
        setTenantsLoading(true);
        setTenantsError(null);

        const response = await apiRequest<TenantsResponse>("/auth/tenants", {
          method: "GET",
        });

        if (!alive) return;
        setTenants(response.items);
        setTenantSlug(response.items[0]?.slug ?? "");

        if (response.items.length === 0) {
          setTenantsError("Нет доступных СНТ");
        }
      } catch (error) {
        if (!alive) return;
        const message =
          error instanceof ApiRequestError
            ? error.message
            : "Не удалось загрузить список СНТ";
        setTenantsError(message);
      } finally {
        if (!alive) return;
        setTenantsLoading(false);
      }
    };

    void loadTenants();

    return () => {
      alive = false;
    };
  }, []);

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

  const loginWithPassword = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        tenantSlug,
        body: {
          phone: fullPhone,
          password,
        },
      });

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

        {tenantsError ? <div className="error">{tenantsError}</div> : null}
        {error ? <div className="error">{error}</div> : null}

        <form className="auth-form" onSubmit={loginWithPassword}>
          <label>
            СНТ
            <select
              value={tenantSlug}
              disabled={tenantsLoading || tenants.length === 0}
              onChange={(event) => setTenantSlug(event.target.value)}
            >
              {tenantsLoading ? <option value="">Загрузка...</option> : null}
              {!tenantsLoading && tenants.length === 0 ? (
                <option value="">Нет доступных СНТ</option>
              ) : null}
              {tenants.map((tenant) => (
                <option key={tenant.slug} value={tenant.slug}>
                  {tenant.name}
                  {tenant.location ? ` (${tenant.location})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            Телефон
            <div className="inline-form-fields">
              <select
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
              >
                {COUNTRY_CODES.map((code) => (
                  <option key={code.value} value={code.value}>
                    {code.label}
                  </option>
                ))}
              </select>
              <input
                value={phoneLocal}
                inputMode="numeric"
                placeholder="9012345678"
                maxLength={12}
                onChange={(event) =>
                  setPhoneLocal(event.target.value.replace(/\D/g, "").slice(0, 12))
                }
              />
            </div>
          </label>

          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button
            type="submit"
            className="primary-button"
            disabled={
              tenantsLoading ||
              tenants.length === 0 ||
              tenantSlug.length === 0 ||
              loading ||
              phoneLocal.length === 0 ||
              password.length === 0
            }
          >
            {loading ? "Вход..." : "Войти"}
          </button>
        </form>
      </section>
    </main>
  );
}
