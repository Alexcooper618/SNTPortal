"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import {
  Circle,
  CreditCard,
  Home,
  Map as MapIcon,
  Megaphone,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { MessengerDrawer } from "@/components/messenger-drawer";
import { ChatFab } from "@/components/chat-fab";

interface NavItem {
  href: string;
  label: string;
}

const residentNav: NavItem[] = [
  { href: "/dashboard", label: "Главная" },
  { href: "/map", label: "Карта" },
  { href: "/payments", label: "Платежи" },
  { href: "/news", label: "Новости" },
  { href: "/forum", label: "Чат" },
  { href: "/documents", label: "Документы" },
  { href: "/profile", label: "Профиль" },
  { href: "/incidents", label: "Обращения" },
];

const chairmanNav: NavItem[] = [
  ...residentNav,
  { href: "/admin", label: "Админ-панель" },
  { href: "/governance", label: "Собрания" },
];

const adminNav: NavItem[] = [{ href: "/platform", label: "Панель администратора" }];

const mobileNavIconMap: Record<string, LucideIcon> = {
  "/dashboard": Home,
  "/map": MapIcon,
  "/payments": CreditCard,
  "/news": Megaphone,
  "/forum": MessageSquareText,
};

interface PortalShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export const PortalShell = ({ children, title, subtitle }: PortalShellProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, session, logout } = useAuth(true);
  const [messengerOpen, setMessengerOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = () => {
      if (pathname === "/forum") return;
      setMessengerOpen(true);
    };
    window.addEventListener("snt:open-messenger", handler as EventListener);
    return () => window.removeEventListener("snt:open-messenger", handler as EventListener);
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/forum") {
      setMessengerOpen(false);
    }
  }, [pathname]);

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  const items =
    session.user.role === "ADMIN" ? adminNav : session.user.role === "CHAIRMAN" ? chairmanNav : residentNav;

  return (
    <div className="portal-bg">
      <div className="portal-shell">
        <aside className="portal-side">
          <div className="brand-block">
            <div className="brand-mark">СНТ</div>
            <div>
              <p className="brand-title">Портал домовладельцев</p>
              <p className="brand-subtitle">tenant: {session.tenantSlug}</p>
            </div>
          </div>

          <nav className="portal-nav">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={pathname === item.href ? "nav-link active" : "nav-link"}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
          >
            Выйти
          </button>
        </aside>

        <main className="portal-main">
          <header className="portal-header">
            <div>
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            <div className="header-actions">
              <div className="profile-pill">
                <span>{session.user.name}</span>
                <span className="role-pill">
                  {session.user.role === "ADMIN"
                    ? "Администратор"
                    : session.user.role === "CHAIRMAN"
                    ? "Председатель"
                    : "Житель"}
                </span>
              </div>
            </div>
          </header>

          <section className="portal-content">{children}</section>
        </main>
      </div>

      <nav className="mobile-nav">
        {items.slice(0, 5).map((item) => {
          const MobileNavIcon = mobileNavIconMap[item.href] ?? Circle;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "mobile-link active" : "mobile-link"}
            >
              <MobileNavIcon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {pathname !== "/forum" ? (
        <>
          <ChatFab session={session} messengerOpen={messengerOpen} />
          <MessengerDrawer
            open={messengerOpen}
            onClose={() => setMessengerOpen(false)}
            session={session}
          />
        </>
      ) : null}
    </div>
  );
};
