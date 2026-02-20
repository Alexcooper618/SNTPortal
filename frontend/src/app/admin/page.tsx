"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Panel, StatCard } from "@/components/ui-kit";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface PlotItem {
  id: number;
  number: string;
  area?: number | null;
  ownerId?: number | null;
  owner?: {
    id: number;
    name: string;
    phone: string;
  } | null;
}

interface PlotListResponse {
  items: PlotItem[];
}

interface PlotMembership {
  id: number;
  plotId: number;
  isPrimary: boolean;
  fromDate: string;
  toDate: string | null;
  plot: PlotItem;
}

interface AdminUser {
  id: number;
  name: string;
  phone: string;
  role: "USER" | "CHAIRMAN" | "ADMIN";
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  plotMemberships?: PlotMembership[];
  ownedPlots?: Array<{ id: number; number: string }>;
  activeSessionsCount?: number;
}

interface UserListResponse {
  items: AdminUser[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

interface ChargeListResponse {
  items: Array<{ id: number; status: string }>;
}

interface PaymentListResponse {
  items: Array<{ id: string; status: string }>;
}

interface AuditListResponse {
  items: Array<{ id: string; action: string; createdAt: string }>;
}

interface UserDetailResponse {
  user: AdminUser;
  audit: Array<{ id: string; action: string; createdAt: string; actor?: { id: number; name: string; role: string } }>;
}

const normalizeError = (requestError: unknown, fallback: string) => {
  if (!(requestError instanceof ApiRequestError)) {
    return fallback;
  }

  if (requestError.payload?.code === "PHONE_ALREADY_EXISTS") {
    return "Телефон уже используется другим пользователем";
  }

  if (requestError.payload?.code === "CANNOT_DEACTIVATE_LAST_CHAIRMAN") {
    return "Нельзя деактивировать последнего активного председателя";
  }

  return requestError.message;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("ru-RU");
};

const toPlotLabel = (membership: PlotMembership) => {
  const suffix = membership.isPrimary ? " (осн.)" : "";
  return `№${membership.plot.number}${suffix}`;
};

function UserDrawer(props: {
  open: boolean;
  onClose: () => void;
  userId: number;
  token: string;
  tenantSlug: string;
  plots: PlotItem[];
  onUserChanged: () => Promise<void>;
}) {
  const { open, onClose, userId, token, tenantSlug, plots, onUserChanged } = props;

  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<UserDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"profile" | "access" | "plots" | "audit">("profile");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [resetPassword, setResetPassword] = useState("");
  const [memberships, setMemberships] = useState<Array<{ plotId: number; isPrimary: boolean }>>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<UserDetailResponse>(`/users/${userId}`, {
        token,
        tenantSlug,
      });
      setDetail(response);
      setName(response.user.name);
      setPhone(response.user.phone);
      setIsActive(response.user.isActive);

      const nextMemberships = (response.user.plotMemberships ?? [])
        .filter((m) => m.toDate === null)
        .map((m) => ({ plotId: m.plotId, isPrimary: m.isPrimary }));
      setMemberships(nextMemberships);
    } catch (requestError) {
      setError(normalizeError(requestError, "Не удалось загрузить пользователя"));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const saveProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiRequest(`/users/${userId}`, {
        method: "PATCH",
        token,
        tenantSlug,
        body: {
          name,
          phone,
          isActive,
        },
      });
      await load();
      await onUserChanged();
    } catch (requestError) {
      setError(normalizeError(requestError, "Не удалось сохранить"));
    } finally {
      setLoading(false);
    }
  };

