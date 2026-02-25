"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import { Panel, StatCard } from "@/components/ui-kit";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface IntegrationStatusResponse {
  connected: boolean;
  provider: "TUYA";
  needsReconnect: boolean;
  devicesCount: number;
  lastSyncAt?: string;
  updatedAt?: string;
}

interface DeviceItem {
  id: string;
  name: string;
  category: string | null;
  isOnline: boolean;
  roomName: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
  latestState: Record<string, unknown>;
}

interface DevicesResponse {
  items: DeviceItem[];
}

interface CommandResponse {
  command: {
    id: string;
    status: "QUEUED" | "SENT" | "SUCCESS" | "FAILED" | "TIMEOUT";
    errorCode?: string | null;
    errorMessage?: string | null;
    executedAt?: string | null;
  };
  latestState: Record<string, unknown>;
}

interface NotificationItem {
  id: string;
  type: "SYSTEM" | "BILLING" | "NEWS" | "FORUM" | "INCIDENT" | "GOVERNANCE" | "DEVICE";
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  items: NotificationItem[];
  unreadCount: number;
}

const formatDateTime = (value?: string | null): string => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ru-RU");
};

const readSwitchState = (state: Record<string, unknown>): string => {
  const keys = ["switch", "switch_1", "switch_led"];
  for (const key of keys) {
    const value = state[key];
    if (typeof value === "boolean") {
      return value ? "ВКЛ" : "ВЫКЛ";
    }
    if (typeof value === "string") {
      if (value.toLowerCase() === "true") return "ВКЛ";
      if (value.toLowerCase() === "false") return "ВЫКЛ";
    }
  }
  return "Неизвестно";
};

