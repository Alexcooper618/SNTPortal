"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CreditCard,
  FileText,
  Map as MapIcon,
  MessageSquareText,
  Megaphone,
  ShieldCheck,
  TriangleAlert,
  Vote as VoteIcon,
} from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Panel, StatCard } from "@/components/ui-kit";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface BalanceResponse {
  totalDueCents: number;
  totalPaidCents: number;
  outstandingCents: number;
}

interface NotificationResponse {
  unreadCount: number;
}

interface IncidentItem {
  id: string;
  title: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  openedAt: string;
  createdBy?: {
    id: number;
    name: string;
  };
}

interface IncidentResponse {
  items: IncidentItem[];
}

interface NewsPost {
  id: number;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdAt: string;
  publishedAt?: string | null;
  author?: {
    id: number;
    name: string;
  };
}

interface NewsResponse {
  items: NewsPost[];
}

interface InvoiceItem {
  id: number;
  number: string;
  status: "PENDING" | "PARTIAL" | "PAID" | "CANCELED";
  totalCents: number;
  paidCents: number;
  dueDate: string;
  plot?: {
    id: number;
    number: string;
  };
}

interface InvoicesResponse {
  items: InvoiceItem[];
}

interface MeetingItem {
  id: string;
  title: string;
  scheduledAt: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
}

interface MeetingsResponse {
  items: MeetingItem[];
}

interface VoteItem {
  id: string;
  title: string;
  status: "DRAFT" | "OPEN" | "CLOSED";
  opensAt: string;
  closesAt: string;
}

interface VotesResponse {
  items: VoteItem[];
}

const toRub = (cents: number): string => `${(cents / 100).toLocaleString("ru-RU")} ₽`;

const formatDate = (value: string) => {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString("ru-RU", { year: "numeric", month: "short", day: "numeric" });
};

