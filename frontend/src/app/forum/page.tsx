"use client";

import { useEffect } from "react";
import { PortalShell } from "@/components/portal-shell";
import { MessengerDrawer } from "@/components/messenger-drawer";
import { useAuth } from "@/hooks/use-auth";

export default function ChatPage() {
  const { ready, session } = useAuth(true);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;

    const updateViewportHeight = () => {
      document.documentElement.style.setProperty("--forum-vh", `${window.innerHeight}px`);
    };

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    window.addEventListener("orientationchange", updateViewportHeight);
    document.body.classList.add("forum-native-page");
    document.documentElement.classList.add("forum-native-page");

    return () => {
      window.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("orientationchange", updateViewportHeight);
      document.body.classList.remove("forum-native-page");
      document.documentElement.classList.remove("forum-native-page");
      document.documentElement.style.removeProperty("--forum-vh");
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