function DevicesPageContent() {
  const { ready, session } = useAuth(true);
  const searchParams = useSearchParams();

  const [integration, setIntegration] = useState<IntegrationStatusResponse | null>(null);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyByDevice, setBusyByDevice] = useState<Record<string, boolean>>({});
  const [globalBusy, setGlobalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const oauthStatus = searchParams.get("tuya");
  const oauthMessage = searchParams.get("message");

  const deviceNotifications = useMemo(
    () => notifications.filter((item) => item.type === "DEVICE").slice(0, 10),
    [notifications]
  );

  const loadData = async () => {
    if (!session) return;

    setLoading(true);
    setError(null);

    try {
      const [integrationResult, devicesResult, notificationResult] = await Promise.all([
        apiRequest<IntegrationStatusResponse>("/smart-home/integration", {
          token: session.accessToken,
          tenantSlug: session.tenantSlug,
        }),
        apiRequest<DevicesResponse>("/smart-home/devices", {
          token: session.accessToken,
          tenantSlug: session.tenantSlug,
        }).catch(() => ({ items: [] })),
        apiRequest<NotificationsResponse>("/notifications", {
          token: session.accessToken,
          tenantSlug: session.tenantSlug,
        }).catch(() => ({ items: [], unreadCount: 0 })),
      ]);

      setIntegration(integrationResult);
      setDevices(devicesResult.items);
      setNotifications(notificationResult.items);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError) {
        setError(requestError.message);
      } else {
        setError("Не удалось загрузить устройства");
      }
      setIntegration(null);
      setDevices([]);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready || !session) return;

    if (oauthStatus === "connected") {
      setNotice("Tuya успешно подключена");
    } else if (oauthStatus === "error") {
      setNotice(oauthMessage && oauthMessage.length > 0 ? `Ошибка Tuya: ${oauthMessage}` : "Ошибка подключения Tuya");
    }

    loadData().catch(() => {
      // State updates are handled in loadData.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session, oauthStatus, oauthMessage]);

  const startOauth = async () => {
    if (!session) return;

    setGlobalBusy(true);
    setError(null);
    try {
      const response = await apiRequest<{ url: string }>("/smart-home/oauth/start", {
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
      });

      window.location.href = response.url;
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : "Не удалось начать OAuth Tuya");
      setGlobalBusy(false);
    }
  };

  const disconnectTuya = async () => {
    if (!session) return;

    setGlobalBusy(true);
    setError(null);
    try {
      await apiRequest<{ ok: boolean; removed: boolean }>("/smart-home/integration", {
        method: "DELETE",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
      });
      setNotice("Интеграция Tuya отключена");
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : "Не удалось отключить интеграцию Tuya");
    } finally {
      setGlobalBusy(false);
    }
  };

  const sendCommand = async (deviceId: string, commandType: "turn_on" | "turn_off" | "toggle") => {
    if (!session) return;

    setBusyByDevice((current) => ({ ...current, [deviceId]: true }));
    setError(null);

    try {
      const response = await apiRequest<CommandResponse>(`/smart-home/devices/${deviceId}/commands`, {
        method: "POST",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
        body: {
          commandType,
        },
      });

      setDevices((current) =>
        current.map((device) =>
          device.id === deviceId
            ? {
                ...device,
                latestState: response.latestState,
                updatedAt: new Date().toISOString(),
              }
            : device
        )
      );

      if (response.command.status === "FAILED") {
        setError(response.command.errorMessage ?? "Команда не выполнена");
      } else {
        setNotice("Команда отправлена");
      }
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : "Ошибка отправки команды");
    } finally {
      setBusyByDevice((current) => ({ ...current, [deviceId]: false }));
    }
  };

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  return (
    <PortalShell title="Умный дом" subtitle="Tuya: личные устройства и базовое управление">
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <div className="grid-3">
        <StatCard
          label="Интеграция"
          value={integration?.connected ? "Подключена" : "Не подключена"}
          hint={integration?.needsReconnect ? "Требуется повторная авторизация" : undefined}
        />
        <StatCard label="Устройств" value={String(integration?.devicesCount ?? devices.length)} />
        <StatCard label="Последняя синхронизация" value={formatDateTime(integration?.lastSyncAt)} />
      </div>

      <div className="row">
        <button className="primary-button" type="button" onClick={startOauth} disabled={globalBusy}>
          {integration?.connected ? "Переподключить Tuya" : "Подключить Tuya"}
        </button>
        <button className="secondary-button" type="button" onClick={() => loadData()} disabled={loading || globalBusy}>
          Обновить
        </button>
        {integration?.connected ? (
          <button className="secondary-button" type="button" onClick={disconnectTuya} disabled={globalBusy}>
            Отключить интеграцию
          </button>
        ) : null}
      </div>

      <div className="grid-2">
        <Panel title="Мои устройства">
          {loading ? (
            <p className="muted">Загрузка...</p>
          ) : devices.length === 0 ? (
            <p className="muted">Устройства пока не найдены. Подключите Tuya и обновите список.</p>
          ) : (
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Устройство</th>
                    <th>Статус</th>
                    <th>Питание</th>
                    <th>Команды</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => {
                    const busy = Boolean(busyByDevice[device.id]);
                    return (
                      <tr key={device.id}>
                        <td>
                          <div>
                            <strong>{device.name}</strong>
                          </div>
                          <div className="muted">
                            {device.category ?? "unknown"}
                            {device.roomName ? ` · ${device.roomName}` : ""}
                          </div>
                          <div className="muted">Обновлено: {formatDateTime(device.updatedAt)}</div>
                        </td>
                        <td>
                          <span className="pill">{device.isOnline ? "online" : "offline"}</span>
                        </td>
                        <td>{readSwitchState(device.latestState)}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => sendCommand(device.id, "turn_on")}
                              disabled={busy}
                            >
                              Вкл
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => sendCommand(device.id, "turn_off")}
                              disabled={busy}
                            >
                              Выкл
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => sendCommand(device.id, "toggle")}
                              disabled={busy}
                            >
                              Toggle
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="События устройств (DEVICE)">
          {deviceNotifications.length === 0 ? (
            <p className="muted">Пока нет событий по устройствам.</p>
          ) : (
            <ul>
              {deviceNotifications.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <br />
                  {item.body}
                  <br />
                  <span className="muted">{formatDateTime(item.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </PortalShell>
  );
}

export default function DevicesPage() {
  return (
    <Suspense fallback={<div className="center-screen">Загрузка...</div>}>
      <DevicesPageContent />
    </Suspense>
  );
}
