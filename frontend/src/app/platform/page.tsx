"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import { Panel } from "@/components/ui-kit";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

type TenantStatus = "ACTIVE" | "ARCHIVED";

interface PlatformTenant {
  id: number;
  slug: string;
  name: string;
  status: TenantStatus;
  location?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timeZone?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TenantListResponse {
  items: PlatformTenant[];
  pagination: { total: number; limit: number; offset: number };
}

interface TenantResponse {
  tenant: PlatformTenant;
}

interface PlatformUser {
  id: number;
  tenantId: number;
  tenant: { id: number; slug: string; name: string };
  name: string;
  phone: string;
  role: "USER" | "CHAIRMAN" | "ADMIN";
  isActive: boolean;
  lastLoginAt?: string | null;
  mustChangePassword: boolean;
  createdAt: string;
}

interface UserListResponse {
  items: PlatformUser[];
  pagination: { total: number; limit: number; offset: number };
}

interface UserResponse {
  user: PlatformUser;
}

const normalizeError = (requestError: unknown, fallback: string) => {
  if (!(requestError instanceof ApiRequestError)) return fallback;
  if (requestError.payload?.code === "PHONE_ALREADY_EXISTS") return "Телефон уже используется";
  if (requestError.payload?.code === "CANNOT_DEACTIVATE_LAST_CHAIRMAN") return "Нельзя отключить последнего активного председателя";
  if (requestError.payload?.code === "TENANT_SLUG_EXISTS") return "Slug уже занят";
  return requestError.message;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("ru-RU");
};

function TenantDrawer(props: {
  open: boolean;
  token: string;
  tenantSlug: string;
  tenant?: PlatformTenant | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { open, token, tenantSlug, tenant, onClose, onSaved } = props;
  const isCreate = !tenant;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<TenantStatus>("ACTIVE");
  const [location, setLocation] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [timeZone, setTimeZone] = useState("");

  const [chairmanName, setChairmanName] = useState("");
  const [chairmanPhone, setChairmanPhone] = useState("");
  const [chairmanPassword, setChairmanPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(tenant?.name ?? "");
    setSlug(tenant?.slug ?? "");
    setStatus(tenant?.status ?? "ACTIVE");
    setLocation(tenant?.location ?? "");
    setAddress(tenant?.address ?? "");
    setLatitude(tenant?.latitude === null || tenant?.latitude === undefined ? "" : String(tenant.latitude));
    setLongitude(tenant?.longitude === null || tenant?.longitude === undefined ? "" : String(tenant.longitude));
    setTimeZone(tenant?.timeZone ?? "");
    setChairmanName("");
    setChairmanPhone("");
    setChairmanPassword("");
  }, [open, tenant]);

  const fillFromGeolocation = async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Геолокация недоступна в браузере");
      return;
    }

    setLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000 });
      });
      setLatitude(String(pos.coords.latitude));
      setLongitude(String(pos.coords.longitude));
    } catch (_err) {
      setError("Не удалось получить геолокацию");
    } finally {
      setLoading(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const lat = latitude.trim().length === 0 ? undefined : Number(latitude);
    const lon = longitude.trim().length === 0 ? undefined : Number(longitude);
    if (latitude.trim().length > 0 && !Number.isFinite(lat)) {
      setLoading(false);
      setError("Широта должна быть числом");
      return;
    }
    if (longitude.trim().length > 0 && !Number.isFinite(lon)) {
      setLoading(false);
      setError("Долгота должна быть числом");
      return;
    }

    const chairmanFilled =
      chairmanName.trim().length > 0 || chairmanPhone.trim().length > 0 || chairmanPassword.trim().length > 0;
    const chairmanValid =
      chairmanName.trim().length > 0 && chairmanPhone.trim().length > 0 && chairmanPassword.trim().length > 0;

    if (chairmanFilled && !chairmanValid) {
      setLoading(false);
      setError("Для создания председателя заполните имя, телефон и временный пароль");
      return;
    }

    try {
      if (isCreate) {
        await apiRequest<TenantResponse>("/platform/tenants", {
          method: "POST",
          token,
          tenantSlug,
          body: {
            name,
            slug,
            status,
            location: location.trim().length > 0 ? location : undefined,
            address: address.trim().length > 0 ? address : undefined,
            latitude: lat,
            longitude: lon,
            timeZone: timeZone.trim().length > 0 ? timeZone : undefined,
            chairman: chairmanValid
              ? { name: chairmanName, phone: chairmanPhone, temporaryPassword: chairmanPassword }
              : undefined,
          },
        });
      } else {
        await apiRequest<TenantResponse>(`/platform/tenants/${tenant.id}`, {
          method: "PATCH",
          token,
          tenantSlug,
          body: {
            name,
            slug,
            status,
            location: location.trim().length > 0 ? location : "",
            address: address.trim().length > 0 ? address : "",
            latitude: lat,
            longitude: lon,
            timeZone: timeZone.trim().length > 0 ? timeZone : undefined,
          },
        });
      }

      await onSaved();
      onClose();
    } catch (requestError) {
      setError(normalizeError(requestError, "Не удалось сохранить СНТ"));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="drawer-overlay" role="dialog" aria-modal="true">
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <h2>{isCreate ? "Создать СНТ" : "Редактировать СНТ"}</h2>
            {!isCreate ? <p className="muted">ID: {tenant.id}</p> : null}
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="drawer-body">
          {error ? <div className="error">{error}</div> : null}

          <form className="auth-form" onSubmit={save}>
            <label>
              Название
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <label>
              Slug
              <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
            </label>

            <label>
              Статус
              <select value={status} onChange={(e) => setStatus(e.target.value as TenantStatus)}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>

            <label>
              Регион (старое поле location)
              <input value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>

            <label>
              Адрес
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>

            <div className="inline-form-fields">
              <label style={{ flex: 1 }}>
                Широта
                <input value={latitude} onChange={(e) => setLatitude(e.target.value)} />
              </label>
              <label style={{ flex: 1 }}>
                Долгота
                <input value={longitude} onChange={(e) => setLongitude(e.target.value)} />
              </label>
            </div>

            <button type="button" className="secondary-button" onClick={fillFromGeolocation} disabled={loading}>
              Взять координаты с устройства
            </button>

            <label>
              Таймзона (IANA, можно оставить пустой для auto)
              <input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} placeholder="Europe/Moscow" />
            </label>

            {isCreate ? (
              <div className="panel mini">
                <p className="mini-label">Опционально: создать председателя</p>
                <div className="inline-form-fields" style={{ marginTop: 8 }}>
                  <input
                    style={{ flex: 1 }}
                    placeholder="Имя"
                    value={chairmanName}
                    onChange={(e) => setChairmanName(e.target.value)}
                  />
                  <input
                    style={{ flex: 1 }}
                    placeholder="Телефон"
                    value={chairmanPhone}
                    onChange={(e) => setChairmanPhone(e.target.value)}
                  />
                </div>
                <input
                  style={{ marginTop: 8 }}
                  placeholder="Временный пароль"
                  value={chairmanPassword}
                  onChange={(e) => setChairmanPassword(e.target.value)}
                />
              </div>
            ) : null}

            <button type="submit" className="primary-button" disabled={loading || name.trim().length === 0 || slug.trim().length === 0}>
              {loading ? "Сохранение..." : "Сохранить"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function UserDrawer(props: {
  open: boolean;
  token: string;
  tenantSlug: string;
  user?: PlatformUser | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { open, token, tenantSlug, user, onClose, onSaved } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<PlatformUser["role"]>("USER");
  const [isActive, setIsActive] = useState(true);
  const [resetPassword, setResetPassword] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    setError(null);
    setName(user.name);
    setPhone(user.phone);
    setRole(user.role);
    setIsActive(user.isActive);
    setResetPassword("");
  }, [open, user]);

  const save = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest<UserResponse>(`/platform/users/${user.id}`, {
        method: "PATCH",
        token,
        tenantSlug,
        body: { name, phone, role, isActive },
      });
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(normalizeError(requestError, "Не удалось сохранить пользователя"));
    } finally {
      setLoading(false);
    }
  };

  const doReset = async () => {
    if (!user) return;
    if (resetPassword.trim().length === 0) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest<UserResponse>(`/platform/users/${user.id}/reset-password`, {
        method: "POST",
        token,
        tenantSlug,
        body: { temporaryPassword: resetPassword },
      });
      setResetPassword("");
      await onSaved();
    } catch (requestError) {
      setError(normalizeError(requestError, "Не удалось сбросить пароль"));
    } finally {
      setLoading(false);
    }
  };

  if (!open || !user) return null;

  return (
    <div className="drawer-overlay" role="dialog" aria-modal="true">
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <h2>Пользователь</h2>
            <p className="muted">
              ID: {user.id} · СНТ: {user.tenant.name} ({user.tenant.slug})
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="drawer-body">
          {error ? <div className="error">{error}</div> : null}

          <div className="panel mini">
            <p className="mini-label">Последний вход</p>
            <p className="mini-value">{formatDateTime(user.lastLoginAt ?? null)}</p>
          </div>

          <label>
            Имя
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label>
            Телефон
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>

          <label>
            Роль
            <select value={role} onChange={(e) => setRole(e.target.value as PlatformUser["role"])}>
              <option value="USER">USER</option>
              <option value="CHAIRMAN">CHAIRMAN</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>

          <label className="checkbox-row">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Активен
          </label>

          <button className="primary-button" type="button" onClick={save} disabled={loading}>
            {loading ? "Сохранение..." : "Сохранить"}
          </button>

          <div className="panel mini">
            <p className="mini-label">Сброс пароля (временный)</p>
            <div className="inline-form-fields" style={{ marginTop: 8 }}>
              <input
                style={{ flex: 1 }}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Новый временный пароль"
              />
              <button type="button" className="secondary-button" onClick={doReset} disabled={loading || resetPassword.trim().length === 0}>
                Сбросить
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlatformPage() {
  const router = useRouter();
  const { ready, session } = useAuth(true);

  const token = session?.accessToken;
  const tenantSlug = session?.tenantSlug;

  const [tab, setTab] = useState<"tenants" | "users">("tenants");

  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenantStatus, setTenantStatus] = useState<TenantStatus | "">("");
  const [tenantOffset, setTenantOffset] = useState(0);
  const [tenantTotal, setTenantTotal] = useState(0);

  const [tenantDrawerOpen, setTenantDrawerOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<PlatformTenant | null>(null);

  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userTenantId, setUserTenantId] = useState<number | "">("");
  const [userRole, setUserRole] = useState<PlatformUser["role"] | "">("");
  const [userActive, setUserActive] = useState<"all" | "active" | "inactive">("all");
  const [userOffset, setUserOffset] = useState(0);
  const [userTotal, setUserTotal] = useState(0);

  const [userDrawerOpen, setUserDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);

  const [createTenantId, setCreateTenantId] = useState<number | "">("");
  const [createUserName, setCreateUserName] = useState("");
  const [createUserPhone, setCreateUserPhone] = useState("");
  const [createUserRole, setCreateUserRole] = useState<PlatformUser["role"]>("USER");
  const [createUserPassword, setCreateUserPassword] = useState("");
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [createUserNotice, setCreateUserNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !session) return;
    if (session.user.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [ready, router, session]);

  const loadTenants = async (offset = tenantOffset) => {
    if (!token || !tenantSlug) return;
    setTenantsLoading(true);
    setTenantsError(null);
    try {
      const params = new URLSearchParams({
        limit: "20",
        offset: String(offset),
      });
      if (tenantSearch.trim().length > 0) params.set("search", tenantSearch.trim());
      if (tenantStatus) params.set("status", tenantStatus);

      const response = await apiRequest<TenantListResponse>(`/platform/tenants?${params.toString()}`, {
        token,
        tenantSlug,
      });
      setTenants(response.items);
      setTenantTotal(response.pagination.total);
      setTenantOffset(response.pagination.offset);
    } catch (requestError) {
      setTenants([]);
      setTenantTotal(0);
      setTenantsError(normalizeError(requestError, "Не удалось загрузить СНТ"));
    } finally {
      setTenantsLoading(false);
    }
  };

  const loadUsers = async (offset = userOffset) => {
    if (!token || !tenantSlug) return;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const params = new URLSearchParams({
        limit: "20",
        offset: String(offset),
      });
      if (userSearch.trim().length > 0) params.set("search", userSearch.trim());
      if (userTenantId !== "") params.set("tenantId", String(userTenantId));
      if (userRole) params.set("role", userRole);
      if (userActive === "active") params.set("isActive", "true");
      if (userActive === "inactive") params.set("isActive", "false");

      const response = await apiRequest<UserListResponse>(`/platform/users?${params.toString()}`, {
        token,
        tenantSlug,
      });
      setUsers(response.items);
      setUserTotal(response.pagination.total);
      setUserOffset(response.pagination.offset);
    } catch (requestError) {
      setUsers([]);
      setUserTotal(0);
      setUsersError(normalizeError(requestError, "Не удалось загрузить пользователей"));
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (!ready || !session || !token || !tenantSlug) return;
    void loadTenants(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session, token, tenantSlug]);

  useEffect(() => {
    if (!ready || !session || !token || !tenantSlug) return;
    void loadUsers(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session, token, tenantSlug]);

  const tenantIdOptions = useMemo(() => tenants.map((t) => ({ id: t.id, label: `${t.name} (${t.slug})` })), [tenants]);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !tenantSlug) return;
    setCreateUserError(null);
    setCreateUserNotice(null);

    if (createTenantId === "") {
      setCreateUserError("Выберите СНТ");
      return;
    }
    if (createUserName.trim().length === 0 || createUserPhone.trim().length === 0 || createUserPassword.trim().length === 0) {
      setCreateUserError("Заполните имя, телефон и временный пароль");
      return;
    }

    try {
      await apiRequest<UserResponse>("/platform/users", {
        method: "POST",
        token,
        tenantSlug,
        body: {
          tenantId: createTenantId,
          name: createUserName,
          phone: createUserPhone,
          role: createUserRole,
          temporaryPassword: createUserPassword,
        },
      });

      setCreateUserName("");
      setCreateUserPhone("");
      setCreateUserPassword("");
      setCreateUserRole("USER");
      setCreateUserNotice("Пользователь создан");
      await loadUsers(0);
    } catch (requestError) {
      setCreateUserError(normalizeError(requestError, "Не удалось создать пользователя"));
    }
  };

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  if (session.user.role !== "ADMIN") {
    return <div className="center-screen">Нет доступа</div>;
  }

  const tenantLimit = 20;
  const canTenantPrev = tenantOffset > 0;
  const canTenantNext = tenantOffset + tenantLimit < tenantTotal;

  const userLimit = 20;
  const canUserPrev = userOffset > 0;
  const canUserNext = userOffset + userLimit < userTotal;

  return (
    <PortalShell title="Платформа" subtitle="Управление СНТ и пользователями">
      <div className="drawer-tabs" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={tab === "tenants" ? "tab-button active" : "tab-button"}
          onClick={() => setTab("tenants")}
        >
          СНТ
        </button>
        <button
          type="button"
          className={tab === "users" ? "tab-button active" : "tab-button"}
          onClick={() => setTab("users")}
        >
          Пользователи
        </button>
      </div>

      {tab === "tenants" ? (
        <Panel
          title="СНТ"
          action={
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setSelectedTenant(null);
                setTenantDrawerOpen(true);
              }}
            >
              Создать СНТ
            </button>
          }
        >
          {tenantsError ? <div className="error">{tenantsError}</div> : null}

          <div className="inline-form-fields" style={{ marginBottom: 10 }}>
            <input
              style={{ flex: 1 }}
              placeholder="Поиск по названию/slug/адресу"
              value={tenantSearch}
              onChange={(e) => setTenantSearch(e.target.value)}
            />
            <select
              value={tenantStatus}
              onChange={(e) => setTenantStatus(e.target.value === "" ? "" : (e.target.value as TenantStatus))}
            >
              <option value="">Все</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
            <button type="button" className="secondary-button" onClick={() => loadTenants(0)} disabled={tenantsLoading}>
              {tenantsLoading ? "..." : "Найти"}
            </button>
          </div>

          {tenants.length === 0 ? (
            <p className="muted">Нет СНТ.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Название</th>
                  <th>Slug</th>
                  <th>Статус</th>
                  <th>Адрес</th>
                  <th>Координаты</th>
                  <th>TZ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.name}</td>
                    <td>{t.slug}</td>
                    <td>{t.status}</td>
                    <td>{t.address ?? t.location ?? "-"}</td>
                    <td>
                      {typeof t.latitude === "number" && typeof t.longitude === "number"
                        ? `${t.latitude.toFixed(5)}, ${t.longitude.toFixed(5)}`
                        : "-"}
                    </td>
                    <td>{t.timeZone ?? "-"}</td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="secondary-button small"
                        onClick={() => {
                          setSelectedTenant(t);
                          setTenantDrawerOpen(true);
                        }}
                      >
                        Редактировать
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="table-actions" style={{ justifyContent: "space-between", marginTop: 10 }}>
            <span className="muted">Всего: {tenantTotal}</span>
            <div className="table-actions">
              <button type="button" className="secondary-button small" disabled={!canTenantPrev} onClick={() => loadTenants(Math.max(0, tenantOffset - tenantLimit))}>
                Назад
              </button>
              <button type="button" className="secondary-button small" disabled={!canTenantNext} onClick={() => loadTenants(tenantOffset + tenantLimit)}>
                Вперед
              </button>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <Panel title="Создать пользователя">
            {createUserNotice ? <div className="notice">{createUserNotice}</div> : null}
            {createUserError ? <div className="error">{createUserError}</div> : null}

            <form className="auth-form" onSubmit={createUser}>
              <label>
                СНТ
                <select value={createTenantId} onChange={(e) => setCreateTenantId(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Выберите СНТ</option>
                  {tenantIdOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Имя
                <input value={createUserName} onChange={(e) => setCreateUserName(e.target.value)} />
              </label>
              <label>
                Телефон
                <input value={createUserPhone} onChange={(e) => setCreateUserPhone(e.target.value)} />
              </label>
              <label>
                Роль
                <select value={createUserRole} onChange={(e) => setCreateUserRole(e.target.value as PlatformUser["role"])}>
                  <option value="USER">USER</option>
                  <option value="CHAIRMAN">CHAIRMAN</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
              <label>
                Временный пароль
                <input value={createUserPassword} onChange={(e) => setCreateUserPassword(e.target.value)} />
              </label>

              <button type="submit" className="primary-button">
                Создать
              </button>
            </form>
          </Panel>

          <Panel title="Пользователи">
            {usersError ? <div className="error">{usersError}</div> : null}

            <div className="inline-form-fields" style={{ marginBottom: 10 }}>
              <input style={{ flex: 1 }} placeholder="Поиск (имя/телефон/СНТ)" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
              <select value={userTenantId} onChange={(e) => setUserTenantId(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">Все СНТ</option>
                {tenantIdOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={userRole}
                onChange={(e) => setUserRole(e.target.value === "" ? "" : (e.target.value as PlatformUser["role"]))}
              >
                <option value="">Все роли</option>
                <option value="USER">USER</option>
                <option value="CHAIRMAN">CHAIRMAN</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <select
                value={userActive}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "all" || value === "active" || value === "inactive") {
                    setUserActive(value);
                  }
                }}
              >
                <option value="all">Все</option>
                <option value="active">Активные</option>
                <option value="inactive">Неактивные</option>
              </select>
              <button type="button" className="secondary-button" onClick={() => loadUsers(0)} disabled={usersLoading}>
                {usersLoading ? "..." : "Найти"}
              </button>
            </div>

            {users.length === 0 ? (
              <p className="muted">Нет пользователей.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>СНТ</th>
                    <th>Имя</th>
                    <th>Телефон</th>
                    <th>Роль</th>
                    <th>Активен</th>
                    <th>Последний вход</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td>
                        {u.tenant.name}
                        <div className="muted">{u.tenant.slug}</div>
                      </td>
                      <td>{u.name}</td>
                      <td>{u.phone}</td>
                      <td>{u.role}</td>
                      <td>{u.isActive ? "Да" : "Нет"}</td>
                      <td>{formatDateTime(u.lastLoginAt ?? null)}</td>
                      <td className="table-actions">
                        <button
                          type="button"
                          className="secondary-button small"
                          onClick={() => {
                            setSelectedUser(u);
                            setUserDrawerOpen(true);
                          }}
                        >
                          Редактировать
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="table-actions" style={{ justifyContent: "space-between", marginTop: 10 }}>
              <span className="muted">Всего: {userTotal}</span>
              <div className="table-actions">
                <button type="button" className="secondary-button small" disabled={!canUserPrev} onClick={() => loadUsers(Math.max(0, userOffset - userLimit))}>
                  Назад
                </button>
                <button type="button" className="secondary-button small" disabled={!canUserNext} onClick={() => loadUsers(userOffset + userLimit)}>
                  Вперед
                </button>
              </div>
            </div>
          </Panel>
        </>
      )}

      {token && tenantSlug ? (
        <TenantDrawer
          open={tenantDrawerOpen}
          token={token}
          tenantSlug={tenantSlug}
          tenant={selectedTenant}
          onClose={() => setTenantDrawerOpen(false)}
          onSaved={async () => {
            await loadTenants(tenantOffset);
            await loadUsers(userOffset);
          }}
        />
      ) : null}

      {token && tenantSlug && selectedUser ? (
        <UserDrawer
          open={userDrawerOpen}
          token={token}
          tenantSlug={tenantSlug}
          user={selectedUser}
          onClose={() => setUserDrawerOpen(false)}
          onSaved={async () => {
            await loadUsers(userOffset);
          }}
        />
      ) : null}
    </PortalShell>
  );
}
