"use client";

import { useEffect, useState } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Panel } from "@/components/ui-kit";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface MeResponse {
  user: {
    id: number;
    name: string;
    phone: string;
    role: string;
    ownedPlots: Array<{ id: number; number: string }>;
  };
  unreadNotifications: number;
}

export default function ProfilePage() {
  const { ready, session } = useAuth(true);
  const [data, setData] = useState<MeResponse | null>(null);

  useEffect(() => {
    if (!ready || !session) return;

    apiRequest<MeResponse>("/users/me", {
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
    })
      .then(setData)
      .catch(() => setData(null));
  }, [ready, session]);

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  return (
    <PortalShell title="Профиль" subtitle="Персональные данные и привязка участков">
      <div className="grid-2">
        <Panel title="Личные данные">
          {data ? (
            <ul>
              <li>Имя: {data.user.name}</li>
              <li>Телефон: {data.user.phone}</li>
              <li>Роль: {data.user.role}</li>
              <li>Непрочитанные уведомления: {data.unreadNotifications}</li>
            </ul>
          ) : (
            <p>Нет данных профиля.</p>
          )}
        </Panel>

        <Panel title="Участки">
          {data && data.user.ownedPlots.length > 0 ? (
            <ul>
              {data.user.ownedPlots.map((plot) => (
                <li key={plot.id}>Участок №{plot.number}</li>
              ))}
            </ul>
          ) : (
            <p>Участки не привязаны.</p>
          )}
        </Panel>
      </div>
    </PortalShell>
  );
}
