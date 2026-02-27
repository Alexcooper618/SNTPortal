"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Paperclip } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Panel, StatCard } from "@/components/ui-kit";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, ApiRequestError, getApiBaseUrl } from "@/lib/api";

interface SntBalanceResponse {
  openingCollectedCents: number;
  collectedCents: number;
  expensesCents?: number;
  sntBalanceCents: number;
}

interface SntExpenseAttachment {
  id: number;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface SntExpenseItem {
  id: number;
  amountCents: number;
  purpose: string;
  spentAt: string;
  createdAt: string;
  createdBy: {
    id: number;
    name: string;
    role: "USER" | "CHAIRMAN" | "ADMIN";
  };
  attachments: SntExpenseAttachment[];
}

interface SntExpenseResponse {
  items: SntExpenseItem[];
}

const toRub = (cents: number): string => `${(cents / 100).toLocaleString("ru-RU")} ₽`;

const parseRubToCents = (raw: string): number => {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return Number.NaN;
  return Math.round(value * 100);
};

const toDateTime = (value: string) => {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("ru-RU");
};

const resolveFileUrl = (fileUrl: string) => {
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }
  const base = getApiBaseUrl().replace(/\/api\/v1$/, "");
  return `${base}${fileUrl}`;
};

export default function SntBalanceDetailsPage() {
  const { ready, session } = useAuth(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<SntBalanceResponse | null>(null);
  const [expenses, setExpenses] = useState<SntExpenseItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [amountRub, setAmountRub] = useState("");
  const [purpose, setPurpose] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  const isChairman = session?.user.role === "CHAIRMAN";

  const load = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [balanceData, expensesData] = await Promise.all([
        apiRequest<SntBalanceResponse>("/billing/balance/snt", {
          token: session.accessToken,
          tenantSlug: session.tenantSlug,
        }),
        apiRequest<SntExpenseResponse>("/billing/balance/snt/expenses?limit=200", {
          token: session.accessToken,
          tenantSlug: session.tenantSlug,
        }),
      ]);
      setSummary(balanceData);
      setExpenses(expensesData.items);
    } catch (requestError) {
      setSummary(null);
      setExpenses([]);
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Не удалось загрузить расшифровку баланса СНТ"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready || !session) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session]);

  const registerExpense = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !isChairman) return;

    const amountCents = parseRubToCents(amountRub);
    if (!Number.isFinite(amountCents)) {
      setError("Сумма расхода должна быть числом больше 0");
      return;
    }
    if (purpose.trim().length < 2) {
      setError("Укажите назначение платежа");
      return;
    }

    const formData = new FormData();
    formData.append("amountCents", String(amountCents));
    formData.append("purpose", purpose.trim());
    if (attachment) {
      formData.append("attachment", attachment);
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest<{ expense: SntExpenseItem }>("/billing/balance/snt/expenses", {
        method: "POST",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
        body: formData,
      });
      setAmountRub("");
      setPurpose("");
      setAttachment(null);
      setNotice("Расход зарегистрирован");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : "Не удалось зарегистрировать расход");
    } finally {
      setSaving(false);
    }
  };

  const expensesTotal = useMemo(() => expenses.reduce((acc, item) => acc + item.amountCents, 0), [expenses]);

  return (
    <PortalShell title="Баланс СНТ" subtitle="Расшифровка расходов и общая копилка">
      <Panel title="Сводка" action={<Link href="/dashboard" className="secondary-button">На главную</Link>}>
        <div className="grid-3">
          <StatCard label="Баланс СНТ" value={loading ? "..." : toRub(summary?.sntBalanceCents ?? 0)} />
          <StatCard label="Собрано оплатами" value={loading ? "..." : toRub(summary?.collectedCents ?? 0)} />
          <StatCard label="Расходы" value={loading ? "..." : toRub(summary?.expensesCents ?? expensesTotal)} />
        </div>
      </Panel>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {isChairman ? (
        <Panel title="Зарегистрировать расход">
          <form className="inline-form snt-expense-form" onSubmit={registerExpense}>
            <label>
              Сумма (₽)
              <input
                value={amountRub}
                onChange={(event) => setAmountRub(event.target.value)}
                placeholder="Например, 1500"
                inputMode="decimal"
              />
            </label>
            <label>
              Назначение платежа
              <input
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Например, закупка материалов"
              />
            </label>
            <label className="snt-expense-file">
              <span>
                <Paperclip size={16} /> Файл или фото
              </span>
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
              />
              <small>{attachment ? attachment.name : "Не выбрано"}</small>
            </label>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Сохраняем..." : "Зарегистрировать расход"}
            </button>
          </form>
        </Panel>
      ) : null}

      <Panel title="История расходов">
        {loading ? (
          <p className="muted">Загружаем расходы...</p>
        ) : expenses.length === 0 ? (
          <p className="muted">Расходов пока нет.</p>
        ) : (
          <ul className="snt-expense-list">
            {expenses.map((item) => (
              <li key={item.id} className="snt-expense-item">
                <div className="snt-expense-head">
                  <p className="snt-expense-amount">-{toRub(item.amountCents)}</p>
                  <p className="snt-expense-date">{toDateTime(item.spentAt)}</p>
                </div>
                <p className="snt-expense-purpose">{item.purpose}</p>
                <p className="snt-expense-meta">Добавил: {item.createdBy.name}</p>
                {item.attachments.length > 0 ? (
                  <div className="snt-expense-attachments">
                    {item.attachments.map((file) => (
                      <a
                        key={file.id}
                        href={resolveFileUrl(file.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="secondary-button"
                      >
                        {file.fileName}
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PortalShell>
  );
}
