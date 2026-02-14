"use client";

import { PortalShell } from "@/components/portal-shell";
import { MessengerDrawer } from "@/components/messenger-drawer";
import { useAuth } from "@/hooks/use-auth";

export default function ChatPage() {
  const { ready, session } = useAuth(true);

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  return (
    <PortalShell title="Чат" subtitle="Топики СНТ и личные сообщения">
      <MessengerDrawer variant="page" session={session} />
    </PortalShell>
  );
}

