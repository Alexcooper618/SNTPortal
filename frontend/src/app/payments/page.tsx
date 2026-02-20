"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Panel, StatCard } from "@/components/ui-kit";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface Invoice {
  id: number;
  number: string;
  status: "PENDING" | "PARTIAL" | "PAID" | "CANCELED";
  totalCents: number;
  paidCents: number;
  dueDate: string;
  issuedAt: string;
  closedAt?: string | null;
  plot?: {
    id: number;
    number: string;
  };
  charge?: {
    id: number;
    title: string;
    status: string;
  } | null;
  user?: {
    id: number;
    name: string;
    phone: string;
  } | null;
}

interface InvoicesResponse {
  items: Invoice[];
}

interface BalanceResponse {
  totalDueCents: number;
  totalPaidCents: number;
  outstandingCents: number;
}

interface InitiateResponse {
  payment: {
    id: string;
    status: string;
  };
  checkoutUrl?: string;
}

interface ChargeSummaryItem {
  id: number;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  type: string;
  dueDate: string;
  publishedAt?: string | null;
  unitAmountCents: number;
  totalCents: number;
  paidCents: number;
  progressPercent: number;
  participantsCount: number;
  paidCount: number;
  unpaidCount: number;
  canceledCount: number;
  createdAt: string;
}

interface ChargesResponse {
  items: ChargeSummaryItem[];
}

interface UserListItem {
  id: number;
  name: string;
  phone: string;
  role: "USER" | "CHAIRMAN" | "ADMIN";
  isActive: boolean;
  plotMemberships?: Array<{ isPrimary: boolean }>;
}

interface UserSearchResponse {
  items: UserListItem[];
  pagination: { total: number; limit: number; offset: number };
}

interface CreateChargeResponse {
  charge: { id: number; title: string; status: string };
  participants: {
    includedUsers: number;
    includedPlots: number;
    skippedUsers: Array<{ userId: number; reason: string }>;
  };
  published: boolean;
}

interface NoticeMessage {
  text: string;
  checkoutUrl?: string;
}

const toRub = (cents: number): string => `${(cents / 100).toLocaleString("ru-RU")} ₽`;

const toCents = (raw: string): number => {
  const normalized = raw.trim().replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
};

const toDueIso = (raw: string): string => {
  // raw comes from <input type="date">: YYYY-MM-DD
  const dt = new Date(`${raw}T23:59:59`);
  return dt.toISOString();
};

