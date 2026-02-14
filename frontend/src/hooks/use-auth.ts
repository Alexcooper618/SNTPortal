"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, loadSession, SessionState } from "@/lib/session";

export const useAuth = (redirectToLogin = true) => {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const next = loadSession();
    setSession(next);
    setReady(true);

    if (!next && redirectToLogin) {
      router.replace("/login");
    }
  }, [redirectToLogin, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = () => {
      clearSession();
      setSession(null);
      if (redirectToLogin) {
        router.replace("/login");
      }
    };

    window.addEventListener("snt:session-invalidated", handler as EventListener);
    return () => {
      window.removeEventListener("snt:session-invalidated", handler as EventListener);
    };
  }, [redirectToLogin, router]);

  useEffect(() => {
    if (!session || !redirectToLogin) return;
    if (session.user.mustChangePassword && pathname !== "/change-password") {
      router.replace("/change-password");
    }
  }, [pathname, redirectToLogin, router, session]);

  const logout = () => {
    clearSession();
    setSession(null);
    router.replace("/login");
  };

  return {
    ready,
    session,
    setSession,
    logout,
  };
};