function ActionCard(props: {
  title: string;
  subtitle: string;
  href?: string;
  onClick?: () => void;
  icon: ReactNode;
}) {
  const content = (
    <div className="action-card">
      <div className="action-icon">{props.icon}</div>
      <div className="action-meta">
        <p className="action-title">{props.title}</p>
        <p className="action-sub">{props.subtitle}</p>
      </div>
    </div>
  );

  if (props.href) {
    return (
      <Link href={props.href} className="action-link">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className="action-link" onClick={props.onClick}>
      {content}
    </button>
  );
}

export default function DashboardPage() {
  const { session, ready } = useAuth(true);

  const [loading, setLoading] = useState(true);
  const [outstanding, setOutstanding] = useState(0);
  const [paid, setPaid] = useState(0);
  const [unread, setUnread] = useState(0);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [news, setNews] = useState<NewsPost[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [votes, setVotes] = useState<VoteItem[]>([]);

  useEffect(() => {
    if (!ready || !session) return;

    const load = async () => {
      setLoading(true);

      try {
        const [balance, notifications, incidentData, newsData, invoiceData, meetingsData, votesData] =
          await Promise.all([
            apiRequest<BalanceResponse>("/billing/balance/me", {
              token: session.accessToken,
              tenantSlug: session.tenantSlug,
            }),
            apiRequest<NotificationResponse>("/notifications", {
              token: session.accessToken,
              tenantSlug: session.tenantSlug,
            }),
            apiRequest<IncidentResponse>("/incidents", {
              token: session.accessToken,
              tenantSlug: session.tenantSlug,
            }),
            apiRequest<NewsResponse>("/news", {
              token: session.accessToken,
              tenantSlug: session.tenantSlug,
            }),
            apiRequest<InvoicesResponse>("/billing/invoices", {
              token: session.accessToken,
              tenantSlug: session.tenantSlug,
            }),
            apiRequest<MeetingsResponse>("/meetings", {
              token: session.accessToken,
              tenantSlug: session.tenantSlug,
            }),
            apiRequest<VotesResponse>("/votes", {
              token: session.accessToken,
              tenantSlug: session.tenantSlug,
            }),
          ]);

        setOutstanding(balance.outstandingCents);
        setPaid(balance.totalPaidCents);
        setUnread(notifications.unreadCount);

        const incidentItems =
          session.user.role === "CHAIRMAN"
            ? incidentData.items
            : incidentData.items.filter((item) => item.createdBy?.id === session.user.id);

        setIncidents(incidentItems);
        setNews(newsData.items);
        setInvoices(invoiceData.items);
        setMeetings(meetingsData.items);
        setVotes(votesData.items);
      } catch (_error) {
        setOutstanding(0);
        setPaid(0);
        setUnread(0);
        setIncidents([]);
        setNews([]);
        setInvoices([]);
        setMeetings([]);
        setVotes([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [ready, session]);

  const openIncidents = useMemo(
    () => incidents.filter((item) => item.status === "OPEN" || item.status === "IN_PROGRESS"),
    [incidents]
  );

  const pendingInvoices = useMemo(
    () => invoices.filter((i) => i.status === "PENDING" || i.status === "PARTIAL"),
    [invoices]
  );

  const openVotes = useMemo(() => {
    const now = Date.now();
    return votes.filter((vote) => {
      if (vote.status !== "OPEN") return false;
      const opens = new Date(vote.opensAt).getTime();
      const closes = new Date(vote.closesAt).getTime();
      if (Number.isNaN(opens) || Number.isNaN(closes)) return true;
      return opens <= now && now <= closes;
    });
  }, [votes]);

  const nextMeeting = useMemo(() => {
    const now = Date.now();
    const upcoming = meetings
      .filter((m) => m.status !== "DRAFT")
      .map((m) => ({ item: m, ts: new Date(m.scheduledAt).getTime() }))
      .filter((m) => !Number.isNaN(m.ts) && m.ts >= now)
      .sort((a, b) => a.ts - b.ts);

    return upcoming[0]?.item ?? null;
  }, [meetings]);

  const balanceValue = loading ? "..." : toRub(-outstanding);
  const paidValue = loading ? "..." : toRub(paid);
  const incidentValue = loading ? "..." : String(openIncidents.length);
  const votesValue = loading ? "..." : String(openVotes.length);

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  return (
    <PortalShell title="Главная" subtitle="Сводка по платежам, обращениям, новостям и чату">
      <section className="hero">
        <div className="hero-copy">
          <p className="hero-kicker">{session.user.role === "CHAIRMAN" ? "Панель председателя" : "Кабинет жителя"}</p>
          <h2 className="hero-title">{session.user.name}, добро пожаловать</h2>
          <p className="hero-sub">
            Быстрые действия, важные события и переписка доступны в один клик.
          </p>
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => window.dispatchEvent(new CustomEvent("snt:open-messenger"))}
          >
            <MessageSquareText size={18} />
            Открыть чат
          </button>
          <Link href="/payments" className="secondary-button hero-button">
            <CreditCard size={18} />
            Оплатить
          </Link>
          <Link href="/incidents" className="secondary-button hero-button">
            <TriangleAlert size={18} />
            Создать обращение
          </Link>
        </div>
      </section>

      <div className="grid-4">
        <StatCard label="Баланс" value={balanceValue} hint="Отрицательное значение означает долг" />
        <StatCard label="Оплачено" value={paidValue} hint="Сумма подтвержденных платежей" />
        <StatCard label="Открытые обращения" value={incidentValue} hint="OPEN и IN_PROGRESS" />
        <StatCard label="Открытые голосования" value={votesValue} hint="Требуют участия" />
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <Panel title="Счета к оплате" action={<Link href="/payments" className="secondary-button">Перейти</Link>}>
            {pendingInvoices.length === 0 ? (
              <p className="muted">Нет счетов к оплате.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Счет</th>
                    <th>Участок</th>
                    <th>Статус</th>
                    <th>К оплате</th>
                    <th>Срок</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvoices.slice(0, 6).map((invoice) => {
                    const due = Math.max(0, invoice.totalCents - invoice.paidCents);
                    return (
                      <tr key={invoice.id}>
                        <td>{invoice.number}</td>
                        <td>{invoice.plot ? `№${invoice.plot.number}` : "-"}</td>
                        <td>{invoice.status}</td>
                        <td>{toRub(due)}</td>
                        <td>{formatDate(invoice.dueDate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Новости" action={<Link href="/news" className="secondary-button">Все новости</Link>}>
            {news.length === 0 ? (
              <p className="muted">Публикаций пока нет.</p>
            ) : (
              <ul className="feed-list">
                {news.slice(0, 5).map((post) => (
                  <li key={post.id} className="feed-item">
                    <span className="feed-title">{post.title}</span>
                    <span className="feed-meta">{formatDate(post.publishedAt ?? post.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Последние обращения" action={<Link href="/incidents" className="secondary-button">Все</Link>}>
            {openIncidents.length === 0 ? (
              <p className="muted">Открытых обращений нет.</p>
            ) : (
              <ul className="feed-list">
                {openIncidents.slice(0, 6).map((incident) => (
                  <li key={incident.id} className="feed-item">
                    <span className="feed-title">{incident.title}</span>
                    <span className="feed-meta">{incident.status} · {incident.priority}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="dashboard-side">
          <Panel title="Быстрые действия">
            <div className="action-grid">
              <ActionCard
                title="Чат"
                subtitle="Топики и контакты"
                icon={<MessageSquareText size={18} />}
                onClick={() => window.dispatchEvent(new CustomEvent("snt:open-messenger"))}
              />
              <ActionCard title="Платежи" subtitle="Счета и баланс" icon={<CreditCard size={18} />} href="/payments" />
              <ActionCard title="Новости" subtitle="Объявления СНТ" icon={<Megaphone size={18} />} href="/news" />
              <ActionCard title="Документы" subtitle="Устав, отчеты" icon={<FileText size={18} />} href="/documents" />
              <ActionCard title="Карта" subtitle="Участки и объекты" icon={<MapIcon size={18} />} href="/map" />
              <ActionCard title="Собрания" subtitle="Повестка и голоса" icon={<VoteIcon size={18} />} href="/governance" />
              <ActionCard title="Уведомления" subtitle={`Непрочитанные: ${unread}`} icon={<Bell size={18} />} href="/profile" />
              {session.user.role === "CHAIRMAN" ? (
                <ActionCard title="Админка" subtitle="Пользователи и участки" icon={<ShieldCheck size={18} />} href="/admin" />
              ) : null}
            </div>
          </Panel>

          <Panel title="Собрания и голосования" action={<Link href="/governance" className="secondary-button">Открыть</Link>}>
            {nextMeeting ? (
              <div className="mini-block">
                <p className="mini-label">Ближайшее собрание</p>
                <p className="mini-value">{nextMeeting.title}</p>
                <p className="muted">{formatDate(nextMeeting.scheduledAt)}</p>
              </div>
            ) : (
              <p className="muted">Собраний не запланировано.</p>
            )}

            {openVotes.length > 0 ? (
              <div className="mini-block">
                <p className="mini-label">Открытые голосования</p>
                <p className="mini-value">{openVotes.length}</p>
                <p className="muted">Зайдите в раздел «Собрания» чтобы проголосовать.</p>
              </div>
            ) : (
              <p className="muted">Открытых голосований нет.</p>
            )}
          </Panel>
        </aside>
      </div>
    </PortalShell>
  );
}