export default function PaymentsPage() {
  const { ready, session } = useAuth(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [charges, setCharges] = useState<ChargeSummaryItem[]>([]);
  const [message, setMessage] = useState<NoticeMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [annualTitle, setAnnualTitle] = useState("Годовой сбор");
  const [annualAmount, setAnnualAmount] = useState("12000");
  const [annualDueDate, setAnnualDueDate] = useState("");
  const [annualDescription, setAnnualDescription] = useState("");

  const [requestTitle, setRequestTitle] = useState("Разовый платеж");
  const [requestAmount, setRequestAmount] = useState("1000");
  const [requestDueDate, setRequestDueDate] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserListItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  useEffect(() => {
    if (!ready || !session) return;

    const load = async () => {
      try {
        setError(null);
        setMessage(null);

        if (session.user.role === "CHAIRMAN") {
          const chargesData = await apiRequest<ChargesResponse>("/billing/charges", {
            token: session.accessToken,
            tenantSlug: session.tenantSlug,
          });
          setCharges(chargesData.items);
          setInvoices([]);
          setBalance(null);
          return;
        }

        const [invoicesData, balanceData] = await Promise.all([
          apiRequest<InvoicesResponse>("/billing/invoices", {
            token: session.accessToken,
            tenantSlug: session.tenantSlug,
          }),
          apiRequest<BalanceResponse>("/billing/balance/me", {
            token: session.accessToken,
            tenantSlug: session.tenantSlug,
          }),
        ]);
        setInvoices(invoicesData.items);
        setBalance(balanceData);
        setCharges([]);
      } catch (_error) {
        setError("Не удалось загрузить данные платежей");
      }
    };

    load();
  }, [ready, session]);

  const pendingInvoices = useMemo(
    () =>
      invoices
        .filter((inv) => inv.status === "PENDING" || inv.status === "PARTIAL")
        .slice()
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [invoices]
  );

  const historyInvoices = useMemo(
    () =>
      invoices
        .filter((inv) => inv.status === "PAID" || inv.status === "CANCELED")
        .slice()
        .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()),
    [invoices]
  );

  const payInvoice = async (invoiceId: number) => {
    if (!session) return;

    setError(null);
    setMessage(null);

    try {
      const response = await apiRequest<InitiateResponse>("/payments/initiate", {
        method: "POST",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
        body: {
          invoiceId,
          idempotencyKey: `web_${invoiceId}_${Date.now()}`,
        },
      });

      setMessage(
        response.checkoutUrl
          ? {
              text: "Платеж создан. Нажмите кнопку ниже для перехода к оплате.",
              checkoutUrl: response.checkoutUrl,
            }
          : { text: "Платеж создан" }
      );
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Не удалось создать платеж"
      );
    }
  };

  const loadCharges = async () => {
    if (!session) return;
    const chargesData = await apiRequest<ChargesResponse>("/billing/charges", {
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
    });
    setCharges(chargesData.items);
  };

  const createAnnualSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || session.user.role !== "CHAIRMAN") return;
    if (!annualDueDate) {
      setError("Выберите срок оплаты");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiRequest<CreateChargeResponse>("/billing/charges", {
        method: "POST",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
        body: {
          title: annualTitle,
          description: annualDescription || undefined,
          unitAmountCents: toCents(annualAmount),
          dueDate: toDueIso(annualDueDate),
          type: "ONE_TIME",
          audience: "ALL_ACTIVE_USERS_PRIMARY_PLOTS",
          publishNow: true,
        },
      });

      const skipped = response.participants.skippedUsers.length;
      setMessage(
        skipped > 0
          ? { text: `Сессия создана. Пропущено пользователей без участков/неактивных: ${skipped}` }
          : { text: "Сессия создана" }
      );
      await loadCharges();
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : "Не удалось создать сессию");
    } finally {
      setBusy(false);
    }
  };

  const searchUsers = async () => {
    if (!session || session.user.role !== "CHAIRMAN") return;
    const term = userSearch.trim();
    if (term.length === 0) {
      setUserResults([]);
      setSelectedUserId(null);
      return;
    }

    try {
      const response = await apiRequest<UserSearchResponse>(
        `/users?limit=10&offset=0&isActive=true&search=${encodeURIComponent(term)}`,
        {
          token: session.accessToken,
          tenantSlug: session.tenantSlug,
        }
      );
      setUserResults(response.items.filter((u) => u.role === "USER"));
    } catch (_error) {
      setUserResults([]);
    }
  };

  const createOneTimeRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || session.user.role !== "CHAIRMAN") return;
    if (!requestDueDate) {
      setError("Выберите срок оплаты");
      return;
    }
    if (!selectedUserId) {
      setError("Выберите пользователя");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiRequest<CreateChargeResponse>("/billing/charges", {
        method: "POST",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
        body: {
          title: requestTitle,
          unitAmountCents: toCents(requestAmount),
          dueDate: toDueIso(requestDueDate),
          type: "ONE_TIME",
          audience: "USERS_PRIMARY_PLOTS",
          userIds: [selectedUserId],
          publishNow: true,
        },
      });

      const skipped = response.participants.skippedUsers.length;
      setMessage(
        skipped > 0
          ? { text: "Запрос создан, но пользователь пропущен (нет основного участка или неактивен)." }
          : { text: "Запрос на оплату создан" }
      );
      await loadCharges();
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : "Не удалось создать запрос");
    } finally {
      setBusy(false);
    }
  };

  const closeSession = async (chargeId: number) => {
    if (!session || session.user.role !== "CHAIRMAN") return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/billing/charges/${chargeId}/close`, {
        method: "POST",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
        body: {},
      });
      setMessage({ text: "Сессия закрыта (участников больше нельзя менять)." });
      await loadCharges();
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : "Не удалось закрыть сессию");
    } finally {
      setBusy(false);
    }
  };

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  const isChairman = session.user.role === "CHAIRMAN";

  if (isChairman) {
    return (
      <PortalShell title="Сборы и платежи" subtitle="Годовые сессии, разовые запросы и мониторинг">
        {error ? <div className="error">{error}</div> : null}
        {message ? (
          <div className="notice">
            <div>{message.text}</div>
            {message.checkoutUrl ? (
              <div className="row" style={{ marginTop: 8 }}>
                <a className="secondary-button" href={message.checkoutUrl} rel="noreferrer">
                  Перейти к оплате
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid-2">
          <Panel title="Открыть годовую сессию">
            <form className="inline-form" onSubmit={createAnnualSession}>
              <div className="form-row-3">
                <input value={annualTitle} onChange={(e) => setAnnualTitle(e.target.value)} placeholder="Название" />
                <input
                  value={annualAmount}
                  onChange={(e) => setAnnualAmount(e.target.value)}
                  placeholder="Сумма (₽)"
                  inputMode="decimal"
                />
                <input
                  type="date"
                  value={annualDueDate}
                  onChange={(e) => setAnnualDueDate(e.target.value)}
                />
              </div>
              <input
                value={annualDescription}
                onChange={(e) => setAnnualDescription(e.target.value)}
                placeholder="Описание (опционально)"
              />
              <button className="primary-button" type="submit" disabled={busy}>
                Открыть сессию
              </button>
            </form>
          </Panel>

          <Panel title="Разовый запрос пользователю">
            <form className="inline-form" onSubmit={createOneTimeRequest}>
              <div className="form-row-2">
                <input value={requestTitle} onChange={(e) => setRequestTitle(e.target.value)} placeholder="Название" />
                <input
                  value={requestAmount}
                  onChange={(e) => setRequestAmount(e.target.value)}
                  placeholder="Сумма (₽)"
                  inputMode="decimal"
                />
              </div>
              <div className="form-row-2">
                <input
                  type="date"
                  value={requestDueDate}
                  onChange={(e) => setRequestDueDate(e.target.value)}
                />
                <div className="row">
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Поиск (имя/телефон)"
                  />
                  <button type="button" className="secondary-button" onClick={searchUsers} disabled={busy}>
                    Найти
                  </button>
                </div>
              </div>

              {userResults.length > 0 ? (
                <select
                  value={selectedUserId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedUserId(v ? Number(v) : null);
                  }}
                >
                  <option value="">Выберите пользователя</option>
                  {userResults.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.phone})
                    </option>
                  ))}
                </select>
              ) : null}

              <button className="primary-button" type="submit" disabled={busy}>
                Отправить запрос
              </button>
            </form>
          </Panel>
        </div>

        <Panel title="Сессии сборов">
          {charges.length === 0 ? (
            <p className="muted">Сессий пока нет.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Сессия</th>
                  <th>Статус</th>
                  <th>Срок</th>
                  <th>Прогресс</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {charges.map((charge) => (
                  <tr key={charge.id}>
                    <td>
                      <div>
                        <strong>{charge.title}</strong>
                      </div>
                      <div className="muted">
                        {toRub(charge.paidCents)} / {toRub(charge.totalCents)} · участников: {charge.participantsCount}
                      </div>
                    </td>
                    <td>
                      <span className="pill">{charge.status}</span>
                    </td>
                    <td>{new Date(charge.dueDate).toLocaleDateString("ru-RU")}</td>
                    <td style={{ minWidth: 180 }}>
                      <div className="row">
                        <div className="progress" style={{ flex: 1 }}>
                          <span style={{ width: `${Math.max(0, Math.min(100, charge.progressPercent))}%` }} />
                        </div>
                        <span className="muted">{charge.progressPercent}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="table-actions">
                        <Link className="secondary-button" href={`/payments/sessions/${charge.id}`}>
                          Открыть
                        </Link>
                        {charge.status === "CLOSED" ? null : (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => closeSession(charge.id)}
                            disabled={busy}
                          >
                            Закрыть
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="Платежи и баланс" subtitle="Начисления, инвойсы и онлайн-оплата">
      {error ? <div className="error">{error}</div> : null}
      {message ? (
        <div className="notice">
          <div>{message.text}</div>
          {message.checkoutUrl ? (
            <div className="row" style={{ marginTop: 8 }}>
              <a className="secondary-button" href={message.checkoutUrl} rel="noreferrer">
                Перейти к оплате
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid-3">
        <StatCard label="Начислено" value={balance ? toRub(balance.totalDueCents) : "..."} />
        <StatCard label="Оплачено" value={balance ? toRub(balance.totalPaidCents) : "..."} />
        <StatCard label="Остаток" value={balance ? toRub(balance.outstandingCents) : "..."} />
      </div>

      <Panel title="Запросы к оплате">
        {pendingInvoices.length === 0 ? (
          <p className="muted">Нет запросов к оплате.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Сбор/счет</th>
                <th>Участок</th>
                <th>К оплате</th>
                <th>Статус</th>
                <th>Срок</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingInvoices.map((invoice) => {
                const due = Math.max(0, invoice.totalCents - invoice.paidCents);
                return (
                  <tr key={invoice.id}>
                    <td>{invoice.charge?.title ?? invoice.number}</td>
                    <td>{invoice.plot ? `№${invoice.plot.number}` : "-"}</td>
                    <td>{toRub(due)}</td>
                    <td>{invoice.status}</td>
                    <td>{new Date(invoice.dueDate).toLocaleDateString("ru-RU")}</td>
                    <td>
                      <button className="secondary-button" onClick={() => payInvoice(invoice.id)}>
                        Оплатить
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="История">
        {historyInvoices.length === 0 ? (
          <p className="muted">История пуста.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Сбор/счет</th>
                <th>Участок</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {historyInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.charge?.title ?? invoice.number}</td>
                  <td>{invoice.plot ? `№${invoice.plot.number}` : "-"}</td>
                  <td>{toRub(invoice.totalCents)}</td>
                  <td>{invoice.status}</td>
                  <td>{new Date(invoice.issuedAt).toLocaleDateString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </PortalShell>
  );
}
