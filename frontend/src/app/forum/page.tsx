"use client";

import { useEffect } from "react";
import { PortalShell } from "@/components/portal-shell";
import { MessengerDrawer } from "@/components/messenger-drawer";
import { useAuth } from "@/hooks/use-auth";

export default function ChatPage() {
  const { ready, session } = useAuth(true);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("forum-native-page");
    document.documentElement.classList.add("forum-native-page");

    return () => {
      document.body.classList.remove("forum-native-page");
      document.documentElement.classList.remove("forum-native-page");
    };
  }, []);

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  return (
    <PortalShell title="Чат" subtitle="Топики СНТ и личные сообщения">
      <MessengerDrawer variant="page" session={session} />
    </PortalShell>
  );
}
