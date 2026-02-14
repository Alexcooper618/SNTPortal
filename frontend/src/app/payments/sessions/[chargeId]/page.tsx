"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Panel, StatCard } from "@/components/ui-kit";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

type InvoiceStatus = "PENDING" | "PARTIAL" | "PAID" | "CANCELED";

interface Charge {
  id: number;
  title: string;
  description?: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  type: string;
  dueDate: string;
  publishedAt?: string | null;
  createdAt: string;
  amountCents: number;
}

interface SessionDetailResponse {
  charge: Charge;
  summary: {
    totalCents: number;
    paidCents: number;
    outstandingCents: number;
    progressPercent: number;
    participantsCount: number;
    paidCount: number;
    partialCount: number;
    unpaidCount: number;
    canceledCount: number;
  };
  participants: Array<{
    invoice: {
      id: number;
      number: string;
      status: InvoiceStatus;
      totalCents: number;
      paidCents: number;
      dueDate: string;
      issuedAt: string;
      closedAt?: string | null;
    };
    user: { id: number; name: string; phone: string } | null;
    plot: { id: number; number: string };
  }>;
}

interface AdminUser {
  id: number;
  name: string;
  phone: string;
  role: "USER" | "CHAIRMAN";
  isActive: boolean;
  plotMemberships?: Array<{ isPrimary: boolean; plot: { id: number; number: string } }>;
}

interface UserListResponse {
  items: AdminUser[];
  pagination: { total: number; limit: number; offset: number };
}

const toRub = (cents: number): string => `${(cents / 100).toLocaleString("ru-RU")} ₽`;

const normalizeError = (error: unknown, fallback: string) => {
  if (!(error instanceof ApiRequestError)) return fallback;
  if (error.payload?.code === "CANNOT_REMOVE_PAID_PARTICIPANT") {
    return "Нельзя исключить участника, у которого уже есть оплата.";
  }
  if (error.payload?.code === "CHARGE_NOT_EDITABLE") {
    return "Сессия закрыта: состав участников менять нельзя.";
  }
  return error.message;
};

