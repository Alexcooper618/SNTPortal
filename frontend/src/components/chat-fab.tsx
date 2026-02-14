"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { loadSession, SessionState } from "@/lib/session";

interface UnreadSummary {
  unreadRooms: number;
  unreadMessages: number;
}

const clampBadge = (value: number) => {
  if (value <= 0) return null;
  if (value > 99) return "99+";
  return String(value);
};

export function ChatFab(props: { session: SessionState; messengerOpen: boolean }) {
  const { session, messengerOpen } = props;
  const [summary, setSummary] = useState<UnreadSummary>({ unreadRooms: 0, unreadMessages: 0 });
  const inFlightRef = useRef(false);

  const authOptions = useCallback(() => {
    const latest = loadSession();
    return {
      token: latest?.accessToken ?? session.accessToken,
      tenantSlug: latest?.tenantSlug ?? session.tenantSlug,
    };
  }, [session.accessToken, session.tenantSlug]);

  const badge = useMemo(() => clampBadge(summary.unreadMessages), [summary.unreadMessages]);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const next = await apiRequest<UnreadSummary>("/chat/unread-summary", {
        ...authOptions(),
      });
      setSummary(next);
    } catch (_error) {
      // Non-critical; auth flow will handle 401 via apiRequest + session invalidation event.
    } finally {
      inFlightRef.current = false;
    }
  }, [authOptions]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (messengerOpen) return;
    const id = window.setInterval(() => {
      refresh();
    }, 25_000);
    return () => window.clearInterval(id);
  }, [messengerOpen, refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => refresh();
    window.addEventListener("snt:chat-summary-invalidated", handler as EventListener);
    return () => window.removeEventListener("snt:chat-summary-invalidated", handler as EventListener);
  }, [refresh]);

  return (
    <button
      type="button"
      className="chat-fab"
      aria-label="Открыть чат"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("snt:open-messenger"));
        }
      }}
    >
      <MessageSquareText size={18} />
      <span>Чат</span>
      {badge ? <span className="chat-fab-badge">{badge}</span> : null}
    </button>
  );
}
