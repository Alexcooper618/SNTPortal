"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { loadSession, saveSession } from "@/lib/session";

interface ChangePasswordResponse {
  ok: boolean;
  user: {
    id: number;
    tenantId: number;
    name: string;
    phone: string;
    role: "USER" | "CHAIRMAN" | "ADMIN";
  };
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const session = loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    setError(null);
    setNotice(null);

    if (newPassword !== confirmPassword) {
      setError("Новый пароль и подтверждение не совпадают");
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest<ChangePasswordResponse>("/auth/change-password", {
        method: "POST",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
        body: {
          currentPassword,
          newPassword,
        },
      });

      saveSession({
        ...session,
        user: {
          ...response.user,
          mustChangePassword: false,
        },
      });

      setNotice("Пароль успешно обновлен");
      router.replace("/dashboard");
    } catch (requestError) {
      const message =
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Не удалось обновить пароль";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return <div className="center-screen">Загрузка...</div>;
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Смена пароля</h1>
        <p>Для продолжения работы необходимо изменить временный пароль.</p>

        {error ? <div className="error">{error}</div> : null}
        {notice ? <div className="notice">{notice}</div> : null}

        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Текущий (временный) пароль
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>

          <label>
            Новый пароль
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>

          <label>
            Повтор нового пароля
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Сохранение..." : "Сменить пароль"}
          </button>
        </form>
      </section>
    </main>
  );
}