export default function SessionPage() {
  const params = useParams<{ chargeId: string }>();
  const { ready, session } = useAuth(true);

  const chargeId = Number(params.chargeId);

  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [onlyDebtors, setOnlyDebtors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const token = session?.accessToken;
  const tenantSlug = session?.tenantSlug;

  const load = async () => {
    if (!token || !tenantSlug) return;
    setError(null);
    setNotice(null);

    const [detailData, userData] = await Promise.all([
      apiRequest<SessionDetailResponse>(`/billing/charges/${chargeId}`, {
        token,
        tenantSlug,
      }),
      apiRequest<UserListResponse>("/users?limit=500&offset=0&isActive=true", {
        token,
        tenantSlug,
      }),
    ]);

    setDetail(detailData);
    setUsers(userData.items.filter((u) => u.role === "USER"));

    const currentUserIds = Array.from(
      new Set(
        detailData.participants
          .filter((p) => p.invoice.status !== "CANCELED")
          .map((p) => p.user?.id)
          .filter((id): id is number => typeof id === "number")
      )
    );
    setSelectedUserIds(currentUserIds);
  };

  useEffect(() => {
    if (!ready || !session) return;
    if (session.user.role !== "CHAIRMAN") return;
    if (!Number.isFinite(chargeId)) return;

    load().catch(() => setError("Не удалось загрузить сессию"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session, chargeId]);

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => `${u.name} ${u.phone}`.toLowerCase().includes(term));
  }, [search, users]);

  const participantRows = useMemo(() => {
    if (!detail) return [];
    const items = onlyDebtors
      ? detail.participants.filter((p) => p.invoice.status === "PENDING" || p.invoice.status === "PARTIAL")
      : detail.participants;
    return items.slice().sort((a, b) => a.plot.number.localeCompare(b.plot.number));
  }, [detail, onlyDebtors]);

  const toggleUser = (userId: number) => {
    setSelectedUserIds((current) => {
      if (current.includes(userId)) return current.filter((id) => id !== userId);
      return [...current, userId];
    });
  };

  const hasPrimaryPlot = (user: AdminUser) =>
    Boolean(user.plotMemberships && user.plotMemberships.some((m) => m.isPrimary));

  const saveParticipants = async () => {
    if (!detail || !token || !tenantSlug) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/billing/charges/${detail.charge.id}/participants`, {
        method: "PUT",
        token,
        tenantSlug,
        body: {
          userIds: selectedUserIds,
        },
      });

      setNotice("Состав участников обновлен.");
      await load();
    } catch (requestError) {
      setError(normalizeError(requestError, "Не удалось сохранить участников"));
    } finally {
      setBusy(false);
    }
  };

  const closeSession = async () => {
    if (!detail || !token || !tenantSlug) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/billing/charges/${detail.charge.id}/close`, {
        method: "POST",
        token,
        tenantSlug,
        body: {},
      });
      setNotice("Сессия закрыта (участников больше нельзя менять).");
      await load();
    } catch (requestError) {
      setError(normalizeError(requestError, "Не удалось закрыть сессию"));
    } finally {
      setBusy(false);
    }
  };

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  if (session.user.role !== "CHAIRMAN") {
    return (
      <PortalShell title="Сессия сбора" subtitle="Только для председателя">
        <div className="error">Доступ ограничен ролью председателя.</div>
      </PortalShell>
    );
  }

  if (!Number.isFinite(chargeId)) {
    return (
      <PortalShell title="Сессия сбора" subtitle="Неверный идентификатор">
        <div className="error">Некорректный chargeId.</div>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="Сессия сбора" subtitle={detail ? detail.charge.title : "Загрузка..."}>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <div className="row">
        <Link className="secondary-button" href="/payments">
          Назад к списку
        </Link>
        {detail && detail.charge.status !== "CLOSED" ? (
          <button className="secondary-button" type="button" onClick={closeSession} disabled={busy}>
            Закрыть сессию
          </button>
        ) : null}
        {detail ? <span className="pill">{detail.charge.status}</span> : null}
      </div>

      {detail ? (
        <>
          <div className="grid-3">
            <StatCard label="Собрано" value={toRub(detail.summary.paidCents)} />
            <StatCard label="Цель" value={toRub(detail.summary.totalCents)} hint={`участников: ${detail.summary.participantsCount}`} />
            <StatCard label="Осталось" value={toRub(detail.summary.outstandingCents)} hint={`оплатили: ${detail.summary.paidCount}`} />
          </div>

          <Panel title="Прогресс">
            <div className="row" style={{ alignItems: "center" }}>
              <div className="progress" style={{ flex: 1 }}>
                <span style={{ width: `${Math.max(0, Math.min(100, detail.summary.progressPercent))}%` }} />
              </div>
              <span className="muted">{detail.summary.progressPercent}%</span>
            </div>
          </Panel>

          <Panel
            title="Участники и оплаты"
            action={
              <label className="row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={onlyDebtors}
                  onChange={(e) => setOnlyDebtors(e.target.checked)}
                />
                Только должники
              </label>
            }
          >
            <table>
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Участок</th>
                  <th>Статус</th>
                  <th>К оплате</th>
                  <th>Оплачено</th>
                  <th>Остаток</th>
                </tr>
              </thead>
              <tbody>
                {participantRows.map((p) => {
                  const total = p.invoice.totalCents;
                  const paid = p.invoice.paidCents;
                  const outstanding =
                    p.invoice.status === "CANCELED" ? 0 : Math.max(0, p.invoice.totalCents - p.invoice.paidCents);
                  return (
                    <tr key={p.invoice.id}>
                      <td>{p.user ? `${p.user.name} (${p.user.phone})` : "-"}</td>
                      <td>№{p.plot.number}</td>
                      <td>{p.invoice.status}</td>
                      <td>{toRub(total)}</td>
                      <td>{toRub(paid)}</td>
                      <td>{toRub(outstanding)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          <Panel title="Состав участников">
            <div className="inline-form">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск (имя/телефон)"
              />

              {detail.charge.status === "CLOSED" ? (
                <div className="notice">Сессия закрыта: состав участников менять нельзя.</div>
              ) : null}

              <div className="plots-inline">
                {visibleUsers.map((u) => {
                  const primaryOk = hasPrimaryPlot(u);
                  const checked = selectedUserIds.includes(u.id);
                  return (
                    <label key={u.id} className="checkbox-row" style={{ opacity: primaryOk ? 1 : 0.55 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUser(u.id)}
                        disabled={!primaryOk || busy || detail.charge.status === "CLOSED"}
                      />
                      {u.name} ({u.phone})
                      {!primaryOk ? <span className="muted"> · нет основного участка</span> : null}
                    </label>
                  );
                })}
              </div>

              <button
                className="primary-button"
                type="button"
                onClick={saveParticipants}
                disabled={busy || detail.charge.status === "CLOSED"}
              >
                Сохранить состав
              </button>
            </div>
          </Panel>
        </>
      ) : (
        <div className="center-screen">Загрузка...</div>
      )}
    </PortalShell>
  );
}