  const doResetPassword = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiRequest(`/users/${userId}/reset-password`, {
        method: "POST",
        token,
        tenantSlug,
        body: {
          temporaryPassword: resetPassword,
        },
      });
      setResetPassword("");
      await load();
      await onUserChanged();
    } catch (requestError) {
      setError(normalizeError(requestError, "Не удалось сбросить пароль"));
    } finally {
      setLoading(false);
    }
  };

  const savePlots = async () => {
    const primaryCount = memberships.filter((m) => m.isPrimary).length;
    if (memberships.length > 0 && primaryCount !== 1) {
      setError("Нужно выбрать ровно один основной участок");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiRequest(`/users/${userId}/plots`, {
        method: "PUT",
        token,
        tenantSlug,
        body: {
          memberships,
        },
      });
      await load();
      await onUserChanged();
    } catch (requestError) {
      setError(normalizeError(requestError, "Не удалось сохранить участки"));
    } finally {
      setLoading(false);
    }
  };

  const togglePlot = (plotId: number) => {
    setMemberships((current) => {
      const exists = current.find((m) => m.plotId === plotId);
      if (exists) {
        const next = current.filter((m) => m.plotId !== plotId);
        // If removed primary, leave no primary, user must pick again.
        return next.map((m) => (m.isPrimary ? m : m));
      }
      return [...current, { plotId, isPrimary: current.length === 0 }];
    });
  };

  const setPrimary = (plotId: number) => {
    setMemberships((current) => current.map((m) => ({ ...m, isPrimary: m.plotId === plotId })));
  };

  const membershipSet = useMemo(() => new Set(memberships.map((m) => m.plotId)), [memberships]);

  if (!open) return null;

  return (
    <div className="drawer-overlay" role="dialog" aria-modal="true">
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <h2>Пользователь</h2>
            <p className="muted">ID: {userId}</p>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="drawer-tabs">
          <button
            type="button"
            className={tab === "profile" ? "tab-button active" : "tab-button"}
            onClick={() => setTab("profile")}
          >
            Профиль
          </button>
          <button
            type="button"
            className={tab === "access" ? "tab-button active" : "tab-button"}
            onClick={() => setTab("access")}
          >
            Доступ
          </button>
          <button
            type="button"
            className={tab === "plots" ? "tab-button active" : "tab-button"}
            onClick={() => setTab("plots")}
          >
            Участки
          </button>
          <button
            type="button"
            className={tab === "audit" ? "tab-button active" : "tab-button"}
            onClick={() => setTab("audit")}
          >
            Аудит
          </button>
        </div>

        {error ? <div className="error">{error}</div> : null}

        {loading && !detail ? <p className="muted">Загрузка...</p> : null}

        {detail ? (
          <div className="drawer-body">
            {tab === "profile" ? (
              <div className="form-grid">
                <label>
                  ФИО
                  <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label>
                  Телефон
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(event) => setIsActive(event.target.checked)}
                  />
                  Аккаунт активен
                </label>

                <div className="grid-2">
                  <div className="panel mini">
                    <p className="mini-label">Последний вход</p>
                    <p className="mini-value">{formatDateTime(detail.user.lastLoginAt)}</p>
                  </div>
                  <div className="panel mini">
                    <p className="mini-label">Активных сессий</p>
                    <p className="mini-value">{detail.user.activeSessionsCount ?? 0}</p>
                  </div>
                </div>

                <button className="primary-button" type="button" disabled={loading} onClick={saveProfile}>
                  Сохранить
                </button>
              </div>
            ) : null}

            {tab === "access" ? (
              <div className="form-grid">
                <div className="grid-2">
                  <div className="panel mini">
                    <p className="mini-label">Статус</p>
                    <p className="mini-value">{detail.user.isActive ? "ACTIVE" : "INACTIVE"}</p>
                  </div>
                  <div className="panel mini">
                    <p className="mini-label">Смена пароля</p>
                    <p className="mini-value">{detail.user.mustChangePassword ? "обязательна" : "нет"}</p>
                  </div>
                </div>

                <label>
                  Сбросить на временный пароль
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    placeholder="Временный пароль"
                  />
                </label>
                <button
                  className="primary-button"
                  type="button"
                  disabled={loading || resetPassword.trim().length === 0}
                  onClick={doResetPassword}
                >
                  Сбросить пароль
                </button>
                <p className="muted">
                  Текущий пароль не отображается. После сброса пользователю потребуется смена пароля при первом входе.
                </p>
              </div>
            ) : null}

            {tab === "plots" ? (
              <div className="form-grid">
                <p className="muted">Выберите участки пользователя и отметьте основной (используется для начислений/витрины).</p>

                <div className="plots-grid">
                  {plots.map((plot) => {
                    const checked = membershipSet.has(plot.id);
                    const isPrimary = memberships.some((m) => m.plotId === plot.id && m.isPrimary);

                    return (
                      <div key={plot.id} className={checked ? "plot-chip selected" : "plot-chip"}>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              togglePlot(plot.id);
                            }}
                          />
                          Участок №{plot.number}
                        </label>

                        {checked ? (
                          <button
                            type="button"
                            className={isPrimary ? "secondary-button small active" : "secondary-button small"}
                            onClick={() => setPrimary(plot.id)}
                          >
                            {isPrimary ? "Основной" : "Сделать основным"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <button className="primary-button" type="button" disabled={loading} onClick={savePlots}>
                  Сохранить участки
                </button>
              </div>
            ) : null}

            {tab === "audit" ? (
              <div className="form-grid">
                <ul className="audit-list">
                  {detail.audit.length === 0 ? <li className="muted">Нет событий.</li> : null}
                  {detail.audit.map((event) => (
                    <li key={event.id}>
                      <span className="audit-action">{event.action}</span>
                      <span className="audit-meta">{formatDateTime(event.createdAt)}</span>
                      {event.actor ? (
                        <span className="audit-meta">· {event.actor.name}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { ready, session } = useAuth(true);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 20, offset: 0 });
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  const [plots, setPlots] = useState<PlotItem[]>([]);
  const [plotsError, setPlotsError] = useState<string | null>(null);
  const [plotNumber, setPlotNumber] = useState("");
  const [plotArea, setPlotArea] = useState("");

  const [chargesCount, setChargesCount] = useState<number | null>(null);
  const [paymentsCount, setPaymentsCount] = useState<number | null>(null);
  const [auditEvents, setAuditEvents] = useState<Array<{ id: string; action: string; createdAt: string }>>([]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [plotIds, setPlotIds] = useState<number[]>([]);
  const [primaryPlotId, setPrimaryPlotId] = useState<number | "">("");

  const [search, setSearch] = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [plotFilter, setPlotFilter] = useState<number | "">("");

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const token = session?.accessToken;
  const tenantSlug = session?.tenantSlug;

  const loadPlots = async () => {
    if (!token || !tenantSlug) return;
    try {
      const response = await apiRequest<PlotListResponse>("/plots", {
        token,
        tenantSlug,
      });
      setPlots(response.items);
      setPlotsError(null);
    } catch (_error) {
      setPlots([]);
      setPlotsError("Не удалось загрузить участки");
    }
  };

  const createPlot = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !tenantSlug) return;

    setNotice(null);
    setError(null);

    const areaNumeric = plotArea.trim().length === 0 ? undefined : Number(plotArea);
    if (plotArea.trim().length > 0 && !Number.isFinite(areaNumeric)) {
      setError("Площадь должна быть числом");
      return;
    }

    try {
      await apiRequest("/plots", {
        method: "POST",
        token,
        tenantSlug,
        body: {
          number: plotNumber,
          area: areaNumeric,
        },
      });

      setPlotNumber("");
      setPlotArea("");
      setNotice("Участок добавлен");
      await loadPlots();
    } catch (requestError) {
      setError(normalizeError(requestError, "Не удалось создать участок"));
    }
  };

  const loadUsers = async (offset = pagination.offset) => {
    if (!token || !tenantSlug) return;

    setUserLoading(true);
    setUserError(null);

    const params = new URLSearchParams();
    params.set("limit", String(pagination.limit));
    params.set("offset", String(offset));

    if (search.trim().length > 0) {
      params.set("search", search.trim());
    }

    if (isActiveFilter === "active") {
      params.set("isActive", "true");
    } else if (isActiveFilter === "inactive") {
      params.set("isActive", "false");
    }

    if (plotFilter !== "") {
      params.set("plotId", String(plotFilter));
    }

    try {
      const response = await apiRequest<UserListResponse>(`/users?${params.toString()}`, {
        token,
        tenantSlug,
      });
      setUsers(response.items);
      setPagination(response.pagination);
    } catch (requestError) {
      setUsers([]);
      setPagination({ total: 0, limit: pagination.limit, offset });
      setUserError(normalizeError(requestError, "Не удалось загрузить пользователей"));
    } finally {
      setUserLoading(false);
    }
  };

  const loadWidgets = async () => {
    if (!token || !tenantSlug) return;

    apiRequest<ChargeListResponse>("/billing/charges", {
      token,
      tenantSlug,
    })
      .then((response) => setChargesCount(response.items.length))
      .catch(() => setChargesCount(0));

    apiRequest<PaymentListResponse>("/payments", {
      token,
      tenantSlug,
    })
      .then((response) => setPaymentsCount(response.items.length))
      .catch(() => setPaymentsCount(0));

    apiRequest<AuditListResponse>("/audit?limit=10", {
      token,
      tenantSlug,
    })
      .then((response) => setAuditEvents(response.items))
      .catch(() => setAuditEvents([]));
  };

  useEffect(() => {
    if (!ready || !session || session.user.role !== "CHAIRMAN") return;

    loadPlots();
    loadUsers(0);
    loadWidgets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session]);

  const togglePlotId = (plotId: number) => {
    setPlotIds((current) => {
      if (current.includes(plotId)) {
        const next = current.filter((id) => id !== plotId);
        if (primaryPlotId === plotId) {
          setPrimaryPlotId("");
        }
        return next;
      }

      return [...current, plotId];
    });
  };

  const createResident = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || session.user.role !== "CHAIRMAN" || !token || !tenantSlug) return;

    setNotice(null);
    setError(null);

    const creatingMemberships = plotIds.length > 0;

    if (creatingMemberships) {
      if (primaryPlotId === "") {
        setError("Выберите основной участок");
        return;
      }
    }

    try {
      await apiRequest("/users", {
        method: "POST",
        token,
        tenantSlug,
        body: {
          name,
          phone,
          temporaryPassword,
          plotIds,
          primaryPlotId: primaryPlotId === "" ? undefined : primaryPlotId,
        },
      });

      setName("");
      setPhone("");
      setTemporaryPassword("");
      setPlotIds([]);
      setPrimaryPlotId("");
      setNotice("Пользователь создан. На первом входе ему потребуется смена пароля.");
      await loadUsers(0);
      await loadWidgets();
    } catch (requestError) {
      setError(normalizeError(requestError, "Не удалось создать пользователя"));
    }
  };

  const usersSummary = useMemo(() => {
    const active = users.filter((u) => u.isActive).length;
    const inactive = users.filter((u) => !u.isActive).length;
    return { active, inactive };
  }, [users]);

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  if (session.user.role !== "CHAIRMAN") {
    return (
      <PortalShell title="Админ-панель" subtitle="Только для председателя">
        <div className="error">Доступ ограничен ролью председателя.</div>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="Админ-панель" subtitle="Операционный контроль СНТ">
      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="grid-3">
        <StatCard label="Пользователи" value={`${pagination.total}`} hint={`активных: ${usersSummary.active}, неактивных: ${usersSummary.inactive}`} />
        <StatCard label="Начисления" value={chargesCount === null ? "..." : String(chargesCount)} />
        <StatCard label="Платежи" value={paymentsCount === null ? "..." : String(paymentsCount)} />
      </div>

      <div className="grid-2">
        <Panel title="Добавить жителя">
          <form className="inline-form" onSubmit={createResident}>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="ФИО" />
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Телефон (E.164)" />
            <input
              type="password"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              placeholder="Временный пароль"
            />

            <div className="panel mini">
              <p className="mini-label">Участки (опционально)</p>
              {plotsError ? <p className="muted">{plotsError}</p> : null}
              <div className="plots-inline">
                {plots.map((plot) => (
                  <label key={plot.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={plotIds.includes(plot.id)}
                      onChange={() => togglePlotId(plot.id)}
                    />
                    №{plot.number}
                  </label>
                ))}
              </div>
              {plotIds.length > 0 ? (
                <label>
                  Основной участок
                  <select
                    value={primaryPlotId}
                    onChange={(event) => {
                      const v = event.target.value;
                      setPrimaryPlotId(v === "" ? "" : Number(v));
                    }}
                  >
                    <option value="">Выберите</option>
                    {plotIds
                      .map((id) => plots.find((p) => p.id === id))
                      .filter(Boolean)
                      .map((plot) => (
                        <option key={(plot as PlotItem).id} value={(plot as PlotItem).id}>
                          №{(plot as PlotItem).number}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
            </div>

            <button className="primary-button" type="submit">
              Создать USER
            </button>
          </form>

          <p className="muted">
            Пользователь создается только председателем. Саморегистрация отключена.
          </p>
        </Panel>

        <Panel title="Последние audit-события">
          <ul>
            {auditEvents.length === 0 ? <li className="muted">Пока нет событий.</li> : null}
            {auditEvents.map((event) => (
              <li key={event.id}>
                {event.action} · {formatDateTime(event.createdAt)}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Участки">
        <div className="grid-2">
          <form className="inline-form" onSubmit={createPlot}>
            <input
              value={plotNumber}
              onChange={(event) => setPlotNumber(event.target.value)}
              placeholder="Номер участка (например, 12)"
            />
            <input
              value={plotArea}
              onChange={(event) => setPlotArea(event.target.value)}
              placeholder="Площадь (м², опционально)"
            />
            <button className="primary-button" type="submit">
              Добавить участок
            </button>
          </form>

          <div className="panel mini">
            <p className="mini-label">Всего участков</p>
            <p className="mini-value">{plots.length}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Номер</th>
              <th>Площадь</th>
              <th>Основной владелец</th>
            </tr>
          </thead>
          <tbody>
            {plots.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">
                  Участков пока нет.
                </td>
              </tr>
            ) : null}
            {plots.map((plot) => (
              <tr key={plot.id}>
                <td>№{plot.number}</td>
                <td>{plot.area ?? "-"}</td>
                <td>{plot.owner ? `${plot.owner.name} (${plot.owner.phone})` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel
        title="Пользователи"
        action={
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              loadUsers(0);
              loadWidgets();
            }}
          >
            Обновить
          </button>
        }
      >
        <div className="admin-filters">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по имени/телефону"
          />

          <select
            value={isActiveFilter}
            onChange={(event) =>
              setIsActiveFilter(event.target.value as "all" | "active" | "inactive")
            }
          >
            <option value="all">Все</option>
            <option value="active">Только активные</option>
            <option value="inactive">Только неактивные</option>
          </select>

          <select
            value={plotFilter}
            onChange={(event) => {
              const v = event.target.value;
              setPlotFilter(v === "" ? "" : Number(v));
            }}
          >
            <option value="">Все участки</option>
            {plots.map((plot) => (
              <option key={plot.id} value={plot.id}>
                №{plot.number}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="primary-button"
            onClick={() => {
              loadUsers(0);
            }}
          >
            Применить
          </button>
        </div>

        {userError ? <div className="error">{userError}</div> : null}

        <table>
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Телефон</th>
              <th>Статус</th>
              <th>Участки</th>
              <th>Пароль</th>
              <th>Последний вход</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {userLoading ? (
              <tr>
                <td colSpan={7} className="muted">
                  Загрузка...
                </td>
              </tr>
            ) : null}

            {!userLoading && users.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  Пользователей нет.
                </td>
              </tr>
            ) : null}

            {users.map((user) => {
              const plotsLabel = (user.plotMemberships ?? [])
                .filter((m) => m.toDate === null)
                .slice(0, 3)
                .map(toPlotLabel)
                .join(", ");

              return (
                <tr key={user.id}>
                  <td>
                    <div className="user-main">
                      <span className="user-name">{user.name}</span>
                      <span className="user-sub">ID: {user.id} · создан: {formatDateTime(user.createdAt)}</span>
                    </div>
                  </td>
                  <td>{user.phone}</td>
                  <td>
                    {user.isActive ? "ACTIVE" : "INACTIVE"}
                    {user.mustChangePassword ? " · смена пароля" : ""}
                  </td>
                  <td>{plotsLabel || "-"}</td>
                  <td>{user.mustChangePassword ? "temp" : "ok"}</td>
                  <td>{formatDateTime(user.lastLoginAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      Открыть
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="pager">
          <button
            type="button"
            className="secondary-button"
            disabled={pagination.offset <= 0}
            onClick={() => {
              const nextOffset = Math.max(0, pagination.offset - pagination.limit);
              loadUsers(nextOffset);
            }}
          >
            Назад
          </button>
          <p className="muted">
            {pagination.total === 0
              ? "0"
              : `${pagination.offset + 1}-${Math.min(pagination.offset + pagination.limit, pagination.total)} из ${pagination.total}`}
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={pagination.offset + pagination.limit >= pagination.total}
            onClick={() => {
              const nextOffset = pagination.offset + pagination.limit;
              loadUsers(nextOffset);
            }}
          >
            Вперед
          </button>
        </div>
      </Panel>

      {selectedUserId && token && tenantSlug ? (
        <UserDrawer
          open={selectedUserId !== null}
          userId={selectedUserId}
          token={token}
          tenantSlug={tenantSlug}
          plots={plots}
          onClose={() => setSelectedUserId(null)}
          onUserChanged={async () => {
            await loadUsers(pagination.offset);
            await loadWidgets();
          }}
        />
      ) : null}
    </PortalShell>
  );
}
