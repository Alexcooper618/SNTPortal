"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { saveSession } from "@/lib/session";

interface RegisterResponse {
  tenant: {
    id: number;
    slug: string;
  };
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

export default function RegisterSntPage() {
  const router = useRouter();
  const [tenantName, setTenantName] = useState("СНТ Рассвет");
  const [tenantSlug, setTenantSlug] = useState("rassvet");
  const [location, setLocation] = useState("Московская область");
  const [chairmanName, setChairmanName] = useState("Иван Петров");
  const [chairmanPhone, setChairmanPhone] = useState("+79990001122");
  const [chairmanPassword, setChairmanPassword] = useState("Chairman123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<RegisterResponse>("/auth/register-snt", {
        method: "POST",
        body: {
          tenantName,
          tenantSlug,
          location,
          chairmanName,
          chairmanPhone,
          chairmanPassword,
        },
      });

      saveSession({
        tenantSlug: response.tenant.slug,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        user: {
          ...response.user,
          mustChangePassword: response.mustChangePassword,
        },
      });

      router.replace("/admin");
    } catch (requestError) {
      const message =
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Не удалось зарегистрировать СНТ";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Создание нового СНТ</h1>
        <p>Создается tenant и первый пользователь с ролью председателя.</p>

        {error ? <div className="error">{error}</div> : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Название СНТ
            <input value={tenantName} onChange={(event) => setTenantName(event.target.value)} />
          </label>

          <label>
            Tenant slug
            <input value={tenantSlug} onChange={(event) => setTenantSlug(event.target.value)} />
          </label>

          <label>
            Локация
            <input value={location} onChange={(event) => setLocation(event.target.value)} />
          </label>

          <label>
            Имя председателя
            <input value={chairmanName} onChange={(event) => setChairmanName(event.target.value)} />
          </label>

          <label>
            Телефон председателя
            <input value={chairmanPhone} onChange={(event) => setChairmanPhone(event.target.value)} />
          </label>

          <label>
            Пароль председателя
            <input
              type="password"
              value={chairmanPassword}
              onChange={(event) => setChairmanPassword(event.target.value)}
            />
          </label>

          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? "Создание..." : "Создать СНТ"}
          </button>
        </form>

        <p>
          Уже есть аккаунт? <Link href="/login">Войти</Link>
        </p>
      </section>
    </main>
  );
}
